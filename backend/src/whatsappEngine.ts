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

          // Reconcile the address-book name into the exact CRM chat row. This
          // preserves all CRM fields and replaces only the phone fallback name.
          if (this.isRealSavedContactName(c.id, resolvedName)) {
            const resolvedJid = db.resolveJid(c.id);
            const existingChat = db.chats.get(resolvedJid);
            db.upsertChat(resolvedJid, {
              name: resolvedName,
              phone,
              updatedAt: existingChat && existingChat.name !== resolvedName
                ? Date.now()
                : existingChat?.updatedAt,
            });
          }

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
          if (this.isRealSavedContactName(update.id, resolvedName)) {
            db.upsertContact(update.id, { name: resolvedName });
            const resolvedJid = db.resolveJid(update.id);
            const existingChat = db.chats.get(resolvedJid);
            db.upsertChat(resolvedJid, {
              name: resolvedName,
              updatedAt: existingChat && existingChat.name !== resolvedName
                ? Date.now()
                : existingChat?.updatedAt,
            });
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
          if (this.isRealSavedContactName(c.id, resolvedName)) {
            const resolvedJid = db.resolveJid(c.id);
            const existingChat = db.chats.get(resolvedJid);
            db.upsertChat(resolvedJid, {
              name: resolvedName,
              phone,
              updatedAt: existingChat && existingChat.name !== resolvedName
                ? Date.now()
                : existingChat?.updatedAt,
            });
          }
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

        const historyDirections = new Map<string, { inbound: number; outbound: number }>();
        for (const msg of messages) {
          const parsed = this.processIncomingMessage(msg);
          if (!parsed || parsed.chatJid.endsWith('@g.us')) continue;
          const jid = db.resolveJid(parsed.chatJid);
          const counts = historyDirections.get(jid) || { inbound: 0, outbound: 0 };
          if (parsed.fromMe) counts.outbound += 1;
          else counts.inbound += 1;
          historyDirections.set(jid, counts);
        }

        // Treat an existing two-way history as a human-managed conversation.
        for (const [jid, counts] of historyDirections) {
          if (counts.inbound > 0 && counts.outbound > 0) {
            db.upsertChat(jid, { aiDisabled: true });
            db.upsertContact(jid, { aiDisabled: true });
          }
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

            if (parsed.fromMe) {
              // Outbound message sent manually by human agent
            }

            // 2. Inbound messages are stored and broadcast only — no auto-reply
            // All sales follow-up is handled manually via the CRM dashboard.
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

  private isRealSavedContactName(rawJid: string, name?: string): boolean {
    if (!name) return false;
    const cleanName = name.trim();
    const lower = cleanName.toLowerCase();
    const badNames = new Set(['.', 'contact', 'unsaved contact', 'unknown contact', 'whatsapp contact', 'ai vastra sales agent', 'ai sales agent', 'ai vastra', 'me', '']);
    const jidDigits = db.resolveJid(rawJid).split('@')[0].replace(/\D/g, '');
    const nameDigits = cleanName.replace(/\D/g, '');
    return cleanName.length > 1 &&
      !badNames.has(lower) &&
      !cleanName.includes('@') &&
      !cleanName.startsWith('~') &&
      nameDigits.length < 10 &&
      cleanName !== jidDigits;
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

