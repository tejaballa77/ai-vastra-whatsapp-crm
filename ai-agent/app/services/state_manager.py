"""
AI Vastra - Customer State, Memory & Track Manager.
Maintains persistent customer profiles across WhatsApp sessions, prevents repetitive loops,
tracks product tracks (Catalogue, Virtual Try-On, AI Kiosk, Both), detects customer details (Name, Company, Purchase Intent),
and auto-creates urgent CRM leads.
"""

import re
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.logging import logger
from app.models.customer import CustomerProfile, UrgentLead


async def get_or_create_customer(
    db: AsyncSession,
    phone_number: str,
    name: str | None = None,
) -> CustomerProfile:
    """Retrieves or creates a CustomerProfile for persistent cross-session memory."""
    cleaned_phone = phone_number.strip() if phone_number else f"anon_{uuid.uuid4().hex[:8]}"
    query = select(CustomerProfile).where(CustomerProfile.phone_number == cleaned_phone)
    res = await db.execute(query)
    customer = res.scalar_one_or_none()

    if not customer:
        customer = CustomerProfile(
            phone_number=cleaned_phone,
            name=name if (name and name not in ["WhatsApp Customer", "Client"]) else None,
            active_track="unassigned",
            intent_state="greeting",
            session_count=1,
            last_seen_at=datetime.now(UTC),
        )
        db.add(customer)
        await db.commit()
        await db.refresh(customer)
        logger.info(f"Created new CustomerProfile for {cleaned_phone} (Name: {customer.name})")
    else:
        customer.session_count += 1
        customer.last_seen_at = datetime.now(UTC)
        if name and name not in ["WhatsApp Customer", "Client"] and not customer.name:
            customer.name = name
        await db.commit()
        await db.refresh(customer)
        logger.info(f"Loaded existing CustomerProfile for {cleaned_phone} (Name: {customer.name}, Track: {customer.active_track})")

    return customer


def resolve_primary_track(message: str, current_track: str | None = None) -> str | None:
    """
    Intelligently identifies the active subject/category being queried in the user's message.
    Handles numeric menu selection (1, 2, 3) as well as natural language queries.
    """
    lower = message.lower().strip()

    # 0. Numeric option selection
    if re.match(r"^(1|1️⃣|option\s*1|one)\b", lower):
        if not current_track or current_track in ["unassigned", "greeting"]:
            return "catalogue"
        return current_track

    if re.match(r"^(2|2️⃣|option\s*2|two)\b", lower):
        if not current_track or current_track in ["unassigned", "greeting"]:
            return "virtual_tryon"
        return current_track

    if re.match(r"^(3|3️⃣|option\s*3|three)\b", lower):
        if not current_track or current_track in ["unassigned", "greeting"]:
            return "ai_kiosk"
        return current_track
    
    # Check if a specific question is asked about a category
    has_vto = bool(re.search(r"\b(virtual[\s-]?try[\s-]?on|try[\s-]?on|vto)\b", lower))
    has_cat = bool(re.search(r"\b(catalogue|catalog|photoshoot|photo[\s-]?shoot|flat[\s-]?lay)\b", lower))
    has_kiosk = bool(re.search(r"\b(kiosk|standee|touchscreen)\b", lower))
    
    # 1. Check for explicit multi-service purchase / combo requests
    if bool(re.search(r"\b(both|all\s+three|all\s+3|all\s+services|everything)\b", lower)):
        return "both"
    if (has_cat and has_vto and not has_kiosk and re.search(r"\b(and|both|plus)\b", lower)):
        return "both"

    # 2. Check clauses from last to first (most recent clause is usually the actual question asked)
    clauses = re.split(r"[,;.?!\n]|(?:\bthen\b)|(?:\band\s+now\b)|(?:\bwhat\s+about\b)|(?:\bhow\s+about\b)", lower)
    for clause in reversed(clauses):
        c = clause.strip()
        if not c:
            continue
        c_vto = bool(re.search(r"\b(virtual[\s-]?try[\s-]?on|try[\s-]?on|vto)\b", c))
        c_cat = bool(re.search(r"\b(catalogue|catalog|photoshoot|photo[\s-]?shoot|flat[\s-]?lay)\b", c))
        c_kiosk = bool(re.search(r"\b(kiosk|standee|touchscreen)\b", c))
        
        if c_vto and not c_kiosk and not c_cat:
            return "virtual_tryon"
        if c_cat and not c_vto and not c_kiosk:
            return "catalogue"
        if c_kiosk and not c_vto and not c_cat:
            return "ai_kiosk"
        if (c_cat and c_vto) or (c_vto and c_kiosk) or (c_cat and c_kiosk):
            return "both"

    # 3. Overall sentence check
    if has_vto and not has_cat and not has_kiosk:
        return "virtual_tryon"
    if has_cat and not has_vto and not has_kiosk:
        return "catalogue"
    if has_kiosk and not has_vto and not has_cat:
        return "ai_kiosk"
    if (has_cat and has_vto) or (has_vto and has_kiosk) or (has_cat and has_kiosk):
        return "both"

    return None


