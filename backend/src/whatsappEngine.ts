import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  WAMessage,
  proto,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
import { Server as SocketIOServer } from 'socket.io';
import { db, CRMMessage } from './store';

export class WhatsAppEngine {
  private sock: ReturnType<typeof makeWASocket> | null = null;
  private io: SocketIOServer;
  private authFolder = path.join(__dirname, '../auth_info_baileys');
  public status: 'DISCONNECTED' | 'CONNECTING' | 'QR_READY' | 'CONNECTED' = 'DISCONNECTED';
  public currentQrCode: string | null = null;
  public meJid: string | null = null;
  public aiAutoReplyEnabled: boolean = true;
  private pendingDebounceMap = new Map<string, { timeout: NodeJS.Timeout; messages: string[]; senderJid: string }>();

  constructor(io: SocketIOServer) {
    this.io = io;
  }

  public async initialize() {
    if (this.sock) return;

    try {
      console.log('[WhatsApp Engine] Initializing Baileys Multi-Device session...');
      this.status = 'CONNECTING';
      this.broadcastStatus();

      const logger = pino({ level: 'silent' });
      const { state, saveCreds } = await useMultiFileAuthState(this.authFolder);

      // Fast non-blocking Baileys version resolution for instant QR code generation!
      let version: [number, number, number] = [2, 3000, 1017531287];
      try {
        const { version: latestVer } = await fetchLatestBaileysVersion();
        if (latestVer) version = latestVer;
      } catch (e) {
        console.warn('[WhatsApp Engine] Using default Baileys version:', version.join('.'));
      }

      console.log(`[WhatsApp Engine] Baileys Version: ${version.join('.')}`);

      this.sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: false,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        browser: ['AI Vastra CRM', 'Chrome', '1.0.0'],
        syncFullHistory: true,
        markOnlineOnConnect: true,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 25000,
      });

