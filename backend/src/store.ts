import fs from 'fs';
import path from 'path';

export interface CRMContact {
  jid: string;
  name: string;
  phone: string;
  avatarUrl?: string;
  leadStatus: 'INTERESTED' | 'WARM_INTERESTED' | 'NOT_INTERESTED' | 'UNASSIGNED';
  followUpDate?: string;
  notes?: string;
  tags: string[];
  customFields?: Record<string, string>;
}

export interface CRMChat {
  jid: string;
  name: string;
  unreadCount: number;
  lastMessagePreview?: string;
  lastMessageAt: number;
  avatarUrl?: string;
  isGroup: boolean;
  leadStatus: 'INTERESTED' | 'WARM_INTERESTED' | 'NOT_INTERESTED' | 'UNASSIGNED';
  followUpDate?: string;
  notes?: string;
  tags: string[];
}

export interface CRMMessage {
  id: string;
  chatJid: string;
  senderJid: string;
  senderName?: string;
  fromMe: boolean;
  text: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
  fileName?: string;
  timestamp: number;
  status: 'PENDING' | 'SENT' | 'DELIVERED' | 'READ';
}

class StorageEngine {
  private dataFilePath: string;
  public contacts: Map<string, CRMContact> = new Map();
  public chats: Map<string, CRMChat> = new Map();
  public messages: Map<string, CRMMessage[]> = new Map(); // chatJid -> CRMMessage[]
  public lidToJidMap: Map<string, string> = new Map(); // LID JID -> Phone JID

