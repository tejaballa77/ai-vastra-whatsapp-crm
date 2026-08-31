"""
AI Vastra - Official Sales Agent Knowledge Base, Intent Matching & Escalation Engine.
Strictly implements:
1. Semantic Intent & Motive Matching
2. 100% Verbatim Exact Answer Delivery from AI_Vastra_WhatsApp_AI_FAQ.pdf
3. Complete Package Reference Plans (Section 5 & 6) and Pay-As-You-Go rates
4. Zero Hallucination & No Unsupported Claims
5. Strict Silence on Major Irrelevant Topics
6. Multilingual Language Matching (English, Hindi, Hinglish)
7. Official AI Vastra Response Rules (Section 13)
8. Escalation to Ai Vastra Sales Team ("Our team will contact you shortly")
"""

import re
from typing import TypedDict


class EscalationCheckResult(TypedDict):
    is_escalated: bool
    reason: str | None
    escalation_message: str | None


# Official Sales Team Contact
SALES_TEAM_NAME = "Ai Vastra Sales Team"
SALES_TEAM_EMAIL = "support@aivastra.com"

# Official Links
WEBSITE_URL = "https://aivastra.com"
PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=aivastra.nice.interactive&hl=en_IN"
VTO_DEMO_1 = "https://www.youtube.com/shorts/Ttm_t_hE38k"
VTO_DEMO_2 = "https://www.youtube.com/watch?v=gQBVFIHB394"
CATALOGUE_DEMO_CHANNEL = "https://www.youtube.com/@ai.vastra_tryon"
CATALOGUE_DEMO_VIDEOS = "https://www.youtube.com/@ai.vastra_tryon/videos"

# Standard Human Handoff / Escalation Message
ESCALATION_TRANSFER_MESSAGE = (
    "Sure! Our team will contact you shortly to assist you directly. "
    "Please share your requirement details and our team will get in touch with you."
)

# Strict escalation triggers for manual/negotiated requests
ESCALATION_PATTERNS = [
    # Custom pricing, discount & volume negotiation
    (r"\b(custom\s+pricing|custom\s+quote|wholesale\s+pricing|custom\s+rate|discount|negotiat(e|ion))\b", "Custom Pricing / Discount Request"),
    (r"\b(reseller\s+pricing|reselling|franchise|white[\s-]?label\s+pricing|agency\s+pricing)\b", "Reseller / Agency Pricing"),
    (r"\b(custom\s+contract|large[\s-]?volume\s+deal|10000\+\s+images)\b", "Large-Volume Requirement"),
    # Custom AI models & API
    (r"\b(custom\s+ai\s+models?|fine[\s-]?tun(e|ing)|train(ing)?\s+our\s+own\s+model|custom\s+model)\b", "Custom AI Model Request"),
    (r"\b(api\s+access|api\s+keys?|developer\s+api|sdk\s+access|api\s+integration)\b", "API Access Request"),
    (r"\b(special\s+integration|custom\s+integration|erp\s+integration|sap\s+integration)\b", "Special Integration Request"),
    # Partnership
    (r"\b(partner(ship)?|collaborat(e|ion)|b2b\s+tie[\s-]?up|distributor)\b", "Partnership Discussion"),
    # Human agent / Call request
    (r"\b(speak\s+to\s+(someone|human|person|agent|manager|founder)|talk\s+to\s+(a\s+)?(human|agent|person)|customer\s+care\s+number|call\s+me)\b", "Human Handoff Request"),
]


def check_escalation_triggers(query: str) -> EscalationCheckResult:
    """Checks whether the query triggers an immediate transfer to sales team."""
    cleaned_query = query.lower().strip()

    for pattern, reason in ESCALATION_PATTERNS:
        if re.search(pattern, cleaned_query):
            return {
                "is_escalated": True,
                "reason": reason,
                "escalation_message": ESCALATION_TRANSFER_MESSAGE,
            }

    return {
        "is_escalated": False,
        "reason": None,
        "escalation_message": None,
    }


# Master System Prompt Grounded in AI_Vastra_WhatsApp_AI_FAQ.pdf
AI_VASTRA_SYSTEM_PROMPT = """You are a helpful, professional human sales representative at AI Vastra / Nice Digitals on WhatsApp.

CORE RULES:
1. STRICTLY NO EMOJIS: Never output any emojis in your response. Output clean plain text only.
2. MULTILINGUAL: Always reply in the EXACT language used by the customer (English, Telugu, Hindi, Hinglish).
3. FORMATTING: Clean plain text only with bullet points (•). No asterisks (**) or citation brackets ([1], [2]).
4. SERVICE NAMES: "AI Catalogue Photoshoot" is identical to "AI Catalogue".
5. GRATITUDE & THANK YOU RESPONSES:
   - If the customer says "Thank you", "Thanks", "Thank you for your kind information", or expresses gratitude:
     Respond politely: "You're most welcome! If you'd like to get started or need any assistance, feel free to visit aivastra.com or email us at support@aivastra.com. Have a great day!"
     DO NOT repeat pricing tables when customer is saying thank you.
6. OFFICIAL URLS ONLY:
   - Website/Login/Sign-up/Pricing: https://aivastra.com
   - Play Store App: https://play.google.com/store/apps/details?id=aivastra.nice.interactive&hl=en_IN
   - Demo Videos: https://www.youtube.com/@ai.vastra_tryon/videos
   - Support Email: support@aivastra.com
7. OFFICIAL PRICING:
   • Virtual Try-On: Pay-As-You-Go ₹5/try-on. Packages: Starter ₹999 (180 try-ons), Growth ₹2,500 (455 try-ons), Pro ₹10,000 (2,105 try-ons), Enterprise ₹25,000 (6,000 try-ons). Supports Shopify & website.
   • AI Catalogue Photoshoot: Pay-As-You-Go ₹10/photo. Packages: Starter ₹1,000 (80 photos), Growth ₹5,000 (450 photos), Pro ₹10,000 (1,000 photos). Free sample at aivastra.com.
   • AI Kiosk Standee: ₹1,25,000 + GST (Delivery in 10-15 business days).
   • Terms: GST extra as applicable, credits never expire, 100% advance payment.
8. DEMO & ESCALATIONS:
   - When asked for video demo: share https://www.youtube.com/@ai.vastra_tryon/videos
   - When asked for live demo, custom enterprise deals, or human team: "Our team will contact you shortly."
9. CONCISE & USER-FRIENDLY: Keep all replies short, friendly, and directly relevant (2 to 4 sentences/bullets maximum). Never output bloated text or long essays.
10. IRRELEVANT MESSAGES: Output ONLY [NO_REPLY] if completely unrelated to AI Vastra."""
