import fs from 'fs';
import path from 'path';
import { db } from './store';

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
}

const DEFAULT_KB: AiKnowledgeBase = {
  enabled: true,
  openAiApiKey: process.env.OPENAI_API_KEY || '',
  openAiModel: 'gpt-4o-mini',
  companyName: 'AI Vastra',
  companyDescription: 'AI Vastra helps fashion brands, retailers, and D2C clothing companies create instant AI-powered virtual model photoshoots, product catalogs, and catalog videos without expensive physical photoshoots.',
  productsAndPricing: `
1. Growth Pack: ₹4,999/month - Includes 50 Virtual Model Shoots, High-Resolution Output, Catalog Exports.
2. Pro Pack: ₹9,999/month - Includes 150 Virtual Model Shoots, Custom Models, Priority Rendering, Dedicated Support.
3. Enterprise Plan: Custom Pricing - Unlimited Virtual Shoots, Custom AI Model Training, API Access.
Live Demo Video Link: https://youtube.com/@ai.vastra_tryon
  `.trim(),
  faqsAndAnswers: `
Q: How does AI Vastra work?
A: You simply upload flat photos of your garments (shirts, sarees, dresses), and our AI places them onto realistic virtual models in 30 seconds.

Q: Is there a free trial or live demo?
A: Yes, we arrange 10-minute live interactive demos for brands.

Q: Can I see sample videos or catalog photos?
A: Yes, check our official video demos here: https://youtube.com/@ai.vastra_tryon
  `.trim(),
  greetingMessage: 'Hello! Welcome to AI Vastra. We help fashion brands create instant AI virtual model shoots. How can I help you today?',
  aiTone: 'Professional, polite, enthusiastic, and helpful sales specialist',
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
        return { ...DEFAULT_KB, ...JSON.parse(raw) };
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

  public isHumanActive(chatJid: string): boolean {
    const msgs = db.messages.get(chatJid);
    if (!msgs || msgs.length === 0) return false;

    const cutoff = Date.now() - (this.kb.humanOverrideMinutes * 60 * 1000);
    const recentHumanMsg = msgs.slice(-5).reverse().find(m => m.fromMe && m.timestamp > cutoff);
    return Boolean(recentHumanMsg);
  }

  public async generateResponse(chatJid: string, incomingText: string): Promise<{ text: string; autoTagStatus?: 'INTERESTED' | 'WARM_INTERESTED' }> {
    if (!this.kb.enabled) {
      return { text: '' };
    }

    // Check Human Override
    if (this.isHumanActive(chatJid)) {
      console.log(`[AI Agent] Human agent is active in ${chatJid}. AI auto-reply paused.`);
      return { text: '' };
    }

    const apiKey = this.kb.openAiApiKey || process.env.OPENAI_API_KEY;

    // 1. If OpenAI API Key is provided -> Call OpenAI GPT-4o / GPT-3.5
    if (apiKey) {
      try {
        const responseText = await this.callOpenAiLlm(apiKey, incomingText, chatJid);
        const lowerRes = (incomingText + ' ' + responseText).toLowerCase();
        let autoTagStatus: 'INTERESTED' | 'WARM_INTERESTED' | undefined = undefined;

        if (lowerRes.includes('price') || lowerRes.includes('cost') || lowerRes.includes('pack') || lowerRes.includes('pricing')) {
          autoTagStatus = 'WARM_INTERESTED';
        }
        if (lowerRes.includes('demo') || lowerRes.includes('call') || lowerRes.includes('meeting') || lowerRes.includes('buy')) {
          autoTagStatus = 'INTERESTED';
        }

        return { text: responseText, autoTagStatus };
      } catch (err: any) {
        console.error('[AI Agent] OpenAI API call error, falling back to rule engine:', err.message);
      }
    }

    // 2. Rule Engine Fallback (Zero-Cost)
    const lower = incomingText.toLowerCase().trim();

    if (/^(hi|hello|hey|good morning|good afternoon|hlo|hii|namaste)$/i.test(lower)) {
      return {
        text: `${this.kb.greetingMessage}\n\nFeel free to ask about our software plans, pricing, or virtual model shoot demos!`,
      };
    }

    if (lower.includes('price') || lower.includes('cost') || lower.includes('pricing') || lower.includes('pack') || lower.includes('plan')) {
      return {
        text: `Here are our AI Vastra software plans:\n\n${this.kb.productsAndPricing}\n\nWould you like to schedule a 10-minute live demo for your brand today?`,
        autoTagStatus: 'WARM_INTERESTED',
      };
    }

    if (lower.includes('demo') || lower.includes('sample') || lower.includes('video') || lower.includes('catalog')) {
      return {
        text: `You can watch our live catalog video demos here:\n👉 https://youtube.com/@ai.vastra_tryon\n\nWe can also arrange a 1-on-1 live demo on your own garments. Let us know what time works best for you!`,
        autoTagStatus: 'INTERESTED',
      };
    }

    return {
      text: `Thank you for reaching out to ${this.kb.companyName}!\n\n${this.kb.companyDescription}\n\nYou can check demo videos here: https://youtube.com/@ai.vastra_tryon or reply with your preferred demo time!`,
    };
  }

  private async callOpenAiLlm(apiKey: string, userQuery: string, chatJid: string): Promise<string> {
    const fetch = globalThis.fetch || require('node-fetch');
    const { ragEngine } = require('./ragEngine');

    // Retrieve semantic RAG document context from uploaded files
    const ragContext = ragEngine.retrieveRelevantContext(userQuery, 3000);

    // Fetch recent chat history
    const msgs = db.messages.get(chatJid) || [];
    const recentHistory = msgs.slice(-6).map(m => ({
      role: m.fromMe ? 'assistant' : 'user',
      content: m.text || ''
    }));

    const systemPrompt = `
You are a human employee and official Sales Specialist at ${this.kb.companyName}.
Your tone must be: ${this.kb.aiTone}. Chat naturally, politely, and professionally as a real employee.

COMPANY OVERVIEW:
${this.kb.companyDescription}

PRODUCTS, PACKAGES & PRICING:
${this.kb.productsAndPricing}

TEXT FAQS & POLICIES:
${this.kb.faqsAndAnswers}

${ragContext ? `RETRIEVED DOCUMENT KNOWLEDGE (RAG PIPELINE):
${ragContext}` : ''}

CRITICAL INSTRUCTIONS:
1. Analyze the customer's question carefully. Understand the underlying meaning/intent, even if the wording differs from the FAQs or documents.
2. Frame a 100% RELEVANT, professional, natural, and helpful response strictly based on the company overview, pricing, FAQs, and uploaded RAG document knowledge above.
3. Chat like a real human employee working at this company (friendly, helpful, concise).
4. Format for WhatsApp with clean line breaks and appropriate emojis. Keep response under 150 words.
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