def detect_customer_signals(text: str, current_track: str, current_name: str | None) -> dict[str, Any]:
    """
    Analyzes incoming customer message for Name, Track Preference, and Purchase/Buy intent.
    Strictly extracts names ONLY on explicit introductions (e.g. 'my name is X', 'I am X').
    """
    cleaned = text.strip()
    lower = cleaned.lower()
    signals: dict[str, Any] = {}

    # Numeric option detection
    if re.match(r"^(1|1️⃣|option\s*1|one)\b", lower):
        if current_track in ["unassigned", "greeting"]:
            signals["detected_track"] = "catalogue"
    elif re.match(r"^(2|2️⃣|option\s*2|two)\b", lower):
        if current_track in ["unassigned", "greeting"]:
            signals["detected_track"] = "virtual_tryon"
    elif re.match(r"^(3|3️⃣|option\s*3|three)\b", lower):
        if current_track in ["unassigned", "greeting"]:
            signals["detected_track"] = "ai_kiosk"

    # Greeting & Go Back check: resets track so user gets full greeting & 2 options
    is_go_back = bool(re.search(r"^(0|0️⃣|go\s*back|goback|back|menu|main\s*menu|restart|reset)\b", lower))
    is_greeting = bool(re.search(r"^(hi|hello|hey|start|namaste|good\s+(morning|afternoon|evening))\b", lower))
    if (is_greeting or is_go_back) and len(cleaned.split()) <= 4:
        signals["detected_track"] = "unassigned"
        signals["intent_state"] = "greeting"

    # 1. STRICT Name Extraction (Only on explicit introductions)
    if not current_name:
        name_match = re.search(
            r"\b(?:my name is|i am|this is|myself|call me)\s+([A-Za-z]+)\b",
            cleaned,
            re.IGNORECASE,
        )
        if name_match:
            candidate = name_match.group(1).strip().capitalize()
            if candidate.lower() not in ["hi", "hello", "hey", "interested", "need", "want", "sir", "madam"]:
                signals["detected_name"] = candidate
                logger.info(f"Explicit customer name detected: {candidate}")

    # 2. Business / Company / Website Extraction
    comp_match = re.search(
        r"\b(?:company|business|brand|store|shop)(?:\s+name)?(?:\s+is|\s*:)?\s+([A-Za-z0-9\s&]{2,35})\b",
        cleaned,
        re.IGNORECASE,
    )
    if comp_match:
        signals["detected_business"] = comp_match.group(1).strip()

    web_match = re.search(r"\b(?:website|site)(?:\s+is|\s*:)?\s+([a-zA-Z0-9.\-_/:]+\.[a-zA-Z]{2,10})\b", cleaned, re.IGNORECASE)
    if web_match:
        signals["detected_website"] = web_match.group(1).strip()

    # 3. Product Track Detection (Catalogue, Virtual Try-On, AI Kiosk, Both / All Three)
    detected_track = resolve_primary_track(cleaned)
    if detected_track:
        signals["detected_track"] = detected_track

    # 4. Intent Detection (Ready to Buy / Live Demo / Managed Service / Human)
    if re.search(r"\b(want\s+to\s+buy|wanna\s+buy|i\s+want\s+buy|how\s+to\s+buy|how\s+can\s+i\s+buy|purchase|pay|order|how\s+to\s+get\s+started|start\s+using|buy\s+now|checkout)\b", lower):
        signals["intent_state"] = "ready_to_buy"
    elif re.search(r"\b(don't\s+know\s+tech|do\s+not\s+know\s+tech|manage\s+(it|everything|for\s+us)|operate\s+for\s+us|just\s+send\s+photos|send\s+you\s+photos|you\s+manage|full\s+service)\b", lower):
        signals["intent_state"] = "managed_service_requested"
    elif re.search(r"\b(live\s+demo|schedule\s+demo|book\s+demo|want\s+a\s+demo|need\s+demo|arrange\s+demo|want\s+demo)\b", lower):
        signals["intent_state"] = "demo_requested"
    elif re.search(r"\b(talk\s+to\s+human|speak\s+with\s+someone|call\s+me|contact\s+someone|contact\s+the\s+person|human\s+agent|talk\s+directly)\b", lower):
        signals["intent_state"] = "human_handoff"
    elif re.search(r"\b(price|pricing|cost|how\s+much|package|packages|plans|starter|growth|pro|rate)\b", lower):
        signals["intent_state"] = "evaluating_pricing"

    return signals


