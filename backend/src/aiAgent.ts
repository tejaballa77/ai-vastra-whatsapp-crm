import fs from 'fs';
import path from 'path';
import { db } from './store';

// Official Sales Links & Details
export const WEBSITE_URL = 'https://aivastra.com';
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=aivastra.nice.interactive&hl=en_IN';
export const VTO_DEMO_1 = 'https://www.youtube.com/shorts/Ttm_t_hE38k';
export const VTO_DEMO_2 = 'https://www.youtube.com/watch?v=gQBVFIHB394';
export const CATALOGUE_DEMO_CHANNEL = 'https://www.youtube.com/@ai.vastra_tryon';
export const CATALOGUE_DEMO_VIDEOS = 'https://www.youtube.com/@ai.vastra_tryon/videos';
export const SUPPORT_EMAIL = 'support@aivastra.com';

// Escalation Patterns
const ESCALATION_PATTERNS: [RegExp, string][] = [
  [/\b(custom\s+pricing|custom\s+quote|wholesale\s+pricing|custom\s+rate|discount|negotiat(e|ion))\b/i, 'Custom Pricing / Discount Request'],
  [/\b(reseller\s+pricing|reselling|franchise|white[\s-]?label\s+pricing|agency\s+pricing)\b/i, 'Reseller / Agency Pricing'],
  [/\b(custom\s+contract|large[\s-]?volume\s+deal|10000\+\s+images)\b/i, 'Large-Volume Requirement'],
  [/\b(custom\s+ai\s+models?|fine[\s-]?tun(e|ing)|train(ing)?\s+our\s+own\s+model|custom\s+model)\b/i, 'Custom AI Model Request'],
  [/\b(api\s+access|api\s+keys?|developer\s+api|sdk\s+access|api\s+integration)\b/i, 'API Access Request'],
  [/\b(special\s+integration|custom\s+integration|erp\s+integration|sap\s+integration)\b/i, 'Special Integration Request'],
  [/\b(partner(ship)?|collaborat(e|ion)|b2b\s+tie[\s-]?up|distributor)\b/i, 'Partnership Discussion'],
  [/\b(speak\s+to\s+(someone|human|person|agent|manager|founder)|talk\s+to\s+(a\s+)?(human|agent|person)|customer\s+care\s+number|call\s+me)\b/i, 'Human Handoff Request'],
];

