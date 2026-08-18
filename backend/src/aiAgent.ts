import fs from 'fs';
import path from 'path';
import { db } from './store';
import { ragEngine } from './ragEngine';

export interface AiKnowledgeBase {
  enabled: boolean;
  openAiApiKey: string;
  openAiModel: string;
  companyName: string;
  companyDescription: string;
  productsAndPricing: string;
  faqsAndAnswers: string;
  greetingMessage: string;
  aiTone: string;
  humanOverrideMinutes: number;
  customPrompt: string; // User-defined AI behaviour rules & guidelines
}

const DEFAULT_KB: AiKnowledgeBase = {
  enabled: true,
  openAiApiKey: process.env.OPENAI_API_KEY || '',
  openAiModel: 'gpt-4o-mini',
  companyName: 'Nice Digitals',
  companyDescription: 'Nice Digitals offers AI-powered solutions for fashion and retail businesses including AI Vastra (Virtual Try-On), AI Catalog Generation, and AI Kiosk.',
  productsAndPricing: '',
  faqsAndAnswers: '',
  greetingMessage: 'Hello! 👋 Welcome to Nice Digitals! We offer AI-powered solutions for fashion and retail. How can I help you today?',
  aiTone: 'Professional, warm, helpful, and human-like',
  customPrompt: `You are a real human sales employee working for Nice Digitals / AI Vastra.
Your goal is to answer client questions naturally, politely, and accurately on WhatsApp.

Nice Digitals offers 3 AI-powered services for fashion and retail businesses:
1. AI Vastra — Virtual Try-On for fashion brands (Website: https://aivastra.com)
2. AI Catalog Generation — Professional AI product photography (Website: https://nicedigitals.com/catalog)
3. AI Kiosk — Smart in-store AI experience for retail shops (Website: https://nicedigitals.com/kiosk)

════════════════════════════════════════
STRICT HUMAN BEHAVIOR & RESPONSE RULES
════════════════════════════════════════

1. EXACT Q&A MATCHING & UNMODIFIED ANSWERS:
   - Clients may phrase questions in different ways (e.g. "What do I pay?", "Tell me prices", "How much for try-on?").
   - Analyze the SEMANTIC MEANING of whatever question the client asks and match it to the corresponding Q: entry in the document.
   - Deliver the EXACT unmodified answer text from the A: block of that question (including any YouTube links, website URLs, and emojis)!

2. CHAT LIKE A REAL HUMAN:
   - Talk warmly, politely, and casually like a real person, not a generic computer bot.
   - Keep replies clean, concise, and direct as written in the A: block of the document.

3. INTELLIGENT PDF BROCHURE DELIVERY:
   - When a client asks for pricing, demo videos, virtual try-on details, presentation, or demonstrates genuine interest in our services, output the PDF delivery tag [SEND_PDF: Ai Vastra - try-on 2.pdf] so the system automatically sends the presentation PDF attachment along with your answer!

4. UNRELATED / IRRELEVANT MESSAGES (STRICT SILENCE):
   - If the client's message is completely non-business or unrelated to our services/document (e.g. spam, random jokes, weather, or off-topic chat), reply EXACTLY: "NO_REPLY" (Do NOT send any automatic reply message!).

5. CONVERSATION CONTEXT MEMORY:
   - Always analyze recent chat history. If the client previously discussed Virtual Try-On and now asks "what is cost?", know they are asking about Virtual Try-On pricing!

6. STRICT TRUTH (NO HALLUCINATIONS):
   - ONLY state facts, prices, features, and links that exist in the uploaded Knowledge Base document. NEVER invent fake numbers or plans.`,
  humanOverrideMinutes: 10,
};

class AiAgentService {
  private kbPath: string;
  public kb: AiKnowledgeBase;

  constructor() {
    this.kbPath = path.join(__dirname, '../ai_knowledge_base.json');
    this.kb = this.loadKb();
  }

  private loadKb(): AiKnowledgeBase {
    try {
      if (fs.existsSync(this.kbPath)) {
        const raw = fs.readFileSync(this.kbPath, 'utf-8');
        const parsed = JSON.parse(raw);

        // Auto-sanitize legacy ₹4,999 / ₹9,999 hardcoded mock data
        if (parsed.productsAndPricing && (parsed.productsAndPricing.includes('4,999') || parsed.productsAndPricing.includes('4999') || parsed.productsAndPricing.includes('9,999') || parsed.productsAndPricing.includes('9999'))) {
          parsed.productsAndPricing = '';
        }
        if (parsed.faqsAndAnswers && parsed.faqsAndAnswers.includes('ai.vastra_tryon')) {
          parsed.faqsAndAnswers = '';
        }

        const merged = { ...DEFAULT_KB, ...parsed };
        // Save cleaned KB back to disk
        fs.writeFileSync(this.kbPath, JSON.stringify(merged, null, 2), 'utf-8');
        return merged;
      }
    } catch (e) {
      console.warn('[AI Agent] Error loading Knowledge Base, using default:', e);
    }
    return DEFAULT_KB;
  }

