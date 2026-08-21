'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  PhoneCall,
  Search,
  X,
  Trash2,
  Check,
  FileSpreadsheet,
  ExternalLink,
  Plus,
  Save,
  ChevronDown,
  ChevronUp,
  Pencil,
  Info,
  Linkedin,
  Facebook,
  Instagram,
  Globe,
  Mail,
  Phone,
  User,
  Briefcase,
  Calendar,
  Database,
  Filter,
  MessageSquare,
  ArrowUpRight
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useSocket } from '../context/SocketContext';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CallChoiceType = 'YES' | 'NO' | 'INVALID' | 'PENDING';
export type CallStatusType = 'INTERESTED' | 'WARM' | 'NOT_INTERESTED' | 'NOT_CONNECTED' | 'NOT_REACHABLE' | 'INVALID' | 'PENDING' | string;

export interface NoteEntry {
  text: string;
  date: string; // DD-MM-YYYY
}

export interface FollowUpRound {
  id: string;
  roundNumber: number; // 1 for Follow up 1, 2 for Follow up 2, etc.
  callChoice: CallChoiceType;
  callStatus: CallStatusType;
  followUpDate?: string; // YYYY-MM-DD or DD-MM-YYYY
  notesList?: NoteEntry[];
  note?: string;
  calledBy?: string;
  updatedAt?: number;
}