  constructor() {
    const dataDir = path.join(__dirname, '../data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.dataFilePath = path.join(dataDir, 'db.json');
    this.loadData();
  }

  private loadData() {
    try {
      if (fs.existsSync(this.dataFilePath)) {
        const raw = fs.readFileSync(this.dataFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.contacts) {
          this.contacts = new Map(Object.entries(parsed.contacts));
        }
        if (parsed.chats) {
          this.chats = new Map(Object.entries(parsed.chats));
        }
        if (parsed.messages) {
          this.messages = new Map(Object.entries(parsed.messages));
        }
        if (parsed.lidToJidMap) {
          this.lidToJidMap = new Map(Object.entries(parsed.lidToJidMap));
        }
        console.log(`[Storage] Loaded ${this.chats.size} chats and ${this.contacts.size} contacts from storage.`);
      }
    } catch (err) {
      console.error('[Storage] Error loading db.json:', err);
    }
  }

  public saveData() {
    try {
      const obj = {
        contacts: Object.fromEntries(this.contacts),
        chats: Object.fromEntries(this.chats),
        messages: Object.fromEntries(this.messages),
        lidToJidMap: Object.fromEntries(this.lidToJidMap),
      };
      fs.writeFileSync(this.dataFilePath, JSON.stringify(obj, null, 2), 'utf-8');
    } catch (err) {
      console.error('[Storage] Error saving db.json:', err);
    }
  }

  public registerLidMapping(lid: string, phoneJid: string, saveNow: boolean = false) {
    if (lid && phoneJid && lid !== phoneJid) {
      this.lidToJidMap.set(lid, phoneJid);
      if (saveNow) this.saveData();
    }
  }

  public resolveJid(jid: string): string {
    if (!jid) return jid;
    const clean = jid.split('@')[0];
    const mapped = this.lidToJidMap.get(jid) || this.lidToJidMap.get(clean);
    const target = mapped || jid;
    const targetClean = target.split('@')[0];
    if (target.endsWith('@g.us')) return `${targetClean}@g.us`;
    return `${targetClean}@s.whatsapp.net`;
  }

  public getContactName(rawJid: string): string {
    if (!rawJid) return 'Unsaved Contact';

    const resolvedJid = this.resolveJid(rawJid);
    const cleanNum = resolvedJid.split('@')[0].replace(/\D/g, '');
    const rawNum = rawJid.split('@')[0].replace(/\D/g, '');

    const keyCandidates = [
      resolvedJid,
      rawJid,
      cleanNum,
      rawNum,
      `${cleanNum}@s.whatsapp.net`,
      `${cleanNum}@c.us`,
      `${rawNum}@s.whatsapp.net`,
      `${rawNum}@c.us`
    ];

    for (const key of keyCandidates) {
      const contact = this.contacts.get(key);
      if (contact && contact.name && contact.name !== 'Unsaved Contact' && contact.name !== cleanNum && contact.name !== rawNum && !contact.name.includes('@') && !/^\d{13,}$/.test(contact.name.replace(/\D/g, ''))) {
        return contact.name;
      }
    }

    // Try finding by phone number in contacts
    for (const c of this.contacts.values()) {
      if (c.phone) {
        const cp = c.phone.replace(/\D/g, '');
        if (cp && (cp === cleanNum || cp === rawNum || cp.endsWith(cleanNum) || cleanNum.endsWith(cp))) {
          if (c.name && c.name !== 'Unsaved Contact' && !c.name.includes('@') && !/^\d{13,}$/.test(c.name.replace(/\D/g, ''))) {
            return c.name;
          }
        }
      }
    }

    return this.formatPhoneFallback(cleanNum || rawNum);
  }

  public formatPhoneFallback(raw: string): string {
    if (!raw) return 'Unknown Contact';

    let clean = raw.split('@')[0];
    const mapped = this.lidToJidMap.get(raw) || this.lidToJidMap.get(clean);
    if (mapped) {
      clean = mapped.split('@')[0];
    }

    const digits = clean.replace(/\D/g, '');

    // 12-digit Indian number starting with 91 (e.g. 919392361326 -> +91 93923 61326)
    if (digits.startsWith('91') && digits.length === 12) {
      const ten = digits.slice(2);
      return `+91 ${ten.slice(0, 5)} ${ten.slice(5)}`;
    }

    // 10-digit Indian number (e.g. 9392361326 -> +91 93923 61326)
    if (digits.length === 10) {
      return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
    }

    // If it's a long internal LID string (>12 digits) with no mapped phone, fallback cleanly
    if (digits.length > 12) {
      return `Unsaved Contact`;
    }

    return digits ? `+${digits}` : raw;
  }

  public upsertContact(rawJid: string, partial: Partial<CRMContact>, saveNow: boolean = false) {
    const jid = this.resolveJid(rawJid);
    const rawNumber = jid.split('@')[0];
    const existing = this.contacts.get(jid) || {
      jid,
      name: this.formatPhoneFallback(rawNumber),
      phone: rawNumber,
      leadStatus: 'UNASSIGNED',
      tags: [],
    };

    let name = existing.name;
    if (partial.name && partial.name !== rawNumber) {
      name = partial.name;
    }

    const updated = {
      ...existing,
      ...partial,
      name,
    };

    this.contacts.set(jid, updated);

    // Retroactively update matching chat name if chat exists
    const chat = this.chats.get(jid);
    if (chat) {
      if (name && name !== rawNumber) {
        chat.name = name;
      }
      if (updated.avatarUrl) {
        chat.avatarUrl = updated.avatarUrl;
      }
      this.chats.set(jid, chat);
    }

    if (saveNow) this.saveData();
    return updated;
  }

  public importContactsList(list: { phone: string; name: string }[]): number {
    let matchCount = 0;
    for (const item of list) {
      if (!item.phone || !item.name) continue;
      const cleanPhone = item.phone.replace(/\D/g, '');
      if (!cleanPhone) continue;

      // Find matching contact or chat by phone number suffix
      for (const [jid, contact] of this.contacts.entries()) {
        const contactNum = jid.split('@')[0].replace(/\D/g, '');
        if (contactNum.endsWith(cleanPhone) || cleanPhone.endsWith(contactNum)) {
          contact.name = item.name;
          this.contacts.set(jid, contact);
          const chat = this.chats.get(jid);
          if (chat) {
            chat.name = item.name;
            this.chats.set(jid, chat);
          }
          matchCount++;
        }
      }

      for (const [jid, chat] of this.chats.entries()) {
        const chatNum = jid.split('@')[0].replace(/\D/g, '');
        if (chatNum.endsWith(cleanPhone) || cleanPhone.endsWith(chatNum)) {
          chat.name = item.name;
          this.chats.set(jid, chat);
          matchCount++;
        }
      }
    }

    this.saveData();
    return matchCount;
  }

  public updateContactName(rawJid: string, name: string, saveNow: boolean = false) {
    const jid = this.resolveJid(rawJid);
    const contact = this.contacts.get(jid);
    if (contact) {
      contact.name = name;
      this.contacts.set(jid, contact);
    } else {
      this.upsertContact(jid, { name }, saveNow);
    }

    const chat = this.chats.get(jid);
    if (chat) {
      chat.name = name;
      this.chats.set(jid, chat);
    }

    if (saveNow) this.saveData();
    return this.chats.get(jid);
  }

  public upsertChat(rawJid: string, partial: Partial<CRMChat>, saveNow: boolean = false) {
    const jid = this.resolveJid(rawJid);
    const rawNumber = jid.split('@')[0];
    const contact = this.contacts.get(jid);

    const defaultName = contact?.name || (partial.name && partial.name !== rawNumber ? partial.name : this.formatPhoneFallback(rawNumber));

    const existing = this.chats.get(jid) || {
      jid,
      name: defaultName,
      unreadCount: 0,
      lastMessageAt: partial.lastMessageAt || 0,
      isGroup: jid.endsWith('@g.us'),
      leadStatus: 'UNASSIGNED',
      tags: [],
    };

    let name = existing.name;
    if (partial.name && partial.name !== rawNumber) {
      name = partial.name;
    } else if (contact?.name && contact.name !== rawNumber) {
      name = contact.name;
    }

    const updated = {
      ...existing,
      ...partial,
      name,
      avatarUrl: partial.avatarUrl || existing.avatarUrl || contact?.avatarUrl,
    };

    if (contact) {
      if (contact.leadStatus && contact.leadStatus !== 'UNASSIGNED') {
        updated.leadStatus = contact.leadStatus;
      }
      if (contact.notes) updated.notes = contact.notes;
      if (contact.followUpDate) updated.followUpDate = contact.followUpDate;
      if (contact.tags && contact.tags.length > 0) updated.tags = contact.tags;
    }

    this.chats.set(jid, updated);
    if (saveNow) this.saveData();
    return updated;
  }

  public addMessage(msg: CRMMessage, saveNow: boolean = false) {
    const chatJid = this.resolveJid(msg.chatJid);
    msg.chatJid = chatJid;

    if (msg.timestamp && msg.timestamp < 10000000000) {
      msg.timestamp = msg.timestamp * 1000;
    }

    const list = this.messages.get(chatJid) || [];
    const existingIdx = list.findIndex(m => m.id === msg.id);
    if (existingIdx >= 0) {
      list[existingIdx] = { ...list[existingIdx], ...msg };
    } else {
      list.push(msg);
    }
    list.sort((a, b) => a.timestamp - b.timestamp);
    this.messages.set(chatJid, list);

    const contact = this.contacts.get(chatJid);
    const defaultName = contact?.name || (msg.senderName && msg.senderName !== 'Me' && msg.senderName !== chatJid.split('@')[0] ? msg.senderName : this.formatPhoneFallback(chatJid.split('@')[0]));

    const chat = this.chats.get(chatJid) || {
      jid: chatJid,
      name: defaultName,
      unreadCount: 0,
      lastMessageAt: msg.timestamp,
      isGroup: chatJid.endsWith('@g.us'),
      leadStatus: 'UNASSIGNED',
      tags: [],
    };

    const text = msg.text || '';
    const isSystemNotice = text === '[E2E_NOTIFICATION]' || text === '[CALL_LOG]' || text.includes('end-to-end encrypted');

    if (!isSystemNotice) {
      if (text === '[REVOKED]' || text === 'This message was deleted') {
        chat.lastMessagePreview = '🚫 This message was deleted';
      } else if (msg.mediaType === 'image' || text === '[IMAGE]' || text === 'Photo') {
        chat.lastMessagePreview = '📷 Photo';
      } else if (msg.mediaType === 'document' || text === '[DOCUMENT]' || text === 'Document' || (msg.fileName && msg.fileName.endsWith('.pdf'))) {
        chat.lastMessagePreview = `📄 ${msg.fileName || 'Document'}`;
      } else if (msg.mediaType === 'audio' || text === '[AUDIO]') {
        chat.lastMessagePreview = '🎵 Voice Note';
      } else if (text && text !== '[CHAT]' && text !== 'Contact') {
        chat.lastMessagePreview = text;
      }
      chat.lastMessageAt = Math.max(chat.lastMessageAt || 0, msg.timestamp);
    }

    if (msg.senderName && msg.senderName !== 'Me' && msg.senderName !== chatJid.split('@')[0] && chat.name === this.formatPhoneFallback(chatJid.split('@')[0])) {
      chat.name = msg.senderName;
      this.upsertContact(chatJid, { name: msg.senderName }, saveNow);
    }

    this.chats.set(chatJid, chat);
    this.saveData();
    return msg;
  }

  public updateMessageStatus(id: string, rawChatJid: string, status: CRMMessage['status']) {
    const chatJid = this.resolveJid(rawChatJid);
    const list = this.messages.get(chatJid);
    if (list) {
      const msg = list.find(m => m.id === id);
      if (msg) {
        msg.status = status;
        this.saveData();
        return msg;
      }
    }
    return null;
  }

  public getAllChatsSorted(): CRMChat[] {
    const list = Array.from(this.chats.values());
    const uniqueMap = new Map<string, CRMChat>();

    for (const c of list) {
      const resolvedKey = this.resolveJid(c.jid);
      const name = this.getContactName(c.jid);
      const avatarUrl = this.contacts.get(resolvedKey)?.avatarUrl || c.avatarUrl;

      const msgs = this.getMessagesForChat(c.jid);
      let lastMessagePreview = 'No messages';
      let lastMessageAt = 0;

      if (msgs.length > 0) {
        const lastMsg = msgs[msgs.length - 1];
        lastMessagePreview = lastMsg.text || (lastMsg.mediaType ? `[${lastMsg.mediaType.toUpperCase()}]` : '');
        lastMessageAt = lastMsg.timestamp;
      }

      const updatedChat: CRMChat = {
        ...c,
        jid: resolvedKey,
        name,
        avatarUrl,
        lastMessagePreview,
        lastMessageAt,
      };

      if (!uniqueMap.has(resolvedKey) || lastMessageAt > uniqueMap.get(resolvedKey)!.lastMessageAt) {
        uniqueMap.set(resolvedKey, updatedChat);
      }
    }

    return Array.from(uniqueMap.values()).sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  }

  public getMessagesForChat(rawChatJid: string): CRMMessage[] {
    const chatJid = this.resolveJid(rawChatJid);
    const rawNumber = rawChatJid.split('@')[0];
    const cleanNumber = chatJid.split('@')[0];

    const messageMap = new Map<string, CRMMessage>();

    const appendList = (list?: CRMMessage[]) => {
      if (list) {
        for (const m of list) {
          messageMap.set(m.id, m);
        }
      }
    };

    appendList(this.messages.get(rawChatJid));
    appendList(this.messages.get(chatJid));
    appendList(this.messages.get(rawNumber));
    appendList(this.messages.get(cleanNumber));

    // Check LID mappings
    for (const [lid, mappedPhone] of this.lidToJidMap.entries()) {
      if (mappedPhone === chatJid || mappedPhone === rawChatJid || mappedPhone.includes(cleanNumber)) {
        appendList(this.messages.get(lid));
        appendList(this.messages.get(lid.split('@')[0]));
      }
    }

    const merged = Array.from(messageMap.values()).sort((a, b) => a.timestamp - b.timestamp);
    return merged;
  }

  public updateCrmMetadata(rawJid: string, metadata: {
    leadStatus?: 'INTERESTED' | 'WARM_INTERESTED' | 'NOT_INTERESTED' | 'UNASSIGNED';
    followUpDate?: string;
    notes?: string;
    tags?: string[];
  }) {
    const jid = this.resolveJid(rawJid);
    const chat = this.chats.get(jid);
    if (chat) {
      if (metadata.leadStatus !== undefined) chat.leadStatus = metadata.leadStatus;
      if (metadata.followUpDate !== undefined) chat.followUpDate = metadata.followUpDate;
      if (metadata.notes !== undefined) chat.notes = metadata.notes;
      if (metadata.tags !== undefined) chat.tags = metadata.tags;
      this.chats.set(jid, chat);
    }

    const contact = this.contacts.get(jid);
    if (contact) {
      if (metadata.leadStatus !== undefined) contact.leadStatus = metadata.leadStatus;
      if (metadata.followUpDate !== undefined) contact.followUpDate = metadata.followUpDate;
      if (metadata.notes !== undefined) contact.notes = metadata.notes;
      if (metadata.tags !== undefined) contact.tags = metadata.tags;
      this.contacts.set(jid, contact);
    } else {
      this.upsertContact(jid, metadata);
    }

    this.saveData();
    return this.chats.get(jid);
  }
}

export const db = new StorageEngine();