  public saveKb(updated: Partial<AiKnowledgeBase>) {
    this.kb = { ...this.kb, ...updated };
    try {
      fs.writeFileSync(this.kbPath, JSON.stringify(this.kb, null, 2), 'utf-8');
      console.log('[AI Agent] Knowledge Base updated & saved.');
    } catch (e) {
      console.error('[AI Agent] Error saving Knowledge Base:', e);
    }
  }

  public aiAutoReplyCount: number = 0;

  public isHumanActive(chatJid: string): boolean {
    const msgs = db.messages.get(chatJid);
    if (!msgs || msgs.length === 0) return false;

    const cutoff = Date.now() - (this.kb.humanOverrideMinutes * 60 * 1000);
    const recentHumanMsg = msgs.slice(-5).reverse().find(m => m.fromMe && m.timestamp > cutoff);
    return Boolean(recentHumanMsg);
  }

  public async generateResponse(chatJid: string, incomingText: string): Promise<{ text: string; autoTagStatus?: 'INTERESTED' | 'WARM_INTERESTED'; documentPath?: string; documentName?: string }> {
    if (!this.kb.enabled) {
      return { text: '' };
    }

    // Check Human Override
    if (this.isHumanActive(chatJid)) {
      console.log(`[AI Agent] Human agent is active in ${chatJid}. AI auto-reply paused.`);
      return { text: '' };
    }

    const docs = ragEngine.getDocuments() || [];
    const pdfDoc = docs.find((d: any) => d.originalName?.toLowerCase().endsWith('.pdf') || d.mimeType?.includes('pdf') || d.filename?.toLowerCase().endsWith('.pdf'));

    const apiKey = this.kb.openAiApiKey || process.env.OPENAI_API_KEY;

    // 1. If OpenAI API Key is provided -> Call OpenAI GPT-4o / GPT-3.5
    if (apiKey) {
      try {
        let responseText = await this.callOpenAiLlm(apiKey, incomingText, chatJid);

        // Strict Silence Rule for Irrelevant / Off-Topic Messages: Do NOT send any automatic reply!
        if (responseText.includes('NO_REPLY') || responseText.trim().length === 0) {
          console.log(`[AI Agent] Message from ${chatJid} deemed irrelevant/off-topic. Staying silent (0 auto-replies sent).`);
          return { text: '' };
        }

        const lowerRes = (incomingText + ' ' + responseText).toLowerCase();
        let autoTagStatus: 'INTERESTED' | 'WARM_INTERESTED' | undefined = undefined;

        if (lowerRes.includes('price') || lowerRes.includes('cost') || lowerRes.includes('pack') || lowerRes.includes('pricing')) {
          autoTagStatus = 'WARM_INTERESTED';
        }
        if (lowerRes.includes('demo') || lowerRes.includes('call') || lowerRes.includes('meeting') || lowerRes.includes('buy') || lowerRes.includes('catalogue') || lowerRes.includes('try-on')) {
          autoTagStatus = 'INTERESTED';
        }

        let attachedDocPath: string | undefined = undefined;
        let attachedDocName: string | undefined = undefined;

        // Intelligent Human Sales Behavior: Attach PDF whenever client asks for pricing/demo/features or explicitly triggers PDF tags
        const lowerQuery = incomingText.toLowerCase();
        const hasPdfTag = /pdf\s+should\s+be\s+delivered|pdf\s+name|send_pdf|attach_pdf|send_presentation/i.test(responseText);
        const isInterestedLead = Boolean(autoTagStatus) && (lowerQuery.includes('demo') || lowerQuery.includes('price') || lowerQuery.includes('cost') || lowerQuery.includes('detail') || lowerQuery.includes('pdf') || lowerQuery.includes('brochure') || lowerQuery.includes('virtual try'));

        if ((hasPdfTag || isInterestedLead) && pdfDoc) {
          const uploadDir = path.join(__dirname, '../uploads/documents');
          const fullPath = path.join(uploadDir, pdfDoc.filename);
          if (fs.existsSync(fullPath)) {
            attachedDocPath = fullPath;
            attachedDocName = pdfDoc.originalName;
          }
        }

        // Clean out raw bracket tags from output text so customer gets a clean human message
        responseText = responseText.replace(/\[\s*(PDF SHOULD BE DELIVERED|PDF NAME|SEND_PDF|ATTACH_PDF|SEND_PRESENTATION).*?\\]/gi, '').trim();

        // Increment automatic replies count
        this.aiAutoReplyCount++;

        return { text: responseText, autoTagStatus, documentPath: attachedDocPath, documentName: attachedDocName };
      } catch (err: any) {
        console.error('[AI Agent] OpenAI API call error, falling back to rule engine:', err.message);
      }
    }

    // 2. Smart Rule Engine Fallback (Uses uploaded document context if available)

    const docContext = ragEngine.retrieveRelevantContext(incomingText, 2000);
    const lower = incomingText.toLowerCase().trim();

    if (/^(hi|hello|hey|good morning|good afternoon|hlo|hii|namaste)$/i.test(lower)) {
      return {
        text: `${this.kb.greetingMessage}\n\nWe offer Virtual Try-On, AI Catalog Photography, and Smart AI Kiosks. What would you like to know? 😊`,
      };
    }

    if (docContext && docContext.trim().length > 20) {
      // Extract top clean lines from document context
      const lines = docContext.split('\n').map(l => l.trim()).filter(l => l.length > 5 && !l.startsWith('==='));
      const textSnippet = lines.slice(0, 3).join(' ');
      return {
        text: `${textSnippet}\n\nFor more details or a live demo, let us know! 😊`,
        autoTagStatus: lower.includes('price') || lower.includes('cost') ? 'WARM_INTERESTED' : 'INTERESTED'
      };
    }

    return {
      text: `Thank you for reaching out! 😊\nWe offer AI Virtual Try-On, AI Catalog Photography, and Smart AI Kiosks.\n\nCheck out demo videos here: https://youtube.com/@ai.vastra_tryon or let us know how we can assist you!`,
    };
  }

