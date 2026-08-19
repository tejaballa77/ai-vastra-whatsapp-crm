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

export interface NoteEntry {
  text: string;
  date: string; // DD-MM-YYYY
}

export interface ColdCallLead {
  id: string;
  // Core display columns
  businessName: string;
  personName: string;
  phone: string;
  // Extended info (shown in popup)
  businessWebsite?: string;
  role?: string;
  email?: string;
  linkedinProfile?: string;
  facebookProfile?: string;
  instaProfile?: string;
  // Notes
  note?: string;            // Original note from Excel
  notesList?: NoteEntry[];  // User-added notes with timestamps
  // Status & tracking
  callStatus?: 'YES' | 'NO' | 'PENDING' | 'INTERESTED' | 'NOT_INTERESTED' | 'CONNECTED' | 'BUSY' | 'NO_ANSWER' | 'CALLBACK_REQUESTED';
  followUpDate?: string;
  // Multi-user & tracking
  calledBy?: string;        // Logged-in username (e.g. James Mitchell)
  callTimestamp?: number;   // Timestamp of last call/note update
  callOutcome?: string;     // Outcome badge (INTERESTED, NOT_INTERESTED, BUSY, NO_ANSWER, CALLBACK_REQUESTED, CONNECTED, PENDING)
  // Legacy compatibility
  name?: string;
  company?: string;
  customFields?: Record<string, any>;
  createdAt: number;
  updatedAt: number;
}

class StorageEngine {
  private dataFilePath: string;
  public contacts: Map<string, CRMContact> = new Map();
  public chats: Map<string, CRMChat> = new Map();
  public messages: Map<string, CRMMessage[]> = new Map(); // chatJid -> CRMMessage[]
  public lidToJidMap: Map<string, string> = new Map(); // LID JID -> Phone JID
  public coldCalls: Map<string, ColdCallLead> = new Map(); // Lead ID -> ColdCallLead