async def update_customer_profile(
    db: AsyncSession,
    customer: CustomerProfile,
    signals: dict[str, Any],
) -> CustomerProfile:
    """Applies detected signals to customer memory."""
    if signals.get("detected_name") and not customer.name:
        customer.name = signals["detected_name"]
        logger.info(f"Updated customer name to {customer.name}")

    if signals.get("detected_business") and not customer.business_name:
        customer.business_name = signals["detected_business"]

    if signals.get("detected_website") and not customer.website:
        customer.website = signals["detected_website"]

    if "detected_track" in signals:
        customer.active_track = signals["detected_track"]
        logger.info(f"Updated customer active track to {customer.active_track}")

    if signals.get("intent_state"):
        customer.intent_state = signals["intent_state"]

    await db.commit()
    await db.refresh(customer)
    return customer


async def register_urgent_lead(
    db: AsyncSession,
    customer: CustomerProfile,
    requirement_summary: str,
    status: str = "urgent",
) -> UrgentLead:
    """Registers an urgent lead entry in the CRM Lead Box table."""
    lead = UrgentLead(
        customer_id=customer.id,
        customer_phone=customer.phone_number,
        customer_name=customer.name,
        business_name=customer.business_name,
        website=customer.website,
        active_track=customer.active_track if customer.active_track != "unassigned" else "catalogue",
        requirement_summary=requirement_summary,
        status=status,
    )
    db.add(lead)
    await db.commit()
    await db.refresh(lead)
    logger.info(f"🚨 Registered Urgent Lead for {customer.phone_number} (Name: {customer.name}, Track: {lead.active_track})")
    return lead


def build_contextual_prompt(customer: CustomerProfile, is_first_turn: bool = False) -> str:
    """
    Constructs dynamic, compact, context-aware instructions based on customer state and track.
    Eliminates repetitive loops and personalizes dialogue efficiently without emojis.
    """
    name_str = customer.name if customer.name else "UNKNOWN"
    track = customer.active_track

    return f"""You are a helpful, professional human sales representative at AI Vastra / Nice Digitals on WhatsApp.
Customer Context: Name: {name_str}, Phone: {customer.phone_number}, Active Track: {track.upper()}, Intent: {customer.intent_state.upper()}.

CORE RULES:
1. STRICTLY NO EMOJIS: Never output any emojis in your response. Output clean plain text only.
2. MULTILINGUAL: Always reply in the EXACT language used by the customer (English, Telugu, Hindi, Hinglish).
3. FORMATTING: Clean plain text only with bullet points (•). No asterisks (**) or citation brackets ([1], [2]).
4. SERVICE NAMES: "AI Catalogue Photoshoot" is identical to "AI Catalogue".
5. CONTINUITY: You have previous chat history. Never repeat introductory questions if track is already established.
6. GRATITUDE & THANK YOU RESPONSES:
   - If the customer says "Thank you", "Thanks", "Thank you for your kind information", or expresses gratitude:
     Respond politely: "You're most welcome! If you'd like to get started or need any assistance, feel free to visit aivastra.com or email us at support@aivastra.com. Have a great day!"
     DO NOT repeat pricing tables or long feature lists when customer is just saying thank you.
7. OFFICIAL URLS ONLY:
   - Website/Login/Sign-up/Pricing: https://aivastra.com
   - Play Store App: https://play.google.com/store/apps/details?id=aivastra.nice.interactive&hl=en_IN
   - Demo Videos: https://www.youtube.com/@ai.vastra_tryon/videos
   - Support Email: support@aivastra.com
8. OFFICIAL PRICING:
   • Virtual Try-On: Pay-As-You-Go ₹5/try-on. Packages: Starter ₹999 (180 try-ons), Growth ₹2,500 (455 try-ons), Pro ₹10,000 (2,105 try-ons), Enterprise ₹25,000 (6,000 try-ons). Supports Shopify & website.
   • AI Catalogue Photoshoot: Pay-As-You-Go ₹10/photo. Packages: Starter ₹1,000 (80 photos), Growth ₹5,000 (450 photos), Pro ₹10,000 (1,000 photos). Free sample at aivastra.com.
   • AI Kiosk Standee: ₹1,25,000 + GST (Delivery in 10-15 business days).
   • Terms: GST extra as applicable, credits never expire, 100% advance payment.
9. DEMO & ESCALATIONS:
   - When asked for video demo: share https://www.youtube.com/@ai.vastra_tryon/videos
   - When asked for live demo, custom enterprise deals, or human team: "Our team will contact you shortly."
10. IRRELEVANT MESSAGES: Output ONLY [NO_REPLY] if completely unrelated to AI Vastra."""
    return prompt
