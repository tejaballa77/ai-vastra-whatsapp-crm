import re
import uuid
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.config import settings
from app.core.logging import logger
from app.db.session import get_db
from app.models.conversation import Conversation, Message
from app.models.customer import CustomerProfile, UrgentLead
from app.models.workspace import Workspace
from app.services.rag import execute_rag_sync
from app.services.sales_rules import (
    SALES_TEAM_EMAIL,
    SALES_TEAM_NAME,
)
from app.services.state_manager import (
    detect_customer_signals,
    get_or_create_customer,
    register_urgent_lead,
    update_customer_profile,
)

router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])


class InteractiveButton(BaseModel):
    id: str
    title: str
    query: str


class WhatsAppMessageRequest(BaseModel):
    message: str = Field(..., description="Incoming customer message from WhatsApp")
    sender_phone: str | None = Field(default=None, description="Customer WhatsApp phone number or Session ID")
    sender_name: str | None = Field(default=None, description="Customer display name")
    workspace_id: uuid.UUID | None = Field(default=None, description="Workspace ID")
    conversation_id: str | None = Field(default=None, description="Specific Conversation ID or WhatsApp JID")


class WhatsAppMessageResponse(BaseModel):
    reply: str
    is_escalated: bool = False
    escalation_reason: str | None = None
    is_ignored: bool = False
    citations: list[dict[str, Any]] = []
    sales_rep: dict[str, str] = {
        "name": SALES_TEAM_NAME,
        "email": SALES_TEAM_EMAIL,
    }
    conversation_id: str
    customer_name: str | None = None
    customer_phone: str = "Client"
    active_track: str = "unassigned"
    interactive_buttons: list[InteractiveButton] = []


class UrgentLeadResponse(BaseModel):
    id: str
    customer_phone: str
    customer_name: str | None
    business_name: str | None
    active_track: str
    requirement_summary: str
    status: str
    created_at: str


async def _get_or_create_default_workspace(db: AsyncSession) -> Workspace:
    """Finds or creates default AI Vastra WhatsApp FAQ workspace."""
    query = select(Workspace).order_by(Workspace.created_at.asc()).limit(1)
    res = await db.execute(query)
    workspace = res.scalar_one_or_none()
    if not workspace:
        workspace = Workspace(name="Whatsapp_FAQ")
        db.add(workspace)
        await db.commit()
        await db.refresh(workspace)
    return workspace