  constructor() {
    const dataDir = path.join(__dirname, '../data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.dataFilePath = path.join(dataDir, 'db.json');
    this.loadData();
  }

  private canonicalPhone(digits: string): string {
    if (!digits) return '';
    const clean = digits.replace(/\D/g, '');
    // Ignore 15-digit LIDs or unmapped numbers longer than 13 digits
    if (clean.length > 13 || clean.length === 15) return '';
    if (clean.length === 12 && clean.startsWith('91')) return clean.slice(2);
    if (clean.length === 13 && clean.startsWith('091')) return clean.slice(3);
    if (clean.length === 10) return clean;
    return '';
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
        if (parsed.coldCalls) {
          this.coldCalls = new Map(Object.entries(parsed.coldCalls));
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

          // Ignore 15-digit LIDs or invalid keys
          if (rawNum.length > 13 || rawNum.length === 15 || key.endsWith('@lid')) {
            const mapped = this.lidToJidMap.get(key) || this.lidToJidMap.get(rawNum);
            if (!mapped) continue;
          }

          const tenDigit = this.canonicalPhone(rawNum);

          if (!tenDigit || tenDigit.length !== 10) {
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

        // Reset legacy Chand Sir test lead fields so it does not appear in CRM Info
        const chandJid = '919505595434@s.whatsapp.net';
        const chand = this.chats.get(chandJid);
        if (chand) {
          chand.leadStatus = 'UNASSIGNED';
          chand.callStatus = undefined;
          chand.followUpDate = '';
          chand.notes = '';
          chand.notesList = [];
          this.chats.set(chandJid, chand);
        }

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
        coldCalls: Object.fromEntries(this.coldCalls),
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
      } else {
        lastMessageAt = (c.lastMessageAt && c.lastMessageAt < 10000000000) ? c.lastMessageAt * 1000 : (c.lastMessageAt || 0);
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
        // Prioritize the chat that has the most recent update / timestamp
        const primary = (updatedChat.lastMessageAt || 0) >= (existing.lastMessageAt || 0) ? updatedChat : existing;
        const secondary = primary === updatedChat ? existing : updatedChat;

        const curNameBad = !primary.name || BAD_NAMES.has(primary.name.toLowerCase().trim()) || primary.name.length <= 1;
        const existNameBad = !secondary.name || BAD_NAMES.has(secondary.name.toLowerCase().trim()) || secondary.name.length <= 1;
        const bestName = !curNameBad ? primary.name : (!existNameBad ? secondary.name : primary.name);

        uniqueMap.set(dedupeKey, {
          ...secondary,
          ...primary,
          name: bestName || this.formatPhoneFallback(rawDigits),
          leadStatus: primary.leadStatus !== undefined ? primary.leadStatus : (secondary.leadStatus || 'UNASSIGNED'),
          callStatus: primary.callStatus !== undefined ? primary.callStatus : secondary.callStatus,
          followUpDate: primary.followUpDate !== undefined ? primary.followUpDate : secondary.followUpDate,
          notes: primary.notes !== undefined ? primary.notes : secondary.notes,
          notesList: primary.notesList !== undefined ? primary.notesList : (secondary.notesList || []),
          lastMessageAt: Math.max(existing.lastMessageAt || 0, lastMessageAt || 0),
          avatarUrl: primary.avatarUrl || secondary.avatarUrl,
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
        lastMessageAt: 0,
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

  // ==================== COLD CALLS MANAGEMENT ====================
  public getAllColdCalls(): ColdCallLead[] {
    return Array.from(this.coldCalls.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  public importColdCalls(leads: Partial<ColdCallLead>[]): ColdCallLead[] {
    const imported: ColdCallLead[] = [];
    const now = Date.now();

    for (const lead of leads) {
      // Allow entry if any identifying info is present
      if (!lead.businessName && !lead.personName && !lead.phone && !lead.name) continue;
      const phoneDigits = (lead.phone || '').replace(/\D/g, '');
      const id = lead.id || (phoneDigits.length >= 8 ? phoneDigits : `lead_${now}_${Math.random().toString(36).substring(2, 7)}`);

      const existing = this.coldCalls.get(id);
      const entry: ColdCallLead = {
        id,
        // New primary fields (preserve existing values if not provided)
        businessName: lead.businessName !== undefined ? lead.businessName : (existing?.businessName || lead.name || existing?.name || ''),
        personName: lead.personName !== undefined ? lead.personName : (existing?.personName || lead.name || existing?.name || ''),
        phone: lead.phone !== undefined ? lead.phone : (existing?.phone || ''),
        // Extended info fields (blank cells stay blank — only set if explicitly provided)
        businessWebsite: lead.businessWebsite !== undefined ? lead.businessWebsite : (existing?.businessWebsite || ''),
        role: lead.role !== undefined ? lead.role : (existing?.role || ''),
        email: lead.email !== undefined ? lead.email : (existing?.email || ''),
        linkedinProfile: lead.linkedinProfile !== undefined ? lead.linkedinProfile : (existing?.linkedinProfile || ''),
        facebookProfile: lead.facebookProfile !== undefined ? lead.facebookProfile : (existing?.facebookProfile || ''),
        instaProfile: lead.instaProfile !== undefined ? lead.instaProfile : (existing?.instaProfile || ''),
        // Notes
        note: lead.note !== undefined ? lead.note : (existing?.note || ''),
        notesList: (lead.notesList && lead.notesList.length > 0) ? lead.notesList : (existing?.notesList || []),
        // Status
        callStatus: existing?.callStatus || lead.callStatus || 'PENDING',
        followUpDate: lead.followUpDate !== undefined ? lead.followUpDate : (existing?.followUpDate || ''),
        // Multi-user & tracking
        calledBy: lead.calledBy !== undefined ? lead.calledBy : (existing?.calledBy || 'Staff'),
        callTimestamp: lead.callTimestamp !== undefined ? lead.callTimestamp : (existing?.callTimestamp || now),
        callOutcome: lead.callOutcome !== undefined ? lead.callOutcome : (existing?.callOutcome || 'Pending'),
        // Legacy compat
        name: lead.personName || lead.name || existing?.name || '',
        company: lead.businessName || lead.company || existing?.company || '',
        customFields: { ...(existing?.customFields || {}), ...(lead.customFields || {}) },
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };

      this.coldCalls.set(id, entry);
      imported.push(entry);
    }

    this.saveData();
    return imported;
  }

  public updateColdCall(id: string, partial: Partial<ColdCallLead>): ColdCallLead | null {
    const existing = this.coldCalls.get(id);
    if (!existing) return null;

    const now = Date.now();
    const updated: ColdCallLead = {
      ...existing,
      ...partial,
      // Preserve notesList array type (NoteEntry[])
      notesList: partial.notesList !== undefined ? (partial.notesList as NoteEntry[]) : existing.notesList,
      customFields: partial.customFields ? { ...existing.customFields, ...partial.customFields } : existing.customFields,
      calledBy: partial.calledBy !== undefined ? partial.calledBy : existing.calledBy,
      callTimestamp: partial.callTimestamp !== undefined ? partial.callTimestamp : now,
      callOutcome: partial.callOutcome !== undefined ? partial.callOutcome : existing.callOutcome,
      updatedAt: now,
    };

    // Keep legacy fields in sync
    updated.name = updated.personName || updated.name || '';
    updated.company = updated.businessName || updated.company || '';

    this.coldCalls.set(id, updated);
    this.saveData();
    return updated;
  }

  public deleteColdCall(id: string): boolean {
    const existed = this.coldCalls.delete(id);
    if (existed) this.saveData();
    return existed;
  }

  public clearColdCalls(): boolean {
    this.coldCalls.clear();
    this.saveData();
    return true;
  }
}

export const db = new StorageEngine();