export interface ColdCallLead {
  id: string;
  // Primary table columns
  businessName: string;
  personName: string;
  phone: string;
  // Hidden in table, shown in popup
  businessWebsite?: string;
  role?: string;
  email?: string;
  linkedinProfile?: string;
  facebookProfile?: string;
  instaProfile?: string;
  // Multi-stage Follow-ups (Follow Up 1, Follow Up 2, Follow Up 3...)
  followUps?: FollowUpRound[];
  // Notes with timestamps
  note?: string;           // original note from Excel
  notesList?: NoteEntry[]; // user-added notes with timestamps
  // Legacy / compatibility
  name?: string;
  company?: string;
  customFields?: Record<string, any>;
  callChoice?: CallChoiceType;
  callStatus?: CallStatusType;
  followUpDate?: string;
  calledBy?: string;        // Logged-in username (e.g. James Mitchell)
  callTimestamp?: number;   // Timestamp of last call/note update
  callOutcome?: string;     // Call status badge
  createdAt: number;
  updatedAt: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getBackendUrl = () => {
  if (process.env.NEXT_PUBLIC_BACKEND_URL) return process.env.NEXT_PUBLIC_BACKEND_URL;
  if (typeof window !== 'undefined') return window.location.origin;
  return 'http://localhost:5000';
};

const getTodayDate = (): string => {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()}`;
};

export const getLeadFollowUps = (lead: ColdCallLead): FollowUpRound[] => {
  if (lead.followUps && lead.followUps.length > 0) {
    return lead.followUps;
  }
  const choice = lead.callChoice || (lead.callStatus === 'NOT_CONNECTED' ? 'NO' : (lead.callStatus === 'NOT_REACHABLE' || lead.callStatus === 'INVALID' ? 'INVALID' : (lead.callStatus && lead.callStatus !== 'PENDING' ? 'YES' : 'PENDING')));
  return [{
    id: `fu_${lead.id}_1`,
    roundNumber: 1,
    callChoice: choice,
    callStatus: lead.callStatus || 'PENDING',
    followUpDate: lead.followUpDate || '',
    note: lead.note || '',
    notesList: lead.notesList || (lead.note ? [{ text: lead.note, date: getTodayDate() }] : []),
    calledBy: lead.calledBy,
    updatedAt: lead.updatedAt,
  }];
};

// Map raw Excel header to our field keys with intelligent multi-followup detection
const mapExcelRow = (row: Record<string, any>, idx: number): Partial<ColdCallLead> => {
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const found = Object.keys(row).find(rk => rk.toLowerCase().replace(/[\s_-]/g, '').includes(k.toLowerCase()));
      if (found !== undefined && row[found] !== undefined && row[found] !== '') {
        return String(row[found]).trim();
      }
    }
    return '';
  };

  const businessName  = get('businessname', 'business', 'company', 'brand', 'org', 'prospectname') || '';
  const personName    = get('personname', 'person', 'contact', 'name', 'lead') || '';
  const phone         = get('phonenumber', 'phone', 'mobile', 'cell', 'number') || '';
  const businessWebsite = get('businesswebsite', 'website', 'url', 'web') || '';
  const role          = get('role', 'designation', 'position', 'title') || '';
  const email         = get('email', 'mail') || '';
  const linkedinProfile = get('linkedin', 'linkedinprofile') || '';
  const facebookProfile = get('facebook', 'facebookprofile', 'fb') || '';
  const instaProfile  = get('insta', 'instagram', 'instaprofile') || '';
  const calledBy      = get('callby', 'calledby', 'caller', 'agent', 'staff') || '';

  // Multi-round Follow-up column extraction (Date, Follow up 1, Followup 2, Followup 3, ...)
  const followUpRounds: FollowUpRound[] = [];
  const roundKeysMap: { roundNum: number; keys: string[] }[] = [
    { roundNum: 1, keys: ['followup1', 'followup-1', 'followup_1', 'follow-up1', 'follow-up 1', 'date', 'firstfollowup'] },
    { roundNum: 2, keys: ['followup2', 'followup-2', 'followup_2', 'follow-up2', 'follow-up 2', 'secondfollowup'] },
    { roundNum: 3, keys: ['followup3', 'followup-3', 'followup_3', 'follow-up3', 'follow-up 3', 'thirdfollowup'] },
    { roundNum: 4, keys: ['followup4', 'followup-4', 'followup_4', 'follow-up4', 'follow-up 4'] },
    { roundNum: 5, keys: ['followup5', 'followup-5', 'followup_5', 'follow-up5', 'follow-up 5'] },
    { roundNum: 6, keys: ['followup6', 'followup-6', 'followup_6', 'follow-up6', 'follow-up 6'] },
    { roundNum: 7, keys: ['followup7', 'followup-7', 'followup_7', 'follow-up7', 'follow-up 7'] },
  ];

  const inferStatusFromNote = (noteText: string): { choice: CallChoiceType; status: CallStatusType } => {
    const low = noteText.toLowerCase();
    if (low.includes('out of service') || low.includes('not reachable') || low.includes('invalid') || low.includes('wrong number') || low.includes('network issue')) {
      return { choice: 'INVALID', status: low.includes('invalid') ? 'INVALID' : 'NOT_REACHABLE' };
    }
    if (low.includes('did not connect') || low.includes('not answering') || low.includes('busy') || low.includes('hang up') || low.includes('hangup') || low.includes('no answer')) {
      return { choice: 'NO', status: 'NOT_CONNECTED' };
    }
    if (low.includes('not interested') || low.includes('no requirement') || low.includes('not related') || low.includes('no need')) {
      return { choice: 'YES', status: 'NOT_INTERESTED' };
    }
    if (low.includes('interested') || low.includes('pricing') || low.includes('explain') || low.includes('call back') || low.includes('share details') || low.includes('demo')) {
      return { choice: 'YES', status: 'INTERESTED' };
    }
    return { choice: 'PENDING', status: 'PENDING' };
  };

  const id = `lead_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`;

  for (const { roundNum, keys } of roundKeysMap) {
    const val = get(...keys);
    if (val) {
      // Extract date if present (e.g. 03-08-2026, 03/08/2026, 03 08 2026, 2026-08-03)
      const dateMatch = val.match(/(\d{2}[-/.]\d{2}[-/.]\d{4}|\d{4}[-/.]\d{2}[-/.]\d{2}|\d{2}\s+\d{2}\s+\d{4})/);
      let parsedDate = '';
      if (dateMatch) {
        const rawDate = dateMatch[0].replace(/\s+/g, '-').replace(/[\/.]/g, '-');
        parsedDate = rawDate;
      }
      const rawNote = val.replace(dateMatch ? dateMatch[0] : '', '').replace(/^[\s(:,-]+|[\s)]+$/g, '').trim();
      const { choice, status } = inferStatusFromNote(val);

      followUpRounds.push({
        id: `fu_${id}_${roundNum}`,
        roundNumber: roundNum,
        callChoice: choice,
        callStatus: status,
        followUpDate: parsedDate,
        note: rawNote || val,
        notesList: rawNote ? [{ text: rawNote, date: parsedDate || getTodayDate() }] : [],
        calledBy: calledBy || undefined,
        updatedAt: Date.now(),
      });
    }
  }

  // If no follow up columns found, create default Follow Up 1
  if (followUpRounds.length === 0) {
    const note = get('note', 'notes', 'remark', 'comment', 'description') || '';
    const followUpDate = get('followupdate', 'followup', 'date') || '';
    const { choice, status } = inferStatusFromNote(note);
    followUpRounds.push({
      id: `fu_${id}_1`,
      roundNumber: 1,
      callChoice: choice,
      callStatus: status,
      followUpDate,
      note,
      notesList: note ? [{ text: note, date: followUpDate || getTodayDate() }] : [],
      calledBy: calledBy || undefined,
      updatedAt: Date.now(),
    });
  }

  // Collect any remaining extra columns into customFields
  const customFields: Record<string, string> = {};
  const standardKeywords = ['business', 'company', 'person', 'name', 'phone', 'website', 'role', 'email', 'linkedin', 'facebook', 'insta', 'note', 'call', 'status', 'followup', 'date'];
  for (const [k, v] of Object.entries(row)) {
    const cleanKey = k.toLowerCase().replace(/[\s_-]/g, '');
    const isStandard = standardKeywords.some(sk => cleanKey.includes(sk));
    if (!isStandard && v !== undefined && v !== null && String(v).trim() !== '') {
      customFields[k] = String(v).trim();
    }
  }

  const latestRound = followUpRounds[followUpRounds.length - 1] || followUpRounds[0];

  return {
    id,
    businessName: businessName || personName || 'Lead Contact',
    personName,
    phone,
    businessWebsite,
    role,
    email,
    linkedinProfile,
    facebookProfile,
    instaProfile,
    followUps: followUpRounds,
    note: latestRound?.note || '',
    notesList: latestRound?.notesList || [],
    callChoice: latestRound?.callChoice || 'PENDING',
    callStatus: latestRound?.callStatus || 'PENDING',
    followUpDate: latestRound?.followUpDate || '',
    calledBy: calledBy || undefined,
    customFields,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
};

// ─── Component ────────────────────────────────────────────────────────────────

export function ColdCallsModule({
  subPage = 'analytics',
  onSubPageChange,
}: {
  subPage?: 'analytics' | 'sheet' | 'database';
  onSubPageChange?: (page: 'analytics' | 'sheet' | 'database') => void;
}) {
  const { socket } = useSocket();
  const [leads, setLeads] = useState<ColdCallLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'ALL' | 'INTERESTED' | 'WARM' | 'NOT_INTERESTED' | 'PENDING' | number>('ALL');

  const currentUserName = typeof window !== 'undefined'
    ? (localStorage.getItem('crm_user_name') || localStorage.getItem('crm_user_display') || localStorage.getItem('crm_admin_display_name') || localStorage.getItem('crm_admin_username') || 'Teja')
    : 'Teja';

  // Inline edit tracking: Map<leadId, partial changes>
  const [editedRows, setEditedRows] = useState<Map<string, Partial<ColdCallLead>>>(new Map());
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [infoPopupLead, setInfoPopupLead] = useState<ColdCallLead | null>(null);
  const [infoPopupFollowUps, setInfoPopupFollowUps] = useState<FollowUpRound[]>([]);
  const [newNoteInputs, setNewNoteInputs] = useState<Record<number, string>>({});
  const [selectedNoteIndex, setSelectedNoteIndex] = useState<Record<number, number>>({});
  const [showMoreInfo, setShowMoreInfo] = useState(false);
  const [infoSaving, setInfoSaving] = useState(false);

  // Add Data popup
  const [showAddPopup, setShowAddPopup] = useState(false);
  const [addForm, setAddForm] = useState<Partial<ColdCallLead & { phoneError: string }>>({});

  // Dashboard Card Popups
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showInterestedModal, setShowInterestedModal] = useState(false);
  const [showScheduledModal, setShowScheduledModal] = useState(false);
  const [showFollowupsTodayModal, setShowFollowupsTodayModal] = useState(false);
  const [deleteConfirmLead, setDeleteConfirmLead] = useState<ColdCallLead | null>(null);

  const handleConfirmRemoveCall = (lead: ColdCallLead) => {
    const clearedLeadPartial = {
      callChoice: null,
      callStatus: 'PENDING',
      calledBy: null,
      callTimestamp: null,
      callOutcome: null,
      followUps: [],
    };

    setLeads(prev => prev.map(l => l.id === lead.id ? {
      ...l,
      callChoice: undefined,
      callStatus: 'PENDING',
      calledBy: undefined,
      callTimestamp: undefined,
      callOutcome: undefined,
      followUps: [],
    } : l));

    fetch(`${getBackendUrl()}/api/cold-calls/${lead.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(clearedLeadPartial),
    }).catch(err => console.error('Error clearing call entry:', err));

    setDeleteConfirmLead(null);
  };

  // Upload
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Column Width Resizing State ─────────────────────────────────────────────
  const [colWidths, setColWidths] = useState<Record<string, number>>({
    index: 48,
    businessName: 280,
    personName: 280,
    phone: 200,
    info: 140,
  });

  const isResizingRef = useRef<{ field: string; startX: number; startWidth: number } | null>(null);

  const handleMouseDownResize = (field: string, e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = {
      field,
      startX: e.clientX,
      startWidth: colWidths[field] || 150,
    };

    const handleMouseMove = (moveEvt: MouseEvent) => {
      if (!isResizingRef.current) return;
      const diff = moveEvt.clientX - isResizingRef.current.startX;
      const newW = Math.max(60, isResizingRef.current.startWidth + diff);
      const fieldName = isResizingRef.current.field;
      setColWidths(prev => ({ ...prev, [fieldName]: newW }));
    };

    const handleMouseUp = () => {
      isResizingRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // ── Fetch & Socket Sync ───────────────────────────────────────────────────────
  const fetchLeads = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${getBackendUrl()}/api/cold-calls`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setLeads(data as ColdCallLead[]);
      }
    } catch (e) {
      console.error('fetchLeads error', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { 
    fetchLeads(); 
  }, [fetchLeads]);

  useEffect(() => {
    if (!socket) return;
    const handleColdCallsUpdated = (updatedLeads: ColdCallLead[]) => {
      if (Array.isArray(updatedLeads)) {
        setLeads(updatedLeads);
      }
    };
    socket.on('cold_calls_updated', handleColdCallsUpdated);
    return () => {
      socket.off('cold_calls_updated', handleColdCallsUpdated);
    };
  }, [socket]);

  // ── Upload Excel ─────────────────────────────────────────────────────────────
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
        if (!rows.length) { alert('File is empty.'); return; }

        const parsedLeads = rows.map((r, i) => mapExcelRow(r, i));

        const res = await fetch(`${getBackendUrl()}/api/cold-calls/import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leads: parsedLeads }),
        });
        const data = await res.json();
        if (data.success && Array.isArray(data.leads)) {
          setLeads(data.leads);
          triggerSaveToast('saved');
        }
      } catch (err) {
        console.error('Upload error', err);
        alert('Failed to parse file. Please use a valid .xlsx or .csv file.');
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  // ── Inline Edit (Always-On Excel Editing with Instant Auto-Save) ────────────
  const handleCellEdit = (leadId: string, field: keyof ColdCallLead, value: string) => {
    const activeUser = typeof window !== 'undefined'
      ? (localStorage.getItem('crm_user_name') || localStorage.getItem('crm_admin_display_name') || 'Executive User')
      : 'Executive User';
    const now = Date.now();

    const partialUpdates: Partial<ColdCallLead> = {
      [field]: value,
      calledBy: activeUser,
      callTimestamp: now,
      updatedAt: now,
    };

    setEditedRows(prev => {
      const next = new Map(prev);
      next.set(leadId, { ...(next.get(leadId) || {}), ...partialUpdates });
      return next;
    });

    // Optimistically update displayed leads in React state
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, ...partialUpdates } : l));

    // INSTANT AUTO-SAVE TO BACKEND & BROADCAST TO ALL CONNECTED USERS
    fetch(`${getBackendUrl()}/api/cold-calls/${leadId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partialUpdates),
    }).then(res => res.json()).then(data => {
      if (data.success && data.lead) {
        setLeads(prev => prev.map(l => l.id === data.lead.id ? data.lead : l));
      }
    }).catch(err => console.error('Instant cell save error:', err));
  };

  // ── Save All Edits ────────────────────────────────────────────────────────────
  const handleSaveAll = async () => {
    setSaveStatus('saving');
    try {
      if (editedRows.size > 0) {
        await Promise.all(
          Array.from(editedRows.entries()).map(([id, partial]) =>
            fetch(`${getBackendUrl()}/api/cold-calls/${id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...partial, calledBy: currentUserName, callTimestamp: Date.now() }),
            })
          )
        );
        setEditedRows(new Map());
      }
      triggerSaveToast('saved');
      fetchLeads();
    } catch (e) {
      console.error('Save error', e);
      setSaveStatus('idle');
    }
  };

  const triggerSaveToast = (status: 'saved') => {
    setSaveStatus(status);
    setTimeout(() => setSaveStatus('idle'), 3000);
  };

  // ── Info & Multi-Stage Follow-ups Popup ────────────────────────────────────────
  const getRoundNotesList = (round: FollowUpRound): NoteEntry[] => {
    if (round.notesList && round.notesList.length > 0) return round.notesList;
    if (round.note && round.note.trim()) return [{ text: round.note, date: getTodayDate() }];
    return [];
  };

  const openInfoPopup = (lead: ColdCallLead) => {
    const edited = editedRows.get(lead.id) || {};
    const mergedLead = { ...lead, ...edited };
    setInfoPopupLead(mergedLead);
    setInfoPopupFollowUps(getLeadFollowUps(mergedLead));
    setNewNoteInputs({});
    setSelectedNoteIndex({});
    setShowMoreInfo(false);
  };

  const handleFollowUpFieldChange = (roundIdx: number, field: keyof FollowUpRound, value: any) => {
    setInfoPopupFollowUps(prev => {
      const next = [...prev];
      const target = { ...next[roundIdx] };
      if (field === 'callChoice') {
        target.callChoice = value;
        if (value === 'YES') {
          if (!target.callStatus || target.callStatus === 'PENDING' || target.callStatus === 'NOT_CONNECTED' || target.callStatus === 'NOT_REACHABLE' || target.callStatus === 'INVALID') {
            target.callStatus = 'INTERESTED';
          }
        } else if (value === 'NO') {
          target.callStatus = 'NOT_CONNECTED';
        } else if (value === 'INVALID') {
          target.callStatus = 'NOT_REACHABLE';
        } else {
          target.callStatus = 'PENDING';
        }
      } else {
        (target as any)[field] = value;
      }
      target.calledBy = currentUserName;
      target.updatedAt = Date.now();
      next[roundIdx] = target;
      return next;
    });
  };

  const handleAddFollowUpStage = () => {
    setInfoPopupFollowUps(prev => {
      const nextRoundNum = prev.length + 1;
      return [
        ...prev,
        {
          id: `fu_${infoPopupLead?.id || 'lead'}_${Date.now()}_${nextRoundNum}`,
          roundNumber: nextRoundNum,
          callChoice: 'PENDING',
          callStatus: 'PENDING',
          followUpDate: '',
          notesList: [],
          note: '',
          calledBy: currentUserName,
          updatedAt: Date.now(),
        }
      ];
    });
  };

  const handleDeleteFollowUpStage = (roundIdx: number) => {
    setInfoPopupFollowUps(prev => {
      const filtered = prev.filter((_, i) => i !== roundIdx);
      return filtered.map((r, i) => ({ ...r, roundNumber: i + 1 }));
    });
  };

  const handleAddNoteToRound = (roundIdx: number) => {
    const text = (newNoteInputs[roundIdx] || '').trim();
    if (!text) return;
    const newEntry: NoteEntry = { text, date: getTodayDate() };
    setInfoPopupFollowUps(prev => {
      const next = [...prev];
      const target = { ...next[roundIdx] };
      const currentList = getRoundNotesList(target);
      target.notesList = [newEntry, ...currentList];
      next[roundIdx] = target;
      return next;
    });
    setNewNoteInputs(prev => ({ ...prev, [roundIdx]: '' }));
    setSelectedNoteIndex(prev => ({ ...prev, [roundIdx]: 0 }));
  };

  const handleDeleteNoteFromRound = (roundIdx: number, noteIdx: number) => {
    setInfoPopupFollowUps(prev => {
      const next = [...prev];
      const target = { ...next[roundIdx] };
      const currentList = getRoundNotesList(target);
      target.notesList = currentList.filter((_, i) => i !== noteIdx);
      if (target.notesList.length === 0) target.note = '';
      next[roundIdx] = target;
      return next;
    });
    setSelectedNoteIndex(prev => ({ ...prev, [roundIdx]: 0 }));
  };

  const handleEditNoteInRound = (roundIdx: number, noteIdx: number, text: string) => {
    setInfoPopupFollowUps(prev => {
      const next = [...prev];
      const target = { ...next[roundIdx] };
      const currentList = [...getRoundNotesList(target)];
      if (currentList[noteIdx]) {
        currentList[noteIdx] = { ...currentList[noteIdx], text };
      }
      target.notesList = currentList;
      next[roundIdx] = target;
      return next;
    });
  };

  const handleSaveInfoPopup = async () => {
    if (!infoPopupLead) return;
    setInfoSaving(true);
    try {
      const now = Date.now();
      const finalizedFollowUps = infoPopupFollowUps.map((round, idx) => {
        const pendingText = (newNoteInputs[idx] || '').trim();
        if (pendingText) {
          const newEntry: NoteEntry = { text: pendingText, date: getTodayDate() };
          return {
            ...round,
            notesList: [newEntry, ...(round.notesList || [])],
          };
        }
        return round;
      });

      const latestRound = finalizedFollowUps[finalizedFollowUps.length - 1] || finalizedFollowUps[0];

      const partial: Partial<ColdCallLead> = {
        businessName: infoPopupLead.businessName,
        personName: infoPopupLead.personName,
        phone: infoPopupLead.phone,
        businessWebsite: infoPopupLead.businessWebsite,
        role: infoPopupLead.role,
        email: infoPopupLead.email,
        linkedinProfile: infoPopupLead.linkedinProfile,
        facebookProfile: infoPopupLead.facebookProfile,
        instaProfile: infoPopupLead.instaProfile,
        followUps: finalizedFollowUps,
        callChoice: latestRound?.callChoice || 'PENDING',
        callStatus: latestRound?.callStatus || 'PENDING',
        followUpDate: latestRound?.followUpDate || '',
        note: latestRound?.note || latestRound?.notesList?.[0]?.text || '',
        notesList: latestRound?.notesList || [],
        calledBy: currentUserName,
        callTimestamp: now,
        updatedAt: now,
      };

      setLeads(prev => prev.map(l => l.id === infoPopupLead.id ? { ...l, ...partial } : l));

      const res = await fetch(`${getBackendUrl()}/api/cold-calls/${infoPopupLead.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partial),
      });
      const data = await res.json();
      if (data.success && data.lead) {
        setLeads(prev => prev.map(l => l.id === data.lead.id ? data.lead : l));
        triggerSaveToast('saved');
        setInfoPopupLead(null);
      }
    } catch (e) {
      console.error('Info save error', e);
    } finally {
      setInfoSaving(false);
    }
  };

  const handlePopupLeadFieldEdit = (field: keyof ColdCallLead, value: string) => {
    if (!infoPopupLead) return;
    setInfoPopupLead(prev => prev ? { ...prev, [field]: value } : null);
  };

  // ── Add Data Handler ──────────────────────────────────────────────────────────
  const handleAddData = async () => {
    const rawPhone = (addForm.phone || '').trim();
    if (!rawPhone) {
      setAddForm(f => ({ ...f, phoneError: 'Phone number is required.' }));
      return;
    }
    const cleanPhone = rawPhone.replace(/\D/g, '');
    if (cleanPhone.length < 7) {
      setAddForm(f => ({ ...f, phoneError: 'Please enter a valid phone number.' }));
      return;
    }

    const now = Date.now();
    const newLead: Partial<ColdCallLead> = {
      businessName: (addForm.businessName || '').trim(),
      personName: (addForm.personName || '').trim(),
      phone: cleanPhone,
      businessWebsite: (addForm.businessWebsite || '').trim(),
      role: (addForm.role || '').trim(),
      email: (addForm.email || '').trim(),
      linkedinProfile: (addForm.linkedinProfile || '').trim(),
      facebookProfile: (addForm.facebookProfile || '').trim(),
      instaProfile: (addForm.instaProfile || '').trim(),
      note: (addForm.note || '').trim(),
      callStatus: 'PENDING',
      calledBy: currentUserName,
      callTimestamp: now,
      createdAt: now,
      updatedAt: now,
    };

    try {
      const res = await fetch(`${getBackendUrl()}/api/cold-calls/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads: [newLead] }),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.leads)) {
        setLeads(data.leads);
        triggerSaveToast('saved');
        setShowAddPopup(false);
        setAddForm({});
      }
    } catch (e) {
      console.error('Add data error', e);
    }
  };

  const maxFollowUpRounds = Math.max(
    1,
    ...leads.map(l => (l.followUps && l.followUps.length > 0) ? l.followUps.length : 1)
  );

  const getFollowupRoundCount = (roundNum: number) => {
    return leads.filter(l => {
      const fRounds = getLeadFollowUps(l);
      const target = fRounds.find(r => r.roundNumber === roundNum);
      return Boolean(target?.followUpDate && target.followUpDate.trim() !== '' && target.followUpDate !== '—');
    }).length;
  };

  const totalFollowUpsCount = leads.filter(l => {
    const fRounds = getLeadFollowUps(l);
    return fRounds.some(r => Boolean(r.followUpDate && r.followUpDate.trim() !== '' && r.followUpDate !== '—')) || Boolean(l.followUpDate);
  }).length;

  // ── Filter & Dynamic Sort ───────────────────────────────────────────────────
  const filteredLeads = leads.filter(l => {
    const q = searchQuery.toLowerCase();
    const match =
      (l.businessName || '').toLowerCase().includes(q) ||
      (l.personName || l.name || '').toLowerCase().includes(q) ||
      (l.phone || '').includes(q) ||
      (l.note || '').toLowerCase().includes(q) ||
      (l.followUps || []).some(f => (f.note || '').toLowerCase().includes(q) || (f.notesList || []).some(n => n.text.toLowerCase().includes(q)));
    if (!match) return false;
    if (filterTab === 'INTERESTED') return l.callStatus === 'INTERESTED';
    if (filterTab === 'WARM') return l.callStatus === 'YES' || l.callStatus === 'WARM';
    if (filterTab === 'NOT_INTERESTED') return l.callStatus === 'NOT_INTERESTED';
    if (filterTab === 'PENDING') return !l.callStatus || l.callStatus === 'PENDING';
    if (typeof filterTab === 'number') {
      const fRounds = getLeadFollowUps(l);
      const target = fRounds.find(r => r.roundNumber === filterTab);
      return Boolean(target?.followUpDate && target.followUpDate.trim() !== '' && target.followUpDate !== '—');
    }
    return true;
  });

  // DYNAMIC SPREADSHEET SORTING:
  // 1. Worked / Logged leads (where status/call choice/notes/calledBy are entered) float to the VERY TOP!
  // 2. Newly uploaded file rows float right below worked leads!
  // 3. Older uncalled leads float at the bottom!
  const sortedLeads = [...filteredLeads].sort((a, b) => {
    const aWorked = (a.callChoice === 'YES' || a.callChoice === 'NO' || a.callChoice === 'INVALID' || (Boolean(a.callStatus) && a.callStatus !== 'PENDING') || (Boolean(a.calledBy) && a.calledBy !== 'Staff' && a.calledBy !== 'Executive User') || Boolean(a.note) || (a.notesList && a.notesList.length > 0) || (a.followUps && a.followUps.length > 1));
    const bWorked = (b.callChoice === 'YES' || b.callChoice === 'NO' || b.callChoice === 'INVALID' || (Boolean(b.callStatus) && b.callStatus !== 'PENDING') || (Boolean(b.calledBy) && b.calledBy !== 'Staff' && b.calledBy !== 'Executive User') || Boolean(b.note) || (b.notesList && b.notesList.length > 0) || (b.followUps && b.followUps.length > 1));

    // Priority 1: Worked / Logged leads come FIRST at the top!
    if (aWorked && !bWorked) return -1;
    if (!aWorked && bWorked) return 1;

    // If both are worked, sort by most recent activity timestamp descending
    if (aWorked && bWorked) {
      const timeA = typeof a.callTimestamp === 'number' ? a.callTimestamp : (typeof a.updatedAt === 'number' ? a.updatedAt : (a.updatedAt ? new Date(a.updatedAt).getTime() : (a.createdAt || 0)));
      const timeB = typeof b.callTimestamp === 'number' ? b.callTimestamp : (typeof b.updatedAt === 'number' ? b.updatedAt : (b.updatedAt ? new Date(b.updatedAt).getTime() : (b.createdAt || 0)));
      return timeB - timeA;
    }

    // Priority 2: Uncalled leads — newly uploaded file rows appear on top of older uncalled file rows!
    const createdA = typeof a.createdAt === 'number' ? a.createdAt : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
    const createdB = typeof b.createdAt === 'number' ? b.createdAt : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
    return createdB - createdA;
  });

  // Calculate Today's Scheduled Follow-ups
  const todayStr = getTodayDate();
  const followUpsDueTodayLeads = sortedLeads.filter(l => {
    const fRounds = getLeadFollowUps(l);
    return fRounds.some(r => {
      if (!r.followUpDate) return false;
      const fDate = r.followUpDate.trim();
      return fDate === todayStr || fDate === new Date().toISOString().slice(0, 10);
    }) || (l.followUpDate === todayStr || l.followUpDate === new Date().toISOString().slice(0, 10));
  });

  const callsMadeTodayCount = leads.filter(l => {
    if (!l.updatedAt) return false;
    const d = new Date(l.updatedAt);
    const today = new Date();
    return (
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear() &&
      l.callStatus && l.callStatus !== 'PENDING'
    );
  }).length;

  const counts = {
    all: leads.length,
    interested: leads.filter(l => l.callStatus === 'INTERESTED').length,
    warm: leads.filter(l => l.callStatus === 'YES' || l.callStatus === 'WARM').length,
    notInterested: leads.filter(l => l.callStatus === 'NOT_INTERESTED').length,
    followups: totalFollowUpsCount,
    followupsToday: followUpsDueTodayLeads.length,
    callsToday: callsMadeTodayCount,
  };

  // ── Editable Cell Component (Always Live Excel Editable) ──────────────────────
  const EditableCell = ({
    leadId, field, value, placeholder = '', className = ''
  }: {
    leadId: string;
    field: keyof ColdCallLead;
    value: string;
    placeholder?: string;
    className?: string;
  }) => {
    const [localVal, setLocalVal] = useState(value);

    useEffect(() => { setLocalVal(value); }, [value]);

    const commit = (val: string) => {
      if (val !== value) handleCellEdit(leadId, field, val);
    };

    return (
      <input
        value={localVal}
        onChange={e => { setLocalVal(e.target.value); commit(e.target.value); }}
        onKeyDown={e => { if (e.key === 'Escape') setLocalVal(value); }}
        className={`w-full px-2 py-1.5 text-sm border border-transparent hover:border-zinc-400 focus:border-black focus:bg-white bg-transparent outline-none transition-all font-semibold ${className || 'text-black'}`}
        placeholder={placeholder}
      />
    );
  };

  const getLocalYYYYMMDD = (ts?: number | string) => {
    const d = ts ? new Date(ts) : new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const normalizeDateStr = (dStr?: string) => {
    if (!dStr) return '';
    const s = dStr.trim();
    if (s.includes('-') && s.split('-')[0].length === 2) {
      const [dd, mm, yyyy] = s.split('-');
      return `${yyyy}-${mm}-${dd}`;
    }
    return s;
  };

  const todayLocalStr = getLocalYYYYMMDD();

  // All Scheduled Follow-ups (current & future follow-up dates)
  const scheduledFollowupLeadsList = leads.filter(l => {
    if (!l.followUpDate || l.followUpDate.trim() === '' || l.followUpDate === '—') return false;
    const normF = normalizeDateStr(l.followUpDate);
    return normF >= todayLocalStr;
  });

  // Follow-ups Today: Strictly matches today's local date
  const followupTodayLeadsList = leads.filter(l => {
    const normF = normalizeDateStr(l.followUpDate);
    return normF === todayLocalStr;
  });

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-zinc-50/50 text-black">

      {/* ── TOAST ───────────────────────────────────────────────────────────── */}
      {saveStatus !== 'idle' && (
        <div className="fixed top-5 right-5 z-[9999] bg-black text-white px-6 py-3 rounded-2xl shadow-2xl border border-zinc-700 flex items-center gap-3">
          {saveStatus === 'saving' ? (
            <div className="w-6 h-6 rounded-full border-2 border-white border-t-transparent animate-spin" />
          ) : (
            <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center text-black font-bold">
              ✓
            </div>
          )}
          <span className="text-sm font-bold">{saveStatus === 'saving' ? 'Saving...' : '✓ Saved'}</span>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          PAGE 1: ANALYTICS & RECENT CALLS DASHBOARD
      ══════════════════════════════════════════════════════════════════════ */}
      {subPage === 'analytics' && (() => {

        // 1. Total Calls — contacts marked "Yes" in Call column
        const totalCallsLeads = leads.filter(l => {
          return l.callChoice === 'YES' || l.callStatus === 'YES' || l.callStatus === 'INTERESTED' || l.callStatus === 'WARM';
        });
        const totalCallsCount = totalCallsLeads.length;

        // 2. Status Breakdown — all leads with call choice / status recorded
        const statusLeads = leads.filter(l => l.callChoice === 'YES' || l.callChoice === 'NO' || (l.callStatus && l.callStatus !== 'PENDING'));
        const countInterested = statusLeads.filter(l => l.callStatus === 'INTERESTED').length;
        const countWarm = statusLeads.filter(l => l.callStatus === 'WARM' || l.callStatus === 'YES').length;
        const countNotInterested = statusLeads.filter(l => l.callStatus === 'NOT_INTERESTED').length;
        const countNotConnected = statusLeads.filter(l => l.callStatus === 'NOT_CONNECTED' || l.callChoice === 'NO').length;

        // 3. Conversations (Interested Contacts)
        const interestedLeadsList = leads.filter(l => l.callStatus === 'INTERESTED' || (l.callChoice === 'YES' && (l.callStatus === 'WARM' || l.callStatus === 'YES' || !l.callStatus)));

        // Recent calls list: ALL leads where a call choice (YES/NO) or explicit status (Interested/Warm/etc.) has been logged
        const displayCallsList = leads.filter(l => {
          const hasCallChoice = l.callChoice === 'YES' || l.callChoice === 'NO';
          const hasLoggedStatus = Boolean(l.callStatus) && l.callStatus !== 'PENDING';
          return hasCallChoice || hasLoggedStatus;
        }).sort((a, b) => {
          const tA = typeof a.callTimestamp === 'number' ? a.callTimestamp : (typeof a.updatedAt === 'number' ? a.updatedAt : (a.updatedAt ? new Date(a.updatedAt).getTime() : 0));
          const tB = typeof b.callTimestamp === 'number' ? b.callTimestamp : (typeof b.updatedAt === 'number' ? b.updatedAt : (b.updatedAt ? new Date(b.updatedAt).getTime() : 0));
          return tB - tA;
        });

        return (
          <div className="space-y-6">
            {/* Top Toolbar Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm">
              <div>
                <h3 className="text-lg font-extrabold text-black tracking-tight flex items-center gap-2">
                  <span>Cold Calls Performance Overview</span>
                </h3>
                <p className="text-xs text-zinc-500 font-medium">Real-time team cold calling metrics & recent calls log</p>
              </div>
            </div>

            {/* 5 Modern Metric Cards with Interactive Click Modals */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {/* Card 1: Total Calls */}
              <div className="bg-[#eff6ff] p-4 rounded-2xl border border-blue-200/80 shadow-sm flex items-center gap-3.5 transition-all">
                <div className="w-11 h-11 rounded-2xl bg-blue-500 text-white flex items-center justify-center flex-shrink-0 shadow-md">
                  <Phone className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">Total Calls</div>
                  <div className="text-2xl font-black text-blue-950 tracking-tight">{totalCallsCount.toLocaleString()}</div>
                  <div className="text-[10px] font-semibold text-blue-600/90 mt-0.5 truncate">Total calls marked "Yes"</div>
                </div>
              </div>

              {/* Card 2: Status Breakdown */}
              <div
                onClick={() => setShowStatusModal(true)}
                className="bg-[#ecfdf5] p-4 rounded-2xl border border-emerald-200/80 shadow-sm flex items-center gap-3.5 transition-all hover:shadow-md hover:border-emerald-400 cursor-pointer active:scale-98 group"
                title="Click to view detailed status breakdown"
              >
                <div className="w-11 h-11 rounded-2xl bg-emerald-500 text-white flex items-center justify-center flex-shrink-0 shadow-md group-hover:scale-105 transition-transform">
                  <PhoneCall className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider flex items-center justify-between">
                    <span>Status</span>
                    <span className="text-[9px] text-emerald-600 bg-emerald-100 px-1 py-0.5 rounded font-black">POPUP ↗</span>
                  </div>
                  <div className="text-2xl font-black text-emerald-950 tracking-tight">{statusLeads.length.toLocaleString()}</div>
                  <div className="text-[10px] font-semibold text-emerald-600/90 mt-0.5 truncate">Click for status breakdown</div>
                </div>
              </div>

              {/* Card 3: Conversations (Interested Contacts) */}
              <div
                onClick={() => setShowInterestedModal(true)}
                className="bg-[#f5f3ff] p-4 rounded-2xl border border-purple-200/80 shadow-sm flex items-center gap-3.5 transition-all hover:shadow-md hover:border-purple-400 cursor-pointer active:scale-98 group"
                title="Click to view interested contacts info"
              >
                <div className="w-11 h-11 rounded-2xl bg-purple-500 text-white flex items-center justify-center flex-shrink-0 shadow-md group-hover:scale-105 transition-transform">
                  <User className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-bold text-purple-700 uppercase tracking-wider flex items-center justify-between">
                    <span>Conversations</span>
                    <span className="text-[9px] text-purple-600 bg-purple-100 px-1 py-0.5 rounded font-black">POPUP ↗</span>
                  </div>
                  <div className="text-2xl font-black text-purple-950 tracking-tight">{interestedLeadsList.length.toLocaleString()}</div>
                  <div className="text-[10px] font-semibold text-purple-600/90 mt-0.5 truncate">Interested contacts</div>
                </div>
              </div>

              {/* Card 4: Follow-ups Scheduled (NEW: All Future Follow-ups) */}
              <div
                onClick={() => setShowScheduledModal(true)}
                className="bg-[#eef2ff] p-4 rounded-2xl border border-indigo-200/80 shadow-sm flex items-center gap-3.5 transition-all hover:shadow-md hover:border-indigo-400 cursor-pointer active:scale-98 group"
                title="Click to inspect all scheduled follow-up leads"
              >
                <div className="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center flex-shrink-0 shadow-md group-hover:scale-105 transition-transform">
                  <Calendar className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-bold text-indigo-800 uppercase tracking-wider flex items-center justify-between">
                    <span className="truncate">Follow-ups Scheduled</span>
                    <span className="text-[9px] text-indigo-600 bg-indigo-100 px-1 py-0.5 rounded font-black">POPUP ↗</span>
                  </div>
                  <div className="text-2xl font-black text-indigo-950 tracking-tight">{scheduledFollowupLeadsList.length.toLocaleString()}</div>
                  <div className="text-[10px] font-semibold text-indigo-600/90 mt-0.5 truncate">All scheduled follow-ups</div>
                </div>
              </div>

              {/* Card 5: Follow-ups Today */}
              <div
                onClick={() => setShowFollowupsTodayModal(true)}
                className="bg-[#fffbeb] p-4 rounded-2xl border border-amber-200/80 shadow-sm flex items-center gap-3.5 transition-all hover:shadow-md hover:border-amber-400 cursor-pointer active:scale-98 group"
                title="Click to inspect today's follow-up leads"
              >
                <div className="w-11 h-11 rounded-2xl bg-amber-500 text-white flex items-center justify-center flex-shrink-0 shadow-md group-hover:scale-105 transition-transform">
                  <Briefcase className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-bold text-amber-800 uppercase tracking-wider flex items-center justify-between">
                    <span className="truncate">Follow-ups Today</span>
                    <span className="text-[9px] text-amber-600 bg-amber-100 px-1 py-0.5 rounded font-black">POPUP ↗</span>
                  </div>
                  <div className="text-2xl font-black text-amber-950 tracking-tight">{followupTodayLeadsList.length.toLocaleString()}</div>
                  <div className="text-[10px] font-semibold text-amber-600/90 mt-0.5 truncate">Scheduled for today</div>
                </div>
              </div>
            </div>

            {/* Recent Calls Table matching reference picture */}
            <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-200 pb-4">
                <div>
                  <h3 className="text-xl font-extrabold text-black tracking-tight">Recent Calls</h3>
                  <p className="text-xs text-zinc-500 font-medium">Recent calls and notes logged by team members</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => onSubPageChange?.('sheet')}
                    className="px-4 py-1.5 bg-black hover:bg-zinc-800 text-white font-extrabold text-xs rounded-xl transition-all flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
                    title="Click to edit contacts or call logs in Cold Calls List"
                  >
                    <span>✏️ Edit Calls / Contacts</span>
                  </button>
                  <span className="px-3.5 py-1.5 bg-zinc-100 border border-zinc-200 text-black text-xs font-black rounded-full">
                    {displayCallsList.length} Records
                  </span>
                </div>
              </div>

              {displayCallsList.length === 0 ? (
                <div className="p-12 text-center text-sm text-zinc-400 italic bg-zinc-50 rounded-2xl border border-zinc-200">
                  No call logs found. Start logging calls or import data.
                </div>
              ) : (
                <div className="overflow-x-auto border border-zinc-200 rounded-2xl">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="bg-zinc-100/80 border-b border-zinc-200 text-xs font-extrabold text-black uppercase tracking-wider">
                        <th className="py-3.5 px-4">Business Name</th>
                        <th className="py-3.5 px-4">Phone Number</th>
                        <th className="py-3.5 px-4">Called By</th>
                        <th className="py-3.5 px-4">Time</th>
                        <th className="py-3.5 px-4">Outcome</th>
                        <th className="py-3.5 px-4">Note</th>
                        <th className="py-3.5 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 bg-white">
                      {displayCallsList.map((lead) => {
                        const timeTs = lead.callTimestamp || lead.updatedAt || lead.createdAt;
                        const formattedTime = timeTs
                          ? new Date(timeTs).toLocaleString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: true,
                            })
                          : 'Today';

                        const outcome = lead.callStatus || (lead.callChoice === 'NO' ? 'NOT_CONNECTED' : 'PENDING');
                        let outcomeBadge = (
                          <span className="px-2.5 py-1 bg-zinc-100 text-zinc-700 border border-zinc-300 rounded-lg text-xs font-bold">
                            Pending
                          </span>
                        );

                        if (outcome === 'INTERESTED') {
                          outcomeBadge = (
                            <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-extrabold">
                              Interested
                            </span>
                          );
                        } else if (outcome === 'WARM' || outcome === 'YES') {
                          outcomeBadge = (
                            <span className="px-2.5 py-1 bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-xs font-extrabold">
                              Warm
                            </span>
                          );
                        } else if (outcome === 'NOT_INTERESTED') {
                          outcomeBadge = (
                            <span className="px-2.5 py-1 bg-rose-100 text-rose-800 border border-rose-300 rounded-lg text-xs font-extrabold">
                              Not Interested
                            </span>
                          );
                        } else if (outcome === 'NOT_CONNECTED' || outcome === 'NO') {
                          outcomeBadge = (
                            <span className="px-2.5 py-1 bg-zinc-100 text-zinc-700 border border-zinc-300 rounded-lg text-xs font-extrabold">
                              Not Connected
                            </span>
                          );
                        }

                        const latestNoteText = (lead.notesList && lead.notesList.length > 0)
                          ? lead.notesList[0].text
                          : (lead.note || 'No note added');

                        return (
                          <tr key={lead.id} className="hover:bg-zinc-50/80 transition-colors">
                            {/* Business Name */}
                            <td className="py-3.5 px-4 font-extrabold text-black">
                              {lead.businessName || lead.personName || lead.name || 'Unsaved Contact'}
                              {lead.personName && lead.businessName && lead.personName !== lead.businessName && (
                                <span className="block text-xs font-medium text-zinc-500">({lead.personName})</span>
                              )}
                            </td>

                            {/* Phone Number (Vibrant Green) */}
                            <td className="py-3.5 px-4 font-black text-[#00a884]">
                              {lead.phone || 'N/A'}
                            </td>

                            {/* Called By (Vibrant Green) */}
                            <td className="py-3.5 px-4">
                              {lead.calledBy && lead.calledBy !== 'Executive User' && lead.calledBy !== 'Staff' ? (
                                <span className="px-2.5 py-1 bg-emerald-50 border border-emerald-300 rounded-lg text-xs font-black text-emerald-800 flex items-center gap-1.5 w-fit shadow-xs">
                                  <User className="w-3.5 h-3.5 text-emerald-600" />
                                  {lead.calledBy}
                                </span>
                              ) : (
                                <span className="text-xs text-zinc-400 font-medium">—</span>
                              )}
                            </td>

                            {/* Time (Green if Entered Today, Normal Gray if Past) */}
                            <td className="py-3.5 px-4">
                              {timeTs && getLocalYYYYMMDD(timeTs) === todayLocalStr ? (
                                <span className="px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-300 font-extrabold text-xs rounded-lg inline-flex items-center gap-1.5 shadow-xs">
                                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                  {formattedTime}
                                </span>
                              ) : (
                                <span className="text-xs font-semibold text-zinc-600">
                                  {formattedTime}
                                </span>
                              )}
                            </td>

                            {/* Outcome */}
                            <td className="py-3.5 px-4">
                              {outcomeBadge}
                            </td>

                            {/* Note */}
                            <td 
                              className="py-3.5 px-4 max-w-xs truncate text-xs text-zinc-800 font-semibold cursor-pointer"
                              title={latestNoteText || 'No notes recorded'}
                              onClick={() => openInfoPopup(lead)}
                            >
                              {latestNoteText || '—'}
                            </td>

                            {/* Action Buttons */}
                            <td className="py-3.5 px-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => openInfoPopup(lead)}
                                  className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-black border border-zinc-300 font-bold text-xs rounded-lg transition-all cursor-pointer"
                                >
                                  Info
                                </button>
                                <button
                                  onClick={() => setDeleteConfirmLead(lead)}
                                  className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-lg transition-all cursor-pointer"
                                  title="Remove call log entry"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ══════════════════════════════════════════════════════════════════════
          PAGE 2: COLD CALLS EXCEL SPREADSHEET SHEET
      ══════════════════════════════════════════════════════════════════════ */}
      {subPage === 'sheet' && (
        <div className="space-y-4">
          {/* Filter Pills on the left side */}
          <div className="bg-white rounded-xl border border-zinc-200 p-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 overflow-x-auto flex-wrap">
              {([
                ['ALL', `All (${counts.all})`],
                ['INTERESTED', `Interested (${counts.interested})`],
                ['WARM', `Warm (${counts.warm})`],
                ['NOT_INTERESTED', `Not Interested (${counts.notInterested})`],
              ] as [any, string][]).map(([tab, label]) => (
                <button
                  key={tab}
                  onClick={() => setFilterTab(tab)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                    filterTab === tab ? 'bg-black text-white shadow-xs' : 'text-zinc-700 bg-zinc-100 hover:bg-zinc-200'
                  }`}
                >
                  {label}
                </button>
              ))}

              {/* Follow-up Rounds: Follow up 1, Follow up 2, etc. directly listed on left */}
              {Array.from({ length: maxFollowUpRounds }).map((_, i) => {
                const roundNum = i + 1;
                const rCount = getFollowupRoundCount(roundNum);
                const isSelected = filterTab === roundNum;
                return (
                  <button
                    key={`fu_${roundNum}`}
                    onClick={() => setFilterTab(roundNum)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                      isSelected ? 'bg-black text-white shadow-xs' : 'text-zinc-700 bg-zinc-100 hover:bg-zinc-200'
                    }`}
                  >
                    Follow up {roundNum} ({rCount})
                  </button>
                );
              })}
            </div>
          </div>

          {/* TOOLBAR - Search Box on left | Save, Add Data, Upload Excel, Clear on right */}
          <div className="bg-white rounded-xl border border-zinc-200 p-3 flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Left Side: Search Box */}
            <div className="relative min-w-[300px] flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search name, phone, business..."
                className="w-full pl-9 pr-4 py-2 text-sm font-medium rounded-xl border border-zinc-300 bg-zinc-50 focus:bg-white focus:border-black focus:outline-none transition-all text-black"
              />
            </div>

            {/* Right Side: Action Buttons */}
            <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
              {/* Save Button */}
              <button
                onClick={handleSaveAll}
                disabled={saveStatus === 'saving'}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-black hover:bg-zinc-800 text-white font-bold text-xs rounded-xl transition-all shadow-sm active:scale-95 disabled:opacity-60 cursor-pointer"
              >
                {saveStatus === 'saving' ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : saveStatus === 'saved' ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>{saveStatus === 'saved' ? 'Saved ✓' : 'Save'}</span>
              </button>

              {/* Add Data Button */}
              <button
                onClick={() => { setAddForm({}); setShowAddPopup(true); }}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-zinc-100 hover:bg-zinc-200 border border-zinc-300 text-black font-bold text-xs rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Data</span>
              </button>

              {/* Upload Excel Button */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".xlsx, .xls, .csv"
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#00a884] hover:bg-[#008f70] text-white font-bold text-xs rounded-xl transition-all shadow-sm active:scale-95 disabled:opacity-60 cursor-pointer"
              >
                {isUploading ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                )}
                <span>{isUploading ? 'Uploading...' : 'Upload Excel'}</span>
              </button>
            </div>
          </div>

          {/* EXACT EXCEL SPREADSHEET TABLE WITH LIVE EDITING & DYNAMIC SORTING */}
          <div className="bg-white rounded-xl border border-gray-300 shadow-sm overflow-hidden font-sans">
            {loading ? (
              <div className="p-16 text-center text-sm text-gray-500 font-semibold">Loading spreadsheet...</div>
            ) : sortedLeads.length === 0 ? (
              <div className="p-16 text-center space-y-3 bg-white">
                <div className="w-12 h-12 rounded-2xl bg-gray-100 text-gray-500 flex items-center justify-center mx-auto border border-gray-300">
                  <FileSpreadsheet className="w-6 h-6 text-gray-700" />
                </div>
                <p className="text-base font-extrabold text-black">No spreadsheet data</p>
                <p className="text-xs text-gray-500 font-semibold">
                  {leads.length === 0 ? 'Upload an Excel sheet to populate rows.' : 'No rows match your search.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse border border-gray-300 text-sm">
                  {/* Table Headers */}
                  <thead>
                    <tr className="bg-[#f3f4f6] text-gray-700 font-bold border-b border-gray-300 text-xs uppercase tracking-wider select-none">
                      <th className="py-2.5 px-3 border border-gray-300 bg-[#e5e7eb] text-gray-800 text-center" style={{ width: `${colWidths.index || 48}px` }}>#</th>
                      
                      <th className="py-2.5 px-3 border border-gray-300 relative group" style={{ width: `${colWidths.businessName || 280}px` }}>
                        <span>BUSINESS NAME</span>
                        <div
                          onMouseDown={(e) => handleMouseDownResize('businessName', e)}
                          className="absolute top-0 right-0 bottom-0 w-2.5 cursor-col-resize hover:bg-black/30 transition-colors z-20"
                          title="Drag to resize column width"
                        />
                      </th>

                      <th className="py-2.5 px-3 border border-gray-300 relative group" style={{ width: `${colWidths.personName || 280}px` }}>
                        <span>PERSON NAME</span>
                        <div
                          onMouseDown={(e) => handleMouseDownResize('personName', e)}
                          className="absolute top-0 right-0 bottom-0 w-2.5 cursor-col-resize hover:bg-black/30 transition-colors z-20"
                          title="Drag to resize column width"
                        />
                      </th>

                      <th className="py-2.5 px-3 border border-gray-300 relative group" style={{ width: `${colWidths.phone || 200}px` }}>
                        <span>PHONE NUMBER</span>
                        <div
                          onMouseDown={(e) => handleMouseDownResize('phone', e)}
                          className="absolute top-0 right-0 bottom-0 w-2.5 cursor-col-resize hover:bg-black/30 transition-colors z-20"
                          title="Drag to resize column width"
                        />
                      </th>

                      <th className="py-2.5 px-3 border border-gray-300 text-center relative group" style={{ width: `${colWidths.info || 140}px` }}>
                        <span>INFO</span>
                        <div
                          onMouseDown={(e) => handleMouseDownResize('info', e)}
                          className="absolute top-0 right-0 bottom-0 w-2.5 cursor-col-resize hover:bg-black/30 transition-colors z-20"
                          title="Drag to resize column width"
                        />
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white text-gray-900 font-normal">
                    {sortedLeads.map((lead, idx) => {
                      const fRounds = getLeadFollowUps(lead);
                      const followUpsCount = fRounds.length;
                      const hasNotesOrDates = fRounds.some(r => Boolean(r.followUpDate || (r.notesList && r.notesList.length > 0) || r.note));

                      return (
                        <tr key={lead.id} className="hover:bg-blue-50/40 transition-colors">
                          {/* Row Index Column (1, 2, 3...) */}
                          <td className="py-2 px-3 text-center bg-[#f3f4f6] text-gray-500 font-mono text-xs font-semibold border border-gray-300 select-none">
                            {idx + 1}
                          </td>

                          {/* Business Name Cell */}
                          <td className="py-2 px-3 border border-gray-300 font-semibold text-black" style={{ width: `${colWidths.businessName || 280}px` }}>
                            <EditableCell
                              leadId={lead.id}
                              field="businessName"
                              value={lead.businessName || ''}
                              placeholder="Enter business name..."
                            />
                          </td>

                          {/* Person Name Cell */}
                          <td className="py-2 px-3 border border-gray-300 font-semibold text-black" style={{ width: `${colWidths.personName || 280}px` }}>
                            <EditableCell
                              leadId={lead.id}
                              field="personName"
                              value={lead.personName || lead.name || ''}
                              placeholder="Enter person name..."
                            />
                          </td>

                          {/* Phone Number Cell (Green Font) */}
                          <td className="py-2 px-3 border border-gray-300 font-extrabold text-[#00a884]" style={{ width: `${colWidths.phone || 200}px` }}>
                            <EditableCell
                              leadId={lead.id}
                              field="phone"
                              value={lead.phone || ''}
                              placeholder="Enter phone..."
                              className="text-[#00a884] font-extrabold"
                            />
                          </td>

                          {/* INFO Button Cell */}
                          <td className="py-2 px-3 border border-gray-300 text-center" style={{ width: `${colWidths.info || 140}px` }}>
                            <button
                              onClick={() => openInfoPopup(lead)}
                              title="Click to view & edit all Follow-ups and Contact details"
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer shadow-xs active:scale-95 ${
                                hasNotesOrDates
                                  ? 'bg-black text-white hover:bg-zinc-800'
                                  : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border border-zinc-300'
                              }`}
                            >
                              <Info className="w-3.5 h-3.5" />
                              <span>Info</span>
                              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                                hasNotesOrDates ? 'bg-zinc-800 text-white' : 'bg-zinc-200 text-zinc-700'
                              }`}>
                                {followUpsCount}
                              </span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          INFO & MULTI-STAGE FOLLOW-UPS POPUP
      ══════════════════════════════════════════════════════════════════════ */}
      {infoPopupLead && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 text-black font-sans">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-gray-200 flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in duration-150">

            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-[#f8f9fa] rounded-t-2xl">
              <div>
                <h3 className="text-xl font-black text-black tracking-tight">
                  {infoPopupLead.businessName || infoPopupLead.personName || 'Contact Info & Follow-ups'}
                </h3>
                {(infoPopupLead.personName || infoPopupLead.phone) && (
                  <p className="text-xs font-bold text-zinc-500 mt-0.5">
                    {infoPopupLead.personName ? infoPopupLead.personName : ''}
                    {infoPopupLead.phone ? `${infoPopupLead.personName ? ' · ' : ''}📞 ${infoPopupLead.phone}` : ''}
                  </p>
                )}
              </div>
              <button
                onClick={() => setInfoPopupLead(null)}
                className="w-8 h-8 rounded-full bg-white hover:bg-gray-200 flex items-center justify-center text-gray-700 transition-all shadow-sm border border-gray-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 p-6 space-y-6 font-sans">

              {/* ── Multi-Stage Follow-ups Container ── */}
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-black text-black uppercase tracking-wider flex items-center gap-2">
                    <PhoneCall className="w-4 h-4 text-[#00a884]" />
                    Follow-up Logs & History
                  </h4>
                  <span className="text-xs font-bold text-zinc-500">
                    {infoPopupFollowUps.length} {infoPopupFollowUps.length === 1 ? 'Stage' : 'Stages'}
                  </span>
                </div>

                {infoPopupFollowUps.map((round, rIdx) => {
                  const currentCallChoice = round.callChoice || 'PENDING';
                  const currentStatus = round.callStatus || 'PENDING';
                  const notesList = getRoundNotesList(round);
                  const notesCount = notesList.length;
                  const activeNoteIdx = Math.min(selectedNoteIndex[rIdx] ?? 0, Math.max(0, notesCount - 1));
                  const selectedNote = notesCount > 0 ? notesList[activeNoteIdx] : null;

                  return (
                    <div
                      key={round.id || rIdx}
                      className="p-4 rounded-xl border border-zinc-300 bg-white shadow-xs space-y-4 relative"
                    >
                      {/* Follow-up Header */}
                      <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
                        <div className="flex items-center gap-2">
                          <h5 className="text-xs font-black text-black uppercase tracking-wider">
                            FOLLOW UP {round.roundNumber || rIdx + 1}
                          </h5>
                          {round.calledBy && (
                            <span className="text-[11px] font-bold text-zinc-400">
                              by {round.calledBy}
                            </span>
                          )}
                        </div>

                        {/* Delete Stage Button (For round > 1) */}
                        {rIdx > 0 && (
                          <button
                            type="button"
                            onClick={() => handleDeleteFollowUpStage(rIdx)}
                            title="Remove this follow-up round"
                            className="text-zinc-400 hover:text-rose-600 p-1 rounded transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Top Row: CALL (Choice), STATUS (Conditional), FOLLOW UP DATE */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-stretch">
                        {/* 1. CALL Choice */}
                        <div className="flex flex-col">
                          <label className="text-[10px] font-black text-zinc-500 uppercase tracking-wider block mb-1">
                            CALL
                          </label>
                          <select
                            value={currentCallChoice}
                            onChange={(e) => handleFollowUpFieldChange(rIdx, 'callChoice', e.target.value as CallChoiceType)}
                            className="w-full h-9 px-2.5 rounded-lg border border-zinc-300 bg-zinc-50 text-xs font-bold text-black outline-none cursor-pointer focus:bg-white focus:border-black"
                          >
                            <option value="PENDING">Pending</option>
                            <option value="YES">Yes</option>
                            <option value="NO">No</option>
                            <option value="INVALID">Invalid</option>
                          </select>
                        </div>

                        {/* 2. STATUS (Conditional on Call Choice) */}
                        <div className="flex flex-col">
                          <label className="text-[10px] font-black text-zinc-500 uppercase tracking-wider block mb-1">
                            STATUS
                          </label>
                          {currentCallChoice === 'YES' ? (
                            <select
                              value={currentStatus}
                              onChange={(e) => handleFollowUpFieldChange(rIdx, 'callStatus', e.target.value as CallStatusType)}
                              className="w-full h-9 px-2.5 rounded-lg border border-emerald-300 bg-emerald-50 text-xs font-extrabold text-emerald-900 outline-none cursor-pointer focus:bg-white focus:border-emerald-600"
                            >
                              <option value="INTERESTED">Interested</option>
                              <option value="WARM">Warm</option>
                              <option value="NOT_INTERESTED">Not Interested</option>
                              <option value="PENDING">Pending</option>
                            </select>
                          ) : currentCallChoice === 'NO' ? (
                            <div className="w-full h-9 px-2.5 rounded-lg border border-zinc-200 bg-zinc-100 text-xs font-extrabold text-zinc-700 flex items-center justify-center select-none">
                              Not Connected
                            </div>
                          ) : currentCallChoice === 'INVALID' ? (
                            <select
                              value={currentStatus}
                              onChange={(e) => handleFollowUpFieldChange(rIdx, 'callStatus', e.target.value as CallStatusType)}
                              className="w-full h-9 px-2.5 rounded-lg border border-rose-300 bg-rose-50 text-xs font-extrabold text-rose-900 outline-none cursor-pointer focus:bg-white focus:border-rose-600"
                            >
                              <option value="NOT_REACHABLE">Not reachable</option>
                              <option value="INVALID">Invalid</option>
                            </select>
                          ) : (
                            <div className="w-full h-9 px-2.5 rounded-lg border border-zinc-200 bg-zinc-50 text-xs font-semibold text-zinc-400 flex items-center justify-center select-none">
                              —
                            </div>
                          )}
                        </div>

                        {/* 3. FOLLOW UP DATE (Calendar Picker) */}
                        <div className="flex flex-col">
                          <label className="text-[10px] font-black text-zinc-500 uppercase tracking-wider block mb-1">
                            FOLLOW UP {round.roundNumber || rIdx + 1} DATE
                          </label>
                          <div className={`flex items-center gap-1 w-full h-9 rounded-lg px-2 border transition-all ${
                            round.followUpDate 
                              ? 'bg-emerald-50/70 border-emerald-200 focus-within:border-emerald-600 focus-within:bg-white' 
                              : 'bg-zinc-50 border-zinc-300 focus-within:border-black focus-within:bg-white'
                          }`}>
                            <input
                              type="date"
                              value={normalizeDateStr(round.followUpDate || '')}
                              onChange={(e) => handleFollowUpFieldChange(rIdx, 'followUpDate', e.target.value)}
                              className={`w-full bg-transparent text-xs outline-none cursor-pointer ${
                                round.followUpDate ? 'text-[#00a884] font-black' : 'text-gray-400 font-medium'
                              }`}
                            />
                            {round.followUpDate && (
                              <button
                                type="button"
                                onClick={() => handleFollowUpFieldChange(rIdx, 'followUpDate', '')}
                                title="Clear date"
                                className="text-emerald-600 hover:text-red-500 p-0.5 rounded transition-colors cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Bottom Row: NOTES with + Add and Notes Dropdown Selector */}
                      <div className="space-y-2 pt-1 border-t border-zinc-100">
                        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-wider block">
                          NOTES FOR FOLLOW UP {round.roundNumber || rIdx + 1}
                        </label>

                        {/* Input Row: Type note + Add button + Notes dropdown */}
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={newNoteInputs[rIdx] || ''}
                            onChange={(e) => setNewNoteInputs(prev => ({ ...prev, [rIdx]: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddNoteToRound(rIdx);
                              }
                            }}
                            placeholder="Type a note and click + Add..."
                            className="flex-1 h-9 px-3 text-xs rounded-lg border border-zinc-300 bg-zinc-50 focus:bg-white focus:border-[#00a884] focus:outline-none transition-all font-medium text-black"
                          />
                          <button
                            type="button"
                            onClick={() => handleAddNoteToRound(rIdx)}
                            className="h-9 px-3.5 bg-[#00a884] hover:bg-[#008f70] text-white font-bold text-xs rounded-lg transition-all flex items-center gap-1 cursor-pointer flex-shrink-0 shadow-xs active:scale-95"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add</span>
                          </button>

                          {/* Notes Dropdown Selector */}
                          <select
                            value={activeNoteIdx}
                            onChange={(e) => setSelectedNoteIndex(prev => ({ ...prev, [rIdx]: Number(e.target.value) }))}
                            disabled={notesCount === 0}
                            className="h-9 px-3 rounded-lg border border-zinc-300 bg-zinc-100 hover:bg-zinc-200 text-black font-extrabold text-xs outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                          >
                            {notesCount === 0 ? (
                              <option value={0}>0 Notes</option>
                            ) : (
                              notesList.map((_, nIdx) => (
                                <option key={nIdx} value={nIdx}>
                                  Note {nIdx + 1}
                                </option>
                              ))
                            )}
                          </select>
                        </div>

                        {/* Active Selected Note Display Card */}
                        {notesCount > 0 && selectedNote && (
                          <div className="p-2.5 rounded-lg bg-zinc-50 border border-zinc-200 flex items-center justify-between gap-3 text-xs">
                            <div className="flex-1 flex items-center gap-2 min-w-0">
                              <span className="text-[10px] font-black text-zinc-600 bg-zinc-200 px-2 py-0.5 rounded flex-shrink-0 uppercase">
                                Note {activeNoteIdx + 1}
                              </span>
                              <input
                                value={selectedNote.text}
                                onChange={(e) => handleEditNoteInRound(rIdx, activeNoteIdx, e.target.value)}
                                className="flex-1 bg-transparent text-xs text-black font-bold outline-none"
                                placeholder="Edit note..."
                              />
                              <span className="text-[10px] text-zinc-400 whitespace-nowrap flex-shrink-0 font-medium">
                                📅 {selectedNote.date}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeleteNoteFromRound(rIdx, activeNoteIdx)}
                              title="Delete this note"
                              className="text-zinc-400 hover:text-rose-600 p-1 rounded transition-colors cursor-pointer flex-shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* "ADD FOLLOW UP" Button (Capital, Black Style, Single + Icon) */}
                <button
                  type="button"
                  onClick={handleAddFollowUpStage}
                  className="w-full py-2.5 border-2 border-dashed border-zinc-900 hover:border-black bg-zinc-50 hover:bg-zinc-100 text-black font-black text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs active:scale-98"
                >
                  <Plus className="w-4 h-4 text-black" />
                  <span>ADD FOLLOW UP {infoPopupFollowUps.length + 1}</span>
                </button>

                {/* ── Contact Details (Collapsible at Bottom under Add Follow Up button) ── */}
                <div className="border border-zinc-200 rounded-xl overflow-hidden bg-zinc-50/50 mt-4">
                  <button
                    type="button"
                    onClick={() => setShowMoreInfo(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-zinc-100 transition-all text-xs font-bold text-gray-700 cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-[#00a884]" />
                      Lead & Contact Profile Details
                    </span>
                    {showMoreInfo ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </button>

                  {showMoreInfo && (
                    <div className="p-4 border-t border-zinc-200 space-y-3 bg-white">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <InfoField
                          icon={<Briefcase className="w-3.5 h-3.5 text-gray-400" />}
                          label="Business Name"
                          value={infoPopupLead.businessName || ''}
                          onChange={v => handlePopupLeadFieldEdit('businessName', v)}
                        />
                        <InfoField
                          icon={<User className="w-3.5 h-3.5 text-gray-400" />}
                          label="Person Name"
                          value={infoPopupLead.personName || ''}
                          onChange={v => handlePopupLeadFieldEdit('personName', v)}
                        />
                        <InfoField
                          icon={<Phone className="w-3.5 h-3.5 text-gray-400" />}
                          label="Phone Number"
                          value={infoPopupLead.phone || ''}
                          onChange={v => handlePopupLeadFieldEdit('phone', v)}
                        />
                        <InfoField
                          icon={<Briefcase className="w-3.5 h-3.5 text-gray-400" />}
                          label="Designation / Role"
                          value={infoPopupLead.role || ''}
                          onChange={v => handlePopupLeadFieldEdit('role', v)}
                        />
                        <InfoField
                          icon={<Mail className="w-3.5 h-3.5 text-gray-400" />}
                          label="Email"
                          value={infoPopupLead.email || ''}
                          onChange={v => handlePopupLeadFieldEdit('email', v)}
                        />
                        <InfoField
                          icon={<Globe className="w-3.5 h-3.5 text-gray-400" />}
                          label="Website"
                          value={infoPopupLead.businessWebsite || ''}
                          onChange={v => handlePopupLeadFieldEdit('businessWebsite', v)}
                          isLink
                        />
                        <InfoField
                          icon={<Linkedin className="w-3.5 h-3.5 text-[#0a66c2]" />}
                          label="LinkedIn Profile"
                          value={infoPopupLead.linkedinProfile || ''}
                          onChange={v => handlePopupLeadFieldEdit('linkedinProfile', v)}
                          isLink
                        />
                        <InfoField
                          icon={<Facebook className="w-3.5 h-3.5 text-[#1877f2]" />}
                          label="Facebook Profile"
                          value={infoPopupLead.facebookProfile || ''}
                          onChange={v => handlePopupLeadFieldEdit('facebookProfile', v)}
                          isLink
                        />
                        <InfoField
                          icon={<Instagram className="w-3.5 h-3.5 text-[#e1306c]" />}
                          label="Instagram Profile"
                          value={infoPopupLead.instaProfile || ''}
                          onChange={v => handlePopupLeadFieldEdit('instaProfile', v)}
                          isLink
                        />
                      </div>

                      {/* Extra Columns from uploaded Excel file */}
                      {infoPopupLead.customFields && Object.keys(infoPopupLead.customFields).length > 0 && (
                        <div className="border-t border-gray-200 pt-3 mt-3 space-y-2">
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Extra Excel Columns</p>
                          {Object.entries(infoPopupLead.customFields).map(([k, v]) => (
                            <div key={k} className="flex items-center gap-3 bg-gray-50 p-2.5 rounded-xl border border-gray-200 text-xs">
                              <span className="font-bold text-gray-600 min-w-[110px]">{k}:</span>
                              <span className="font-semibold text-black flex-1 truncate">{String(v)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-3 rounded-b-2xl">
              <button
                type="button"
                onClick={() => setInfoPopupLead(null)}
                className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveInfoPopup}
                disabled={infoSaving}
                className="px-6 py-2 bg-black hover:bg-zinc-800 text-white font-black text-xs rounded-xl transition-all shadow-sm active:scale-95 disabled:opacity-60 flex items-center gap-2 cursor-pointer"
              >
                {infoSaving ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>{infoSaving ? 'Saving...' : 'Save Changes'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          ADD DATA POPUP
      ══════════════════════════════════════════════════════════════════════ */}
      {showAddPopup && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 text-black font-sans">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-gray-200 flex flex-col max-h-[90vh] overflow-hidden">
            
            {/* Header */}
            <div className="px-6 py-5 border-b border-gray-200 flex items-center justify-between bg-[#f8f9fa] rounded-t-2xl">
              <h3 className="text-2xl font-black text-black tracking-tight flex items-center gap-2">
                <Plus className="w-5 h-5 text-[#00a884]" />
                Add New Contact
              </h3>
              <button onClick={() => setShowAddPopup(false)} className="w-9 h-9 rounded-full bg-white hover:bg-gray-200 flex items-center justify-center text-gray-700 transition-all shadow-sm border border-gray-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 p-6 space-y-4">
              {/* Phone — mandatory (GREEN) */}
              <div>
                <label className="text-xs font-black text-black uppercase tracking-wider block mb-1.5">
                  Phone Number <span className="text-[#00a884] font-black">* (Mandatory)</span>
                </label>
                <input
                  type="tel"
                  value={addForm.phone || ''}
                  onChange={e => setAddForm(f => ({ ...f, phone: e.target.value, phoneError: '' }))}
                  placeholder="e.g. 9773266714"
                  className={`w-full px-4 py-2.5 text-xs font-extrabold text-[#00a884] rounded-xl border ${addForm.phoneError ? 'border-rose-400 bg-rose-50' : 'border-gray-300 bg-gray-50'} focus:bg-white focus:border-[#00a884] focus:outline-none transition-all`}
                />
                {addForm.phoneError && <p className="text-rose-600 text-xs font-bold mt-1">{addForm.phoneError}</p>}
              </div>

              {/* Only 4 optional fields: Business Name, Person Name, Email, Note */}
              {([
                ['businessName', 'Business Name', 'e.g. RnB Fashion'],
                ['personName', 'Person Name', 'e.g. Rambhibai Bhatiya'],
                ['email', 'Email', 'e.g. info@example.com'],
                ['note', 'Note', 'Any initial note or remark...'],
              ] as [string, string, string][]).map(([field, label, ph]) => (
                <div key={field}>
                  <label className="text-xs font-black text-black uppercase tracking-wider block mb-1.5">
                    {label} <span className="text-gray-400 font-semibold normal-case">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={(addForm as any)[field] || ''}
                    onChange={e => setAddForm(f => ({ ...f, [field]: e.target.value }))}
                    placeholder={ph}
                    className="w-full px-4 py-2.5 text-xs font-semibold rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-black focus:outline-none transition-all"
                  />
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 bg-[#f8f9fa] rounded-b-2xl flex items-center justify-between">
              <button onClick={() => setShowAddPopup(false)} className="px-4 py-2 text-xs font-extrabold text-gray-700 hover:text-black transition-colors">
                Cancel
              </button>
              <button
                onClick={handleAddData}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#00a884] hover:bg-[#008f70] text-white font-extrabold text-xs rounded-xl transition-all shadow-md active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>Add Contact</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── STATUS BREAKDOWN POPUP MODAL ── */}
      {showStatusModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 text-black font-sans">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden animate-in fade-in zoom-in duration-150">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-emerald-50/50">
              <div>
                <h3 className="text-lg font-black text-emerald-950 flex items-center gap-2">
                  <PhoneCall className="w-5 h-5 text-emerald-600" />
                  Status Breakdown
                </h3>
                <p className="text-xs font-semibold text-emerald-700 mt-0.5">Summary of all call statuses</p>
              </div>
              <button onClick={() => setShowStatusModal(false)} className="w-8 h-8 rounded-full bg-white hover:bg-gray-200 flex items-center justify-center text-gray-700 transition-all border border-gray-200 shadow-sm">
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Body */}
            <div className="p-6 space-y-3 font-sans">
              {([
                ['Interested', leads.filter(l => l.callStatus === 'INTERESTED').length, 'text-emerald-900', 'bg-emerald-50', 'border-emerald-200', '👍'],
                ['Warm', leads.filter(l => l.callStatus === 'WARM' || l.callStatus === 'YES').length, 'text-amber-900', 'bg-amber-50', 'border-amber-200', '🔥'],
                ['Not Interested', leads.filter(l => l.callStatus === 'NOT_INTERESTED').length, 'text-rose-900', 'bg-rose-50', 'border-rose-200', '👎'],
                ['Not Connected / Pending', leads.filter(l => l.callStatus === 'NOT_CONNECTED' || l.callChoice === 'NO' || !l.callStatus || l.callStatus === 'PENDING').length, 'text-zinc-900', 'bg-zinc-50', 'border-zinc-200', '⏳'],
              ] as [string, number, string, string, string, string][]).map(([label, count, textColor, cardBg, cardBorder, emoji]) => (
                <div key={label} className={`p-4 rounded-xl border ${cardBg} ${cardBorder} flex items-center justify-between`}>
                  <div className={`flex items-center gap-2.5 text-sm font-extrabold ${textColor}`}>
                    <span className="text-base">{emoji}</span>
                    <span>{label}</span>
                  </div>
                  <span className="font-black text-black text-xl">{count}</span>
                </div>
              ))}
            </div>
            {/* Footer */}
            <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex justify-end">
              <button onClick={() => setShowStatusModal(false)} className="px-5 py-2 bg-black hover:bg-zinc-800 text-white font-bold text-xs rounded-xl transition-all shadow-sm">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── INTERESTED CONTACTS POPUP MODAL ── */}
      {showInterestedModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 text-black font-sans">
          <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-gray-200 flex flex-col max-h-[85vh] overflow-hidden animate-in fade-in zoom-in duration-150">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-purple-50/60">
              <div>
                <h3 className="text-lg font-black text-purple-950 flex items-center gap-2">
                  <User className="w-5 h-5 text-purple-600" />
                  Interested Leads ({leads.filter(l => l.callStatus === 'INTERESTED' || (l.callChoice === 'YES' && (l.callStatus === 'WARM' || l.callStatus === 'YES' || !l.callStatus))).length})
                </h3>
                <p className="text-xs font-semibold text-purple-700 mt-0.5">High potential clients recorded</p>
              </div>
              <button onClick={() => setShowInterestedModal(false)} className="w-8 h-8 rounded-full bg-white hover:bg-gray-200 flex items-center justify-center text-gray-700 transition-all border border-gray-200 shadow-sm">
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Table Body */}
            <div className="overflow-y-auto flex-1 p-6">
              {leads.filter(l => l.callStatus === 'INTERESTED' || (l.callChoice === 'YES' && (l.callStatus === 'WARM' || l.callStatus === 'YES' || !l.callStatus))).length === 0 ? (
                <div className="p-12 text-center text-xs text-gray-400 font-semibold bg-gray-50 rounded-xl border border-gray-200">
                  No interested contacts recorded.
                </div>
              ) : (
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-gray-100 text-gray-700 font-extrabold border-b border-gray-200 uppercase tracking-wider">
                        <th className="p-3">#</th>
                        <th className="p-3">Business Name</th>
                        <th className="p-3">Person Name</th>
                        <th className="p-3">Phone</th>
                        <th className="p-3 text-center">Status</th>
                        <th className="p-3">Note</th>
                        <th className="p-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white font-medium">
                      {leads.filter(l => l.callStatus === 'INTERESTED' || (l.callChoice === 'YES' && (l.callStatus === 'WARM' || l.callStatus === 'YES' || !l.callStatus))).map((lead, idx) => (
                        <tr key={lead.id} className="hover:bg-purple-50/30 transition-colors">
                          <td className="p-3 text-gray-400 font-mono font-bold">{idx + 1}</td>
                          <td className="p-3 font-extrabold text-black">{lead.businessName || '—'}</td>
                          <td className="p-3 font-semibold text-gray-700">{lead.personName || lead.name || '—'}</td>
                          <td className="p-3 font-extrabold text-[#00a884]">{lead.phone || '—'}</td>
                          <td className="p-3 text-center">
                            <span className="px-2.5 py-0.5 text-xs font-bold rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
                              {lead.callStatus || 'Interested'}
                            </span>
                          </td>
                          <td className="p-3 text-gray-600 truncate max-w-[150px]">{lead.note || lead.notesList?.[0]?.text || '—'}</td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => { setShowInterestedModal(false); openInfoPopup(lead); }}
                              className="px-3 py-1 bg-purple-100 hover:bg-purple-200 text-purple-900 font-bold text-xs rounded-lg transition-all border border-purple-300"
                            >
                              Notes
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {/* Footer */}
            <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex justify-end">
              <button onClick={() => setShowInterestedModal(false)} className="px-5 py-2 bg-black hover:bg-zinc-800 text-white font-bold text-xs rounded-xl transition-all shadow-sm">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── FOLLOW-UPS SCHEDULED POPUP MODAL (ALL FUTURE) ── */}
      {showScheduledModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 text-black font-sans">
          <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-gray-200 flex flex-col max-h-[85vh] overflow-hidden animate-in fade-in zoom-in duration-150">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-indigo-50/80">
              <div>
                <h3 className="text-lg font-black text-indigo-950 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-indigo-600" />
                  Follow-ups Scheduled ({scheduledFollowupLeadsList.length})
                </h3>
                <p className="text-xs font-semibold text-indigo-700 mt-0.5">All contacts scheduled for future follow-up dates</p>
              </div>
              <button onClick={() => setShowScheduledModal(false)} className="w-8 h-8 rounded-full bg-white hover:bg-gray-200 flex items-center justify-center text-gray-700 transition-all border border-gray-200 shadow-sm">
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Table Body */}
            <div className="overflow-y-auto flex-1 p-6">
              {scheduledFollowupLeadsList.length === 0 ? (
                <div className="p-12 text-center text-xs text-gray-400 font-semibold bg-gray-50 rounded-xl border border-gray-200">
                  No scheduled follow-up contacts found.
                </div>
              ) : (
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-gray-100 text-gray-700 font-extrabold border-b border-gray-200 uppercase tracking-wider">
                        <th className="p-3">#</th>
                        <th className="p-3">Business Name</th>
                        <th className="p-3">Person Name</th>
                        <th className="p-3">Phone</th>
                        <th className="p-3 font-extrabold text-indigo-700">Follow-up Date</th>
                        <th className="p-3">Note</th>
                        <th className="p-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white font-medium">
                      {scheduledFollowupLeadsList.map((lead, idx) => (
                        <tr key={lead.id} className="hover:bg-indigo-50/30 transition-colors">
                          <td className="p-3 text-gray-400 font-mono font-bold">{idx + 1}</td>
                          <td className="p-3 font-extrabold text-black">{lead.businessName || '—'}</td>
                          <td className="p-3 font-semibold text-gray-700">{lead.personName || lead.name || '—'}</td>
                          <td className="p-3 font-extrabold text-[#00a884]">{lead.phone || '—'}</td>
                          <td className="p-3 font-extrabold text-indigo-800 bg-indigo-50/80 rounded">{lead.followUpDate || '—'}</td>
                          <td className="p-3 text-gray-600 truncate max-w-[150px]">{lead.note || lead.notesList?.[0]?.text || '—'}</td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => { setShowScheduledModal(false); openInfoPopup(lead); }}
                              className="px-3 py-1 bg-indigo-100 hover:bg-indigo-200 text-indigo-900 font-bold text-xs rounded-lg transition-all border border-indigo-300"
                            >
                              Notes
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {/* Footer */}
            <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex justify-end">
              <button onClick={() => setShowScheduledModal(false)} className="px-5 py-2 bg-black hover:bg-zinc-800 text-white font-bold text-xs rounded-xl transition-all shadow-sm">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── FOLLOW-UPS TODAY POPUP MODAL ── */}
      {showFollowupsTodayModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 text-black font-sans">
          <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-gray-200 flex flex-col max-h-[85vh] overflow-hidden animate-in fade-in zoom-in duration-150">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-amber-50/60">
              <div>
                <h3 className="text-lg font-black text-amber-950 flex items-center gap-2">
                  <Briefcase className="w-5 h-5 text-amber-600" />
                  Follow-ups Today ({followupTodayLeadsList.length})
                </h3>
                <p className="text-xs font-semibold text-amber-700 mt-0.5">Contacts scheduled for follow-up today</p>
              </div>
              <button onClick={() => setShowFollowupsTodayModal(false)} className="w-8 h-8 rounded-full bg-white hover:bg-gray-200 flex items-center justify-center text-gray-700 transition-all border border-gray-200 shadow-sm">
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Table Body */}
            <div className="overflow-y-auto flex-1 p-6">
              {followupTodayLeadsList.length === 0 ? (
                <div className="p-12 text-center text-xs text-gray-400 font-semibold bg-gray-50 rounded-xl border border-gray-200">
                  No scheduled follow-up contacts found for today.
                </div>
              ) : (
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-gray-100 text-gray-700 font-extrabold border-b border-gray-200 uppercase tracking-wider">
                        <th className="p-3">#</th>
                        <th className="p-3">Business Name</th>
                        <th className="p-3">Person Name</th>
                        <th className="p-3">Phone</th>
                        <th className="p-3 font-extrabold text-amber-700">Follow-up Date</th>
                        <th className="p-3">Note</th>
                        <th className="p-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white font-medium">
                      {followupTodayLeadsList.map((lead, idx) => (
                        <tr key={lead.id} className="hover:bg-amber-50/30 transition-colors">
                          <td className="p-3 text-gray-400 font-mono font-bold">{idx + 1}</td>
                          <td className="p-3 font-extrabold text-black">{lead.businessName || '—'}</td>
                          <td className="p-3 font-semibold text-gray-700">{lead.personName || lead.name || '—'}</td>
                          <td className="p-3 font-extrabold text-[#00a884]">{lead.phone || '—'}</td>
                          <td className="p-3 font-extrabold text-amber-800 bg-amber-50/80 rounded">{lead.followUpDate || '—'}</td>
                          <td className="p-3 text-gray-600 truncate max-w-[150px]">{lead.note || lead.notesList?.[0]?.text || '—'}</td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => { setShowFollowupsTodayModal(false); openInfoPopup(lead); }}
                              className="px-3 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-xs rounded-lg transition-all border border-amber-300"
                            >
                              Notes
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {/* Footer */}
            <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex justify-end">
              <button onClick={() => setShowFollowupsTodayModal(false)} className="px-5 py-2 bg-black hover:bg-zinc-800 text-white font-bold text-xs rounded-xl transition-all shadow-sm">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE CONFIRMATION POPUP MODAL ── */}
      {deleteConfirmLead && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 text-black font-sans">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-gray-200 overflow-hidden animate-in fade-in zoom-in duration-150 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-black">Remove Call Log?</h3>
                <p className="text-xs text-rose-600 font-bold mt-0.5">Do you really want to remove this?</p>
              </div>
            </div>

            <p className="text-xs text-zinc-600 font-medium bg-zinc-50 p-3 rounded-xl border border-zinc-200">
              This will clear the logged call entry, outcome, and user assignment for <strong className="text-black">{deleteConfirmLead.businessName || deleteConfirmLead.personName || deleteConfirmLead.phone}</strong>. The contact details and original notes will not be deleted.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setDeleteConfirmLead(null)}
                className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleConfirmRemoveCall(deleteConfirmLead)}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Yes, Remove</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Info Field Helper Component ──────────────────────────────────────────────
function InfoField({
  icon, label, value, onChange, isLink = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (v: string) => void;
  isLink?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-shrink-0 w-6 flex items-center justify-center">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-0.5">{label}</p>
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={`Enter ${label.toLowerCase()}...`}
            className="flex-1 px-2 py-1 text-xs rounded-lg border border-gray-200 bg-gray-50 focus:bg-white focus:border-[#00a884] focus:outline-none transition-all min-w-0"
          />
          {isLink && value && (
            <a
              href={value.startsWith('http') ? value : `https://${value}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-[#00a884] transition-colors flex-shrink-0"
              title="Open link"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
