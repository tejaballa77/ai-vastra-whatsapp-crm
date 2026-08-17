import fs from 'fs';
import path from 'path';

export interface CRMContact {
  jid: string;
  name: string;
  phone: string;
  avatarUrl?: string;
  leadStatus: 'INTERESTED' | 'WARM_INTERESTED' | 'NOT_INTERESTED' | 'UNASSIGNED';
  callStatus?: 'YES' | 'NO';
  followUpDate?: string;
  notes?: string;
  notesList?: string[];
  tags: string[];
  customFields?: Record<string, string>;
}

export interface CRMChat {
  jid: string;
  name: string;
  phone?: string;
  unreadCount: number;
  lastMessagePreview?: string;
  lastMessageAt: number;
  lastMessageFromMe?: boolean;
  lastMessageStatus?: CRMMessage['status'];
  avatarUrl?: string;
  isGroup: boolean;
  leadStatus: 'INTERESTED' | 'WARM_INTERESTED' | 'NOT_INTERESTED' | 'UNASSIGNED';
  callStatus?: 'YES' | 'NO';
  followUpDate?: string;
  notes?: string;
  notesList?: string[];
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
  mediaType?: 'image' | 'video' | 'audio' | 'document' | 'call';
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

  private canonicalPhone(digits: string): string {
    if (!digits) return digits;
    const clean = digits.replace(/\D/g, '');
    if (clean.length === 12 && clean.startsWith('91')) return clean.slice(2);
    if (clean.length === 13 && clean.startsWith('091')) return clean.slice(3);
    return clean;
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

        // ============================================================
        // PERMANENT DATABASE CLEANUP & DEDUPLICATION:
        // Remove bare number keys (no '@') and merge duplicate chats
        // ============================================================
        const cleanedChats = new Map<string, CRMChat>();
        const phoneToCanonicalJid = new Map<string, string>();

        for (const [key, chat] of this.chats.entries()) {
          const isGroup = key.endsWith('@g.us') || (chat.jid && chat.jid.endsWith('@g.us'));
          if (isGroup) {
            const groupJid = key.includes('@g.us') ? key : chat.jid;
            cleanedChats.set(groupJid, { ...chat, jid: groupJid, isGroup: true });
            continue;
          }

          const rawNum = (chat.phone || chat.jid || key).split('@')[0].replace(/\D/g, '');
          const tenDigit = this.canonicalPhone(rawNum);

          if (!tenDigit || tenDigit.length < 10) {
            // Keep groups or non-phone chats with '@'
            if (key.includes('@')) cleanedChats.set(key, chat);
            continue;
          }

          const canonicalJid = `91${tenDigit}@s.whatsapp.net`;

          if (!cleanedChats.has(canonicalJid)) {
            cleanedChats.set(canonicalJid, {
              ...chat,
              jid: canonicalJid,
              phone: `91${tenDigit}`,
            });
            phoneToCanonicalJid.set(tenDigit, canonicalJid);
          } else {
            const existing = cleanedChats.get(canonicalJid)!;
            // Merge metadata
            const mergedLead = (chat.leadStatus && chat.leadStatus !== 'UNASSIGNED') ? chat.leadStatus : existing.leadStatus;
            const mergedCall = chat.callStatus || existing.callStatus;
            const mergedFollow = chat.followUpDate || existing.followUpDate;
            const mergedNotes = chat.notes || existing.notes;
            const mergedNotesList = (chat.notesList && chat.notesList.length > 0) ? chat.notesList : existing.notesList;
            const newestTime = Math.max(existing.lastMessageAt || 0, chat.lastMessageAt || 0);

            // Merge messages if stored under old key
            const oldMsgs = this.messages.get(key) || [];
            if (oldMsgs.length > 0 && key !== canonicalJid) {
              const existingMsgs = this.messages.get(canonicalJid) || [];
              const combined = [...existingMsgs, ...oldMsgs];
              const uniqueMsgs = Array.from(new Map(combined.map(m => [m.id, m])).values());
              uniqueMsgs.sort((a, b) => a.timestamp - b.timestamp);
              this.messages.set(canonicalJid, uniqueMsgs);
            }

            cleanedChats.set(canonicalJid, {
              ...existing,
              leadStatus: mergedLead || 'UNASSIGNED',
              callStatus: mergedCall,
              followUpDate: mergedFollow,
              notes: mergedNotes,
              notesList: mergedNotesList,
              lastMessageAt: newestTime,
              unreadCount: Math.max(existing.unreadCount || 0, chat.unreadCount || 0),
            });
          }
        }

        this.chats = cleanedChats;
        this.saveData();
        console.log(`[Storage] Loaded & cleaned: ${this.chats.size} unique chats and ${this.contacts.size} contacts from storage.`);
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
    const digits = targetClean.replace(/\D/g, '');
    const ten = this.canonicalPhone(digits);
    if (ten && ten.length === 10) return `91${ten}@s.whatsapp.net`;
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

  public markChatAsRead(rawJid: string) {
    const jid = this.resolveJid(rawJid);
    const clean = jid.split('@')[0];
    for (const key of [jid, rawJid, clean]) {
      const chat = this.chats.get(key);
      if (chat) {
        chat.unreadCount = 0;
        this.chats.set(key, chat);
      }
    }
    this.saveData();
  }

  public deleteChat(rawJid: string) {
    const jid = this.resolveJid(rawJid);
    const clean = jid.split('@')[0];
    this.chats.delete(jid);
    this.chats.delete(rawJid);
    this.chats.delete(clean);
    this.messages.delete(jid);
    this.messages.delete(rawJid);
    this.messages.delete(clean);
    this.saveData();
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
    const BAD_NAMES = new Set(['.', 'contact', 'unsaved contact', 'unknown contact']);

    for (const c of list) {
      const resolvedKey = this.resolveJid(c.jid);
      const rawDigits = resolvedKey.split('@')[0].replace(/\D/g, '');
      // Canonical 10-digit key — merges 919714515645, 9714515645, 09714515645 into ONE entry
      const dedupeKey = this.canonicalPhone(rawDigits) || resolvedKey;

      let name = (c.name && c.name !== 'Unsaved Contact' && !c.name.includes('@'))
        ? c.name
        : this.getContactName(c.jid);

      if (!name || BAD_NAMES.has(name.toLowerCase().trim()) || name.length <= 1) {
        name = this.formatPhoneFallback(rawDigits);
      }
      if (name.includes('T ONE') || name.includes('REAL-WORLD') || name.includes('TESTING')) {
        name = this.formatPhoneFallback(rawDigits);
      }

      const avatarUrl = this.contacts.get(resolvedKey)?.avatarUrl || c.avatarUrl;
      const msgs = this.getMessagesForChat(c.jid);

      let lastMessagePreview = 'No messages';
      let lastMessageAt = 0;
      let lastMessageFromMe = false;
      let lastMessageStatus: CRMMessage['status'] = 'SENT';

      if (msgs.length > 0) {
        const validMsgs = msgs.filter(m => m.text !== '[E2E_NOTIFICATION]' && !m.text?.includes('end-to-end encrypted'));
        const targetMsg = validMsgs.length > 0 ? validMsgs[validMsgs.length - 1] : msgs[msgs.length - 1];

        lastMessageFromMe = Boolean(targetMsg.fromMe);
        lastMessageStatus = targetMsg.status || 'SENT';

        const text = targetMsg.text || '';
        if (text === '[REVOKED]' || text === 'This message was deleted') {
          lastMessagePreview = '🚫 This message was deleted';
        } else if (text.includes('Missed voice call') || text.includes('Missed call') || (text.includes('Voice call') && !lastMessageFromMe)) {
          lastMessagePreview = '📞 Missed voice call';
        } else if (text.includes('Voice call') || text.includes('Video call') || targetMsg.mediaType === 'call' || text === '[CALL_LOG]') {
          lastMessagePreview = '📞 Voice call';
        } else if (targetMsg.mediaType === 'image' || text === '[IMAGE]' || text === 'Photo') {
          lastMessagePreview = '📷 Photo';
        } else if (targetMsg.mediaType === 'document' || text === '[DOCUMENT]' || text === 'Document' || (targetMsg.fileName && targetMsg.fileName.endsWith('.pdf'))) {
          lastMessagePreview = `📄 ${targetMsg.fileName || 'Document'}`;
        } else if (targetMsg.mediaType === 'audio' || text === '[AUDIO]') {
          lastMessagePreview = '🎵 Voice Note';
        } else if (text && text !== '[CHAT]' && text !== 'Contact' && text !== '[INTERACTIVE]') {
          lastMessagePreview = text;
        }

        const rawTs = targetMsg.timestamp || 0;
        lastMessageAt = rawTs < 10000000000 ? rawTs * 1000 : rawTs;
      }

      let unreadCount = c.unreadCount;
      if (unreadCount === undefined || unreadCount === null) {
        let count = 0;
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].fromMe) break;
          count++;
        }
        unreadCount = count;
      }

