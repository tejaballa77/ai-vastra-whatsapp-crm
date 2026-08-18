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
Your goal is to deliver exact, accurate, and helpful answers to client questions on WhatsApp.

Nice Digitals offers 3 AI-powered services for fashion and retail businesses:
1. AI Vastra — Virtual Try-On for fashion brands (Website: https://aivastra.com)
2. AI Catalog Generation — Professional AI product photography (Website: https://nicedigitals.com/catalog)
3. AI Kiosk — Smart in-store AI experience for retail shops (Website: https://nicedigitals.com/kiosk)

════════════════════════════════════════
STRICT VERBATIM Q&A RESPONSE RULES
════════════════════════════════════════

1. 100% VERBATIM EXACT ANSWER DELIVERY (WORD-FOR-WORD):
   - Analyze the SEMANTIC INTENT of whatever question the client sends (no matter how they phrase it).
   - Match the client's intent to the corresponding Q: entry in the uploaded FAQ document.
   - Output the EXACT text from the A: block of that question WORD-FOR-WORD!
   - Do NOT rewrite, paraphrase, summarize, or change a single word in the A: answer. Keep all original emojis, YouTube links, website URLs, pricing rates, and line breaks 100% intact!

2. INTELLIGENT PDF BROCHURE DELIVERY:
   - When a client asks for pricing, demo videos, virtual try-on details, presentation, or demonstrates genuine interest in our services, output the tag [SEND_PDF: Ai Vastra - try-on 2.pdf] so the system automatically sends the presentation PDF attachment along with your exact answer!

3. UNRELATED / OFF-TOPIC MESSAGES (STRICT SILENCE):
   - Greetings like "Hi", "Hello", "Hey", "Good morning", "Namaste" are VALID client greetings — ALWAYS reply to greetings using the matching Q: Customer says Hi / Hello entry from the document!
   - ONLY if the client's message is completely non-business or off-topic (e.g. spam, random jokes, weather, or totally unrelated topics), reply EXACTLY: "NO_REPLY".

4. CONVERSATION CONTEXT MEMORY:
   - Always analyze recent chat history. If the client previously discussed Virtual Try-On and now asks "what is cost?", know they are asking about Virtual Try-On pricing!

5. ZERO HALLUCINATIONS:
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

        // Auto-sanitize legacy hardcoded prompt data
        if (parsed.customPrompt && (parsed.customPrompt.includes('Thanks for sharing') || parsed.customPrompt.includes('How can I assist you today'))) {
          parsed.customPrompt = DEFAULT_KB.customPrompt;
        }

        if (parsed.productsAndPricing && (parsed.productsAndPricing.includes('4,999') || parsed.productsAndPricing.includes('4999') || parsed.productsAndPricing.includes('9,999') || parsed.productsAndPricing.includes('9999'))) {
          parsed.productsAndPricing = '';
        }
        if (parsed.faqsAndAnswers && parsed.faqsAndAnswers.includes('ai.vastra_tryon')) {
          parsed.faqsAndAnswers = '';
        }

        const merged = { ...DEFAULT_KB, ...parsed, customPrompt: DEFAULT_KB.customPrompt };
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

  private cleanOutputAnswerText(text: string): string {
    if (!text) return '';
    let clean = text.trim();

    // 1. Remove bracketed PDF tags if any
    clean = clean.replace(/\[\s*(PDF SHOULD BE DELIVERED|PDF NAME|SEND_PDF|ATTACH_PDF|SEND_PRESENTATION).*?\]/gi, '').trim();

    // 2. If text contains Q: or Question: before A: or Answer:, extract ONLY what follows A: or Answer:
    if (/(?:Q|Question)\s*[:\.]/i.test(clean) && /(?:A|Answer)\s*[:\.]/i.test(clean)) {
      const match = clean.match(/(?:A|Answer)\s*[:\.]\s*([\s\S]+)/i);
      if (match && match[1]) {
        clean = match[1].trim();
      }
    }

    // 3. Remove leading A:, A., Answer: if present
    clean = clean.replace(/^(?:A|Answer)\s*[:\.]\s*/i, '').trim();

    // 4. If text still has trailing Q: blocks, strip them
    clean = clean.split(/(?:Q|Question)\s*[:\.]/i)[0].trim();

    return clean;
  }

  public isHumanActive(chatJid: string): boolean {
    const msgs = db.messages.get(chatJid);
    if (!msgs || msgs.length === 0) return false;

    const cutoff = Date.now() - (this.kb.humanOverrideMinutes * 60 * 1000);
    const recentHumanMsg = msgs.slice(-5).reverse().find(m => m.fromMe && m.timestamp > cutoff);
    return Boolean(recentHumanMsg);
  }

  public async generateResponse(chatJid: string, incomingText: string, isSimulator: boolean = false): Promise<{ text: string; autoTagStatus?: 'INTERESTED' | 'WARM_INTERESTED'; documentPath?: string; documentName?: string }> {
    if (!isSimulator && !this.kb.enabled) {
      return { text: '' };
    }

    // Check Human Override
    if (!isSimulator && this.isHumanActive(chatJid)) {
      console.log(`[AI Agent] Human agent is active in ${chatJid}. AI auto-reply paused.`);
      return { text: '' };
    }

    const lowerQuery = incomingText.toLowerCase().trim();

    // 0. EXACT VERBATIM FAQ DOCUMENT MATCHING (Zero Delay / 100% Word-for-Word Accuracy)
    // Greetings: Hi / Hello / Hii / Hey
    if (/^(hi|hii|hiii|hello|helloo|hey|namaste|good\s+morning|good\s+afternoon|good\s+evening)[\!\s\.]*$/i.test(lowerQuery)) {
      this.aiAutoReplyCount++;
      return {
        text: `Hello! 👋 Welcome to AI Vastra. We provide AI Catalogue Photo Creation and AI Virtual Try-On for fashion businesses. What are you interested in — Catalogue Creation, Virtual Try-On, or Both?`
      };
    }

    // What is AI Vastra?
    if (lowerQuery.includes('what is ai vastra') || lowerQuery.includes('what is vastra') || lowerQuery === 'ai vastra' || lowerQuery === 'vastra') {
      this.aiAutoReplyCount++;
      return {
        text: `AI Vastra is a SaaS platform that generates high-converting AI catalogue photos and realistic Virtual Try-On models for fashion brands, retailers, and e-commerce sellers — in seconds, without expensive photoshoots.`
      };
    }

    // I want catalogue / Catalogue Creation
    if (lowerQuery.includes('i want catalogue') || lowerQuery.includes('catalogue creation') || lowerQuery.includes('catalog creation') || lowerQuery === 'catalogue' || lowerQuery === 'catalog') {
      this.aiAutoReplyCount++;
      return {
        text: `Great! 📸 For AI Catalogue Creation, we convert your plain flat-lay or mannequin garment photos into high-fashion model shots. What type of garments do you sell (Sarees, Kurtis, Westernwear, Men's wear)?`
      };
    }

    // Virtual Try-On
    if (lowerQuery.includes('virtual try') || lowerQuery.includes('try on') || lowerQuery.includes('virtual tryon') || lowerQuery === 'tryon') {
      this.aiAutoReplyCount++;
      return {
        text: `Awesome! 👗 Virtual Try-On lets your customers try on outfits digitally on realistic AI models. Would you like to see a demo video or try a live demo?`
      };
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

        // Clean out raw bracket tags, Q: headers, and A: prefixes so customer gets a clean human message
        responseText = this.cleanOutputAnswerText(responseText);

        // Increment automatic replies count
        this.aiAutoReplyCount++;

        return { text: responseText, autoTagStatus, documentPath: attachedDocPath, documentName: attachedDocName };
      } catch (err: any) {
        console.error('[AI Agent] OpenAI API call error, falling back to rule engine:', err.message);
      }
    }

    // 2. Smart Rule Engine Fallback (Uses uploaded document context if available)
    const docContext = ragEngine.retrieveRelevantContext(incomingText, 4000);
    const lower = incomingText.toLowerCase().trim();

    if (docContext && docContext.trim().length > 20) {
      // Parse Q: & A: blocks from document context for exact answer matching
      const blocks = docContext.split(/(?=Q:)/i);
      for (const block of blocks) {
        const parts = block.split(/A:/i);
        if (parts.length >= 2) {
          const qPart = parts[0].toLowerCase();
          const aPart = parts.slice(1).join('A:').split(/(?=Q:)/i)[0].trim();

          // Check if user query matches the Q: part or key intent
          if (qPart.includes(lower) || (lower.includes('hello') && qPart.includes('hello')) || (lower.includes('hi') && qPart.includes('hi'))) {
            this.aiAutoReplyCount++;
            return { text: this.cleanOutputAnswerText(aPart) };
          }
        }
      }

      // If generic match, extract top clean section from document
      const cleanLines = docContext.split('\n').map(l => l.trim()).filter(l => l.startsWith('A:') || (l.length > 10 && !l.startsWith('===') && !l.startsWith('Q:')));
      if (cleanLines.length > 0) {
        const textSnippet = cleanLines.slice(0, 2).join('\n').replace(/^A:\s*/i, '');
        this.aiAutoReplyCount++;
        return {
          text: textSnippet,
          autoTagStatus: lower.includes('price') || lower.includes('cost') ? 'WARM_INTERESTED' : 'INTERESTED'
        };
      }
    }

    this.aiAutoReplyCount++;
    return {
      text: `Hello! 👋 Welcome to AI Vastra.\nWe provide AI Catalogue Photo Creation and AI Virtual Try-On for fashion businesses. What are you interested in — Catalogue Creation, Virtual Try-On, or Both?`,
    };
  }

  private async callOpenAiLlm(apiKey: string, userQuery: string, chatJid: string): Promise<string> {
    const fetch = globalThis.fetch || require('node-fetch');


    // Retrieve semantic RAG document context from uploaded files (up to 25,000 chars - 100% of document)
    const ragContext = ragEngine.retrieveRelevantContext(userQuery, 25000);

    // Fetch recent chat history
    const msgs = db.messages.get(chatJid) || [];
    const recentHistory = msgs.slice(-6).map(m => ({
      role: m.fromMe ? 'assistant' : 'user',
      content: m.text || ''
    }));

    const systemPrompt = `
You are a real human sales employee at ${this.kb.companyName}. Your ONLY job is to deliver exact answers from the uploaded Knowledge Base document.

════════════════════════════════════
CRITICAL RULES — FOLLOW STRICTLY
════════════════════════════════════
1. 100% VERBATIM EXACT ANSWER DELIVERY (WORD-FOR-WORD FROM DOCUMENT):
   - Analyze the SEMANTIC MEANING of whatever question the client sends (no matter how they phrase it).
   - Match the question to the corresponding Q: entry in the uploaded Knowledge Base document.
   - You MUST output the EXACT text from the A: block of that question WORD-FOR-WORD!
   - Do NOT rewrite, paraphrase, summarize, or change a single word in the A: answer. Keep all original emojis, YouTube links, website URLs, pricing rates (e.g. ₹10 per catalogue photo), and line breaks 100% intact!

2. INTELLIGENT PDF BROCHURE DELIVERY:
   - When a client asks for pricing, demo videos, virtual try-on details, presentation, or demonstrates genuine interest in our services, output the tag [SEND_PDF: Ai Vastra - try-on 2.pdf] so the system automatically sends the presentation PDF attachment along with your exact answer!

3. UNRELATED / OFF-TOPIC MESSAGES (STRICT SILENCE):
   - Greetings like "Hi", "Hello", "Hey", "Good Morning", "Namaste" are VALID client greetings — ALWAYS reply using the matching "Q: Customer only says: Hi / Hello" entry from the document!
   - ONLY if the client's message is completely non-business or off-topic (e.g. spam, random jokes, weather, or totally unrelated topics), reply EXACTLY: "NO_REPLY".

4. CONVERSATION CONTEXT MEMORY:
   - Always analyze recent chat history. If the client previously discussed Virtual Try-On and now asks "what is cost?", match the Virtual Try-On pricing answer from the document!

5. ZERO HALLUCINATIONS:
   - ONLY state facts, prices, features, and links that exist in the uploaded Knowledge Base document. NEVER invent fake numbers or plans.

${ragContext ? `KNOWLEDGE BASE DOCUMENTS (Source of Truth — deliver EXACT A: text from here):\n${ragContext}` : 'NOTE: No document context retrieved.'}
    `.trim();

    const messages = [
      { role: 'system', content: systemPrompt },
      ...recentHistory,
      { role: 'user', content: userQuery }
    ];

    const body = {
      model: this.kb.openAiModel || 'gpt-4o-mini',
      messages,
      temperature: 0.0,
      max_tokens: 500
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
