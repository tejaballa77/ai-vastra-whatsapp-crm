import os
from abc import ABC, abstractmethod

import anyio
import google.generativeai as genai
import openai

from app.core.config import settings
from app.core.exceptions import AIError
from app.core.logging import logger


class BaseEmbeddingProvider(ABC):
    """
    Abstract interface for generating vector embeddings from text content.
    Allows swappable AI providers (OpenAI, Gemini).
    """

    @abstractmethod
    async def get_embedding(self, text: str) -> list[float]:
        """Generates embedding for a single text string."""
        pass

    @abstractmethod
    async def get_embeddings(self, texts: list[str]) -> list[list[float]]:
        """Generates embeddings for a batch of text strings."""
        pass


class OpenAIEmbeddingProvider(BaseEmbeddingProvider):
    """OpenAI implementation using the official async client."""

    def __init__(self) -> None:
        self.model = "text-embedding-3-small"

    def _get_client(self) -> openai.AsyncOpenAI:
        api_key = settings.OPENAI_API_KEY or os.environ.get("OPENAI_API_KEY", "")
        if not api_key:
            raise AIError(message="OPENAI_API_KEY is not configured in .env file.")
        return openai.AsyncOpenAI(api_key=api_key)

    async def get_embedding(self, text: str) -> list[float]:
        embeddings = await self.get_embeddings([text])
        return embeddings[0]

    async def get_embeddings(self, texts: list[str]) -> list[list[float]]:
        client = self._get_client()

        try:
            response = await client.embeddings.create(
                input=texts,
                model=self.model,
            )
            return [d.embedding for d in response.data]
        except Exception as e:
            logger.error(f"OpenAI embedding generation failed: {e}")
            raise AIError(message=f"OpenAI embedding error: {str(e)}", details={"error": str(e)}) from e


class GeminiEmbeddingProvider(BaseEmbeddingProvider):
    """Gemini implementation wrapping the generative AI SDK in anyio threads."""

    def __init__(self) -> None:
        self.model = "models/embedding-001"
        genai.configure(api_key=settings.GEMINI_API_KEY)

    async def get_embedding(self, text: str) -> list[float]:
        embeddings = await self.get_embeddings([text])
        return embeddings[0]

    async def get_embeddings(self, texts: list[str]) -> list[list[float]]:
        if not settings.GEMINI_API_KEY:
            raise AIError(message="GEMINI_API_KEY is not configured.")

        try:

            def _embed():
                response = genai.embed_content(
                    model=self.model,
                    content=texts,
                    task_type="retrieval_document",
                )
                return response["embedding"]

            # Wrap blocking sync SDK call in threadpool
            embeddings = await anyio.to_thread.run_sync(_embed)
            return embeddings
        except Exception as e:
            logger.error(f"Gemini embedding generation failed: {e}")
            raise AIError(message="Failed to generate embeddings from Gemini") from e


import hashlib
import math
import re


class LocalEmbeddingProvider(BaseEmbeddingProvider):
    """Local, offline, zero-API deterministic embedding provider (384 dimensions)."""

    def __init__(self, dimension: int = 384) -> None:
        self.dimension = dimension

    def _embed_single(self, text: str) -> list[float]:
        vec = [0.0] * self.dimension
        tokens = re.findall(r"\w+", (text or "").lower())
        if not tokens:
            return vec
        for token in tokens:
            idx = int(hashlib.md5(token.encode("utf-8")).hexdigest(), 16) % self.dimension
            vec[idx] += 1.0
            for i in range(len(token) - 2):
                tri = token[i : i + 3]
                t_idx = int(hashlib.sha256(tri.encode("utf-8")).hexdigest(), 16) % self.dimension
                vec[t_idx] += 0.5

        norm = math.sqrt(sum(x * x for x in vec))
        if norm > 0:
            vec = [x / norm for x in vec]
        return vec

    async def get_embedding(self, text: str) -> list[float]:
        return self._embed_single(text)

    async def get_embeddings(self, texts: list[str]) -> list[list[float]]:
        return [self._embed_single(t) for t in texts]


def get_embedding_provider() -> BaseEmbeddingProvider:
    """
    Factory function returning the configured embedding provider.
    Prefers OpenAI/Gemini if keys exist, otherwise seamlessly falls back to LocalEmbeddingProvider.
    """
    provider = settings.DEFAULT_LLM_PROVIDER.lower()
    has_openai = bool(settings.OPENAI_API_KEY or os.environ.get("OPENAI_API_KEY"))
    has_gemini = bool(settings.GEMINI_API_KEY or os.environ.get("GEMINI_API_KEY"))

    if provider == "openai" and has_openai:
        return OpenAIEmbeddingProvider()
    elif provider == "gemini" and has_gemini:
        return GeminiEmbeddingProvider()
    elif has_openai:
        return OpenAIEmbeddingProvider()
    elif has_gemini:
        return GeminiEmbeddingProvider()
    else:
        return LocalEmbeddingProvider()


# Shared system-wide embedding generator client
embedding_provider = get_embedding_provider()