export const MASTER_AI_VASTRA_PROMPT = `
You are a real human sales employee working for AI Vastra / Nice Digitals on WhatsApp.
Your job is to answer customer questions about AI Vastra based on our official product offerings and knowledge base.

════════════════════════════════════════
COMPANY IDENTITY & OFFERINGS:
════════════════════════════════════════
- Company: AI Vastra / Nice Digitals
- Website: https://aivastra.com
- Support Email: support@aivastra.com
- Core Offerings:
  1. AI Catalogue Photo Creation (turns flat-lay or hanger garment photos into model catalogue photos).
  2. AI Virtual Try-On (allows customers on websites/Shopify to try on outfits virtually).
  3. AI Kiosk (43-inch Full HD Smart Touchscreen Standee for offline retail stores).

════════════════════════════════════════
OFFICIAL GREETING (ON HI / HELLO / START):
════════════════════════════════════════
When a customer sends an initial greeting ("hi", "hello", "hey", "namaste", "start"):
"Hello! 👋 Welcome to AI Vastra. We provide AI Catalogue Photo Creation and AI Virtual Try-On for fashion businesses. What are you interested in — Catalogue Creation, Virtual Try-On, or Both?"

════════════════════════════════════════
PRODUCT PRICING & PACKAGES:
════════════════════════════════════════
1. AI Catalogue Photo Creation:
   • Pay-As-You-Go: ₹10 per catalogue photo (no monthly commitment).
   • Package Plans:
     - Starter: ₹1,000 for 80 images (₹12.50 / photo)
     - Growth: ₹5,000 for 450 images (₹11.11 / photo)
     - Pro: ₹10,000 for 1,000 images (₹10.00 / photo)
   • Free sample trial available at aivastra.com.

2. AI Virtual Try-On:
   • Pay-As-You-Go: ₹5 per successful Try-On (no monthly commitment).
   • Package Plans:
     - Starter: ₹999 for 180 Try-Ons (₹5.55 / Try-On)
     - Growth: ₹2,500 for 455 Try-Ons (₹5.49 / Try-On)
     - Pro: ₹10,000 for 2,105 Try-Ons (₹4.75 / Try-On)
     - Enterprise: ₹25,000 for 6,000 Try-Ons (₹4.17 / Try-On)
   • Website and Shopify integration supported.

3. AI Kiosk (Retail Standee):
   • 43-inch Full HD Standee for offline retail stores.
   • Total Price: ₹1,25,000 + 18% GST = ₹1,47,500.
   • Hardware: ₹1,07,500 | Camera: ₹7,500 | Installation & Demo: ₹10,000.
   • Delivery: 10–15 business days.

4. Terms:
   • GST is extra as applicable.
   • Credits do not expire.
   • 100% advance payment at order confirmation.

════════════════════════════════════════
LANGUAGE & MULTILINGUAL MATCHING:
════════════════════════════════════════
- ALWAYS respond in the SAME language/script the customer used!
- For TELUGU queries (Telugu script or Roman Telugu e.g. "Pricing entha?", "Catalogue details cheppandi"):
  Reply politely in natural Telugu/Roman Telugu with accurate pricing and details.
- For HINDI queries (Devanagari or Hinglish e.g. "catalogue ka price kya hai?", "kaise kaam karta hai?"):
  Reply politely in natural Hindi/Hinglish with accurate pricing.
- For ENGLISH queries: Reply in clear English.

════════════════════════════════════════
HUMAN HANDOFF & DEMO ESCALATION RULES:
════════════════════════════════════════
1. Managed Services / Non-Technical Clients ("we don't know tech", "can you manage everything for us"):
   "Sure! We can help you with that. Our team will contact you regarding this."

2. Team Contact Request ("speak to team", "call me", "connect with sales"):
   - If Name is Already Known (e.g. Rahul): "Sure Rahul! Our team will contact you regarding this."
   - If Name is NOT Known: "Sure! May I know your name sir/ma'am?" -> When they reply with name: "Sure [Name]! Our team will contact you shortly."

3. Live Demo Request ("I want a live demo", "schedule demo"):
   - If Name is Known: "Sure [Name]! Please share your business name and website (and whether you are interested in Catalogue, Virtual Try-On, or Both)."
   - If Name is NOT Known: "Sure! May I know your name, business name, and website so we can schedule your live demo?"
   - When details provided: "Thank you! Your demo request has been received. Our team will schedule it and update you with the confirmed time after checking with our team."

4. Demo Video Requests:
   "Thank you for showing interest in AI Vastra. For demo videos, please visit our YouTube channel:
   https://www.youtube.com/@ai.vastra_tryon/videos"

════════════════════════════════════════
FORMATTING & CONVERSATIONAL RULES:
════════════════════════════════════════
- NEVER use double asterisks (**) or markdown quotes.
- Use clean plain text with bullet points (•) and links.
- Keep WhatsApp replies short, friendly, conversational, and direct.
- Never invent unauthorized discounts or models.
- If a message is completely unrelated to AI Vastra, fashion catalogue creation, virtual try-on, or retail tech (e.g. spam, random jokes), reply EXACTLY:
[NO_REPLY]
`.trim();

class AiAgentService {
  private openAiApiKey: string;
  private openAiModel: string;
  public enabled: boolean = true;

  constructor() {
    this.openAiApiKey = process.env.OPENAI_API_KEY || '';
    this.openAiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  }

  public setApiKey(key: string) {
    this.openAiApiKey = key.trim();
  }

  public setModel(model: string) {
    this.openAiModel = model.trim();
  }