@router.post("/message", response_model=WhatsAppMessageResponse)
@router.post("/message/", response_model=WhatsAppMessageResponse)
async def handle_whatsapp_message(
    payload: WhatsAppMessageRequest,
    db: AsyncSession = Depends(get_db),
) -> WhatsAppMessageResponse:
    """
    Stateful WhatsApp Sales Chat Endpoint with Isolated Cross-Session Memory & Lead Tracking.
    Guarantees Section 10 Greeting with 3 Main Options (AI Catalogue, Virtual Try-On, AI Kiosk) on any hi/hello.
    """
    logger.info(f"Received WhatsApp message from {payload.sender_phone}: '{payload.message}'")

    if not payload.message or not payload.message.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Message content cannot be empty.",
        )

    workspace = await _get_or_create_default_workspace(db)

    # 1. Generate or use unique customer phone key per chat session
    phone_key = payload.sender_phone.strip() if (payload.sender_phone and payload.sender_phone.strip()) else f"session_{uuid.uuid4().hex[:8]}"
    customer = await get_or_create_customer(db, phone_key, payload.sender_name)

    # 2. Extract Customer Signals (Strict Name, Track, Purchase/Buy Intent)
    signals = detect_customer_signals(payload.message, customer.active_track, customer.name)
    customer = await update_customer_profile(db, customer, signals)

    # 3. Retrieve or Create Conversation
    conversation = None
    if payload.conversation_id:
        try:
            parsed_uuid = uuid.UUID(payload.conversation_id)
            conv_query = select(Conversation).where(Conversation.id == parsed_uuid)
            conv_res = await db.execute(conv_query)
            conversation = conv_res.scalar_one_or_none()
        except Exception:
            conv_query = (
                select(Conversation)
                .where(Conversation.title.like(f"%{payload.conversation_id}%"))
                .order_by(Conversation.created_at.desc())
                .limit(1)
            )
            conv_res = await db.execute(conv_query)
            conversation = conv_res.scalar_one_or_none()
    
    if not conversation:
        conv_query = (
            select(Conversation)
            .where(Conversation.title.like(f"%{phone_key}%"))
            .order_by(Conversation.created_at.desc())
            .limit(1)
        )
        conv_res = await db.execute(conv_query)
        conversation = conv_res.scalar_one_or_none()

    if not conversation:
        title_snippet = f"[{phone_key}] - {payload.message[:25]}"
        conversation = Conversation(
            title=title_snippet,
            workspace_id=workspace.id,
        )
        db.add(conversation)
        await db.commit()
        await db.refresh(conversation)

    # 4. Load Conversation History (Last 10 recent messages)
    hist_query = (
        select(Message)
        .where(Message.conversation_id == conversation.id)
        .order_by(Message.created_at.desc())
        .limit(10)
    )
    hist_res = await db.execute(hist_query)
    history_records = list(reversed(hist_res.scalars().all()))

    clean_msg = payload.message.lower().strip()
    norm_msg = re.sub(r'h+i+', 'hi', clean_msg)
    norm_msg = re.sub(r'h+e+y+', 'hey', norm_msg)
    norm_msg = re.sub(r'h+e+l+o+w*|h+e+l+o+', 'hello', norm_msg)

    is_pure_greeting = bool(re.search(r"^(hi|hello|hey|start|namaste|menu|options|good\s+(morning|afternoon|evening))\b", norm_msg)) and not bool(re.search(r"\b(catalogue|catalog|virtual|try[\s-]?on|kiosk|demo|contact|team|price|cost|buy|how|what|when|where|why)\b", norm_msg))
    is_hindi_greeting = bool(re.search(r"^(namaste|pranam|namaskar|shubh\s+sandhya|shubh\s+prabhat|नमस्ते|प्रणाम|नमस्कार)\b", norm_msg)) and not bool(re.search(r"\b(catalogue|catalog|virtual|try[\s-]?on|kiosk|demo|contact|team|price|cost|buy)\b", norm_msg))

    is_initial_greeting = is_pure_greeting or norm_msg in ["hi", "hello", "hey", "start", "menu", "options"] or len(history_records) == 0
    is_initial_hindi_greeting = is_hindi_greeting and len(history_records) == 0

    messages_history = [
        {"role": msg.role, "content": msg.content} for msg in history_records
    ]
    messages_history.append({"role": "user", "content": payload.message})

    # Save incoming user message
    user_msg = Message(
        role="user",
        content=payload.message,
        conversation_id=conversation.id,
    )
    db.add(user_msg)
    await db.commit()

    # 6. Check for Deterministic Menu Selection (1, 2, or Go Back 0)
    is_go_back = bool(re.search(r"^(0|0️⃣|go\s*back|goback|back|menu|main\s*menu|restart|reset)\b", clean_msg)) or clean_msg == "0"
    is_opt1 = bool(re.match(r"^(1|1️⃣|option\s*1|one)\b", clean_msg)) or any(k in norm_msg for k in ["catalogue photoshoot", "catalog photoshoot", "catalogue", "catalog", "photoshoot"])
    is_opt2 = bool(re.match(r"^(2|2️⃣|option\s*2|two)\b", clean_msg)) or any(k in norm_msg for k in ["virtual try-on", "virtual try on", "try-on", "try on", "vto", "tryon"])

    if is_opt1:
        customer.active_track = "catalogue"
        db.add(customer)
        await db.commit()
        rag_result = {
            "response": "Thank you for your interest in AI Catalogue Photoshoot!\n\nWe create professional, studio-quality fashion catalogue photos from simple garment images (flat-lay or hanging) without the need for models or photoshoot setups.\n\nPricing & Packages:\n• Pay-As-You-Go: ₹10 per photo\n• Starter: ₹1,000 for 80 photos\n• Growth: ₹5,000 for 450 photos\n• Pro: ₹10,000 for 1,000 photos\n\n*Credits never expire. GST extra as applicable.*\nYou can try a free sample directly at aivastra.com!\n\n───────────────────────\nReply 0 to Go Back",
            "citations": [
                {
                    "index": 1,
                    "filename": "AI_Vastra_WhatsApp_AI_FAQ.pdf",
                    "page": 3,
                    "text_snippet": "Catalogue Photo Creation Pricing",
                }
            ],
            "is_escalated": False,
            "escalation_reason": None,
            "is_ignored": False,
        }
    elif is_opt2:
        customer.active_track = "virtual_tryon"
        db.add(customer)
        await db.commit()
        rag_result = {
            "response": "Thank you for your interest in Virtual Try-On!\n\nOur AI Virtual Try-On lets your shoppers see how clothes fit on virtual models directly on your website and Shopify store, increasing conversions and reducing returns.\n\nPricing & Packages:\n• Pay-As-You-Go: ₹5 per successful try-on\n• Starter: ₹999 for 180 try-ons\n• Growth: ₹2,500 for 455 try-ons\n• Pro: ₹10,000 for 2,105 try-ons\n• Enterprise: ₹25,000 for 6,000 try-ons\n\n*Credits never expire. GST extra as applicable.*\nDemo videos: https://www.youtube.com/@ai.vastra_tryon/videos\n\n───────────────────────\nReply 0 to Go Back",
            "citations": [
                {
                    "index": 1,
                    "filename": "AI_Vastra_WhatsApp_AI_FAQ.pdf",
                    "page": 4,
                    "text_snippet": "Virtual Try-On Pricing",
                }
            ],
            "is_escalated": False,
            "escalation_reason": None,
            "is_ignored": False,
        }
    elif is_initial_hindi_greeting:
        customer.active_track = "greeting"
        db.add(customer)
        await db.commit()
        rag_result = {
            "response": "नमस्ते! AI Vastra में आपका स्वागत है। हम फैशन बिज़नेस के लिए AI Catalogue Photoshoot और AI Virtual Try-On सेवाएं प्रदान करते हैं। आप किसमें रुचि रखते हैं — Catalogue Photoshoot, Virtual Try-On, या दोनों?",
            "citations": [
                {
                    "index": 1,
                    "filename": "AI_Vastra_WhatsApp_AI_FAQ.pdf",
                    "page": 5,
                    "text_snippet": "Section 10. Recommended WhatsApp Replies - Q: Hi / Hello / Namaste",
                }
            ],
            "is_escalated": False,
            "escalation_reason": None,
            "is_ignored": False,
        }
    elif is_go_back or is_initial_greeting:
        customer.active_track = "greeting"
        db.add(customer)
        await db.commit()
        rag_result = {
            "response": "Hello! Welcome to AI Vastra. We provide AI Catalogue Photoshoot and AI Virtual Try-On for fashion businesses. What are you interested in — Catalogue Photoshoot, Virtual Try-On, or Both?",
            "citations": [
                {
                    "index": 1,
                    "filename": "AI_Vastra_WhatsApp_AI_FAQ.pdf",
                    "page": 5,
                    "text_snippet": "Section 10. Recommended WhatsApp Replies - Q: Hi / Hello - A: Hello! Welcome to AI Vastra...",
                }
            ],
            "is_escalated": False,
            "escalation_reason": None,
            "is_ignored": False,
        }
    else:
        rag_result = await execute_rag_sync(
            workspace_id=workspace.id,
            query_text=payload.message,
            messages=messages_history,
            db=db,
            customer=customer,
        )
        if rag_result.get("response") and not rag_result.get("is_ignored"):
            resp = rag_result["response"]
            resp = re.sub(r'(?:\n\s*)*[-─—_━]{3,}(?:\n\s*)*reply\s*0\s*to\s*go\s*back', '', resp, flags=re.IGNORECASE).strip()
            resp = re.sub(r'(?:\n\s*)*reply\s*0\s*to\s*go\s*back', '', resp, flags=re.IGNORECASE).strip()
            rag_result["response"] = f"{resp}\n\n───────────────────────\nReply 0 to Go Back"

    # If message was not ignored, record response in conversation
    if not rag_result.get("is_ignored"):
        assistant_msg = Message(
            role="assistant",
            content=rag_result["response"],
            conversation_id=conversation.id,
        )
        db.add(assistant_msg)
        await db.commit()

    # 7. Formulate Contextual Interactive Buttons (Only on greetings/menu)
    interactive_buttons = []
    
    if is_initial_greeting or is_initial_hindi_greeting or is_go_back or clean_msg in ["menu", "options", "start", "help", "services", "main menu", "0"]:
        # Only 2 core main options on welcome greeting / menu (No Emojis)
        interactive_buttons = [
            InteractiveButton(
                id="btn_catalogue",
                title="AI Catalogue Photoshoot",
                query="I want AI Catalogue Photoshoot",
            ),
            InteractiveButton(
                id="btn_vto",
                title="Virtual Try-On",
                query="I want virtual try-on",
            ),
        ]
    else:
        interactive_buttons = []

    return WhatsAppMessageResponse(
        reply=rag_result["response"],
        is_escalated=rag_result["is_escalated"],
        escalation_reason=rag_result["escalation_reason"],
        is_ignored=rag_result.get("is_ignored", False),
        citations=rag_result["citations"],
        conversation_id=str(conversation.id),
        customer_name=customer.name,
        customer_phone=customer.phone_number,
        active_track=customer.active_track,
        interactive_buttons=interactive_buttons,
    )