  private async callOpenAiLlm(apiKey: string, userQuery: string, chatJid: string): Promise<string> {
    const fetch = globalThis.fetch || require('node-fetch');


    // Retrieve semantic RAG document context from uploaded files (up to 8000 chars)
    const ragContext = ragEngine.retrieveRelevantContext(userQuery, 8000);

    // Fetch recent chat history
    const msgs = db.messages.get(chatJid) || [];
    const recentHistory = msgs.slice(-6).map(m => ({
      role: m.fromMe ? 'assistant' : 'user',
      content: m.text || ''
    }));

    const systemPrompt = `
You are a professional, warm, and helpful human sales employee at ${this.kb.companyName}.

════════════════════════════════════
CRITICAL RULES — FOLLOW STRICTLY
════════════════════════════════════
1. FLEXIBLE SEMANTIC INTENT MATCHING & EXACT ANSWER DELIVERY:
   - Clients may phrase their questions in many different ways (e.g. "What do I pay?", "Tell me prices", "How much for try-on?").
   - Analyze the SEMANTIC MEANING of whatever question the client sends and match it to the corresponding Q: entry in the document.
   - Deliver the EXACT unmodified answer text from the A: block of that question (including any YouTube links, website URLs, and emojis)! Do NOT rewrite or alter the core text.

2. RESPONSE LENGTH: Keep answers clean, concise, and direct as specified in the document's A: block.

3. PRICING & COST QUESTIONS: Output the exact pricing text from the matching Q&A block in the document (e.g. Pay-As-You-Go ₹5 per successful Try-On, Catalogue Photo ₹10, etc.).

4. URL & DEMO LINKS: Always include the exact YouTube links, Instagram links, and demo URLs as written in the matching A: section of the document!

5. PHOTO / IMAGE RECOGNITION:
   - If the client sends an image/photo of a garment or outfit with text like "Can I get info on this?" or "Photo":
   - Reply: "Thanks for sharing! 📸 Are you looking for Virtual Try-On for this outfit (AI Vastra) or AI Catalog Photography? Let me know so I can share exact details! 😊"

6. UNRELATED / IRRELEVANT MESSAGES (STRICT SILENCE):
   - If the client's message is completely unrelated to our business, fashion, AI Vastra, catalogue photo creation, virtual try-on, kiosks, pricing, or document content (e.g. spam, random jokes, weather, or totally unrelated topics):
   - Reply EXACTLY: "NO_REPLY" (Do NOT send any automatic reply message!).

7. STRICT TRUTH: ONLY use facts, prices, and links from the KNOWLEDGE BASE DOCUMENTS and CUSTOM INSTRUCTIONS below. NEVER invent fake numbers or plans.

8. FORMAT: Respond like a real human on WhatsApp — warm tone, 1-2 emojis, clean line breaks, max 80-100 words total.

${this.kb.companyDescription ? `COMPANY OVERVIEW:\n${this.kb.companyDescription}\n` : ''}

${this.kb.customPrompt ? `CUSTOM AGENT INSTRUCTIONS:\n${this.kb.customPrompt}\n` : ''}

${ragContext ? `KNOWLEDGE BASE DOCUMENTS (Source of Truth — use ONLY this for facts):\n${ragContext}` : 'NOTE: No document context retrieved.'}
    `.trim();

    const messages = [
      { role: 'system', content: systemPrompt },
      ...recentHistory,
      { role: 'user', content: userQuery }
    ];

    const body = {
      model: this.kb.openAiModel || 'gpt-4o-mini',
      messages,
      temperature: 0.7,
      max_tokens: 350
    };

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey.trim()}`
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI API error (${res.status}): ${errText}`);
    }

    const data: any = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || '';
  }
}

export const aiAgent = new AiAgentService();