      this.sock.ev.on('creds.update', saveCreds);

      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          console.log('[WhatsApp Engine] Instant QR Code generated!');
          this.currentQrCode = await QRCode.toDataURL(qr);
          this.status = 'QR_READY';
          this.broadcastStatus();
          this.io.emit('qr_code', { qr: this.currentQrCode });
        }

        if (connection === 'connecting') {
          this.status = 'CONNECTING';
          this.broadcastStatus();
        }

        if (connection === 'open') {
          console.log('[WhatsApp Engine] Connected successfully to WhatsApp Multi-Device!');
          this.status = 'CONNECTED';
          this.currentQrCode = null;
          this.meJid = this.sock?.user?.id || null;
          this.broadcastStatus();
          this.io.emit('qr_code', { qr: null });

          // Attempt profile picture sync for top chats
          this.syncInitialData();
        }

        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
          const isExplicitLogout = statusCode === DisconnectReason.loggedOut;

          console.log(`[WhatsApp Engine] Connection closed. Status code: ${statusCode}`);

          if (isExplicitLogout) {
            console.log('[WhatsApp Engine] Explicit user logout detected. Clearing auth folder...');
            this.sock = null;
            this.status = 'DISCONNECTED';
            this.currentQrCode = null;
            this.meJid = null;
            this.clearAuthAndStore();
            this.broadcastStatus();
          } else {
            console.log('[WhatsApp Engine] Automatic instant reconnection in progress (session credentials retained)...');
            this.sock = null;
            this.status = 'CONNECTING';
            this.broadcastStatus();
            setTimeout(() => this.initialize(), 1500);
          }
        }
      });

      // Contacts Upsert / Sync
      this.sock.ev.on('contacts.upsert', (contacts) => {
        for (const c of contacts) {
          if (!c.id) continue;

          if ((c as any).lid) {
            db.registerLidMapping((c as any).lid, c.id);
          }

          const resolvedName = this.resolveBestContactName(c.id, c.name, c.notify, c.verifiedName);
          const phone = c.id.split('@')[0];

          db.upsertContact(c.id, {
            jid: c.id,
            name: resolvedName,
            phone: phone,
          });

          this.fetchAndCacheProfilePic(c.id);
        }
        this.io.emit('chats_updated', db.getAllChatsSorted());
      });

      // Contacts Update
      this.sock.ev.on('contacts.update', (updates) => {
        for (const update of updates) {
          if (!update.id) continue;
          if ((update as any).lid) {
            db.registerLidMapping((update as any).lid, update.id);
          }
          const resolvedName = this.resolveBestContactName(update.id, update.name, update.notify, update.verifiedName);
          if (resolvedName) {
            db.upsertContact(update.id, { name: resolvedName });
            db.upsertChat(update.id, { name: resolvedName });
          }
          if (update.imgUrl) {
            db.upsertContact(update.id, { avatarUrl: update.imgUrl });
            db.upsertChat(update.id, { avatarUrl: update.imgUrl });
          }
        }
        this.io.emit('chats_updated', db.getAllChatsSorted());
      });

      // Chats Upsert / Sync
      this.sock.ev.on('chats.upsert', (chats) => {
        for (const c of chats) {
          if (!c.id) continue;
          const resolvedName = this.resolveBestContactName(c.id, c.name);
          
          db.upsertChat(c.id, {
            jid: c.id,
            name: resolvedName,
            unreadCount: c.unreadCount || 0,
            isGroup: c.id.endsWith('@g.us'),
          });
          this.fetchAndCacheProfilePic(c.id);
        }
        this.io.emit('chats_updated', db.getAllChatsSorted());
      });

      // Messaging History Sync (Full History extraction!)
      this.sock.ev.on('messaging-history.set', ({ chats, contacts, messages, isLatest }) => {
        console.log(`[WhatsApp Engine] History sync received: ${chats.length} chats, ${contacts.length} contacts, ${messages.length} messages.`);
        
        for (const c of contacts) {
          if (!c.id) continue;
          if ((c as any).lid) {
            db.registerLidMapping((c as any).lid, c.id);
          }
          const resolvedName = this.resolveBestContactName(c.id, c.name, c.notify, c.verifiedName);
          const phone = c.id.split('@')[0];
          db.upsertContact(c.id, {
            jid: c.id,
            name: resolvedName,
            phone: phone,
          });
        }

        for (const c of chats) {
          if (!c.id) continue;
          const resolvedName = this.resolveBestContactName(c.id, c.name);
          db.upsertChat(c.id, {
            jid: c.id,
            name: resolvedName,
            unreadCount: c.unreadCount || 0,
            isGroup: c.id.endsWith('@g.us'),
          });
        }

        for (const msg of messages) {
          this.processIncomingMessage(msg);
        }

        this.syncInitialData();

        this.io.emit('history_synced', {
          chats: db.getAllChatsSorted(),
          messageCount: messages.length,
        });
      });

      // Real-Time Inbound & Outbound Messages Upsert
      this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
        for (const msg of messages) {
          const parsed = this.processIncomingMessage(msg);
          if (parsed) {
            console.log(`[WhatsApp Engine] Real-time message (${parsed.fromMe ? 'Outbound' : 'Inbound'}):`, parsed.text);
            this.io.emit('new_message', parsed);

            // 1. If Outbound manual message sent by user from phone: cancel any pending AI auto-reply for this chat
            if (parsed.fromMe) {
              const pending = this.pendingDebounceMap.get(parsed.chatJid);
              if (pending) {
                clearTimeout(pending.timeout);
                this.pendingDebounceMap.delete(parsed.chatJid);
                console.log(`[AI Auto-Reply] Manual human reply detected for ${parsed.chatJid}. Cancelled pending AI auto-reply.`);
              }
            }

            // 2. Inbound Message Handling with Safeguards (No Groups, No Broadcasts, Debounced)
            const targetJid = msg.key.remoteJid || parsed.chatJid;
            if (
              this.aiAutoReplyEnabled &&
              !parsed.fromMe &&
              parsed.text &&
              !targetJid.endsWith('@g.us') &&
              !targetJid.includes('broadcast') &&
              targetJid !== 'status@broadcast'
            ) {
              console.log(`[WhatsApp Engine] Routing inbound message from ${targetJid} to AI Auto-Reply pipeline...`);
              this.scheduleAiAutoReply(targetJid, parsed.senderJid || targetJid, parsed.text);
            }
          }
        }
        this.io.emit('chats_updated', db.getAllChatsSorted());
      });

      // Message Status / Read Receipts Updates
      this.sock.ev.on('messages.update', (updates) => {
        for (const update of updates) {
          if (update.key.id && update.key.remoteJid && update.update.status !== undefined) {
            let statusStr: CRMMessage['status'] = 'SENT';
            const s = Number(update.update.status);
            if (s === 1 || s === proto.WebMessageInfo.Status.PENDING) statusStr = 'PENDING';
            if (s === 2 || s === proto.WebMessageInfo.Status.SERVER_ACK) statusStr = 'SENT';
            if (s === 3 || s === proto.WebMessageInfo.Status.DELIVERY_ACK) statusStr = 'DELIVERED';
            if (s === 4 || s === proto.WebMessageInfo.Status.READ || s === proto.WebMessageInfo.Status.PLAYED) statusStr = 'READ';

            const resolvedJid = db.resolveJid(update.key.remoteJid);
            const updatedMsg = db.updateMessageStatus(update.key.id, resolvedJid, statusStr);
            if (updatedMsg) {
              this.io.emit('message_status', {
                id: update.key.id,
                chatJid: resolvedJid,
                status: statusStr,
              });
            }
          }
        }
      });

      this.sock.ev.on('message-receipt.update', (receipts) => {
        for (const r of receipts) {
          if (r.key && r.key.id && r.key.remoteJid) {
            let statusStr: CRMMessage['status'] = 'SENT';
            if (r.receipt.readTimestamp) statusStr = 'READ';
            else if (r.receipt.receiptTimestamp) statusStr = 'DELIVERED';

            const resolvedJid = db.resolveJid(r.key.remoteJid);
            db.updateMessageStatus(r.key.id, resolvedJid, statusStr);
            this.io.emit('message_status', {
              id: r.key.id,
              chatJid: resolvedJid,
              status: statusStr,
            });
          }
        }
      });

    } catch (err) {
      console.error('[WhatsApp Engine] Error in initialize():', err);
      this.status = 'DISCONNECTED';
      this.broadcastStatus();
    }
  }

  private resolveBestContactName(rawJid: string, name?: string, notify?: string, verifiedName?: string): string {
    const jid = db.resolveJid(rawJid);
    const rawNumber = jid.split('@')[0];
    const cleanDigits = rawNumber.replace(/\D/g, '');
    const isGroup = jid.endsWith('@g.us');

    if (isGroup) {
      if (name && name !== rawNumber) return name;
      if (notify && notify !== rawNumber) return notify;
    }

    const BAD_NAMES = new Set(['.', 'contact', 'unsaved contact', 'unknown contact', 'ai vastra sales agent', 'ai sales agent', 'ai vastra', 'me', '']);

    // Check saved contact name (must not be a ~pushName or 15-digit LID)
    if (name && name !== rawNumber && !BAD_NAMES.has(name.toLowerCase().trim()) && !name.startsWith('~') && !/^\d{13,}$/.test(name.replace(/\D/g, ''))) {
      return name;
    }

    const existingContact = db.contacts.get(jid) || db.contacts.get(rawJid);
    if (existingContact?.name && existingContact.name !== rawNumber && !BAD_NAMES.has(existingContact.name.toLowerCase().trim()) && !existingContact.name.startsWith('~') && !/^\d{13,}$/.test((existingContact.name || '').replace(/\D/g, ''))) {
      return existingContact.name;
    }

    // Unsaved contact: return clean formatted phone number (+91 77801 71507)
    return db.formatPhoneFallback(cleanDigits || rawNumber);
  }

  private processIncomingMessage(msg: WAMessage): CRMMessage | null {
    if (!msg.key.remoteJid) return null;
    let rawChatJid = msg.key.remoteJid;
    if (rawChatJid === 'status@broadcast') return null;

    // If remoteJid is a 15-digit WhatsApp LID (@lid), resolve actual phone number JID from participant
    if (rawChatJid.endsWith('@lid') || (rawChatJid.split('@')[0].length >= 13 && rawChatJid.split('@')[0].startsWith('226'))) {
      const participant = msg.key.participant || (msg as any).participant || (msg as any).userJid;
      if (participant && participant.endsWith('@s.whatsapp.net')) {
        rawChatJid = participant;
      }
    }

    const chatJid = db.resolveJid(rawChatJid);

    const fromMe = Boolean(msg.key.fromMe);
    const id = msg.key.id || `${Date.now()}`;
    const timestamp = typeof msg.messageTimestamp === 'number' 
      ? msg.messageTimestamp * 1000 
      : (msg.messageTimestamp?.low ? msg.messageTimestamp.low * 1000 : Date.now());

    let text = '';
    let mediaType: CRMMessage['mediaType'] | undefined = undefined;

    let m = msg.message;
    // Unwrap ephemeral, viewOnce, and nested protocol wrappers if present
    if (m?.ephemeralMessage?.message) m = m.ephemeralMessage.message;
    if (m?.viewOnceMessage?.message) m = m.viewOnceMessage.message;
    if (m?.viewOnceMessageV2?.message) m = m.viewOnceMessageV2.message;
    if (m?.documentWithCaptionMessage?.message) m = m.documentWithCaptionMessage.message;

    if (m) {
      if (m.conversation) {
        text = m.conversation;
      } else if (m.extendedTextMessage?.text) {
        text = m.extendedTextMessage.text;
      } else if (m.imageMessage) {
        text = m.imageMessage.caption || 'Photo';
        mediaType = 'image';
      } else if (m.videoMessage) {
        text = m.videoMessage.caption || 'Video';
        mediaType = 'video';
      } else if (m.audioMessage) {
        text = 'Voice message';
        mediaType = 'audio';
      } else if (m.documentMessage) {
        text = m.documentMessage.title || m.documentMessage.fileName || 'Document';
        mediaType = 'document';
      } else if (m.buttonsResponseMessage?.selectedDisplayText) {
        text = m.buttonsResponseMessage.selectedDisplayText;
      } else if (m.templateButtonReplyMessage?.selectedDisplayText) {
        text = m.templateButtonReplyMessage.selectedDisplayText;
      }
    }

    if (!text && !mediaType) return null;

    const pushName = msg.pushName;
    const resolvedName = this.resolveBestContactName(chatJid, undefined, pushName);
    const senderName = fromMe ? 'Me' : resolvedName;

    const crmMsg: CRMMessage = {
      id,
      chatJid,
      senderJid: msg.key.participant || rawChatJid,
      senderName,
      fromMe,
      text,
      mediaType,
      timestamp,
      status: fromMe ? 'SENT' : 'READ',
    };

    // Store in storage engine
    db.addMessage(crmMsg);

    return crmMsg;
  }

  public async sendMessage(chatJid: string, text: string): Promise<CRMMessage> {
    if (!this.sock || this.status !== 'CONNECTED') {
      throw new Error('WhatsApp session is not connected');
    }

    const resolvedJid = db.resolveJid(chatJid);

    console.log(`[WhatsApp Engine] Sending message to ${resolvedJid}: ${text}`);

    const sent = await this.sock.sendMessage(resolvedJid, { text });

    const crmMsg: CRMMessage = {
      id: sent.key.id || `${Date.now()}`,
      chatJid: resolvedJid,
      senderJid: this.sock.user?.id || 'me',
      senderName: 'Me',
      fromMe: true,
      text,
      timestamp: Date.now(),
      status: 'SENT',
    };

    db.addMessage(crmMsg);

    // Broadcast to UI
    this.io.emit('new_message', crmMsg);
    this.io.emit('chats_updated', db.getAllChatsSorted());

    return crmMsg;
  }

  public async disconnect() {
    console.log('[WhatsApp Engine] Disconnecting and revoking session...');
    try {
      if (this.sock) {
        await this.sock.logout();
      }
    } catch (err) {
      console.warn('[WhatsApp Engine] Error during logout:', err);
    }
    this.sock = null;
    this.status = 'DISCONNECTED';
    this.currentQrCode = null;
    this.meJid = null;
    this.clearAuthAndStore();
    this.broadcastStatus();

    // Trigger re-initialization to show fresh QR code immediately
    setTimeout(() => this.initialize(), 1000);
  }

  public async fetchAndCacheProfilePic(rawJid: string) {
    if (!this.sock) return;
    const jid = db.resolveJid(rawJid);
    try {
      const url = await this.sock.profilePictureUrl(jid, 'image');
      if (url) {
        db.upsertChat(jid, { avatarUrl: url });
        db.upsertContact(jid, { avatarUrl: url });
      }
    } catch (err) {
      // Profile picture might be private or unavailable
    }
  }

  private async syncInitialData() {
    if (!this.sock) return;
    const chats = db.getAllChatsSorted();
    let count = 0;
    for (const c of chats) {
      if (count > 60) break;
      await this.fetchAndCacheProfilePic(c.jid);
      count++;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    this.io.emit('chats_updated', db.getAllChatsSorted());
  }

  private scheduleAiAutoReply(chatJid: string, senderJid: string, newText: string) {
    console.log(`[AI Auto-Reply] Inbound message received from ${chatJid}: "${newText}". Starting debounce timer...`);
    const existing = this.pendingDebounceMap.get(chatJid);
    if (existing) {
      clearTimeout(existing.timeout);
      existing.messages.push(newText);
    } else {
      this.pendingDebounceMap.set(chatJid, {
        timeout: null as any,
        messages: [newText],
        senderJid,
      });
    }

    const entry = this.pendingDebounceMap.get(chatJid)!;

    // Debounce wait time: 3 seconds to let customer finish multi-message thoughts
    const debounceWaitMs = 3000;

    entry.timeout = setTimeout(async () => {
      this.pendingDebounceMap.delete(chatJid);

      if (!this.aiAutoReplyEnabled || !this.sock) {
        console.warn(`[AI Auto-Reply] Skipped reply: aiEnabled=${this.aiAutoReplyEnabled}, socketReady=${Boolean(this.sock)}`);
        return;
      }

      const combinedText = entry.messages.join('\n').trim();
      if (!combinedText) return;
      console.log(`[AI Auto-Reply] Processing debounced message for ${chatJid}: "${combinedText}"`);

      // Check conversation message count & warm lead qualification
      const resolvedJid = db.resolveJid(chatJid);
      const existingChat = db.chats.get(resolvedJid) || db.chats.get(chatJid);
      const chatHistory = db.messages.get(resolvedJid) || db.messages.get(chatJid) || [];

      // Check if incoming message is an initial greeting (Hi, Hello, Hii, Hey, Namaste, Menu, Start)
      const cleanIncomingText = combinedText.toLowerCase().trim();
      const normIncomingText = cleanIncomingText.replace(/h+i+/g, 'hi').replace(/h+e+y+/g, 'hey').replace(/h+e+l+o+w*|h+e+l+o+/g, 'hello');
      const isGreetingMsg = /^(hi|hello|hey|start|namaste|menu|options|good\s+(morning|afternoon|evening))\b/.test(normIncomingText);

      // Rule 1: Fresh inbound message un-blacklists cleared leads so AI auto-replies & Warm section qualify new messages
      db.unBlacklist(resolvedJid);
      db.unBlacklist(chatJid);

      if (isGreetingMsg || !existingChat) {
        db.upsertChat(resolvedJid, { aiDisabled: false });
        db.upsertContact(resolvedJid, { aiDisabled: false });
        if (existingChat) existingChat.aiDisabled = false;
      } else if (existingChat?.aiDisabled && !isGreetingMsg) {
        console.log(`[AI Auto-Reply] Re-enabling auto-reply for ${chatJid} on fresh inbound message...`);
        db.upsertChat(resolvedJid, { aiDisabled: false });
        db.upsertContact(resolvedJid, { aiDisabled: false });
        if (existingChat) existingChat.aiDisabled = false;
      }

      // Calculate session turn count (messages received since latest greeting)
      let inboundCount = 1;
      if (!isGreetingMsg) {
        let count = 0;
        for (let i = chatHistory.length - 1; i >= 0; i--) {
          const m = chatHistory[i];
          if (!m.fromMe) {
            count++;
            const txt = (m.text || '').toLowerCase().trim();
            const norm = txt.replace(/h+i+/g, 'hi').replace(/h+e+y+/g, 'hey').replace(/h+e+l+o+w*|h+e+l+o+/g, 'hello');
            const isG = /^(hi|hello|hey|start|namaste|menu|options|good\s+(morning|afternoon|evening))\b/.test(norm);
            if (isG) break;
          }
        }
        inboundCount = Math.max(1, count);
      }

      // Stop AFTER 3rd reply has been delivered. If customer sends > 3 messages, auto-reply is stopped.
      if (inboundCount > 3) {
        db.unBlacklist(resolvedJid);
        db.upsertChat(resolvedJid, { leadStatus: 'WARM', aiDisabled: true, updatedAt: Date.now() });
        db.upsertContact(resolvedJid, { leadStatus: 'WARM', aiDisabled: true, updatedAt: Date.now() }, true);
        this.io.emit('chats_updated', db.getAllChatsSorted());
        console.log(`[AI Auto-Reply] Customer ${chatJid} has completed 3 turns. Auto-reply stopped for human agent takeover.`);
        try {
          await this.sock.sendPresenceUpdate('paused', chatJid);
        } catch (e) {}
        return;
      }

      // Anti-loop check: Check if text is just a simple one-word acknowledgment without questions
      const lower = combinedText.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
      const simpleAcks = new Set(['ok', 'k', 'okay', 'okk', 'okey', 'thanks', 'thank you', 'thx', 'tq', 'dhanyavadalu', 'shukriya', 'bye', 'good night', 'gn']);
      if (simpleAcks.has(lower) && !combinedText.includes('?') && !combinedText.toLowerCase().includes('price') && !combinedText.toLowerCase().includes('cost')) {
        console.log(`[AI Auto-Reply] Acknowledgment '${combinedText}' received from ${chatJid}. Skipped auto-reply to prevent loops.`);
        return;
      }

      try {
        const rawNum = senderJid.split('@')[0].split(':')[0];

        // 1. Send WhatsApp "composing" presence (shows "typing..." to customer)
        try {
          console.log(`[AI Auto-Reply] Sending 'composing' presence to ${chatJid}...`);
          await this.sock.sendPresenceUpdate('composing', chatJid);
        } catch (e: any) {
          console.warn('[AI Auto-Reply] Presence error:', e.message);
        }

        // 2. Call AI Agent service
        console.log(`[AI Auto-Reply] Calling Python AI service for ${rawNum}: "${combinedText}"...`);
        let aiResult = await this.callAiAgent(rawNum, combinedText, chatJid);

        if (!aiResult || !aiResult.reply || aiResult.reply.trim() === '[NO_REPLY]' || aiResult.reply.trim() === '') {
          console.log(`[AI Auto-Reply] AI Agent returned no reply or [NO_REPLY] for ${chatJid}. Using friendly sales fallback reply.`);
          aiResult = {
            reply: "Thank you for reaching out! Our team will contact you regarding this. You can also visit our official website at https://aivastra.com or email us at support@aivastra.com.",
          };
        }

        // 3. Realistic human typing delay based on reply length (2.5s to 4.5s)
        const typingDurationMs = Math.min(4500, Math.max(2500, Math.round(aiResult.reply.length * 15)));
        console.log(`[AI Auto-Reply] Simulating natural typing (${Math.round(typingDurationMs / 1000)}s) for ${chatJid}...`);
        await new Promise((resolve) => setTimeout(resolve, typingDurationMs));

        // 4. Send "paused" presence
        try {
          await this.sock.sendPresenceUpdate('paused', chatJid);
        } catch (e) {}

        // 5. Send clean text message with formatted options list (strictly no emojis)
        let finalReply = aiResult.reply
          .replace(/<think>[\s\S]*?<\/think>/gi, '')
          .replace(/\[NO_REPLY\]/g, '')
          .replace(/\[\d+\]/g, '')
          .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE0F}]/gu, '')
          .replace(/[ \t]{2,}/g, ' ')
          .trim();

        if (aiResult.interactive_buttons && aiResult.interactive_buttons.length > 0) {
          const buttonList = aiResult.interactive_buttons
            .map((btn, idx) => `${idx + 1}. ${btn.title}`)
            .join('\n');
          finalReply += `\n\n*Please select any one of those:*\n${buttonList}`;
        } else {
          // If not the initial main menu options list, ensure standard divider line & Reply 0 to Go Back
          finalReply = finalReply.replace(/(?:\n\s*)*[-─—_━]{3,}(?:\n\s*)*reply\s*0\s*to\s*go\s*back/gi, '').trim();
          finalReply = finalReply.replace(/(?:\n\s*)*reply\s*0\s*to\s*go\s*back/gi, '').trim();
          finalReply += `\n\n───────────────────────\nReply 0 to Go Back`;
        }

        if (finalReply && this.sock) {
          console.log(`[AI Auto-Reply] Sending WhatsApp reply to ${chatJid}: "${finalReply.slice(0, 80)}..."`);
          
          const sent = await this.sock.sendMessage(chatJid, { text: finalReply });

          // Record in CRM database and notify frontend UI
          const crmMsg: CRMMessage = {
            id: sent?.key?.id || `${Date.now()}_ai`,
            chatJid: resolvedJid,
            senderJid: this.sock.user?.id || 'me',
            senderName: 'Ai Vastra Sales Agent',
            fromMe: true,
            text: finalReply,
            timestamp: Date.now(),
            status: 'SENT',
          };
          db.addMessage(crmMsg);

          // Rule 1 & Rule 4: If this was reply 3 to the 3rd customer message, automatically categorize as WARM & stop auto-reply
          if (inboundCount >= 3) {
            db.upsertChat(resolvedJid, {
              leadStatus: 'WARM',
              aiDisabled: true,
              callStatus: undefined,
              followUpDate: '',
              notes: '',
              notesList: [],
              isAutoWarm: true,
            });
            db.upsertContact(resolvedJid, {
              leadStatus: 'WARM',
              aiDisabled: true,
              callStatus: undefined,
              followUpDate: '',
              notes: '',
              notesList: [],
              isAutoWarm: true,
            }, true);
            console.log(`[AI Auto-Reply] 3rd reply delivered to ${chatJid}. Categorized as WARM and auto-reply stopped for human takeover.`);
          }

          this.io.emit('new_message', crmMsg);
          this.io.emit('chats_updated', db.getAllChatsSorted());

          console.log(`[AI Auto-Reply] SUCCESS: Auto-reply successfully delivered to ${chatJid}!`);
        }

      } catch (err: any) {
        console.error('[AI Auto-Reply] Error generating/delivering response:', err.message || err);
        try {
          if (this.sock) await this.sock.sendPresenceUpdate('paused', chatJid);
        } catch (e) {}
      }
    }, debounceWaitMs);
  }

  public async callAiAgent(
    senderPhone: string,
    messageText: string,
    conversationId?: string
  ): Promise<{
    reply?: string;
    is_ignored?: boolean;
    is_escalated?: boolean;
    interactive_buttons?: Array<{ id: string; title: string; query: string }>;
  } | null> {
    const aiPort = process.env.AI_AGENT_PORT || '8005';
    try {
      console.log(`[AI Agent API] POST http://127.0.0.1:${aiPort}/api/v1/whatsapp/message (${senderPhone})`);
      const response = await fetch(`http://127.0.0.1:${aiPort}/api/v1/whatsapp/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageText,
          sender_phone: senderPhone,
          conversation_id: conversationId,
        }),
      });
      if (!response.ok) {
        console.error(`[AI Agent API Error] HTTP ${response.status}: ${await response.text()}`);
        return null;
      }
      const data = (await response.json()) as {
        reply?: string;
        is_ignored?: boolean;
        is_escalated?: boolean;
        interactive_buttons?: Array<{ id: string; title: string; query: string }>;
      };
      console.log(`[AI Agent API] Received reply: "${data.reply?.slice(0, 80)}..." (Buttons: ${data.interactive_buttons?.length || 0})`);
      return data;
    } catch (err: any) {
      console.error(`[AI Agent API Error] Failed to reach port ${aiPort}: ${err.message}`);
      return null;
    }
  }

  public clearAuthAndStore() {
    if (fs.existsSync(this.authFolder)) {
      fs.rmSync(this.authFolder, { recursive: true, force: true });
      console.log('[WhatsApp Engine] Auth directory cleared.');
    }
  }

  private broadcastStatus() {
    this.io.emit('connection_status', {
      status: this.status,
      currentQrCode: this.currentQrCode,
      meJid: this.meJid,
    });
  }
}
