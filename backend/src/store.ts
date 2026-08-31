import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { dbManager } from './db';

export interface BackupSettings {
  enabled: boolean;
  backupTime: string;
  folderPath: string;
  lastBackupDate?: string;
}

export interface CRMContact {
  jid: string;
  name: string;
  phone: string;
  avatarUrl?: string;
  leadStatus: 'INTERESTED' | 'WARM_INTERESTED' | 'WARM' | 'NOT_INTERESTED' | 'UNASSIGNED';
  callStatus?: 'YES' | 'NO';
  followUpDate?: string;
  previousFollowUpDate?: string;
  notes?: string;
  notesList?: string[];
  tags: string[];
  customFields?: Record<string, string>;
  aiDisabled?: boolean;
  isAutoWarm?: boolean;
  manuallySaved?: boolean;
  updatedAt?: number;
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
  leadStatus: 'INTERESTED' | 'WARM_INTERESTED' | 'WARM' | 'NOT_INTERESTED' | 'UNASSIGNED';
  callStatus?: 'YES' | 'NO';
  followUpDate?: string;
  previousFollowUpDate?: string;
  notes?: string;
  notesList?: string[];
  tags: string[];
  aiDisabled?: boolean;
  isAutoWarm?: boolean;
  manuallySaved?: boolean;
  updatedAt?: number;
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

export type CallChoiceType = 'YES' | 'NO' | 'MESSAGE' | 'NOT_ANSWERED' | 'INVALID' | 'PENDING';
export type CallStatusType = 'INTERESTED' | 'WARM' | 'NOT_INTERESTED' | 'NOT_CONNECTED' | 'NOT_REACHABLE' | 'INVALID' | 'PENDING' | string;

export interface FollowUpRound {
  id: string;
  roundNumber: number;
  callChoice?: CallChoiceType;
  callStatus?: CallStatusType;
  followUpDate?: string;
  notesList?: NoteEntry[];
  note?: string;
  calledBy?: string;
  updatedAt?: number;
}

export interface ColdCallLead {
  id: string;
  businessName: string;
  personName: string;
  phone: string;
  businessWebsite?: string;
  role?: string;
  email?: string;
  linkedinProfile?: string;
  facebookProfile?: string;
  instaProfile?: string;
  followUps?: FollowUpRound[];
  note?: string;
  notesList?: NoteEntry[];
  callChoice?: CallChoiceType;
  callStatus?: CallStatusType;
  followUpDate?: string;
  calledBy?: string;
  clientLanguage?: string;
  campaignName?: string;
  callTimestamp?: number;
  callOutcome?: string;
  name?: string;
  company?: string;
  customFields?: Record<string, any>;
  createdAt: number;
  updatedAt: number;
}

export interface ArchivedClearedLead {
  jid: string;
  name: string;
  phone: string;
  previousLeadStatus?: string;
  previousCallStatus?: string;
  previousFollowUpDate?: string;
  previousNotesList?: string[];
  clearedAt: number;
  clearedDate: string;
}

class StorageEngine {
  private dataFilePath: string;
  public contacts: Map<string, CRMContact> = new Map();
  public chats: Map<string, CRMChat> = new Map();
  public messages: Map<string, CRMMessage[]> = new Map();
  public lidToJidMap: Map<string, string> = new Map();
  public coldCalls: Map<string, ColdCallLead> = new Map();
  public activeUsers: Set<string> = new Set();
  public archivedClearedLeads: Map<string, ArchivedClearedLead> = new Map();
  public clearedLeadsSet: Set<string> = new Set();
  public backupSettings: BackupSettings = {
    enabled: true,
    backupTime: '21:00',
    folderPath: '/home/crm-nicedigitals/htdocs/crm.nicedigitalsgroup.com/backend/backups',
    lastBackupDate: '',
  };

  public runAutomatedBackupNow(customFolderPath?: string): { success: boolean; whatsappFile: string; coldCallsFile: string; message: string } {
    try {
      const defaultFolder = path.join(__dirname, '../backups');
      const folder = (customFolderPath || this.backupSettings.folderPath || defaultFolder).trim();
      if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true });
      }

      const now = new Date();
      const dateStr = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;

      // 1. Generate WhatsApp Backup Excel
      const savedChats = this.getAllChatsSorted().filter(c => {
        const hasStatus = Boolean(c.leadStatus && c.leadStatus !== 'UNASSIGNED');
        const hasCall = Boolean(c.callStatus && (c.callStatus as any) !== 'None');
        const hasFollow = Boolean(c.followUpDate && c.followUpDate.trim().length > 0);
        const hasNotes = Boolean((c.notesList && c.notesList.length > 0) || (c.notes && c.notes.trim().length > 0));
        return hasStatus || hasCall || hasFollow || hasNotes || (c as any).manuallySaved;
      });

      const waRows = savedChats.map(c => ({
        'Contact Name / Phone': c.name || c.phone || (c.jid ? c.jid.split('@')[0] : 'Unsaved'),
        'Lead Status': c.leadStatus || 'UNASSIGNED',
        'Call Status': c.callStatus || '—',
        'Follow-Up Date': c.followUpDate || '—',
        'Latest CRM Notes': (c.notesList && c.notesList.length > 0) ? c.notesList.join(' | ') : (c.notes || '—'),
      }));

      const waSheet = XLSX.utils.json_to_sheet(waRows.length > 0 ? waRows : [{
        'Contact Name / Phone': 'No saved data found',
        'Lead Status': '—',
        'Call Status': '—',
        'Follow-Up Date': '—',
        'Latest CRM Notes': '—',
      }]);

      waSheet['!cols'] = [{ wch: 30 }, { wch: 20 }, { wch: 15 }, { wch: 18 }, { wch: 60 }];
      const waWb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(waWb, waSheet, 'WhatsApp_CRM_Data');

      const whatsappFileName = `WhatsApp_Backup_${dateStr}.xlsx`;
      const whatsappFilePath = path.join(folder, whatsappFileName);
      XLSX.writeFile(waWb, whatsappFilePath);

      // 2. Generate Cold Calls Backup Excel
      const allCold = this.getAllColdCalls();
      const coldRows = allCold.map(l => ({
        'Business Name': l.businessName || l.company || '—',
        'Person Name': l.personName || l.name || '—',
        'Phone Number': l.phone || '—',
        'BDM': l.calledBy || '—',
        'Call Status': l.callChoice || l.callOutcome || l.callStatus || '—',
        'Follow-Up Date': l.followUpDate || '—',
        'Notes': (l.notesList && l.notesList.length > 0) ? l.notesList.map((n: any) => typeof n === 'string' ? n : (n.text || '')).join(' | ') : (l.note || '—'),
      }));

      const coldSheet = XLSX.utils.json_to_sheet(coldRows.length > 0 ? coldRows : [{
        'Business Name': 'No cold call data found',
        'Person Name': '—',
        'Phone Number': '—',
        'BDM': '—',
        'Call Status': '—',
        'Follow-Up Date': '—',
        'Notes': '—',
      }]);

      coldSheet['!cols'] = [{ wch: 28 }, { wch: 25 }, { wch: 18 }, { wch: 15 }, { wch: 18 }, { wch: 18 }, { wch: 55 }];
      const coldWb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(coldWb, coldSheet, 'Cold_Calls_All_Data');

      const coldCallsFileName = `ColdCalls_Backup_${dateStr}.xlsx`;
      const coldCallsFilePath = path.join(folder, coldCallsFileName);
      XLSX.writeFile(coldWb, coldCallsFilePath);

      this.backupSettings.lastBackupDate = dateStr;
      this.saveData();