@router.get("/leads", response_model=list[UrgentLeadResponse])
async def list_urgent_leads(
    db: AsyncSession = Depends(get_db),
) -> list[UrgentLeadResponse]:
    """
    CRM Lead Box Endpoint for sales team & developer CRM sync.
    Returns all urgent leads captured from WhatsApp chats with customer name, phone, track & requirement summary.
    """
    query = select(UrgentLead).order_by(UrgentLead.created_at.desc()).limit(50)
    res = await db.execute(query)
    leads = res.scalars().all()

    return [
        UrgentLeadResponse(
            id=str(lead.id),
            customer_phone=lead.customer_phone,
            customer_name=lead.customer_name,
            business_name=lead.business_name,
            active_track=lead.active_track,
            requirement_summary=lead.requirement_summary,
            status=lead.status,
            created_at=lead.created_at.strftime("%Y-%m-%d %H:%M:%S UTC"),
        )
        for lead in leads
    ]


@router.get("/customers")
async def list_customer_profiles(
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """Lists all persistent customer profiles and active memory state."""
    query = select(CustomerProfile).order_by(CustomerProfile.last_seen_at.desc()).limit(50)
    res = await db.execute(query)
    customers = res.scalars().all()

    return [
        {
            "id": str(c.id),
            "phone_number": c.phone_number,
            "name": c.name,
            "business_name": c.business_name,
            "active_track": c.active_track,
            "intent_state": c.intent_state,
            "session_count": c.session_count,
            "last_seen_at": c.last_seen_at.strftime("%Y-%m-%d %H:%M:%S UTC"),
        }
        for c in customers
    ]


@router.get("/webhook")
async def verify_meta_webhook(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
) -> Response:
    """Meta WhatsApp Cloud API Webhook verification endpoint."""
    verify_token = settings.WHATSAPP_VERIFY_TOKEN or "aivastra_whatsapp_verify_token_2026"
    if hub_mode == "subscribe" and hub_verify_token == verify_token:
        logger.info("Meta WhatsApp Cloud Webhook verified successfully!")
        return Response(content=hub_challenge, media_type="text/plain")
    return Response(content="Forbidden", status_code=403)


@router.post("/webhook")
async def handle_meta_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Handles live incoming Meta WhatsApp Cloud API Webhook events with stateful customer tracking.
    """
    try:
        body = await request.json()
        logger.info(f"Incoming Meta Webhook Payload: {body}")

        entries = body.get("entry", [])
        if not entries:
            return {"status": "ignored", "reason": "no_entries"}

        for entry in entries:
            for change in entry.get("changes", []):
                value = change.get("value", {})
                messages = value.get("messages", [])
                metadata = value.get("metadata", {})
                contacts = value.get("contacts", [])
                phone_number_id = metadata.get("phone_number_id", settings.WHATSAPP_PHONE_NUMBER_ID)

                contact_name = None
                if contacts and len(contacts) > 0:
                    contact_name = contacts[0].get("profile", {}).get("name")

                for msg in messages:
                    sender_phone = msg.get("from")
                    msg_type = msg.get("type")

                    incoming_text = ""
                    if msg_type == "text":
                        incoming_text = msg.get("text", {}).get("body", "")
                    elif msg_type == "interactive":
                        interactive = msg.get("interactive", {})
                        if interactive.get("type") == "button_reply":
                            incoming_text = interactive.get("button_reply", {}).get("title", "")
                        elif interactive.get("type") == "list_reply":
                            incoming_text = interactive.get("list_reply", {}).get("title", "")
                    elif msg_type == "button":
                        incoming_text = msg.get("button", {}).get("text", "")

                    if not incoming_text:
                        continue

                    logger.info(f"Processing Meta message from {sender_phone}: '{incoming_text}'")

                    req_obj = WhatsAppMessageRequest(
                        message=incoming_text,
                        sender_phone=sender_phone,
                        sender_name=contact_name,
                    )
                    rag_res = await handle_whatsapp_message(req_obj, db)

                    if rag_res.is_ignored:
                        logger.info(f"Message from {sender_phone} is irrelevant. Silence policy applied.")
                        continue

                    if settings.WHATSAPP_ACCESS_TOKEN and phone_number_id:
                        await _send_meta_whatsapp_reply(
                            phone_number_id=phone_number_id,
                            to_phone=sender_phone,
                            reply_text=rag_res.reply,
                            interactive_buttons=rag_res.interactive_buttons,
                        )

        return {"status": "success"}
    except Exception as e:
        logger.error(f"Error handling Meta Webhook: {e}")
        return {"status": "error", "detail": str(e)}


async def _send_meta_whatsapp_reply(
    phone_number_id: str,
    to_phone: str,
    reply_text: str,
    interactive_buttons: list[InteractiveButton],
) -> None:
    """Dispatches a response back to customer's WhatsApp via Meta Graph API."""
    url = f"https://graph.facebook.com/v19.0/{phone_number_id}/messages"
    headers = {
        "Authorization": f"Bearer {settings.WHATSAPP_ACCESS_TOKEN}",
        "Content-Type": "application/json",
    }

    if interactive_buttons:
        payload = {
            "messaging_product": "whatsapp",
            "to": to_phone,
            "type": "interactive",
            "interactive": {
                "type": "button",
                "body": {"text": reply_text},
                "action": {
                    "buttons": [
                        {
                            "type": "reply",
                            "reply": {"id": btn.id, "title": btn.title[:20]},
                        }
                        for btn in interactive_buttons[:3]
                    ]
                },
            },
        }
    else:
        payload = {
            "messaging_product": "whatsapp",
            "to": to_phone,
            "type": "text",
            "text": {"body": reply_text},
        }

    async with httpx.AsyncClient() as client:
        resp = await client.post(url, headers=headers, json=payload, timeout=10.0)
        logger.info(f"Meta WhatsApp Send Status: {resp.status_code} - {resp.text}")
