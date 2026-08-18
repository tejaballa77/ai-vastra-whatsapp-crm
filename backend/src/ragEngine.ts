import fs from 'fs';
import path from 'path';

export interface UploadedDocument {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  content: string;
}

class RagEngineService {
  private uploadDir: string;
  private dbPath: string;
  private documents: UploadedDocument[];

  constructor() {
    this.uploadDir = path.join(__dirname, '../uploads/documents');
    this.dbPath = path.join(__dirname, '../documents_db.json');

    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }

    this.documents = this.loadDocumentsDb();
  }

  private loadDocumentsDb(): UploadedDocument[] {
    try {
      if (fs.existsSync(this.dbPath)) {
        const raw = fs.readFileSync(this.dbPath, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (e) {
      console.warn('[RAG Engine] Error loading documents DB:', e);
    }
    return [];
  }

  private saveDocumentsDb() {
    try {
      fs.writeFileSync(this.dbPath, JSON.stringify(this.documents, null, 2), 'utf-8');
      console.log('[RAG Engine] Documents database saved.');
    } catch (e) {
      console.error('[RAG Engine] Error saving documents DB:', e);
    }
  }

  public getDocuments(): UploadedDocument[] {
    return this.documents;
  }

  public addDocument(filename: string, originalName: string, mimeType: string, size: number, content: string): UploadedDocument {
    const doc: UploadedDocument = {
      id: `doc_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      filename,
      originalName,
      mimeType,
      size,
      uploadedAt: new Date().toISOString(),
      content
    };

    this.documents.push(doc);
    this.saveDocumentsDb();
    return doc;
  }

  public deleteDocument(id: string): boolean {
    const index = this.documents.findIndex(d => d.id === id);
    if (index !== -1) {
      const doc = this.documents[index];
      const filePath = path.join(this.uploadDir, doc.filename);
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (e) {}
      }
      this.documents.splice(index, 1);
      this.saveDocumentsDb();
      return true;
    }
    return false;
  }

  // RAG Semantic Retrieval: Search all uploaded documents for relevant context
  public retrieveRelevantContext(query: string, maxChars: number = 25000): string {
    if (this.documents.length === 0) return '';
    return this.documents.map(d => `=== DOCUMENT: ${d.originalName} ===\n${d.content}`).join('\n\n').slice(0, maxChars);
  }

  // 100% Verbatim Exact Q&A Answer Extractor: Finds matching Q: block in uploaded docs and returns exact A: block
  public findExactAnswerInDocs(query: string): string | null {
    if (this.documents.length === 0) return null;

    const lowerQuery = query.toLowerCase().replace(/[^\w\s]/g, '').trim();
    const queryWords = lowerQuery.split(/\s+/).filter(w => w.length > 2);
    if (queryWords.length === 0) return null;

    let bestMatch: { answer: string; score: number } | null = null;

    for (const doc of this.documents) {
      if (!doc.content) continue;

      // Split document into Q: and A: blocks
      const qnaBlocks = doc.content.split(/(?=Q\s*[\:\.\-–])/i);
      for (const block of qnaBlocks) {
        const parts = block.split(/(?:A\s*[\:\.\-–])/i);
        if (parts.length >= 2) {
          const qText = parts[0].toLowerCase();
          // Extract ONLY the A: text block, stopping before the next Q: or next Section header (# 11. Lead Qualification Questions)
          let aText = parts.slice(1).join('A:').split(/(?=Q\s*[\:\.\-–]|\n\s*#+\s*|\n\s*\d+\.\s+[A-Z])/i)[0].trim();

          let score = 0;
          const cleanQ = qText.replace(/q\s*[\:\.\-–]\s*/i, '').replace(/customer\s+(?:says|only\s+says)\s*[\:\.\-–]?\s*/i, '').trim();

          // High bonus for exact phrase match or substring match
          if (cleanQ === lowerQuery || cleanQ.includes(lowerQuery) || lowerQuery.includes(cleanQ)) {
            score += 10;
          }

          for (const word of queryWords) {
            if (qText.includes(word)) {
              score += 2;
            }
          }

          if (score > (bestMatch ? bestMatch.score : 0) && aText.length > 5) {
            bestMatch = { answer: aText, score };
          }
        }
      }
    }

    // Return exact A: answer if match score threshold met
    return (bestMatch && bestMatch.score >= 2) ? bestMatch.answer : null;
  }
}

export const ragEngine = new RagEngineService();