      return {
        success: true,
        whatsappFile: whatsappFilePath,
        coldCallsFile: coldCallsFilePath,
        message: `Successfully saved ${whatsappFileName} and ${coldCallsFileName} to ${folder}`,
      };
    } catch (err: any) {
      console.error('[StorageEngine] Error running automated backup:', err.message);
      return {
        success: false,
        whatsappFile: '',
        coldCallsFile: '',
        message: `Failed to run backup: ${err.message}`,
      };
    }
  }

  public registerActiveUser(username: string) {
    if (username && username !== 'Staff' && username !== 'Executive User' && username.trim().length > 0) {
      const clean = username.trim();
      if (!this.activeUsers.has(clean)) {
        this.activeUsers.add(clean);
        this.saveData();
        dbManager.query(
          `INSERT INTO active_users (username, created_at) VALUES (?, ?) ON CONFLICT(username) DO NOTHING`,
          [clean, Date.now()]
        ).catch(() => {});
      }
    }
  }

  public getActiveUsers(): string[] {
    const userSet = new Set<string>(this.activeUsers);
    for (const lead of this.coldCalls.values()) {
      if (lead.calledBy && lead.calledBy !== 'Staff' && lead.calledBy !== 'Executive User') {
        userSet.add(lead.calledBy.trim());
      }
    }
    return Array.from(userSet);
  }

  constructor() {
    const dataDir = path.join(__dirname, '../data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.dataFilePath = path.join(dataDir, 'db.json');
  }

  public async initSqlData() {
    try {
      await dbManager.initTables();

      // Load Contacts from SQL
      const contactRows = await dbManager.query(`SELECT * FROM crm_contacts`);
      for (const row of contactRows) {
        let notesList: string[] = [];
        let tags: string[] = [];
        try { notesList = JSON.parse(row.notes_list || '[]'); } catch (e) {}
        try { tags = JSON.parse(row.tags || '[]'); } catch (e) {}

        this.contacts.set(row.jid, {
          jid: row.jid,
          name: row.name || '',
          phone: row.phone || '',
          avatarUrl: row.avatar_url || undefined,
          leadStatus: row.lead_status || 'UNASSIGNED',
          callStatus: row.call_status || undefined,
          followUpDate: row.follow_up_date || undefined,
          previousFollowUpDate: row.previous_follow_up_date || undefined,
          notes: row.notes || undefined,
          notesList,
          tags,
          aiDisabled: Boolean(row.ai_disabled),
          isAutoWarm: Boolean(row.is_auto_warm),
          manuallySaved: Boolean(row.manually_saved),
          updatedAt: Number(row.updated_at || row.created_at || row.last_message_at || 0),
        });
      }

      // Load Chats from SQL
      const chatRows = await dbManager.query(`SELECT * FROM crm_chats`);
      for (const row of chatRows) {
        let notesList: string[] = [];
        let tags: string[] = [];
        try { notesList = JSON.parse(row.notes_list || '[]'); } catch (e) {}
        try { tags = JSON.parse(row.tags || '[]'); } catch (e) {}

        this.chats.set(row.jid, {
          jid: row.jid,
          name: row.name || '',
          phone: row.phone || '',
          unreadCount: Number(row.unread_count || 0),
          lastMessagePreview: row.last_message_preview || '',
          lastMessageAt: Number(row.last_message_at || 0),
          lastMessageFromMe: Boolean(row.last_message_from_me),
          lastMessageStatus: row.last_message_status || 'SENT',
          avatarUrl: row.avatar_url || undefined,
          isGroup: Boolean(row.is_group),
          leadStatus: row.lead_status || 'UNASSIGNED',
          callStatus: row.call_status || undefined,
          followUpDate: row.follow_up_date || undefined,
          previousFollowUpDate: row.previous_follow_up_date || undefined,
          notes: row.notes || undefined,
          notesList,
          tags,
          aiDisabled: Boolean(row.ai_disabled),
          isAutoWarm: Boolean(row.is_auto_warm),
          manuallySaved: Boolean(row.manually_saved),
          updatedAt: Number(row.updated_at || row.created_at || row.last_message_at || 0),
        });
      }

      // Load Messages from SQL
      const msgRows = await dbManager.query(`SELECT * FROM crm_messages ORDER BY timestamp ASC`);
      for (const row of msgRows) {
        const chatJid = row.chat_jid;
        if (!chatJid) continue;
        const list = this.messages.get(chatJid) || [];
        list.push({
          id: row.id,
          chatJid: row.chat_jid,
          senderJid: row.sender_jid || '',
          senderName: row.sender_name || '',
          fromMe: Boolean(row.from_me),
          text: row.text || '',
          mediaUrl: row.media_url || undefined,
          mediaType: row.media_type || undefined,
          fileName: row.file_name || undefined,
          timestamp: Number(row.timestamp || Date.now()),
          status: row.status || 'SENT',
        });
        this.messages.set(chatJid, list);
      }

      // Load Cold Calls from SQL
      const coldRows = await dbManager.query(`SELECT * FROM cold_calls`);
      for (const row of coldRows) {
        let followUps: FollowUpRound[] = [];
        let notesList: NoteEntry[] = [];
        let customFields: Record<string, any> = {};
        try { followUps = JSON.parse(row.follow_ups || '[]'); } catch (e) {}
        try { notesList = JSON.parse(row.notes_list || '[]'); } catch (e) {}
        try { customFields = JSON.parse(row.custom_fields || '{}'); } catch (e) {}

        this.coldCalls.set(row.id, {
          id: row.id,
          businessName: row.business_name || '',
          personName: row.person_name || '',
          phone: row.phone || '',
          businessWebsite: row.business_website || undefined,
          role: row.role || undefined,
          email: row.email || undefined,
          linkedinProfile: row.linkedin_profile || undefined,
          facebookProfile: row.facebook_profile || undefined,
          instaProfile: row.insta_profile || undefined,
          followUps,
          note: row.note || undefined,
          notesList,
          callChoice: row.call_choice || undefined,
          callStatus: row.call_status || undefined,
          followUpDate: row.follow_up_date || undefined,
          calledBy: row.called_by || undefined,
          clientLanguage: row.client_language || undefined,
          campaignName: row.campaign_name || 'Campaign 1',
          callTimestamp: Number(row.call_timestamp || 0),
          callOutcome: row.call_outcome || undefined,
          name: row.personName || row.name || '',
          company: row.businessName || row.company || '',
          customFields,
          createdAt: Number(row.created_at || Date.now()),
          updatedAt: Number(row.updated_at || Date.now()),
        });
      }

      // Load Archived Cleared Leads from SQL
      const archRows = await dbManager.query(`SELECT * FROM archived_cleared_leads`);
      for (const row of archRows) {
        let notesList: string[] = [];
        try { notesList = JSON.parse(row.previous_notes_list || '[]'); } catch (e) {}

        this.archivedClearedLeads.set(row.jid, {
          jid: row.jid,
          name: row.name || '',
          phone: row.phone || '',
          previousLeadStatus: row.previous_lead_status || undefined,
          previousCallStatus: row.previous_call_status || undefined,
          previousFollowUpDate: row.previous_follow_up_date || undefined,
          previousNotesList: notesList,
          clearedAt: Number(row.cleared_at || Date.now()),
          clearedDate: row.cleared_date || '',
        });
      }

      // Load LID Mappings from SQL
      const lidRows = await dbManager.query(`SELECT * FROM lid_to_jid_map`);
      for (const row of lidRows) {
        this.lidToJidMap.set(row.lid, row.phone_jid);
      }

      // Load Active Users from SQL
      const userRows = await dbManager.query(`SELECT * FROM active_users`);
      for (const row of userRows) {
        this.activeUsers.add(row.username);
      }

      console.log(`[StorageEngine] Loaded ${this.chats.size} chats, ${this.contacts.size} contacts, and ${this.coldCalls.size} cold calls from SQL Database.`);
    } catch (err: any) {
      console.error('[StorageEngine] SQL Data Initialization error:', err.message);
    }

    // Seed exact 4 real Interested Cold Call leads by chand
    const realInterestedColdCalls: Partial<ColdCallLead>[] = [
      {
        id: 'cold_9723266714',
        businessName: 'Tagdo',
        personName: 'Ramjibhai Popatbhai Bhatiya',
        phone: '9723266714',
        calledBy: 'chand',
        callChoice: 'YES',
        callOutcome: 'INTERESTED',
        callStatus: 'INTERESTED',
        campaignName: 'Campaign 1',
        updatedAt: 1725091200000,
      },
      {
        id: 'cold_9885248426',
        businessName: 'trendly',
        personName: 'Venkat',
        phone: '9885248426',
        calledBy: 'chand',
        callChoice: 'YES',
        callOutcome: 'INTERESTED',
        callStatus: 'INTERESTED',
        campaignName: 'Campaign 1',
        updatedAt: 1725004800000,
      },
      {
        id: 'cold_9810422275',
        businessName: 'Delhi Exclusive',
        personName: 'Pranjal',
        phone: '9810422275',
        calledBy: 'chand',
        callChoice: 'YES',
        callOutcome: 'INTERESTED',
        callStatus: 'INTERESTED',
        campaignName: 'Campaign 1',
        updatedAt: 1724918400000,
      },
      {
        id: 'cold_8470089700',
        businessName: 'Delhi exclusive',
        personName: 'Bhavya',
        phone: '8470089700',
        calledBy: 'chand',
        callChoice: 'YES',
        callOutcome: 'INTERESTED',
        callStatus: 'INTERESTED',
        campaignName: 'Campaign 1',
        updatedAt: 1724832000000,
      },
    ];

    const realPhonesSet = new Set(['9723266714', '9885248426', '9810422275', '8470089700']);

    for (const lead of realInterestedColdCalls) {
      const existing = this.coldCalls.get(lead.id!) || Array.from(this.coldCalls.values()).find(c => (c.phone || '').replace(/\D/g, '') === lead.phone);
      const targetId = existing?.id || lead.id!;

      const fullEntry: ColdCallLead = {
        id: targetId,
        businessName: lead.businessName!,
        personName: lead.personName!,
        phone: lead.phone!,
        calledBy: lead.calledBy,
        callChoice: lead.callChoice,
        callOutcome: lead.callOutcome,
        callStatus: lead.callStatus as any,
        campaignName: lead.campaignName || 'Campaign 1',
        createdAt: existing?.createdAt || lead.updatedAt!,
        updatedAt: lead.updatedAt!,
        notesList: existing?.notesList || [],
        customFields: existing?.customFields || {},
      };

      this.coldCalls.set(targetId, fullEntry);

      dbManager.query(
        `INSERT INTO cold_calls (id, business_name, person_name, phone, called_by, call_choice, call_outcome, call_status, campaign_name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET business_name = EXCLUDED.business_name, person_name = EXCLUDED.person_name, phone = EXCLUDED.phone, called_by = EXCLUDED.called_by, call_choice = EXCLUDED.call_choice, call_outcome = EXCLUDED.call_outcome, call_status = EXCLUDED.call_status, updated_at = EXCLUDED.updated_at`,
        [targetId, fullEntry.businessName, fullEntry.personName, fullEntry.phone, fullEntry.calledBy, fullEntry.callChoice, fullEntry.callOutcome, fullEntry.callStatus, fullEntry.campaignName, fullEntry.createdAt, fullEntry.updatedAt]
      ).catch(() => {});
    }

    // Persist unified data to fallback db.json
    this.saveData();
  }

  public unBlacklist(rawJid: string) {
    if (!rawJid) return;
    const jid = this.resolveJid(rawJid);
    const rawDigits = rawJid.replace(/\D/g, '');
    const tenDigit = this.canonicalPhone(rawDigits);

    const keys = [
      rawJid.toLowerCase(),
      jid.toLowerCase(),
      rawDigits,
      tenDigit
    ].filter(k => k && k.length >= 2);

    for (const k of keys) {
      this.clearedLeadsSet.delete(k);
      dbManager.query(`DELETE FROM cleared_leads_blacklist WHERE key = ?`, [k]).catch(() => {});
    }
  }

  private canonicalPhone(digits: string): string {
    if (!digits) return '';
    const clean = digits.replace(/\D/g, '');
    if (clean.length === 10) return clean;
    if (clean.length === 12 && clean.startsWith('91')) return clean.slice(2);
    if (clean.length === 13 && clean.startsWith('091')) return clean.slice(3);
    if (clean.length >= 7 && clean.length <= 15) return clean;
    return clean;
  }

  private loadData() {
    try {
      if (fs.existsSync(this.dataFilePath)) {
        const raw = fs.readFileSync(this.dataFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.contacts) this.contacts = new Map(Object.entries(parsed.contacts));
        if (parsed.chats) this.chats = new Map(Object.entries(parsed.chats));
        if (parsed.messages) this.messages = new Map(Object.entries(parsed.messages));
        if (parsed.lidToJidMap) this.lidToJidMap = new Map(Object.entries(parsed.lidToJidMap));
        if (parsed.coldCalls) this.coldCalls = new Map(Object.entries(parsed.coldCalls));
        if (parsed.activeUsers) this.activeUsers = new Set(parsed.activeUsers);
        if (parsed.archivedClearedLeads) this.archivedClearedLeads = new Map(Object.entries(parsed.archivedClearedLeads));
        if (parsed.backupSettings) this.backupSettings = { ...this.backupSettings, ...parsed.backupSettings };
      }
    } catch (err) {
      console.error('[Storage] Error loading fallback db.json:', err);
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
        activeUsers: Array.from(this.activeUsers),
        archivedClearedLeads: Object.fromEntries(this.archivedClearedLeads),
        backupSettings: this.backupSettings,
      };
      fs.writeFileSync(this.dataFilePath, JSON.stringify(obj, null, 2), 'utf-8');
    } catch (err) {
      console.error('[Storage] Error saving secondary fallback db.json:', err);
    }
  }

  public registerLidMapping(lid: string, phoneJid: string, saveNow: boolean = false) {
    if (lid && phoneJid && lid !== phoneJid) {
      this.lidToJidMap.set(lid, phoneJid);
      dbManager.query(
        `INSERT INTO lid_to_jid_map (lid, phone_jid) VALUES (?, ?) ON CONFLICT(lid) DO UPDATE SET phone_jid = EXCLUDED.phone_jid`,
        [lid, phoneJid]
      ).catch(() => {});
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
    if (digits.length >= 7) return `${digits}@s.whatsapp.net`;

    // Strictly return target cleanly without cross-merging distinct named contacts!
    return target;
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

    if (digits.startsWith('91') && digits.length === 12) {
      const ten = digits.slice(2);
      return `+91 ${ten.slice(0, 5)} ${ten.slice(5)}`;
    }

    if (digits.length === 10) {
      return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
    }

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

    const updated: CRMContact = {
      ...existing,
      ...partial,
      name,
      updatedAt: Date.now(),
    };

    this.contacts.set(jid, updated);

    // Save to SQL Database
    dbManager.query(
      `INSERT INTO crm_contacts (
        jid, name, phone, avatar_url, lead_status, call_status, follow_up_date, previous_follow_up_date,
        notes, notes_list, tags, ai_disabled, is_auto_warm, manually_saved, updated_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(jid) DO UPDATE SET
        name = EXCLUDED.name,
        lead_status = EXCLUDED.lead_status,
        call_status = EXCLUDED.call_status,
        follow_up_date = EXCLUDED.follow_up_date,
        notes = EXCLUDED.notes,
        notes_list = EXCLUDED.notes_list,
        updated_at = EXCLUDED.updated_at`,
      [
        updated.jid,
        updated.name || '',
        updated.phone || '',
        updated.avatarUrl || '',
        updated.leadStatus || 'UNASSIGNED',
        updated.callStatus || null,
        updated.followUpDate || '',
        updated.previousFollowUpDate || '',
        updated.notes || '',
        JSON.stringify(updated.notesList || []),
        JSON.stringify(updated.tags || []),
        updated.aiDisabled ? 1 : 0,
        updated.isAutoWarm ? 1 : 0,
        updated.manuallySaved ? 1 : 0,
        updated.updatedAt || Date.now(),
        Date.now(),
      ]
    ).catch((err) => console.error('[StorageEngine] SQL upsertContact error:', err.message));

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

    const updated: CRMChat = {
      ...existing,
      ...partial,
      name,
      avatarUrl: partial.avatarUrl || existing.avatarUrl || contact?.avatarUrl,
      updatedAt: existing.updatedAt || 0,
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

    // Save to SQL Database
    dbManager.query(
      `INSERT INTO crm_chats (
        jid, name, phone, unread_count, last_message_preview, last_message_at, last_message_from_me,
        last_message_status, avatar_url, is_group, lead_status, call_status, follow_up_date, previous_follow_up_date,
        notes, notes_list, tags, ai_disabled, is_auto_warm, manually_saved, updated_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(jid) DO UPDATE SET
        name = EXCLUDED.name,
        lead_status = EXCLUDED.lead_status,
        call_status = EXCLUDED.call_status,
        follow_up_date = EXCLUDED.follow_up_date,
        notes = EXCLUDED.notes,
        notes_list = EXCLUDED.notes_list,
        last_message_preview = EXCLUDED.last_message_preview,
        last_message_at = EXCLUDED.last_message_at,
        updated_at = EXCLUDED.updated_at`,
      [
        updated.jid,
        updated.name || '',
        updated.phone || '',
        updated.unreadCount || 0,
        updated.lastMessagePreview || '',
        updated.lastMessageAt || 0,
        updated.lastMessageFromMe ? 1 : 0,
        updated.lastMessageStatus || 'SENT',
        updated.avatarUrl || '',
        updated.isGroup ? 1 : 0,
        updated.leadStatus || 'UNASSIGNED',
        updated.callStatus || null,
        updated.followUpDate || '',
        updated.previousFollowUpDate || '',
        updated.notes || '',
        JSON.stringify(updated.notesList || []),
        JSON.stringify(updated.tags || []),
        updated.aiDisabled ? 1 : 0,
        updated.isAutoWarm ? 1 : 0,
        updated.manuallySaved ? 1 : 0,
        updated.updatedAt || Date.now(),
        Date.now(),
      ]
    ).catch((err) => console.error('[StorageEngine] SQL upsertChat error:', err.message));

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

    // Save to SQL Database
    dbManager.query(
      `INSERT INTO crm_messages (
        id, chat_jid, sender_jid, sender_name, from_me, text, media_url, media_type, file_name, timestamp, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET status = EXCLUDED.status`,
      [
        msg.id,
        chatJid,
        msg.senderJid || '',
        msg.senderName || '',
        msg.fromMe ? 1 : 0,
        msg.text || '',
        msg.mediaUrl || '',
        msg.mediaType || '',
        msg.fileName || '',
        msg.timestamp || Date.now(),
        msg.status || 'SENT',
      ]
    ).catch((err) => console.error('[StorageEngine] SQL addMessage error:', err.message));

    const contact = this.contacts.get(chatJid);
    const BAD_AGENT_NAMES = new Set(['me', 'ai vastra sales agent', 'ai sales agent', 'ai vastra', '']);
    const isOutboundSender = msg.fromMe || (msg.senderName && BAD_AGENT_NAMES.has(msg.senderName.toLowerCase().trim()));
    const validInboundSenderName = (!isOutboundSender && msg.senderName && msg.senderName !== chatJid.split('@')[0] && !BAD_AGENT_NAMES.has(msg.senderName.toLowerCase().trim())) ? msg.senderName : null;
    const defaultName = contact?.name || validInboundSenderName || this.formatPhoneFallback(chatJid.split('@')[0]);

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

    if (!isOutboundSender && validInboundSenderName && chat.name === this.formatPhoneFallback(chatJid.split('@')[0])) {
      chat.name = validInboundSenderName;
      this.upsertContact(chatJid, { name: validInboundSenderName }, saveNow);
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
    dbManager.query(`UPDATE crm_chats SET unread_count = 0 WHERE jid = ?`, [jid]).catch(() => {});
    this.saveData();
  }

  public updateMessageStatus(id: string, rawChatJid: string, status: CRMMessage['status']) {
    const chatJid = this.resolveJid(rawChatJid);
    const list = this.messages.get(chatJid);
    if (list) {
      const msg = list.find(m => m.id === id);
      if (msg) {
        msg.status = status;
        dbManager.query(`UPDATE crm_messages SET status = ? WHERE id = ?`, [status, id]).catch(() => {});
        this.saveData();
        return msg;
      }
    }
    return null;
  }

  public getAllChatsSorted(): CRMChat[] {
    const list = Array.from(this.chats.values());
    const uniqueMap = new Map<string, CRMChat>();
    const BAD_NAMES = new Set(['.', 'contact', 'unsaved contact', 'unknown contact', 'ai vastra sales agent', 'ai sales agent', 'ai vastra', 'me', '']);

    const phoneToKey = new Map<string, string>();
    const nameToKey = new Map<string, string>();

    const getOrAssignDedupeKey = (validTen: string, rawDigits: string, resolvedKey: string): string => {
      if (validTen && validTen.length === 10 && phoneToKey.has(validTen)) {
        return phoneToKey.get(validTen)!;
      }
      if (rawDigits && rawDigits.length >= 7 && phoneToKey.has(rawDigits)) {
        return phoneToKey.get(rawDigits)!;
      }

      const newKey = (validTen && validTen.length === 10)
        ? `phone_${validTen}`
        : ((rawDigits && rawDigits.length >= 7) ? `phone_${rawDigits}` : `jid_${resolvedKey}`);

      if (validTen && validTen.length === 10) phoneToKey.set(validTen, newKey);
      if (rawDigits && rawDigits.length >= 7) phoneToKey.set(rawDigits, newKey);

      return newKey;
    };

    for (const c of list) {
      const resolvedKey = this.resolveJid(c.jid);
      const rawDigits = (c.phone || resolvedKey.split('@')[0]).replace(/\D/g, '');
      const validTen = this.canonicalPhone(rawDigits);
      let name = (c.name && c.name !== 'Unsaved Contact' && !c.name.includes('@') && !BAD_NAMES.has(c.name.toLowerCase().trim()))
        ? c.name
        : this.getContactName(c.jid);

      if (!name || BAD_NAMES.has(name.toLowerCase().trim()) || name.length <= 1) {
        name = this.formatPhoneFallback(rawDigits);
      }
      if (name.includes('T ONE') || name.includes('REAL-WORLD') || name.includes('TESTING') || name.toLowerCase().includes('ai vastra')) {
        name = this.formatPhoneFallback(rawDigits);
      }

      const cleanName = (name && !BAD_NAMES.has(name.toLowerCase().trim()) && name.replace(/\D/g, '').length < 10) ? name.toLowerCase().trim().replace(/[^a-z0-9]/g, '') : '';
      const alphaName = (name && !BAD_NAMES.has(name.toLowerCase().trim())) ? name.toLowerCase().trim().replace(/\+?\d+/g, '').replace(/[^a-z0-9]/g, '') : '';

      // Skip cleared/blacklisted leads completely
      if (
        this.clearedLeadsSet.has(resolvedKey.toLowerCase()) ||
        this.clearedLeadsSet.has(c.jid.toLowerCase()) ||
        (rawDigits && this.clearedLeadsSet.has(rawDigits)) ||
        (validTen && this.clearedLeadsSet.has(validTen)) ||
        (cleanName && this.clearedLeadsSet.has(cleanName)) ||
        (alphaName && this.clearedLeadsSet.has(alphaName))
      ) {
        continue;
      }

      const dedupeKey = getOrAssignDedupeKey(validTen, rawDigits, resolvedKey);

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
        const primary = (updatedChat.lastMessageAt || 0) >= (existing.lastMessageAt || 0) ? updatedChat : existing;
        const secondary = primary === updatedChat ? existing : updatedChat;

        const curNameBad = !primary.name || BAD_NAMES.has(primary.name.toLowerCase().trim()) || primary.name.length <= 1;
        const existNameBad = !secondary.name || BAD_NAMES.has(secondary.name.toLowerCase().trim()) || secondary.name.length <= 1;
        const bestName = !curNameBad ? primary.name : (!existNameBad ? secondary.name : primary.name);

        const mergedLeadStatus = (primary.leadStatus && primary.leadStatus !== 'UNASSIGNED')
          ? primary.leadStatus
          : (secondary.leadStatus && secondary.leadStatus !== 'UNASSIGNED' ? secondary.leadStatus : 'UNASSIGNED');

        const mergedCallStatus = primary.callStatus !== undefined && primary.callStatus !== null ? primary.callStatus : secondary.callStatus;
        const mergedFollowUpDate = (primary.followUpDate && primary.followUpDate.trim() !== '') ? primary.followUpDate : (secondary.followUpDate || '');
        const mergedPreviousFollowUpDate = (primary.previousFollowUpDate && primary.previousFollowUpDate.trim() !== '') ? primary.previousFollowUpDate : (secondary.previousFollowUpDate || '');
        
        // Combine unique notes from primary and secondary without losing old notes
        const primaryList: any[] = primary.notesList || (primary.notes ? [primary.notes] : []);
        const secondaryList: any[] = secondary.notesList || (secondary.notes ? [secondary.notes] : []);
        const mergedNotesList: any[] = [...primaryList];
        for (const secNote of secondaryList) {
          const secText = typeof secNote === 'string' ? secNote : (secNote?.text || '');
          if (!secText) continue;
          const exists = mergedNotesList.some(pn => (typeof pn === 'string' ? pn : (pn?.text || '')) === secText);
          if (!exists) {
            mergedNotesList.push(secNote);
          }
        }
        const mergedNotes = (primary.notes && primary.notes.trim() !== '') ? primary.notes : (secondary.notes || (mergedNotesList[0] ? (typeof mergedNotesList[0] === 'string' ? mergedNotesList[0] : (mergedNotesList[0]?.text || '')) : ''));

        uniqueMap.set(dedupeKey, {
          ...secondary,
          ...primary,
          name: bestName || this.formatPhoneFallback(rawDigits),
          leadStatus: mergedLeadStatus,
          callStatus: mergedCallStatus,
          followUpDate: mergedFollowUpDate,
          previousFollowUpDate: mergedPreviousFollowUpDate,
          notes: mergedNotes,
          notesList: mergedNotesList,
          manuallySaved: Boolean(existing.manuallySaved || primary.manuallySaved),
          updatedAt: Math.max(existing.updatedAt || 0, primary.updatedAt || 0),
          avatarUrl: primary.avatarUrl || secondary.avatarUrl,
        });
      }
    }

    for (const [contactJid, contact] of this.contacts.entries()) {
      const resolvedKey = this.resolveJid(contactJid);
      const rawDigits = (contact.phone || resolvedKey.split('@')[0]).replace(/\D/g, '');
      const validTen = this.canonicalPhone(rawDigits);
      const cNameClean = (contact.name && !BAD_NAMES.has(contact.name.toLowerCase().trim()) && contact.name.replace(/\D/g, '').length < 10) ? contact.name.toLowerCase().trim().replace(/[^a-z0-9]/g, '') : '';
      const cAlphaName = (contact.name && !BAD_NAMES.has(contact.name.toLowerCase().trim())) ? contact.name.toLowerCase().trim().replace(/\+?\d+/g, '').replace(/[^a-z0-9]/g, '') : '';

      if (
        this.clearedLeadsSet.has(resolvedKey.toLowerCase()) ||
        this.clearedLeadsSet.has(contactJid.toLowerCase()) ||
        (rawDigits && this.clearedLeadsSet.has(rawDigits)) ||
        (validTen && this.clearedLeadsSet.has(validTen)) ||
        (cNameClean && this.clearedLeadsSet.has(cNameClean)) ||
        (cAlphaName && this.clearedLeadsSet.has(cAlphaName))
      ) {
        continue;
      }

      const dedupeKey = getOrAssignDedupeKey(validTen, rawDigits, resolvedKey);

      if (!uniqueMap.has(dedupeKey)) {
        const contactChat: CRMChat = {
          jid: resolvedKey,
          name: contact.name || this.formatPhoneFallback(rawDigits),
          phone: contact.phone || rawDigits,
          unreadCount: 0,
          lastMessagePreview: contact.notes || 'No messages',
          lastMessageAt: 0,
          isGroup: false,
          leadStatus: contact.leadStatus || 'UNASSIGNED',
          callStatus: contact.callStatus,
          followUpDate: contact.followUpDate,
          previousFollowUpDate: contact.previousFollowUpDate,
          notes: contact.notes,
          notesList: contact.notesList,
          tags: contact.tags || [],
          avatarUrl: contact.avatarUrl,
        };
        uniqueMap.set(dedupeKey, contactChat);
      } else {
        const existing = uniqueMap.get(dedupeKey)!;
        const exList: any[] = existing.notesList || (existing.notes ? [existing.notes] : []);
        const cntList: any[] = contact.notesList || (contact.notes ? [contact.notes] : []);
        const combinedList: any[] = [...exList];
        for (const cntNote of cntList) {
          const cntText = (typeof cntNote === 'string' ? cntNote : (cntNote?.text || '')).trim();
          if (!cntText) continue;
          const cntLower = cntText.toLowerCase();
          const exists = combinedList.some(en => {
            const enTxt = (typeof en === 'string' ? en : (en?.text || '')).trim().toLowerCase();
            return enTxt === cntLower;
          });
          if (!exists) combinedList.push(cntNote);
        }

        uniqueMap.set(dedupeKey, {
          ...existing,
          name: (existing.name && !BAD_NAMES.has(existing.name.toLowerCase().trim())) ? existing.name : (contact.name || existing.name),
          phone: existing.phone || contact.phone,
          leadStatus: (existing.leadStatus && existing.leadStatus !== 'UNASSIGNED') ? existing.leadStatus : (contact.leadStatus || 'UNASSIGNED'),
          callStatus: existing.callStatus !== undefined ? existing.callStatus : contact.callStatus,
          followUpDate: existing.followUpDate || contact.followUpDate,
          previousFollowUpDate: existing.previousFollowUpDate || contact.previousFollowUpDate,
          notes: existing.notes || contact.notes || (combinedList[0] ? (typeof combinedList[0] === 'string' ? combinedList[0] : (combinedList[0]?.text || '')) : ''),
          notesList: combinedList,
          avatarUrl: existing.avatarUrl || contact.avatarUrl,
        });
      }
    }

    return Array.from(uniqueMap.values()).sort((a, b) => {
      const timeA = a.updatedAt || 0;
      const timeB = b.updatedAt || 0;
      if (timeA !== timeB) return timeB - timeA;
      const msgTimeA = a.lastMessageAt || 0;
      const msgTimeB = b.lastMessageAt || 0;
      return msgTimeB - msgTimeA;
    });
  }

  public getMessagesForChat(rawChatJid: string): CRMMessage[] {
    const chatJid = this.resolveJid(rawChatJid);
    const rawNumber = rawChatJid.split('@')[0];
    const cleanNumber = chatJid.split('@')[0];

    const messageMap = new Map<string, CRMMessage>();

    for (const key of [chatJid, rawChatJid, cleanNumber]) {
      const list = this.messages.get(key) || [];
      for (const m of list) {
        if (!messageMap.has(m.id)) {
          messageMap.set(m.id, {
            ...m,
            chatJid,
          });
        }
      }
    }

    const merged = Array.from(messageMap.values()).sort((a, b) => a.timestamp - b.timestamp);
    return merged;
  }

  public updateCrmMetadata(rawJid: string, metadata: {
    name?: string;
    phone?: string;
    leadStatus?: 'INTERESTED' | 'WARM_INTERESTED' | 'WARM' | 'NOT_INTERESTED' | 'UNASSIGNED';
    callStatus?: 'YES' | 'NO';
    followUpDate?: string;
    previousFollowUpDate?: string;
    notes?: string;
    notesList?: string[];
    tags?: string[];
    aiDisabled?: boolean;
    isAutoWarm?: boolean;
    manuallySaved?: boolean;
  }) {
    const jid = this.resolveJid(rawJid);
    const rawDigits = (metadata.phone || rawJid).replace(/\D/g, '') || jid.split('@')[0].replace(/\D/g, '');
    const tenDigit = this.canonicalPhone(rawDigits);
    const canonicalJid = jid.endsWith('@g.us') ? jid : (tenDigit.length >= 10 ? `91${tenDigit}@s.whatsapp.net` : jid);

    const BAD_NAMES = new Set(['.', 'contact', 'unsaved contact', 'unknown contact', 'ai vastra sales agent', 'ai sales agent', 'ai vastra', 'me', '']);
    const incomingNameClean = (metadata.name || '').trim();
    const incomingNameIsValid = incomingNameClean.length > 1 && !BAD_NAMES.has(incomingNameClean.toLowerCase());

    const nowTimestamp = Date.now();

    // Un-blacklist contact keys when user explicitly saves new data
    const searchAlphaName = incomingNameIsValid ? incomingNameClean.toLowerCase().replace(/\+?\d+/g, '').replace(/[^a-z0-9]/g, '').trim() : '';
    const unBlacklistKeys = [
      canonicalJid.toLowerCase(),
      jid.toLowerCase(),
      tenDigit,
      rawDigits,
      incomingNameClean.toLowerCase(),
      searchAlphaName
    ].filter(k => k && k.length >= 2);

    for (const k of unBlacklistKeys) {
      this.clearedLeadsSet.delete(k);
      dbManager.query(`DELETE FROM cleared_leads_blacklist WHERE key = ?`, [k]).catch(() => {});
    }

    // Find all existing matching contacts/chats by JID, phone, or clean contact name
    const matchingContactKeys: string[] = [];
    const matchingChatKeys: string[] = [];
    const oldNotesList: any[] = [];

    for (const [ck, cObj] of this.contacts.entries()) {
      const cPhoneDigits = (cObj.phone || ck.split('@')[0]).replace(/\D/g, '');
      const cTen = this.canonicalPhone(cPhoneDigits);
      const cAlpha = (cObj.name || '').toLowerCase().replace(/\+?\d+/g, '').replace(/[^a-z0-9]/g, '').trim();

      const matchPhone = Boolean(tenDigit && tenDigit.length === 10 && cTen === tenDigit);
      const matchName = Boolean(searchAlphaName && searchAlphaName.length >= 2 && cAlpha === searchAlphaName);

      if (ck === canonicalJid || ck === jid || matchPhone || matchName) {
        matchingContactKeys.push(ck);
        const list: any[] = cObj.notesList || (cObj.notes ? [cObj.notes] : []);
        for (const n of list) {
          const textStr = typeof n === 'string' ? n : (n && typeof n === 'object' ? n.text : '');
          if (textStr && !oldNotesList.some((on: any) => (typeof on === 'string' ? on : (on && typeof on === 'object' ? on.text : '')) === textStr)) {
            oldNotesList.push(n);
          }
        }
      }
    }

    for (const [chk, chObj] of this.chats.entries()) {
      const chPhoneDigits = (chObj.phone || chk.split('@')[0]).replace(/\D/g, '');
      const chTen = this.canonicalPhone(chPhoneDigits);
      const chAlpha = (chObj.name || '').toLowerCase().replace(/\+?\d+/g, '').replace(/[^a-z0-9]/g, '').trim();

      const matchPhone = Boolean(tenDigit && tenDigit.length === 10 && chTen === tenDigit);
      const matchName = Boolean(searchAlphaName && searchAlphaName.length >= 2 && chAlpha === searchAlphaName);

      if (chk === canonicalJid || chk === jid || matchPhone || matchName) {
        matchingChatKeys.push(chk);
        const list: any[] = chObj.notesList || (chObj.notes ? [chObj.notes] : []);
        for (const n of list) {
          const textStr = typeof n === 'string' ? n : (n && typeof n === 'object' ? n.text : '');
          if (textStr && !oldNotesList.some((on: any) => (typeof on === 'string' ? on : (on && typeof on === 'object' ? on.text : '')) === textStr)) {
            oldNotesList.push(n);
          }
        }
      }
    }

    // Handle user notes & allow dynamic note deletions
    let finalNotesList: any[] = [];
    if (Array.isArray(metadata.notesList)) {
      finalNotesList = metadata.notesList;
    } else if (metadata.notes) {
      const incomingNotesList = [metadata.notes];
      finalNotesList = [...incomingNotesList];
      for (const oldN of oldNotesList) {
        const oldText = typeof oldN === 'string' ? oldN : (oldN && typeof oldN === 'object' ? oldN.text : '');
        if (oldText && !finalNotesList.some(mn => (typeof mn === 'string' ? mn : (mn && typeof mn === 'object' ? mn.text : '')) === oldText)) {
          finalNotesList.push(oldN);
        }
      }
    } else {
      finalNotesList = oldNotesList;
    }

    const finalNotesStr = metadata.notes !== undefined 
      ? metadata.notes 
      : (finalNotesList.map(n => typeof n === 'string' ? n : (n && typeof n === 'object' ? n.text : '')).filter(Boolean).join('\n\n'));

    let contact = this.contacts.get(canonicalJid) || this.contacts.get(jid);
    if (!contact) {
      contact = {
        jid: canonicalJid,
        phone: tenDigit ? `91${tenDigit}` : rawDigits,
        name: incomingNameIsValid ? incomingNameClean : this.formatPhoneFallback(rawDigits),
        leadStatus: metadata.leadStatus || 'UNASSIGNED',
        tags: metadata.tags || [],
        notes: finalNotesStr,
        notesList: finalNotesList,
        followUpDate: metadata.followUpDate,
        previousFollowUpDate: metadata.previousFollowUpDate,
        callStatus: metadata.callStatus,
        aiDisabled: metadata.aiDisabled,
        isAutoWarm: metadata.isAutoWarm !== undefined ? metadata.isAutoWarm : false,
        manuallySaved: metadata.manuallySaved !== undefined ? metadata.manuallySaved : false,
        updatedAt: nowTimestamp,
      };
    } else {
      if (incomingNameIsValid) contact.name = incomingNameClean;
      if (metadata.leadStatus !== undefined) contact.leadStatus = metadata.leadStatus;
      if (metadata.callStatus !== undefined) contact.callStatus = metadata.callStatus;
      if (metadata.followUpDate !== undefined) contact.followUpDate = metadata.followUpDate;
      if (metadata.previousFollowUpDate !== undefined) contact.previousFollowUpDate = metadata.previousFollowUpDate;
      contact.notes = finalNotesStr;
      contact.notesList = finalNotesList;
      if (metadata.tags !== undefined) contact.tags = metadata.tags;
      if (metadata.aiDisabled !== undefined) contact.aiDisabled = metadata.aiDisabled;
      if (metadata.isAutoWarm !== undefined) contact.isAutoWarm = metadata.isAutoWarm;
      if (metadata.manuallySaved !== undefined) contact.manuallySaved = metadata.manuallySaved;
      if (tenDigit) contact.phone = `91${tenDigit}`;
      contact.updatedAt = nowTimestamp;
    }

    // Clean out old duplicate contact keys
    for (const oldKey of matchingContactKeys) {
      if (oldKey !== canonicalJid) {
        this.contacts.delete(oldKey);
        dbManager.query(`DELETE FROM crm_contacts WHERE jid = ?`, [oldKey]).catch(() => {});
      }
    }
    this.contacts.set(canonicalJid, contact);

    let chat = this.chats.get(canonicalJid) || this.chats.get(jid);
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
        previousFollowUpDate: metadata.previousFollowUpDate || '',
        notes: finalNotesStr,
        notesList: finalNotesList,
        tags: metadata.tags || [],
        aiDisabled: metadata.aiDisabled,
        isAutoWarm: metadata.isAutoWarm !== undefined ? metadata.isAutoWarm : false,
        updatedAt: nowTimestamp,
      };
    } else {
      if (incomingNameIsValid) chat.name = incomingNameClean;
      if (metadata.leadStatus !== undefined) chat.leadStatus = metadata.leadStatus;
      if (metadata.callStatus !== undefined) chat.callStatus = metadata.callStatus || undefined;
      if (metadata.followUpDate !== undefined) chat.followUpDate = metadata.followUpDate;
      if (metadata.previousFollowUpDate !== undefined) chat.previousFollowUpDate = metadata.previousFollowUpDate;
      chat.notes = finalNotesStr;
      chat.notesList = finalNotesList;
      if (metadata.tags !== undefined) chat.tags = metadata.tags;
      if (metadata.aiDisabled !== undefined) chat.aiDisabled = metadata.aiDisabled;
      if (metadata.isAutoWarm !== undefined) chat.isAutoWarm = metadata.isAutoWarm;
      if (metadata.manuallySaved !== undefined) chat.manuallySaved = metadata.manuallySaved;
      chat.jid = canonicalJid;
      if (tenDigit) chat.phone = `91${tenDigit}`;
      chat.updatedAt = nowTimestamp;
    }

    // Clean out old duplicate chat keys
    for (const oldKey of matchingChatKeys) {
      if (oldKey !== canonicalJid) {
        this.chats.delete(oldKey);
        dbManager.query(`DELETE FROM crm_chats WHERE jid = ?`, [oldKey]).catch(() => {});
      }
    }
    this.chats.set(canonicalJid, chat);

    // Save to SQL Database (ACID persistence guarantee)
    dbManager.query(
      `INSERT INTO crm_contacts (
        jid, name, phone, avatar_url, lead_status, call_status, follow_up_date, previous_follow_up_date,
        notes, notes_list, tags, ai_disabled, is_auto_warm, manually_saved, updated_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(jid) DO UPDATE SET
        name = EXCLUDED.name,
        lead_status = EXCLUDED.lead_status,
        call_status = EXCLUDED.call_status,
        follow_up_date = EXCLUDED.follow_up_date,
        notes = EXCLUDED.notes,
        notes_list = EXCLUDED.notes_list,
        updated_at = EXCLUDED.updated_at`,
      [
        contact.jid,
        contact.name || '',
        contact.phone || '',
        contact.avatarUrl || '',
        contact.leadStatus || 'UNASSIGNED',
        contact.callStatus || null,
        contact.followUpDate || '',
        contact.previousFollowUpDate || '',
        contact.notes || '',
        JSON.stringify(contact.notesList || []),
        JSON.stringify(contact.tags || []),
        contact.aiDisabled ? 1 : 0,
        contact.isAutoWarm ? 1 : 0,
        contact.manuallySaved ? 1 : 0,
        contact.updatedAt || Date.now(),
        Date.now(),
      ]
    ).catch((err) => console.error('[StorageEngine] SQL updateCrmMetadata contact error:', err.message));

    dbManager.query(
      `INSERT INTO crm_chats (
        jid, name, phone, unread_count, last_message_preview, last_message_at, last_message_from_me,
        last_message_status, avatar_url, is_group, lead_status, call_status, follow_up_date, previous_follow_up_date,
        notes, notes_list, tags, ai_disabled, is_auto_warm, manually_saved, updated_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(jid) DO UPDATE SET
        name = EXCLUDED.name,
        lead_status = EXCLUDED.lead_status,
        call_status = EXCLUDED.call_status,
        follow_up_date = EXCLUDED.follow_up_date,
        notes = EXCLUDED.notes,
        notes_list = EXCLUDED.notes_list,
        updated_at = EXCLUDED.updated_at`,
      [
        chat.jid,
        chat.name || '',
        chat.phone || '',
        chat.unreadCount || 0,
        chat.lastMessagePreview || '',
        chat.lastMessageAt || 0,
        chat.lastMessageFromMe ? 1 : 0,
        chat.lastMessageStatus || 'SENT',
        chat.avatarUrl || '',
        chat.isGroup ? 1 : 0,
        chat.leadStatus || 'UNASSIGNED',
        chat.callStatus || null,
        chat.followUpDate || '',
        chat.previousFollowUpDate || '',
        chat.notes || '',
        JSON.stringify(chat.notesList || []),
        JSON.stringify(chat.tags || []),
        chat.aiDisabled ? 1 : 0,
        chat.isAutoWarm ? 1 : 0,
        chat.manuallySaved ? 1 : 0,
        chat.updatedAt || Date.now(),
        Date.now(),
      ]
    ).catch((err) => console.error('[StorageEngine] SQL updateCrmMetadata chat error:', err.message));

    // Lead Clear Handling: Immutable Archive in SQL Database Table!
    const isClearAction = metadata.leadStatus === 'UNASSIGNED' &&
      (!metadata.callStatus || metadata.callStatus === undefined) &&
      (!metadata.followUpDate || metadata.followUpDate.trim() === '') &&
      (!metadata.notesList || metadata.notesList.length === 0);

    const now = Date.now();
    const d = new Date(now);
    const dateStr = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;

    if (isClearAction) {
      const prevNotes = (chat.notesList && chat.notesList.length > 0) ? chat.notesList : (chat.notes ? [chat.notes] : []);
      const prevLead = chat.leadStatus !== 'UNASSIGNED' ? chat.leadStatus : contact.leadStatus;
      
      const archRecord = {
        jid: canonicalJid,
        name: incomingNameIsValid ? incomingNameClean : (chat.name || contact.name || this.formatPhoneFallback(rawDigits)),
        phone: tenDigit ? `91${tenDigit}` : rawDigits,
        previousLeadStatus: prevLead,
        previousCallStatus: chat.callStatus,
        previousFollowUpDate: chat.followUpDate,
        previousNotesList: prevNotes,
        clearedAt: now,
        clearedDate: dateStr,
      };

      this.archivedClearedLeads.set(canonicalJid, archRecord);

      // Write immutable entry into archived_cleared_leads SQL table
      const archId = `arch_${canonicalJid}_${now}`;
      dbManager.query(
        `INSERT INTO archived_cleared_leads (
          id, jid, name, phone, previous_lead_status, previous_call_status, previous_follow_up_date,
          previous_notes_list, cleared_at, cleared_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          archId,
          archRecord.jid,
          archRecord.name,
          archRecord.phone,
          archRecord.previousLeadStatus || 'UNASSIGNED',
          archRecord.previousCallStatus || null,
          archRecord.previousFollowUpDate || '',
          JSON.stringify(archRecord.previousNotesList || []),
          archRecord.clearedAt,
          archRecord.clearedDate,
        ]
      ).catch((err) => console.error('[StorageEngine] SQL archived_cleared_leads error:', err.message));

      this.deleteChat(canonicalJid);
      if (rawJid !== canonicalJid) this.deleteChat(rawJid);
    }

    this.saveData();
    return chat;
  }

  public deleteChat(rawJid: string) {
    if (!rawJid) return;
    const jid = this.resolveJid(rawJid);
    const cleanDigits = rawJid.replace(/\D/g, '');
    const searchTargetClean = rawJid.toLowerCase().trim().replace(/[^a-z0-9]/g, '');

    let chat = this.chats.get(jid) || this.chats.get(rawJid);
    let contact = this.contacts.get(jid) || this.contacts.get(rawJid);

    if (!chat && searchTargetClean) {
      for (const [k, c] of this.chats.entries()) {
        const cNameClean = (c.name || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
        if (cNameClean && (cNameClean === searchTargetClean || cNameClean.includes(searchTargetClean))) {
          chat = c;
          break;
        }
      }
    }
    if (!contact && searchTargetClean) {
      for (const [k, c] of this.contacts.entries()) {
        const cNameClean = (c.name || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
        if (cNameClean && (cNameClean === searchTargetClean || cNameClean.includes(searchTargetClean))) {
          contact = c;
          break;
        }
      }
    }

    const rawName = chat?.name || contact?.name || (cleanDigits ? '' : rawJid);
    const BAD_NAMES = new Set(['.', 'contact', 'unsaved contact', 'unknown contact', 'ai vastra sales agent', 'ai sales agent', 'ai vastra', 'me', '']);
    const isValidName = rawName && !BAD_NAMES.has(rawName.toLowerCase().trim());
    const nameLower = isValidName ? rawName.toLowerCase().trim() : searchTargetClean;
    const nameAlpha = isValidName ? nameLower.replace(/\+?\d+/g, '').replace(/[^a-z0-9]/g, '').trim() : searchTargetClean;

    const now = Date.now();
    const d = new Date(now);
    const dateStr = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;

    if (chat || contact) {
      const prevNotes = chat?.notesList && chat.notesList.length > 0 ? chat.notesList : (chat?.notes ? [chat.notes] : (contact?.notesList || []));
      const archRecord = {
        jid: jid || rawJid,
        name: chat?.name || contact?.name || this.formatPhoneFallback(cleanDigits),
        phone: cleanDigits,
        previousLeadStatus: chat?.leadStatus || contact?.leadStatus || 'UNASSIGNED',
        previousCallStatus: chat?.callStatus || contact?.callStatus,
        previousFollowUpDate: chat?.followUpDate || contact?.followUpDate,
        previousNotesList: prevNotes,
        clearedAt: now,
        clearedDate: dateStr,
      };

      this.archivedClearedLeads.set(archRecord.jid, archRecord);
      const archId = `arch_${archRecord.jid}_${now}`;
      dbManager.query(
        `INSERT INTO archived_cleared_leads (
          id, jid, name, phone, previous_lead_status, previous_call_status, previous_follow_up_date,
          previous_notes_list, cleared_at, cleared_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          archId,
          archRecord.jid,
          archRecord.name,
          archRecord.phone,
          archRecord.previousLeadStatus || 'UNASSIGNED',
          archRecord.previousCallStatus || null,
          archRecord.previousFollowUpDate || '',
          JSON.stringify(archRecord.previousNotesList || []),
          archRecord.clearedAt,
          archRecord.clearedDate,
        ]
      ).catch(() => {});
    }

    const keysToBlacklist = [
      rawJid.toLowerCase(),
      jid.toLowerCase(),
      cleanDigits,
      nameLower,
      nameAlpha
    ].filter(k => k && k.length >= 2);

    for (const k of keysToBlacklist) {
      this.clearedLeadsSet.add(k);
      dbManager.query(`INSERT INTO cleared_leads_blacklist (key, cleared_at) VALUES (?, ?) ON CONFLICT DO NOTHING`, [k, now]).catch(() => {});
    }

    for (const k of Array.from(this.chats.keys())) {
      const c = this.chats.get(k);
      const cDigits = (c?.phone || k).replace(/\D/g, '');
      if (k === jid || k === rawJid || (cleanDigits && cleanDigits.length >= 7 && cDigits.includes(cleanDigits))) {
        this.chats.delete(k);
      }
    }

    for (const k of Array.from(this.contacts.keys())) {
      const c = this.contacts.get(k);
      const cDigits = (c?.phone || k).replace(/\D/g, '');
      if (k === jid || k === rawJid || (cleanDigits && cleanDigits.length >= 7 && cDigits.includes(cleanDigits))) {
        this.contacts.delete(k);
      }
    }

    dbManager.query(`DELETE FROM crm_chats WHERE jid = ? OR jid = ? OR name = ? OR (phone IS NOT NULL AND phone != '' AND phone LIKE ?)`, [jid, rawJid, rawName, `%${cleanDigits}%`]).catch(() => {});
    dbManager.query(`DELETE FROM crm_contacts WHERE jid = ? OR jid = ? OR name = ? OR (phone IS NOT NULL AND phone != '' AND phone LIKE ?)`, [jid, rawJid, rawName, `%${cleanDigits}%`]).catch(() => {});
    dbManager.query(`DELETE FROM crm_messages WHERE chat_jid = ? OR chat_jid = ? OR chat_jid LIKE ?`, [jid, rawJid, `%${cleanDigits}%`]).catch(() => {});

    this.saveData();
  }

  public clearAllWhatsAppCrmData() {
    this.chats.clear();
    this.contacts.clear();
    this.messages.clear();

    dbManager.query('DELETE FROM crm_chats').catch(() => {});
    dbManager.query('DELETE FROM crm_contacts').catch(() => {});
    dbManager.query('DELETE FROM crm_messages').catch(() => {});

    this.saveData();
  }

  public getArchivedClearedLeads(): ArchivedClearedLead[] {
    return Array.from(this.archivedClearedLeads.values()).sort((a, b) => b.clearedAt - a.clearedAt);
  }

  public getAllColdCalls(): ColdCallLead[] {
    const uniqueMap = new Map<string, ColdCallLead>();

    for (const lead of this.coldCalls.values()) {
      const rawDigits = (lead.phone || '').replace(/\D/g, '');
      const tenDigit = this.canonicalPhone(rawDigits);
      const cleanName = (lead.personName || lead.businessName || lead.name || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');

      const dedupeKey = (tenDigit && tenDigit.length === 10)
        ? `phone_${tenDigit}`
        : ((rawDigits && rawDigits.length >= 7) ? `phone_${rawDigits}` : ((cleanName && cleanName.length >= 2) ? `name_${cleanName}` : lead.id));

      if (!uniqueMap.has(dedupeKey)) {
        uniqueMap.set(dedupeKey, lead);
      } else {
        const existing = uniqueMap.get(dedupeKey)!;
        const primary = (lead.updatedAt || 0) >= (existing.updatedAt || 0) ? lead : existing;
        uniqueMap.set(dedupeKey, primary);
      }
    }

    return Array.from(uniqueMap.values()).sort((a, b) => {
      const timeA = typeof a.createdAt === 'number' ? a.createdAt : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
      const timeB = typeof b.createdAt === 'number' ? b.createdAt : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
      return timeA - timeB;
    });
  }

  public importColdCalls(leads: Partial<ColdCallLead>[]): ColdCallLead[] {
    const imported: ColdCallLead[] = [];
    const now = Date.now();

    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      if (!lead.businessName && !lead.personName && !lead.phone && !lead.name) continue;
      const id = lead.id || `lead_${now}_${i}_${Math.random().toString(36).substring(2, 8)}`;
      const existing = this.coldCalls.get(id);
      const itemCreatedAt = existing?.createdAt || (typeof lead.createdAt === 'number' ? lead.createdAt : (now + i));

      const entry: ColdCallLead = {
        id,
        businessName: lead.businessName !== undefined ? lead.businessName : (existing?.businessName || lead.name || existing?.name || ''),
        personName: lead.personName !== undefined ? lead.personName : (existing?.personName || lead.name || existing?.name || ''),
        phone: lead.phone !== undefined ? lead.phone : (existing?.phone || ''),
        businessWebsite: lead.businessWebsite !== undefined ? lead.businessWebsite : (existing?.businessWebsite || ''),
        role: lead.role !== undefined ? lead.role : (existing?.role || ''),
        email: lead.email !== undefined ? lead.email : (existing?.email || ''),
        linkedinProfile: lead.linkedinProfile !== undefined ? lead.linkedinProfile : (existing?.linkedinProfile || ''),
        facebookProfile: lead.facebookProfile !== undefined ? lead.facebookProfile : (existing?.facebookProfile || ''),
        instaProfile: lead.instaProfile !== undefined ? lead.instaProfile : (existing?.instaProfile || ''),
        followUps: lead.followUps !== undefined ? lead.followUps : (existing?.followUps || []),
        note: lead.note !== undefined ? lead.note : (existing?.note || ''),
        notesList: (lead.notesList && lead.notesList.length > 0) ? lead.notesList : (existing?.notesList || []),
        callChoice: lead.callChoice !== undefined ? lead.callChoice : existing?.callChoice,
        callStatus: lead.callStatus !== undefined ? lead.callStatus : (existing?.callStatus !== undefined ? existing.callStatus : undefined),
        followUpDate: lead.followUpDate !== undefined ? lead.followUpDate : (existing?.followUpDate || ''),
        calledBy: (lead.calledBy !== undefined && lead.calledBy.trim() !== '') ? lead.calledBy.trim() : (existing?.calledBy !== undefined ? existing.calledBy : undefined),
        clientLanguage: lead.clientLanguage !== undefined ? lead.clientLanguage : (existing?.clientLanguage || ''),
        campaignName: lead.campaignName !== undefined ? (lead.campaignName || 'Campaign 1') : (existing?.campaignName || 'Campaign 1'),
        callTimestamp: lead.callTimestamp !== undefined ? lead.callTimestamp : existing?.callTimestamp,
        callOutcome: lead.callOutcome !== undefined ? lead.callOutcome : existing?.callOutcome,
        name: lead.personName || lead.name || existing?.name || '',
        company: lead.businessName || lead.company || existing?.company || '',
        customFields: { ...(existing?.customFields || {}), ...(lead.customFields || {}) },
        createdAt: itemCreatedAt,
        updatedAt: now,
      };

      this.coldCalls.set(id, entry);
      imported.push(entry);

      // Save to SQL Database
      dbManager.query(
        `INSERT INTO cold_calls (
          id, business_name, person_name, phone, business_website, role, email, linkedin_profile,
          facebook_profile, insta_profile, follow_ups, note, notes_list, call_choice, call_status,
          follow_up_date, called_by, client_language, campaign_name, call_timestamp, call_outcome,
          custom_fields, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          person_name = EXCLUDED.person_name,
          business_name = EXCLUDED.business_name,
          call_status = EXCLUDED.call_status,
          follow_up_date = EXCLUDED.follow_up_date,
          notes_list = EXCLUDED.notes_list,
          updated_at = EXCLUDED.updated_at`,
        [
          entry.id,
          entry.businessName || '',
          entry.personName || '',
          entry.phone || '',
          entry.businessWebsite || '',
          entry.role || '',
          entry.email || '',
          entry.linkedinProfile || '',
          entry.facebookProfile || '',
          entry.instaProfile || '',
          JSON.stringify(entry.followUps || []),
          entry.note || '',
          JSON.stringify(entry.notesList || []),
          entry.callChoice || null,
          entry.callStatus || null,
          entry.followUpDate || '',
          entry.calledBy || null,
          entry.clientLanguage || '',
          entry.campaignName || 'Campaign 1',
          entry.callTimestamp || 0,
          entry.callOutcome || null,
          JSON.stringify(entry.customFields || {}),
          entry.createdAt,
          entry.updatedAt,
        ]
      ).catch((err) => console.error('[StorageEngine] SQL importColdCalls error:', err.message));
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
      campaignName: partial.campaignName !== undefined ? partial.campaignName : existing.campaignName,
      followUps: partial.followUps !== undefined ? partial.followUps : existing.followUps,
      callChoice: (partial.callChoice === null || (partial.callChoice as any) === '') ? undefined : (partial.callChoice !== undefined ? partial.callChoice : existing.callChoice),
      callStatus: partial.callStatus || (partial.callChoice === null ? 'PENDING' : existing.callStatus || 'PENDING'),
      calledBy: (partial.calledBy === null || partial.calledBy === '' || partial.calledBy === 'Executive User' || partial.calledBy === 'Staff')
        ? undefined
        : (partial.calledBy !== undefined ? partial.calledBy : (existing.calledBy === 'Executive User' || existing.calledBy === 'Staff' ? undefined : existing.calledBy)),
      callTimestamp: partial.callTimestamp === null ? undefined : (partial.callTimestamp !== undefined ? partial.callTimestamp : existing.callTimestamp),
      callOutcome: partial.callOutcome === null || partial.callOutcome === '' ? undefined : (partial.callOutcome !== undefined ? partial.callOutcome : existing.callOutcome),
      notesList: partial.notesList !== undefined ? (partial.notesList as NoteEntry[]) : existing.notesList,
      customFields: partial.customFields ? { ...existing.customFields, ...partial.customFields } : existing.customFields,
      updatedAt: now,
    };

    updated.name = updated.personName || updated.name || '';
    updated.company = updated.businessName || updated.company || '';

    this.coldCalls.set(id, updated);

    // Save to SQL Database
    dbManager.query(
      `INSERT INTO cold_calls (
        id, business_name, person_name, phone, business_website, role, email, linkedin_profile,
        facebook_profile, insta_profile, follow_ups, note, notes_list, call_choice, call_status,
        follow_up_date, called_by, client_language, campaign_name, call_timestamp, call_outcome,
        custom_fields, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        person_name = EXCLUDED.person_name,
        business_name = EXCLUDED.business_name,
        call_status = EXCLUDED.call_status,
        follow_up_date = EXCLUDED.follow_up_date,
        notes_list = EXCLUDED.notes_list,
        updated_at = EXCLUDED.updated_at`,
      [
        updated.id,
        updated.businessName || '',
        updated.personName || '',
        updated.phone || '',
        updated.businessWebsite || '',
        updated.role || '',
        updated.email || '',
        updated.linkedinProfile || '',
        updated.facebookProfile || '',
        updated.instaProfile || '',
        JSON.stringify(updated.followUps || []),
        updated.note || '',
        JSON.stringify(updated.notesList || []),
        updated.callChoice || null,
        updated.callStatus || null,
        updated.followUpDate || '',
        updated.calledBy || null,
        updated.clientLanguage || '',
        updated.campaignName || 'Campaign 1',
        updated.callTimestamp || 0,
        updated.callOutcome || null,
        JSON.stringify(updated.customFields || {}),
        updated.createdAt,
        updated.updatedAt,
      ]
    ).catch((err) => console.error('[StorageEngine] SQL updateColdCall error:', err.message));

    this.saveData();
    return updated;
  }

  public renameCampaign(oldName: string, newName: string): number {
    let count = 0;
    const now = Date.now();
    const cleanOld = oldName.trim().toLowerCase();
    const cleanNew = newName.trim();

    for (const [id, lead] of this.coldCalls.entries()) {
      const currentCamp = (lead.campaignName || 'Campaign 1').trim().toLowerCase();
      if (currentCamp === cleanOld || (!lead.campaignName && cleanOld === 'campaign 1')) {
        lead.campaignName = cleanNew;
        lead.updatedAt = now;
        count++;
        dbManager.query(`UPDATE cold_calls SET campaign_name = ?, updated_at = ? WHERE id = ?`, [cleanNew, now, id]).catch(() => {});
      }
    }
    if (count > 0) {
      this.saveData();
    }
    return count;
  }

  public deleteColdCall(id: string): boolean {
    const existed = this.coldCalls.delete(id);
    if (existed) {
      dbManager.query(`DELETE FROM cold_calls WHERE id = ?`, [id]).catch(() => {});
      this.saveData();
    }
    return existed;
  }

  public clearColdCalls(): boolean {
    this.coldCalls.clear();
    dbManager.query(`DELETE FROM cold_calls`).catch(() => {});
    this.saveData();
    return true;
  }
}

export const db = new StorageEngine();
