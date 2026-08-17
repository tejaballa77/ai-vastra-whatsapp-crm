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
  public retrieveRelevantContext(query: string, maxChars: number = 3000): string {
    if (this.documents.length === 0) return '';

    const queryWords = query.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 2);
    if (queryWords.length === 0) {
      return this.documents.map(d => `--- Document: ${d.originalName} ---\n${d.content.slice(0, 1000)}`).join('\n\n');
    }

    const scoredChunks: { text: string; score: number; docName: string }[] = [];

    this.documents.forEach(doc => {
      // Chunk document into paragraphs / sections
      const paragraphs = doc.content.split(/\n\s*\n/);
      paragraphs.forEach(p => {
        const pClean = p.trim();
        if (pClean.length < 20) return;

        const pLower = pClean.toLowerCase();
        let score = 0;

        queryWords.forEach(word => {
          if (pLower.includes(word)) {
            score += 1;
            // Bonus for exact word matches
            const matches = (pLower.match(new RegExp(`\\b${word}\\b`, 'g')) || []).length;
            score += matches * 1.5;
          }
        });

        if (score > 0) {
          scoredChunks.push({ text: pClean, score, docName: doc.originalName });
        }
      });
    });

    // Sort by relevance score descending
    scoredChunks.sort((a, b) => b.score - a.score);

    if (scoredChunks.length === 0) {
      // Return top overview if no direct keyword matches found
      return this.documents.map(d => `--- Document: ${d.originalName} ---\n${d.content.slice(0, 800)}`).join('\n\n');
    }

    let combined = '';
    for (const chunk of scoredChunks) {
      if (combined.length + chunk.text.length > maxChars) break;
      combined += `\n[From ${chunk.docName}]:\n${chunk.text}\n`;
    }

    return combined.trim();
  }
}

export const ragEngine = new RagEngineService();