  private cleanOutputText(text: string): string {
    if (!text) return '';
    let clean = text.trim();
    // Strip markdown bold asterisks
    clean = clean.replace(/\*\*(.*?)\*\*/g, '$1');
    clean = clean.replace(/\*(.*?)\*/g, '$1');
    // Strip markdown headers
    clean = clean.replace(/^#+\s+/gm, '');
    return clean.trim();
  }

  public async generateResponse(
    chatJid: string,
    incomingText: string
  ): Promise<{ text: string; autoTagStatus?: 'INTERESTED' | 'WARM_INTERESTED' }> {
    if (!this.enabled) return { text: '' };

    const lowerQuery = incomingText.toLowerCase().trim();

    // 1. Initial Quick Greeting Check
    if (/^(hi|hello|hey|namaste|start|good\s+morning|good\s+afternoon|good\s+evening)[\!\s\.]*$/i.test(lowerQuery)) {
      return {
        text: 'Hello! 👋 Welcome to AI Vastra. We provide AI Catalogue Photo Creation and AI Virtual Try-On for fashion businesses. What are you interested in — Catalogue Creation, Virtual Try-On, or Both?',
      };
    }

    // 2. Hindi Greeting Check
    if (/^(namaste|pranam|namaskar|shubh\s+sandhya|shubh\s+prabhat|नमस्ते|प्रणाम|नमस्कार)[\!\s\.]*$/i.test(lowerQuery)) {
      return {
        text: 'नमस्ते! 👋 AI Vastra में आपका स्वागत है। हम फैशन बिज़नेस के लिए AI Catalogue Photo Creation और AI Virtual Try-On सेवाएं प्रदान करते हैं। आप किसमें रुचि रखते हैं — Catalogue Creation, Virtual Try-On, या दोनों?',
      };
    }

    // 3. Telugu Greeting Check
    if (/^(namaskaram|namaskaramu|హలో|నమస్కారం)[\!\s\.]*$/i.test(lowerQuery)) {
      return {
        text: 'నమస్కారం! 👋 AI Vastra కి స్వాగతం. మేము ఫ్యాషన్ వ్యాపారాల కోసం AI Catalogue Photo Creation మరియు AI Virtual Try-On సేవలను అందిస్తున్నాము. మీకు దేనిపై ఆసక్తి ఉంది — Catalogue Creation, Virtual Try-On, లేదా రెండింటిలోనూ?',
      };
    }

    // 4. Check Escalation Triggers
    for (const [pattern] of ESCALATION_PATTERNS) {
      if (pattern.test(lowerQuery)) {
        return {
          text: 'Sure! Our team will contact you shortly regarding this. Please share your requirement details and our team will get in touch with you.',
          autoTagStatus: 'INTERESTED',
        };
      }
    }

    // 5. Query OpenAI LLM (gpt-4o-mini)
    const apiKey = this.openAiApiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.warn('[AI Agent] OPENAI_API_KEY not configured. Falling back to structured response.');
      return {
        text: 'Hello! 👋 Welcome to AI Vastra. We provide AI Catalogue Photo Creation (₹10/photo) and AI Virtual Try-On (₹5/try-on). Would you like to know more about our catalogue or virtual try-on packages?',
      };
    }

    try {
      // Retrieve recent conversation history for this chat
      const msgs = db.messages.get(chatJid) || [];
      const recentHistory = msgs.slice(-10).map(m => ({
        role: m.fromMe ? 'assistant' : 'user',
        content: m.text || '',
      }));

      const messages = [
        { role: 'system', content: MASTER_AI_VASTRA_PROMPT },
        ...recentHistory,
        { role: 'user', content: incomingText },
      ];

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: this.openAiModel || 'gpt-4o-mini',
          messages,
          temperature: 0.2,
          max_tokens: 600,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`OpenAI API error (${res.status}): ${errText}`);
      }

      const data: any = await res.json();
      let responseText = data.choices?.[0]?.message?.content?.trim() || '';

      // Check strict silence token
      if (responseText.includes('[NO_REPLY]') || responseText.includes('NO_REPLY') || responseText.length === 0) {
        console.log(`[AI Agent] Off-topic/irrelevant message from ${chatJid}. Silence policy applied.`);
        return { text: '' };
      }

      responseText = this.cleanOutputText(responseText);

      // Determine autoTagStatus
      const lowerCombined = (incomingText + ' ' + responseText).toLowerCase();
      let autoTagStatus: 'INTERESTED' | 'WARM_INTERESTED' | undefined = undefined;
      if (lowerCombined.includes('price') || lowerCombined.includes('cost') || lowerCombined.includes('pack')) {
        autoTagStatus = 'WARM_INTERESTED';
      }
      if (lowerCombined.includes('demo') || lowerCombined.includes('call') || lowerCombined.includes('buy') || lowerCombined.includes('team will contact')) {
        autoTagStatus = 'INTERESTED';
      }

      return { text: responseText, autoTagStatus };
    } catch (err: any) {
      console.error('[AI Agent] Error calling OpenAI:', err.message);
      return {
        text: 'Hello! 👋 Welcome to AI Vastra. We offer AI Catalogue Photo Creation (₹10/photo) and AI Virtual Try-On (₹5/try-on). How can we help you today?',
      };
    }
  }
}

export const aiAgent = new AiAgentService();
