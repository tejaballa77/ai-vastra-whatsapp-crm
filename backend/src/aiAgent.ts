import fs from 'fs';
import path from 'path';
import { db } from './store';

export interface AiKnowledgeBase {
  enabled: boolean;
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
  aiTone: 'Professional, polite, helpful, and concise',
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

    const lower = incomingText.toLowerCase().trim();

    // 1. Greetings
    if (/^(hi|hello|hey|good morning|good afternoon|hlo|hii|namaste)$/i.test(lower)) {
      return {
        text: `${this.kb.greetingMessage}\n\nFeel free to ask about our software plans, pricing, or virtual model shoot demos!`,
      };
    }

    // 2. Pricing & Cost inquiries
    if (lower.includes('price') || lower.includes('cost') || lower.includes('pricing') || lower.includes('pack') || lower.includes('plan') || lower.includes('charge')) {
      return {
        text: `Here are our AI Vastra software plans:\n\n${this.kb.productsAndPricing}\n\nWould you like to schedule a 10-minute live demo for your brand today?`,
        autoTagStatus: 'WARM_INTERESTED',
      };
    }

    // 3. Demo / Samples / Videos
    if (lower.includes('demo') || lower.includes('sample') || lower.includes('video') || lower.includes('catalog') || lower.includes('photo') || lower.includes('work')) {
      return {
        text: `You can watch our live catalog video demos here:\n👉 https://youtube.com/@ai.vastra_tryon\n\nWe can also arrange a 1-on-1 live demo on your own garments. Let us know what time works best for you!`,
        autoTagStatus: 'INTERESTED',
      };
    }

    // 4. Contact / Meeting / Call Request
    if (lower.includes('call') || lower.includes('speak') || lower.includes('meeting') || lower.includes('number') || lower.includes('address')) {
      return {
        text: `Thank you! Our senior sales specialist will call you shortly. You can also share your convenient time for a quick call.`,
        autoTagStatus: 'INTERESTED',
      };
    }

    // 5. Default Knowledge Base contextual response
    return {
      text: `Thank you for reaching out to ${this.kb.companyName}!\n\n${this.kb.companyDescription}\n\nYou can check demo videos here: https://youtube.com/@ai.vastra_tryon or reply with your preferred demo time!`,
    };
  }
}

export const aiAgent = new AiAgentService();
