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
      const { version } = await fetchLatestBaileysVersion();

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
      });

      this.sock.ev.on('creds.update', saveCreds);

      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          console.log('[WhatsApp Engine] QR Code received from Baileys!');
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
          const reason = (lastDisconnect?.error as any)?.output?.statusCode;
          console.log(`[WhatsApp Engine] Connection closed. Reason code: ${reason}`);

          if (reason === DisconnectReason.loggedOut) {
            console.log('[WhatsApp Engine] Session logged out. Clearing authentication directory...');
            this.sock = null;
            this.status = 'DISCONNECTED';
            this.currentQrCode = null;
            this.meJid = null;
            this.clearAuthAndStore();
            this.broadcastStatus();
          } else {
            console.log('[WhatsApp Engine] Reconnecting automatically...');
            this.sock = null;
            this.status = 'CONNECTING';
            this.broadcastStatus();
            setTimeout(() => this.initialize(), 3000);
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

            // AI Agent Auto-Responder for Inbound Messages (PAUSED for offline testing)
            const AUTO_REPLY_LIVE_WHATSAPP_ENABLED = false;
            if (AUTO_REPLY_LIVE_WHATSAPP_ENABLED && !parsed.fromMe && parsed.text && !parsed.chatJid.endsWith('@g.us')) {
              setTimeout(async () => {
                try {
                  const { aiAgent } = await import('./aiAgent');
                  const aiResult = await aiAgent.generateResponse(parsed.chatJid, parsed.text);
                  if (aiResult && aiResult.text) {
                    console.log(`[AI Agent] Auto-replying to ${parsed.chatJid}: "${aiResult.text.slice(0, 50)}..."`);
                    await this.sendMessage(parsed.chatJid, aiResult.text);

                    // If a PDF document attachment is attached by RAG engine, send the document natively on WhatsApp!
                    if (aiResult.documentPath && fs.existsSync(aiResult.documentPath) && this.sock) {
                      try {
                        console.log(`[AI Agent] Auto-attaching PDF document: ${aiResult.documentName} for ${parsed.chatJid}`);
                        await this.sock.sendMessage(parsed.chatJid, {
                          document: { url: aiResult.documentPath },
                          fileName: aiResult.documentName || 'Ai Vastra Document.pdf',
                          mimetype: 'application/pdf'
                        });
                      } catch (docErr: any) {
                        console.error('[AI Agent] Error sending PDF document attachment:', docErr.message);
                      }
                    }

                    if (aiResult.autoTagStatus) {
                      db.upsertChat(parsed.chatJid, { leadStatus: aiResult.autoTagStatus });
                    }
                  }
                } catch (err) {
                  console.error('[AI Agent] Error generating auto-reply:', err);
                }
              }, 1500);
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
    const isGroup = jid.endsWith('@g.us');

    if (isGroup) {
      if (name && name !== rawNumber) return name;
      if (notify && notify !== rawNumber) return notify;
    }

    if (name && name !== rawNumber && name !== 'Unsaved Contact' && !/^\d{13,}$/.test(name.replace(/\D/g, ''))) {
      return name;
    }
    if (verifiedName && verifiedName !== rawNumber) return verifiedName;

    const existingContact = db.contacts.get(jid) || db.contacts.get(rawJid);
    if (existingContact?.name && existingContact.name !== rawNumber && existingContact.name !== 'Unsaved Contact') {
      return existingContact.name;
    }

    return db.formatPhoneFallback(rawNumber);
  }

  private processIncomingMessage(msg: WAMessage): CRMMessage | null {
    if (!msg.key.remoteJid) return null;
    const rawChatJid = msg.key.remoteJid;
    if (rawChatJid === 'status@broadcast') return null;

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