      const updatedChat: CRMChat = {
        ...c,
        jid: resolvedKey,
        name,
        unreadCount,
        avatarUrl,
        lastMessagePreview,
        lastMessageAt,
        lastMessageFromMe,
        lastMessageStatus,
      };

      if (!uniqueMap.has(dedupeKey)) {
        uniqueMap.set(dedupeKey, updatedChat);
      } else {
        const existing = uniqueMap.get(dedupeKey)!;

        // Merge CRM data — always keep most valuable values
        const mergedLeadStatus = (c.leadStatus && c.leadStatus !== 'UNASSIGNED') ? c.leadStatus
          : (existing.leadStatus !== 'UNASSIGNED' ? existing.leadStatus : 'UNASSIGNED');
        const mergedCallStatus = c.callStatus || existing.callStatus;
        const mergedFollowUpDate = c.followUpDate || existing.followUpDate;
        const mergedNotes = c.notes || existing.notes;
        const mergedNotesList = (c.notesList && c.notesList.length > 0) ? c.notesList : (existing.notesList || []);
        const newestTime = Math.max(existing.lastMessageAt, lastMessageAt);

        const curNameBad = !name || BAD_NAMES.has(name.toLowerCase().trim()) || name.length <= 1;
        const existNameBad = !existing.name || BAD_NAMES.has(existing.name.toLowerCase().trim()) || existing.name.length <= 1;
        const bestName = curNameBad ? existing.name : (existNameBad ? name : (name.length >= existing.name.length ? name : existing.name));

        uniqueMap.set(dedupeKey, {
          ...existing,
          ...updatedChat,
          name: bestName || this.formatPhoneFallback(rawDigits),
          leadStatus: mergedLeadStatus,
          callStatus: mergedCallStatus,
          followUpDate: mergedFollowUpDate,
          notes: mergedNotes,
          notesList: mergedNotesList,
          lastMessageAt: newestTime,
          avatarUrl: avatarUrl || existing.avatarUrl,
        });
      }
    }

    return Array.from(uniqueMap.values()).sort((a, b) => {
      const aIsSaved = (a.leadStatus && a.leadStatus !== 'UNASSIGNED') || a.callStatus === 'YES' || Boolean(a.followUpDate);
      const bIsSaved = (b.leadStatus && b.leadStatus !== 'UNASSIGNED') || b.callStatus === 'YES' || Boolean(b.followUpDate);
      if (aIsSaved && !bIsSaved) return -1;
      if (!aIsSaved && bIsSaved) return 1;
      return b.lastMessageAt - a.lastMessageAt;
    });
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
    name?: string;
    phone?: string;
    leadStatus?: 'INTERESTED' | 'WARM_INTERESTED' | 'NOT_INTERESTED' | 'UNASSIGNED';
    callStatus?: 'YES' | 'NO';
    followUpDate?: string;
    notes?: string;
    notesList?: string[];
    tags?: string[];
  }) {
    const jid = this.resolveJid(rawJid);
    const rawDigits = (metadata.phone || rawJid).replace(/\D/g, '') || jid.split('@')[0].replace(/\D/g, '');
    const tenDigit = this.canonicalPhone(rawDigits);
    const canonicalJid = jid.endsWith('@g.us') ? jid : (tenDigit.length >= 10 ? `91${tenDigit}@s.whatsapp.net` : jid);

    const BAD_NAMES = new Set(['.', 'contact', 'unsaved contact', 'unknown contact']);
    const incomingNameClean = (metadata.name || '').trim();
    const incomingNameIsValid = incomingNameClean.length > 1 && !BAD_NAMES.has(incomingNameClean.toLowerCase());

    // 1. Update or create Contact strictly under canonicalJid
    let contact = this.contacts.get(canonicalJid) || this.contacts.get(jid);
    if (!contact) {
      contact = {
        jid: canonicalJid,
        phone: tenDigit ? `91${tenDigit}` : rawDigits,
        name: incomingNameIsValid ? incomingNameClean : this.formatPhoneFallback(rawDigits),
        leadStatus: metadata.leadStatus || 'UNASSIGNED',
        tags: metadata.tags || [],
        notes: metadata.notes,
        notesList: metadata.notesList || [],
        followUpDate: metadata.followUpDate,
        callStatus: metadata.callStatus,
      };
    } else {
      if (incomingNameIsValid) contact.name = incomingNameClean;
      if (metadata.leadStatus !== undefined) contact.leadStatus = metadata.leadStatus;
      if (metadata.callStatus !== undefined) contact.callStatus = metadata.callStatus;
      if (metadata.followUpDate !== undefined) contact.followUpDate = metadata.followUpDate;
      if (metadata.notes !== undefined) contact.notes = metadata.notes;
      if (metadata.notesList !== undefined) contact.notesList = metadata.notesList;
      if (metadata.tags !== undefined) contact.tags = metadata.tags;
      if (tenDigit) contact.phone = `91${tenDigit}`;
    }
    this.contacts.set(canonicalJid, contact);

    // 2. Find and merge ANY existing chat entries for this number into canonicalJid
    let chat = this.chats.get(canonicalJid) || this.chats.get(jid);
    const keysToDelete: string[] = [];

    if (tenDigit && tenDigit.length >= 10) {
      for (const [k, c] of this.chats.entries()) {
        if (k === canonicalJid) continue;
        const cDigits = this.canonicalPhone((c.phone || c.jid || k).split('@')[0].replace(/\D/g, ''));
        if (cDigits === tenDigit) {
          if (!chat) chat = { ...c };
          else {
            if (c.leadStatus && c.leadStatus !== 'UNASSIGNED') chat.leadStatus = c.leadStatus;
            if (c.callStatus) chat.callStatus = c.callStatus;
            if (c.notes) chat.notes = c.notes;
            if (c.notesList && c.notesList.length > 0) chat.notesList = c.notesList;
            if (c.followUpDate) chat.followUpDate = c.followUpDate;
            chat.lastMessageAt = Math.max(chat.lastMessageAt || 0, c.lastMessageAt || 0);
          }
          keysToDelete.push(k);

          // Merge messages to canonicalJid
          const oldMsgs = this.messages.get(k) || [];
          if (oldMsgs.length > 0) {
            const curMsgs = this.messages.get(canonicalJid) || [];
            const combined = [...curMsgs, ...oldMsgs];
            const uniqueMsgs = Array.from(new Map(combined.map(m => [m.id, m])).values());
            uniqueMsgs.sort((a, b) => a.timestamp - b.timestamp);
            this.messages.set(canonicalJid, uniqueMsgs);
            this.messages.delete(k);
          }
        }
      }
    }

    // Delete duplicate keys from chats map
    for (const k of keysToDelete) {
      this.chats.delete(k);
    }

    if (!chat) {
      chat = {
        jid: canonicalJid,
        phone: tenDigit ? `91${tenDigit}` : rawDigits,
        name: incomingNameIsValid ? incomingNameClean : (contact.name || this.formatPhoneFallback(rawDigits)),
        unreadCount: 0,
        lastMessageAt: Date.now(),
        isGroup: canonicalJid.endsWith('@g.us'),
        leadStatus: metadata.leadStatus || 'UNASSIGNED',
        callStatus: metadata.callStatus || undefined,
        followUpDate: metadata.followUpDate || '',
        notes: metadata.notes || '',
        notesList: metadata.notesList || [],
        tags: metadata.tags || [],
      };
    } else {
      if (incomingNameIsValid) chat.name = incomingNameClean;
      if (metadata.leadStatus !== undefined) chat.leadStatus = metadata.leadStatus;
      if (metadata.callStatus !== undefined) chat.callStatus = metadata.callStatus || undefined;
      if (metadata.followUpDate !== undefined) chat.followUpDate = metadata.followUpDate;
      if (metadata.notes !== undefined) chat.notes = metadata.notes;
      if (metadata.notesList !== undefined) chat.notesList = metadata.notesList;
      if (metadata.tags !== undefined) chat.tags = metadata.tags;
      chat.jid = canonicalJid;
      if (tenDigit) chat.phone = `91${tenDigit}`;
    }

    // Store ONLY under canonicalJid
    this.chats.set(canonicalJid, chat);

    this.saveData();
    return chat;
  }
}

export const db = new StorageEngine();
