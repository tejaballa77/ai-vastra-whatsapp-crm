'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  ArrowUpRight,
  Upload
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useSocket } from '../context/SocketContext';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CallChoiceType = 'YES' | 'NO' | 'MESSAGE' | 'NOT_ANSWERED' | 'INVALID' | 'PENDING';
export type CallStatusType = 'INTERESTED' | 'WARM' | 'NOT_INTERESTED' | 'NOT_CONNECTED' | 'NOT_REACHABLE' | 'INVALID' | 'PENDING' | string;

export interface NoteEntry {
  text: string;
  date: string; // DD-MM-YYYY
}

export interface FollowUpRound {
  id?: string;
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
  clientLanguage?: string;  // Telugu | Hindi | English
  campaignName?: string;    // Campaign / Batch sheet name
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
  return `${dd}/${mm}/${d.getFullYear()}`;
};

const formatDateDDMMYYYY = (ts?: number | string): string => {
  if (!ts) return getTodayDate();
  if (typeof ts === 'string') {
    const s = ts.trim();
    if (!s || s === '—') return '—';
    if (s.includes('/')) {
      const parts = s.split('/');
      if (parts.length === 3) {
        if (parts[0].length === 2 && parts[2].length === 4) return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
        if (parts[0].length === 4) return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
      }
    }
    if (s.includes('-')) {
      const parts = s.split('-');
      if (parts.length === 3) {
        if (parts[0].length === 2) return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
        if (parts[0].length === 4) return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
      }
    }
  }
  const d = typeof ts === 'number' ? new Date(ts) : new Date(Number(ts) || ts);
  if (isNaN(d.getTime())) return typeof ts === 'string' ? ts.replace(/-/g, '/') : getTodayDate();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

const formatDateTime = (ts?: number | string): string => {
  if (!ts) return '—';
  const d = typeof ts === 'number' ? new Date(ts) : new Date(Number(ts) || ts);
  if (isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const strTime = `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
  return `${dd}/${mm}/${yyyy} at ${strTime}`;
};

export const getLeadFollowUps = (lead: ColdCallLead): FollowUpRound[] => {
  const defaultDate = formatDateDDMMYYYY(lead.createdAt);
  if (lead.followUps && lead.followUps.length > 0) {
    return lead.followUps.map(f => ({
      ...f,
      notesList: (f.notesList && f.notesList.length > 0)
        ? f.notesList.map(n => ({
            ...n,
            date: n.date ? (n.date.includes('/') || n.date.includes('-') ? n.date : formatDateDDMMYYYY(n.date)) : defaultDate
          }))
        : (f.note ? [{ text: f.note, date: f.followUpDate || defaultDate }] : [])
    }));
  }
  const choice = lead.callChoice || (lead.callStatus === 'NOT_CONNECTED' ? 'NO' : (lead.callStatus === 'NOT_REACHABLE' || lead.callStatus === 'INVALID' ? 'INVALID' : (lead.callStatus && lead.callStatus !== 'PENDING' ? 'YES' : 'PENDING')));
  return [{
    id: `fu_${lead.id}_1`,
    roundNumber: 1,
    callChoice: choice,
    callStatus: lead.callStatus || 'PENDING',
    followUpDate: lead.followUpDate || '',
    note: lead.note || '',
    notesList: (lead.notesList && lead.notesList.length > 0)
      ? lead.notesList.map(n => ({
          ...n,
          date: n.date ? (n.date.includes('/') || n.date.includes('-') ? n.date : formatDateDDMMYYYY(n.date)) : defaultDate
        }))
      : (lead.note ? [{ text: lead.note, date: lead.followUpDate || defaultDate }] : []),
    calledBy: lead.calledBy,
    updatedAt: lead.updatedAt,
  }];
};

// Map raw Excel header to our field keys with intelligent multi-followup detection
// Map raw Excel header to our field keys with user-selected notes date tag
const mapExcelRow = (row: Record<string, any>, idx: number, userNotesDate?: string): Partial<ColdCallLead> => {
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
  let phone = get('phonenumber', 'phone', 'mobile', 'cell', 'number') || '';
  if (!phone) {
    for (const v of Object.values(row)) {
      if (!v) continue;
      const digits = String(v).replace(/\D/g, '');
      if (digits.length >= 10 && digits.length <= 13) {
        phone = String(v).trim();
        break;
      }
    }
  }
  const businessWebsite = get('businesswebsite', 'website', 'url', 'web') || '';
  const role          = get('role', 'designation', 'position', 'title') || '';
  const email         = get('email', 'mail') || '';
  const linkedinProfile = get('linkedin', 'linkedinprofile') || '';
  const facebookProfile = get('facebook', 'facebookprofile', 'fb') || '';
  const instaProfile  = get('insta', 'instagram', 'instaprofile') || '';

  // Only set BDM if explicitly present in Excel file! (Do NOT default to current logged in user)
  const rawBdm = get('bdm', 'bdmname', 'callby', 'calledby', 'caller', 'agent', 'staff') || '';
  const calledBy = rawBdm ? rawBdm : undefined;

  // Only set Status if explicitly present in Excel file! (Do NOT default to PENDING)
  const rawStatus = get('status', 'callstatus', 'leadstatus') || '';
  const rawAction = get('action', 'callchoice', 'choice') || '';

  let callChoice: CallChoiceType | undefined = undefined;
  let callStatus: CallStatusType | undefined = undefined;

  if (rawAction) {
    const actUpper = rawAction.toUpperCase();
    if (actUpper.includes('YES')) callChoice = 'YES';
    else if (actUpper.includes('NO')) callChoice = 'NO';
    else if (actUpper.includes('MESSAGE')) callChoice = 'MESSAGE';
    else if (actUpper.includes('NOT_ANSWERED') || actUpper.includes('NOT ANSWERED')) callChoice = 'NOT_ANSWERED';
    else if (actUpper.includes('INVALID')) callChoice = 'INVALID';
  }

  if (rawStatus) {
    const statUpper = rawStatus.toUpperCase();
    if (statUpper.includes('INTERESTED') && !statUpper.includes('NOT')) callStatus = 'INTERESTED';
    else if (statUpper.includes('NOT_INTERESTED') || statUpper.includes('NOT INTERESTED')) callStatus = 'NOT_INTERESTED';
    else if (statUpper.includes('FOLLOW_UP') || statUpper.includes('FOLLOW UP')) callStatus = 'FOLLOW_UP';
    else if (statUpper.includes('WARM')) callStatus = 'WARM';
  }

  const id = `lead_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`;
  const noteText = get('note', 'notes', 'remark', 'comment', 'description') || '';
  const followUpDate = get('followupdate', 'followup', 'date') || '';

  // Use user-selected notesEnteredDate (or extracted date, or today)
  const tagDate = userNotesDate ? userNotesDate : (followUpDate || getTodayDate());

  const followUpRounds: FollowUpRound[] = [];
  if (noteText || followUpDate || callStatus || callChoice) {
    followUpRounds.push({
      id: `fu_${id}_1`,
      roundNumber: 1,
      callChoice: callChoice,
      callStatus: callStatus,
      followUpDate,
      note: noteText,
      notesList: noteText ? [{ text: noteText, date: tagDate }] : [],
      calledBy,
      updatedAt: Date.now(),
    });
  }

  // Collect any remaining extra columns into customFields
  const customFields: Record<string, string> = {};
  const standardKeywords = ['business', 'company', 'person', 'name', 'phone', 'website', 'role', 'email', 'linkedin', 'facebook', 'insta', 'note', 'call', 'status', 'followup', 'date', 'bdm'];
  for (const [k, v] of Object.entries(row)) {
    const cleanKey = k.toLowerCase().replace(/[\s_-]/g, '');
    const isStandard = standardKeywords.some(sk => cleanKey.includes(sk));
    if (!isStandard && v !== undefined && v !== null && String(v).trim() !== '') {
      customFields[k] = String(v).trim();
    }
  }

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
    note: noteText,
    notesList: noteText ? [{ text: noteText, date: tagDate }] : [],
    callChoice,
    callStatus,
    followUpDate,
    calledBy,
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
  const [filterTab, setFilterTab] = useState<'PROSPECTS' | 'INTERESTED' | 'NOT_INTERESTED' | 'FOLLOW_UPS' | 'ALL'>('PROSPECTS');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [activeSelectedLeadId, setActiveSelectedLeadId] = useState<string | null>(null);
  const [shakingPromptLeadId, setShakingPromptLeadId] = useState<string | null>(null);

  // Reset pagination on filter or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filterTab, searchQuery]);

  // Upload Modal State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Centered CRM Custom Alert Modal State
  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type?: 'warning' | 'error' | 'info';
  } | null>(null);

  const showAlert = (message: string, title: string = 'Notice', type: 'warning' | 'error' | 'info' = 'warning') => {
    setAlertModal({ isOpen: true, title, message, type });
  };

  const currentUserName = typeof window !== 'undefined'
    ? (localStorage.getItem('crm_user_name') || localStorage.getItem('crm_user_display') || localStorage.getItem('crm_admin_display_name') || localStorage.getItem('crm_admin_username') || 'Teja')
    : 'Teja';

  // Inline edit tracking: Map<leadId, partial changes>
  const [editedRows, setEditedRows] = useState<Map<string, Partial<ColdCallLead>>>(new Map());
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [infoPopupLead, setInfoPopupLead] = useState<ColdCallLead | null>(null);
  const [infoPopupFollowUps, setInfoPopupFollowUps] = useState<FollowUpRound[]>([]);
  const [initialModalSnapshot, setInitialModalSnapshot] = useState<string>('');
  const [noteInputText, setNoteInputText] = useState('');
  const [showMoreInfo, setShowMoreInfo] = useState(false);
  const [infoSaving, setInfoSaving] = useState(false);

  // Add Data popup
  const [showAddPopup, setShowAddPopup] = useState(false);
  const [showAddProfileDetails, setShowAddProfileDetails] = useState(false);
  const [addForm, setAddForm] = useState<Partial<ColdCallLead> & { phoneError?: string; bdmError?: string }>({});

  // Upload Excel popup custom note date option
  const [uploadNotesDate, setUploadNotesDate] = useState<string>('18/08/2026');

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

  // Upload file input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Column Width Resizing State ─────────────────────────────────────────────
  const [colWidths, setColWidths] = useState<Record<string, number>>({
    index: 70,
    businessName: 260,
    personName: 220,
    phone: 180,
    bdm: 160,
    status: 160,
    info: 120,
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

  // ── Fetch & Real-time Sync ──────────────────────────────────────────────────
  const fetchLeads = useCallback(async (isBackground = false) => {
    try {
      if (!isBackground) setLoading(true);
      const res = await fetch(`${getBackendUrl()}/api/cold-calls`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setLeads(data as ColdCallLead[]);
      }
    } catch (e) {
      console.error('fetchLeads error', e);
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, []);

  useEffect(() => { 
    fetchLeads(); 
    const interval = setInterval(() => fetchLeads(true), 4000);
    return () => clearInterval(interval);
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

  // ── Select Active Lead / Toggle Contacted Status via Row Number Button ──────
  const handleToggleContacted = async (lead: ColdCallLead) => {
    const isCurrentlyClaimed = Boolean(
      lead.calledBy &&
      lead.calledBy.trim().length > 0 &&
      lead.calledBy !== 'Executive User' &&
      lead.calledBy !== 'Staff'
    );


    const now = Date.now();
    const isClaimedByMe = isCurrentlyClaimed && lead.calledBy === currentUserName;

    // Enforce: User cannot move to another lead without entering Action/Status for the currently active lead
    if (!isClaimedByMe && activeSelectedLeadId && activeSelectedLeadId !== lead.id) {
      const activeLead = leads.find(l => l.id === activeSelectedLeadId);
      if (activeLead && activeLead.calledBy === currentUserName) {
        const activeStatusDisplay = getLeadStatusDisplay(activeLead);
        if (!activeStatusDisplay) {
          setShakingPromptLeadId(activeLead.id);
          setTimeout(() => setShakingPromptLeadId(null), 3500);
          return;
        }
      }
    }
    
    // Toggle: if claimed by me, clicking again unchecks/removes claim!
    const newCalledBy = isClaimedByMe ? '' : currentUserName;

    if (isClaimedByMe) {
      if (activeSelectedLeadId === lead.id) {
        setActiveSelectedLeadId(null);
      }
    } else {
      setActiveSelectedLeadId(lead.id);
    }

    const fRounds = getLeadFollowUps(lead);
    const updatedRounds = fRounds.map(r => ({
      ...r,
      calledBy: newCalledBy || undefined,
      updatedAt: now,
    }));

    const partial: Partial<ColdCallLead> = {
      calledBy: newCalledBy || undefined,
      callTimestamp: newCalledBy ? now : undefined,
      followUps: updatedRounds,
      updatedAt: now,
    };

    // Immediate optimistic state update
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, ...partial, calledBy: newCalledBy } : l));

    try {
      await fetch(`${getBackendUrl()}/api/cold-calls/${lead.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          calledBy: newCalledBy,
          callTimestamp: newCalledBy ? now : null,
          followUps: updatedRounds,
          updatedAt: now,
        }),
      });
    } catch (err) {
      console.error('Failed to toggle contacted lead:', err);
    }
  };

  // ── Update Action Choice directly from Table Row ───────────────────────────
  const handleActionChange = async (lead: ColdCallLead, newChoice: CallChoiceType) => {
    const now = Date.now();
    const isCurrentlyClaimed = Boolean(
      lead.calledBy &&
      lead.calledBy.trim().length > 0 &&
      lead.calledBy !== 'Executive User' &&
      lead.calledBy !== 'Staff'
    );



    const fRounds = getLeadFollowUps(lead);
    const updatedRounds = [...fRounds];
    if (updatedRounds[0]) {
      updatedRounds[0] = {
        ...updatedRounds[0],
        callChoice: newChoice,
        calledBy: lead.calledBy && lead.calledBy !== 'Staff' && lead.calledBy !== 'Executive User' ? lead.calledBy : currentUserName,
        updatedAt: now,
      };
    }

    const assignedBdm = lead.calledBy && lead.calledBy !== 'Staff' && lead.calledBy !== 'Executive User' ? lead.calledBy : currentUserName;

    const partial: Partial<ColdCallLead> = {
      callChoice: newChoice,
      calledBy: assignedBdm,
      followUps: updatedRounds,
      updatedAt: now,
    };

    // Set active lead
    setActiveSelectedLeadId(lead.id);

    // Immediate optimistic update
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, ...partial, calledBy: assignedBdm } : l));

    try {
      await fetch(`${getBackendUrl()}/api/cold-calls/${lead.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partial),
      });
    } catch (err) {
      console.error('Failed to update action choice:', err);
    }
  };

  // ── Lead Action & Status Helpers ───────────────────────────────────────────
  const getLeadActionChoice = (lead: ColdCallLead): CallChoiceType => {
    const fRounds = getLeadFollowUps(lead);
    const round = fRounds[0];
    return round?.callChoice || lead.callChoice || 'PENDING';
  };

  const getLeadStatusDisplay = (lead: ColdCallLead): string => {
    const fRounds = getLeadFollowUps(lead);
    const round = fRounds[0];
    const choice = round?.callChoice || lead.callChoice;
    const status = round?.callStatus || lead.callStatus || lead.callOutcome;

    if (status === 'INTERESTED' || lead.callOutcome === 'INTERESTED') return 'Interested';
    if (status === 'NOT_INTERESTED' || lead.callOutcome === 'NOT_INTERESTED') return 'Not Interested';
    if (status === 'FOLLOW_UP' || lead.callOutcome === 'FOLLOW_UP') return 'Follow up';
    if (status === 'WARM' || lead.callOutcome === 'WARM') return 'Warm';

    if (choice === 'YES') {
      if (status === 'PENDING') return 'Call - Yes';
      return status || 'Call - Yes';
    }
    if (choice === 'NO') return 'Call - No';
    if (choice === 'MESSAGE') return 'Message';
    if (choice === 'NOT_ANSWERED') return 'Not answered';
    if (choice === 'INVALID') {
      if (status === 'NOT_REACHABLE') return 'Not reachable';
      if (status === 'INVALID') return 'Invalid';
      return status || 'Invalid';
    }
    if (status && status !== 'PENDING') {
      if (status === 'INTERESTED') return 'Interested';
      if (status === 'NOT_INTERESTED') return 'Not Interested';
      if (status === 'FOLLOW_UP') return 'Follow up';
      if (status === 'WARM') return 'Warm';
      if (status === 'DEMO_GOOGLE_MEET') return 'Demo(Google meet)';
      return status;
    }
    return '';
  };

  // ── Helper: Get Lead BDM / Called By (ONLY for STATUS entered leads or active call) ─
  const getLeadCaller = (lead: ColdCallLead): string => {
    const statusDisp = getLeadStatusDisplay(lead);
    
    // If NO status is entered, only show if currently active in call; otherwise leave empty (—)
    if (!statusDisp || statusDisp.trim().length === 0) {
      if (activeSelectedLeadId === lead.id && lead.calledBy && lead.calledBy.trim().length > 0 && lead.calledBy !== 'Executive User' && lead.calledBy !== 'Staff') {
        return lead.calledBy.trim();
      }
      return '';
    }

    // STATUS is entered: return caller username
    if (lead.calledBy && lead.calledBy.trim().length > 0 && lead.calledBy !== 'Executive User' && lead.calledBy !== 'Staff') {
      return lead.calledBy.trim();
    }
    const fRounds = getLeadFollowUps(lead);
    for (const r of fRounds) {
      if (r.calledBy && r.calledBy.trim().length > 0 && r.calledBy !== 'Executive User' && r.calledBy !== 'Staff') {
        return r.calledBy.trim();
      }
    }
    return currentUserName;
  };

  // ── Helper: Get Lead Follow Up Date ────────────────────────────────────────
  const getLeadFollowUpDate = (l: ColdCallLead): string => {
    const fRounds = getLeadFollowUps(l);
    for (const r of fRounds) {
      if (r.followUpDate && r.followUpDate.trim() !== '' && r.followUpDate !== '—') {
        return r.followUpDate.trim();
      }
    }
    if (l.followUpDate && l.followUpDate.trim() !== '' && l.followUpDate !== '—') {
      return l.followUpDate.trim();
    }
    return '';
  };

  // ── Helper: Has Follow Up Date ─────────────────────────────────────────────
  const hasFollowUpDate = (l: ColdCallLead): boolean => {
    return Boolean(getLeadFollowUpDate(l));
  };

  // ── Helper: Lead Categorization Helpers ────────────────────────────────────
  const isInterestedLead = (l: ColdCallLead): boolean => {
    const status = l.callStatus;
    const outcome = l.callOutcome;
    const statusDisp = getLeadStatusDisplay(l);
    return status === 'INTERESTED' || outcome === 'INTERESTED' || statusDisp === 'Interested';
  };

  const isNotInterestedLead = (l: ColdCallLead): boolean => {
    const status = l.callStatus;
    const outcome = l.callOutcome;
    const statusDisp = getLeadStatusDisplay(l);
    return status === 'NOT_INTERESTED' || outcome === 'NOT_INTERESTED' || statusDisp === 'Not Interested';
  };

  const isFollowUpLead = (l: ColdCallLead): boolean => {
    return hasFollowUpDate(l) || l.callStatus === 'FOLLOW_UP' || getLeadStatusDisplay(l) === 'Follow up';
  };

  // Prospects are leads that are not Interested and not Not Interested (includes Call-No, Message, Not answered, Pending, and Prospects with scheduled Follow-up dates!)
  const isProspectLead = (l: ColdCallLead): boolean => {
    return !isInterestedLead(l) && !isNotInterestedLead(l);
  };

  // ── Helper: Get Lead Notes Count ───────────────────────────────────────────
  const getLeadNotesCount = (lead: ColdCallLead): number => {
    const fRounds = getLeadFollowUps(lead);
    let count = 0;
    fRounds.forEach(r => {
      if (r.notesList && r.notesList.length > 0) {
        count += r.notesList.length;
      } else if (r.note && r.note.trim() !== '') {
        count += 1;
      }
    });
    if (count === 0) {
      if (lead.notesList && lead.notesList.length > 0) {
        count += lead.notesList.length;
      } else if (lead.note && lead.note.trim() !== '') {
        count += 1;
      }
    }
    return count;
  };

  // ── Upload Cold Calls Sheet Modal Submit ───────────────────────────────────
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      showAlert('Please select an Excel (.xlsx) or CSV file to upload.', 'File Missing', 'warning');
      return;
    }
    setIsUploading(true);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const buffer = evt.target?.result;
        if (!buffer) {
          throw new Error('File buffer could not be read.');
        }
        const dataArr = new Uint8Array(buffer as ArrayBuffer);
        const wb = XLSX.read(dataArr, { type: 'array' });
        const wsName = wb.SheetNames[0];
        if (!wsName || !wb.Sheets[wsName]) {
          throw new Error('No sheet found in workbook.');
        }
        const ws = wb.Sheets[wsName];
        const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
        if (!rows || rows.length === 0) {
          showAlert('The selected file does not contain any data rows.', 'Empty File', 'error');
          setIsUploading(false);
          return;
        }

        const noteTagDate = uploadNotesDate && uploadNotesDate.trim() ? uploadNotesDate.trim() : '18/08/2026';
        const parsedLeads = rows.map((r, i) => mapExcelRow(r, i, noteTagDate));

        const res = await fetch(`${getBackendUrl()}/api/cold-calls/import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leads: parsedLeads }),
        });

        if (!res.ok) {
          throw new Error(`Server returned HTTP ${res.status}`);
        }

        const data = await res.json();
        if (data.success && Array.isArray(data.leads)) {
          setLeads(data.leads);
          setShowUploadModal(false);
          setUploadFile(null);
          triggerSaveToast('saved');
        } else {
          throw new Error(data.error || 'Server failed to import records');
        }
      } catch (err: any) {
        console.error('Upload error', err);
        showAlert(
          `Failed to process upload: ${err?.message || 'Invalid file format'}. Please verify that the file is a valid .xlsx, .xls, or .csv spreadsheet.`,
          'Upload Error',
          'error'
        );
      } finally {
        setIsUploading(false);
      }
    };
    reader.readAsArrayBuffer(uploadFile);
  };

  // ── Upload Excel file trigger ──────────────────────────────────────────────
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFile(file);
    setShowUploadModal(true);
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

  // ── Info & Follow-up Popup ──────────────────────────────────────────────────
  const getRoundNotesList = (round: FollowUpRound, leadCreatedAt?: number): NoteEntry[] => {
    const defaultDate = formatDateDDMMYYYY(leadCreatedAt);
    if (round.notesList && round.notesList.length > 0) {
      return round.notesList.map(n => ({
        ...n,
        date: n.date ? (n.date.includes('/') || n.date.includes('-') ? n.date : formatDateDDMMYYYY(n.date)) : defaultDate
      }));
    }
    if (round.note && round.note.trim()) return [{ text: round.note, date: round.followUpDate || defaultDate }];
    return [];
  };

  const openInfoPopup = (lead: ColdCallLead) => {
    const edited = editedRows.get(lead.id) || {};
    const mergedLead = { ...lead, ...edited };
    setInfoPopupLead(mergedLead);
    const initialFollowUps = getLeadFollowUps(mergedLead);
    const defaultDate = formatDateDDMMYYYY(mergedLead.createdAt);
    const followUpsToSet = initialFollowUps.length > 0 ? initialFollowUps : [{
      id: `fu_${mergedLead.id || 'lead'}_1`,
      roundNumber: 1,
      callChoice: mergedLead.callChoice || 'PENDING',
      callStatus: mergedLead.callStatus || 'PENDING',
      followUpDate: mergedLead.followUpDate || '',
      notesList: (mergedLead.notesList && mergedLead.notesList.length > 0)
        ? mergedLead.notesList.map(n => ({
            ...n,
            date: n.date ? (n.date.includes('/') || n.date.includes('-') ? n.date : formatDateDDMMYYYY(n.date)) : defaultDate
          }))
        : (mergedLead.note ? [{ text: mergedLead.note, date: mergedLead.followUpDate || defaultDate }] : []),
      note: mergedLead.note || '',
      calledBy: mergedLead.calledBy || undefined,
    }];
    setInfoPopupFollowUps(followUpsToSet);
    setNoteInputText('');
    setShowMoreInfo(false);

    // Capture initial snapshot of modal data to detect whether user actually edited anything
    const round0 = followUpsToSet[0] || { roundNumber: 1, callChoice: 'PENDING', callStatus: 'PENDING', notesList: [] };
    const currentNotes = getRoundNotesList(round0, mergedLead.createdAt);
    const snapshot = JSON.stringify({
      businessName: (mergedLead.businessName || '').trim(),
      personName: (mergedLead.personName || mergedLead.name || '').trim(),
      phone: (mergedLead.phone || '').trim(),
      businessWebsite: (mergedLead.businessWebsite || '').trim(),
      role: (mergedLead.role || '').trim(),
      email: (mergedLead.email || '').trim(),
      linkedinProfile: (mergedLead.linkedinProfile || '').trim(),
      facebookProfile: (mergedLead.facebookProfile || '').trim(),
      instaProfile: (mergedLead.instaProfile || '').trim(),
      clientLanguage: (mergedLead.clientLanguage || '').trim(),
      callChoice: round0.callChoice || 'PENDING',
      callStatus: round0.callStatus || 'PENDING',
      followUpDate: round0.followUpDate || '',
      notesList: currentNotes.map(n => (n.text || '').trim()),
    });
    setInitialModalSnapshot(snapshot);
  };

  const handleFollowUpFieldChange = (roundIdx: number, field: keyof FollowUpRound, value: any) => {
    setInfoPopupFollowUps(prev => {
      const next = [...prev];
      const target: FollowUpRound = { ...(next[roundIdx] || { roundNumber: 1, callChoice: 'PENDING', callStatus: 'PENDING' }) };
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
      target.updatedAt = Date.now();
      next[roundIdx] = target;
      return next;
    });
  };

  const handleAddDirectNote = () => {
    const text = noteInputText.trim();
    if (!text) return;
    setInfoPopupFollowUps(prev => {
      const next = [...prev];
      const target: FollowUpRound = { ...(next[0] || { roundNumber: 1, callChoice: 'PENDING', callStatus: 'PENDING' }) };
      const currentList = [...getRoundNotesList(target)];
      const newEntry: NoteEntry = { text, date: getTodayDate() };
      const updatedList = [newEntry, ...currentList];
      target.notesList = updatedList;
      target.note = updatedList[0]?.text || '';
      next[0] = target;
      return next;
    });
    setNoteInputText('');
  };

  const handleEditNoteEntry = (noteIdx: number) => {
    setInfoPopupFollowUps(prev => {
      const next = [...prev];
      const target: FollowUpRound = { ...(next[0] || { roundNumber: 1, callChoice: 'PENDING', callStatus: 'PENDING' }) };
      const currentList = [...getRoundNotesList(target)];
      const itemToEdit = currentList[noteIdx];
      if (itemToEdit) {
        setNoteInputText(itemToEdit.text);
        const updatedList = currentList.filter((_, i) => i !== noteIdx);
        target.notesList = updatedList;
        target.note = updatedList[0]?.text || '';
        next[0] = target;
      }
      return next;
    });
  };

  const handleDeleteNoteEntry = (noteIdx: number) => {
    setInfoPopupFollowUps(prev => {
      const next = [...prev];
      const target: FollowUpRound = { ...(next[0] || { roundNumber: 1, callChoice: 'PENDING', callStatus: 'PENDING' }) };
      const currentList = [...getRoundNotesList(target)];
      const updatedList = currentList.filter((_, i) => i !== noteIdx);
      target.notesList = updatedList;
      target.note = updatedList[0]?.text || '';
      next[0] = target;
      return next;
    });
  };

  const handleSaveInfoPopup = async () => {
    if (!infoPopupLead) return;
    setInfoSaving(true);
    try {
      const now = Date.now();
      let round0 = { ...(infoPopupFollowUps[0] || { roundNumber: 1, callChoice: 'PENDING', callStatus: 'PENDING' }) };
      const pendingText = noteInputText.trim();
      if (pendingText) {
        const newEntry: NoteEntry = { text: pendingText, date: getTodayDate() };
        const currentList = getRoundNotesList(round0);
        round0.notesList = [newEntry, ...currentList];
        round0.note = newEntry.text;
      }
      const finalizedFollowUps = [round0];
      const latestRound = round0;

      const currentNotes = getRoundNotesList(latestRound, infoPopupLead.createdAt);
      const currentSnapshot = JSON.stringify({
        businessName: (infoPopupLead.businessName || '').trim(),
        personName: (infoPopupLead.personName || infoPopupLead.name || '').trim(),
        phone: (infoPopupLead.phone || '').trim(),
        businessWebsite: (infoPopupLead.businessWebsite || '').trim(),
        role: (infoPopupLead.role || '').trim(),
        email: (infoPopupLead.email || '').trim(),
        linkedinProfile: (infoPopupLead.linkedinProfile || '').trim(),
        facebookProfile: (infoPopupLead.facebookProfile || '').trim(),
        instaProfile: (infoPopupLead.instaProfile || '').trim(),
        clientLanguage: (infoPopupLead.clientLanguage || '').trim(),
        callChoice: latestRound?.callChoice || 'PENDING',
        callStatus: latestRound?.callStatus || 'PENDING',
        followUpDate: latestRound?.followUpDate || '',
        notesList: currentNotes.map(n => (n.text || '').trim()),
      });

      const isDataChanged = currentSnapshot !== initialModalSnapshot;

      // Update BDM (calledBy) to current user ONLY IF data was edited/changed!
      // If user just opened the popup, did not edit anything, and clicked Save -> keep existing calledBy intact!
      let newCalledBy = infoPopupLead.calledBy;
      if (isDataChanged) {
        newCalledBy = currentUserName;
      } else if (!newCalledBy || newCalledBy === 'Executive User' || newCalledBy === 'Staff') {
        const isStatusEntered = (latestRound?.callChoice && latestRound.callChoice !== 'PENDING') || 
                               (latestRound?.callStatus && latestRound.callStatus !== 'PENDING') || 
                               Boolean(latestRound?.followUpDate);
        if (isStatusEntered) {
          newCalledBy = currentUserName;
        }
      }

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
        calledBy: newCalledBy || undefined,
        clientLanguage: infoPopupLead.clientLanguage || '',
        callTimestamp: isDataChanged ? now : (infoPopupLead.callTimestamp || now),
        updatedAt: isDataChanged ? now : (infoPopupLead.updatedAt || now),
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
        setActiveSelectedLeadId(null);
        setInfoPopupLead(null);
      }
    } catch (e) {
      console.error('Info save error', e);
    } finally {
      setInfoSaving(false);
    }
  };

  const handleClearLeadFromModal = async () => {
    if (!infoPopupLead) return;
    const confirmName = infoPopupLead.personName || infoPopupLead.businessName || infoPopupLead.phone || 'this contact';
    if (!window.confirm(`Are you sure you want to clear/delete ${confirmName}? This will permanently remove it from the CRM.`)) {
      return;
    }

    try {
      const targetId = infoPopupLead.id;
      const targetPhone = infoPopupLead.phone ? infoPopupLead.phone.replace(/\D/g, '') : '';
      const targetJid = targetPhone ? `${targetPhone}@s.whatsapp.net` : '';

      setLeads(prev => prev.filter(l => l.id !== targetId));
      setInfoPopupLead(null);

      // Call deletion endpoints
      await fetch(`${getBackendUrl()}/api/cold-calls/${targetId}`, { method: 'DELETE' }).catch(() => {});
      if (targetPhone || targetJid) {
        await fetch(`${getBackendUrl()}/api/chats/${encodeURIComponent(targetJid || targetPhone)}`, { method: 'DELETE' }).catch(() => {});
        await fetch(`${getBackendUrl()}/api/crm/contact/clear`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jid: targetJid, phone: targetPhone })
        }).catch(() => {});
      }

      showAlert('Contact cleared and removed from CRM successfully!', 'Lead Cleared', 'info');
    } catch (err) {
      showAlert('Failed to clear contact. Please try again.', 'Error', 'error');
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
    const callChoice = addForm.callChoice || 'PENDING';
    const callStatus = (callChoice === 'YES')
      ? (addForm.callStatus || 'INTERESTED')
      : (callChoice === 'NO' ? 'NOT_CONNECTED' : (addForm.callStatus || 'PENDING'));
    const followUpDate = (addForm.followUpDate || '').trim();
    const noteText = (addForm.note || '').trim();
    
    // Assign BDM if provided, or if an action/status has been entered
    const isStatusEntered = callChoice !== 'PENDING' || (callStatus && callStatus !== 'PENDING') || Boolean(followUpDate);
    const assignedBdm = (addForm.calledBy || '').trim();

    if (isStatusEntered && !assignedBdm) {
      setAddForm(f => ({ ...f, bdmError: 'Please enter BDM name. BDM is mandatory when an Action or Status is entered.' }));
      return;
    }

    const customDt = (addForm as any).customCallDateTime;
    let callTs = now;
    let noteDateTag = getTodayDate();

    if (customDt) {
      const parsedTs = new Date(customDt).getTime();
      if (!isNaN(parsedTs) && parsedTs > 0) {
        callTs = parsedTs;
        noteDateTag = formatDateDDMMYYYY(customDt.split('T')[0]);
      }
    }

    const round0: FollowUpRound = {
      roundNumber: 1,
      callChoice,
      callStatus,
      followUpDate,
      calledBy: assignedBdm || undefined,
      note: noteText,
      notesList: noteText ? [{ text: noteText, date: noteDateTag }] : [],
      updatedAt: callTs,
    };

    const newLead: Partial<ColdCallLead> = {
      businessName: (addForm.businessName || '').trim(),
      personName: (addForm.personName || '').trim(),
      phone: cleanPhone,
      clientLanguage: (addForm.clientLanguage || '').trim(),
      businessWebsite: (addForm.businessWebsite || '').trim(),
      role: (addForm.role || '').trim(),
      email: (addForm.email || '').trim(),
      linkedinProfile: (addForm.linkedinProfile || '').trim(),
      facebookProfile: (addForm.facebookProfile || '').trim(),
      instaProfile: (addForm.instaProfile || '').trim(),
      note: noteText,
      notesList: noteText ? [{ text: noteText, date: noteDateTag }] : [],
      callChoice,
      callStatus,
      followUpDate,
      followUps: [round0],
      calledBy: assignedBdm || undefined,
      callTimestamp: assignedBdm ? callTs : undefined,
      createdAt: callTs,
      updatedAt: callTs,
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
        setShowAddProfileDetails(false);
      }
    } catch (e) {
      console.error('Add data error', e);
    }
  };

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
    prospects: leads.filter(isProspectLead).length,
    interested: leads.filter(isInterestedLead).length,
    notInterested: leads.filter(isNotInterestedLead).length,
    followups: leads.filter(isFollowUpLead).length,
    all: leads.length,
    callsToday: callsMadeTodayCount,
  };

  // ── Filter Leads (Earliest uploaded files on top pages, newly uploaded data below) ──
  const baseLeads = [...leads].sort((a, b) => {
    const timeA = typeof a.createdAt === 'number' ? a.createdAt : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
    const timeB = typeof b.createdAt === 'number' ? b.createdAt : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
    return timeA - timeB;
  });

  let filteredLeads = baseLeads.filter(l => {
    const q = searchQuery.toLowerCase();
    const match =
      (l.businessName || '').toLowerCase().includes(q) ||
      (l.personName || l.name || '').toLowerCase().includes(q) ||
      (l.phone || '').includes(q) ||
      (l.note || '').toLowerCase().includes(q) ||
      (l.followUps || []).some(f => (f.note || '').toLowerCase().includes(q) || (f.notesList || []).some(n => n.text.toLowerCase().includes(q)));
    if (!match) return false;
    if (filterTab === 'PROSPECTS') return isProspectLead(l);
    if (filterTab === 'INTERESTED') return isInterestedLead(l);
    if (filterTab === 'NOT_INTERESTED') return isNotInterestedLead(l);
    if (filterTab === 'FOLLOW_UPS') return isFollowUpLead(l);
    return true; // 'ALL'
  });

  // For INTERESTED, NOT_INTERESTED, FOLLOW_UPS tabs: show latest status update on top!
  if (filterTab === 'INTERESTED' || filterTab === 'NOT_INTERESTED' || filterTab === 'FOLLOW_UPS') {
    filteredLeads.sort((a, b) => {
      const timeA = typeof a.updatedAt === 'number' ? a.updatedAt : (a.updatedAt ? new Date(a.updatedAt).getTime() : 0);
      const timeB = typeof b.updatedAt === 'number' ? b.updatedAt : (b.updatedAt ? new Date(b.updatedAt).getTime() : 0);
      return timeB - timeA;
    });
  }

  // ── Pagination & Permanent Chronological Sequence (No In-Page Floating) ──────
  const PAGE_SIZE = 20;
  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safeCurrentPage - 1) * PAGE_SIZE;
  const endIndex = startIndex + PAGE_SIZE;
  const sortedLeads = filteredLeads.slice(startIndex, endIndex);

  // ── Editable Cell Component (Always Live Excel Editable) ──────────────────────
  const EditableCell = ({
    leadId, field, value, placeholder = '', className = '', disabled = false
  }: {
    leadId: string;
    field: keyof ColdCallLead;
    value: string;
    placeholder?: string;
    className?: string;
    disabled?: boolean;
  }) => {
    const [localVal, setLocalVal] = useState(value);
    const [isFocused, setIsFocused] = useState(false);

    useEffect(() => {
      if (!isFocused) {
        setLocalVal(value);
      }
    }, [value, isFocused]);

    const handleBlur = () => {
      setIsFocused(false);
      if (localVal !== value && !disabled) {
        handleCellEdit(leadId, field, localVal);
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.currentTarget.blur();
      } else if (e.key === 'Escape') {
        setLocalVal(value);
        setIsFocused(false);
      }
    };

    return (
      <input
        type="text"
        value={localVal}
        disabled={disabled}
        onFocus={() => setIsFocused(true)}
        onChange={e => setLocalVal(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={`w-full px-2 py-1.5 text-sm border border-transparent ${disabled ? 'cursor-not-allowed text-zinc-500' : 'hover:border-zinc-400 focus:border-black focus:bg-white'} bg-transparent outline-none transition-all font-semibold ${className || 'text-black'}`}
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
    if (!s || s === '—') return '';
    if (s.includes('T')) return s.split('T')[0];

    // Check if it's already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

    // Check standard delimiters: -, /, .
    const clean = s.replace(/[\/.]/g, '-');
    const parts = clean.split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        // YYYY-MM-DD
        const [yyyy, mm, dd] = parts;
        return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
      } else if (parts[2].length === 4) {
        // DD-MM-YYYY or MM-DD-YYYY
        const [p1, p2, yyyy] = parts;
        if (Number(p1) > 12) {
          return `${yyyy}-${p2.padStart(2, '0')}-${p1.padStart(2, '0')}`;
        } else if (Number(p2) > 12) {
          return `${yyyy}-${p1.padStart(2, '0')}-${p2.padStart(2, '0')}`;
        } else {
          return `${yyyy}-${p2.padStart(2, '0')}-${p1.padStart(2, '0')}`;
        }
      }
    }

    try {
      const parsed = new Date(s);
      if (!isNaN(parsed.getTime())) {
        const yyyy = parsed.getFullYear();
        const mm = String(parsed.getMonth() + 1).padStart(2, '0');
        const dd = String(parsed.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      }
    } catch {}

    return s;
  };

  const todayLocalStr = getLocalYYYYMMDD();

  // All Scheduled Follow-ups (any lead with a scheduled follow-up date)
  const scheduledFollowupLeadsList = leads.filter(l => {
    const fDate = getLeadFollowUpDate(l);
    if (!fDate) return false;
    const normF = normalizeDateStr(fDate);
    return Boolean(normF);
  });

  // Follow-ups Today: Strictly matches today's local date
  const followupTodayLeadsList = leads.filter(l => {
    const fDate = getLeadFollowUpDate(l);
    if (!fDate) return false;
    const normF = normalizeDateStr(fDate);
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
          COLD CALLS LEAD LIST SPREADSHEET
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="space-y-4">
        {/* Top Filter Bar: Tabs on Left | Upload Excel on Right */}
        <div className="bg-white rounded-xl border border-zinc-200 p-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shadow-xs">
          {/* Left Side: Filter Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto flex-wrap">
            {([
              ['PROSPECTS', `Prospects (${counts.prospects})`],
              ['INTERESTED', `Interested (${counts.interested})`],
              ['NOT_INTERESTED', `Not Interested (${counts.notInterested})`],
              ['FOLLOW_UPS', `Follow ups (${counts.followups})`],
              ['ALL', `All (${counts.all})`],
            ] as [any, string][]).map(([tab, label]) => (
              <button
                key={tab}
                onClick={() => setFilterTab(tab)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all whitespace-nowrap cursor-pointer ${
                  filterTab === tab ? 'bg-black text-white shadow-xs' : 'text-zinc-700 bg-zinc-100 hover:bg-zinc-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Right Side: Upload Excel Button */}
          <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
            <button
              type="button"
              onClick={() => {
                setUploadFile(null);
                setShowUploadModal(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#00a884] hover:bg-[#008f70] text-white font-extrabold text-xs rounded-xl transition-all shadow-xs cursor-pointer active:scale-95"
            >
              <Upload className="w-4 h-4" />
              <span>Upload Excel</span>
            </button>
          </div>
        </div>

        {/* TOOLBAR - Search Box on left | Save, Add Data on right */}
        <div className="bg-white rounded-xl border border-zinc-200 p-3 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Left Side: Search Box */}
          <div className="relative min-w-[280px] flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search name, phone, business..."
              className="w-full pl-9 pr-4 py-2 text-sm font-medium rounded-xl border border-zinc-300 bg-zinc-50 focus:bg-white focus:border-black focus:outline-none transition-all text-black"
            />
          </div>

          {/* Right Side: Save, Add Data */}
          <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
            {/* Save Button */}
            <button
              onClick={handleSaveAll}
              disabled={saveStatus === 'saving'}
              className="inline-flex items-center gap-2 px-4 py-2 bg-black hover:bg-zinc-800 text-white font-bold text-xs rounded-xl transition-all shadow-sm active:scale-95 disabled:opacity-60 cursor-pointer"
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
              onClick={() => {
                setAddForm({});
                setShowAddPopup(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#00a884] hover:bg-[#008f70] text-white font-extrabold text-xs rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Data</span>
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
                      <th className="py-2.5 px-3 border border-gray-300 bg-[#e5e7eb] text-gray-800 text-center" style={{ width: `${colWidths.index || 65}px` }}>CHECK</th>
                      
                      <th className="py-2.5 px-3 border border-gray-300 relative group" style={{ width: `${colWidths.businessName || 260}px` }}>
                        <span>BUSINESS NAME</span>
                        <div
                          onMouseDown={(e) => handleMouseDownResize('businessName', e)}
                          className="absolute top-0 right-0 bottom-0 w-2.5 cursor-col-resize hover:bg-black/30 transition-colors z-20"
                          title="Drag to resize column width"
                        />
                      </th>

                      <th className="py-2.5 px-3 border border-gray-300 relative group" style={{ width: `${colWidths.personName || 220}px` }}>
                        <span>PERSON NAME</span>
                        <div
                          onMouseDown={(e) => handleMouseDownResize('personName', e)}
                          className="absolute top-0 right-0 bottom-0 w-2.5 cursor-col-resize hover:bg-black/30 transition-colors z-20"
                          title="Drag to resize column width"
                        />
                      </th>

                      <th className="py-2.5 px-3 border border-gray-300 relative group" style={{ width: `${colWidths.phone || 180}px` }}>
                        <span>PHONE NUMBER</span>
                        <div
                          onMouseDown={(e) => handleMouseDownResize('phone', e)}
                          className="absolute top-0 right-0 bottom-0 w-2.5 cursor-col-resize hover:bg-black/30 transition-colors z-20"
                          title="Drag to resize column width"
                        />
                      </th>

                      <th className="py-2.5 px-3 border border-gray-300 text-center relative group" style={{ width: `${colWidths.bdm || 160}px` }}>
                        <span>BDM</span>
                        <div
                          onMouseDown={(e) => handleMouseDownResize('bdm', e)}
                          className="absolute top-0 right-0 bottom-0 w-2.5 cursor-col-resize hover:bg-black/30 transition-colors z-20"
                          title="Drag to resize column width"
                        />
                      </th>

                      <th className="py-2.5 px-3 border border-gray-300 text-center relative group" style={{ width: `${colWidths.info || 130}px` }}>
                        <span>ACTION</span>
                        <div
                          onMouseDown={(e) => handleMouseDownResize('info', e)}
                          className="absolute top-0 right-0 bottom-0 w-2.5 cursor-col-resize hover:bg-black/30 transition-colors z-20"
                          title="Drag to resize column width"
                        />
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white text-gray-900 font-normal">
                    {sortedLeads.map((lead) => {
                      const isClaimed = Boolean(
                        lead.calledBy &&
                        lead.calledBy.trim().length > 0 &&
                        lead.calledBy !== 'Executive User' &&
                        lead.calledBy !== 'Staff'
                      );
                      const isClaimedByMe = isClaimed && lead.calledBy === currentUserName;
                      const isClaimedByOther = isClaimed && lead.calledBy !== currentUserName;
                      const statusText = getLeadStatusDisplay(lead);
                      const hasEnteredStatus = Boolean(statusText && statusText.trim().length > 0);

                      // Active in call is ONLY when claimed, actively selected, AND no status entered yet!
                      const isActiveInCall = isClaimed && activeSelectedLeadId === lead.id && !hasEnteredStatus;

                      // User is locked from editing other leads if they are currently working on an active lead with no status yet
                      const activeUnfinishedLead = leads.find(l => 
                        l.calledBy === currentUserName && 
                        activeSelectedLeadId === l.id && 
                        (!getLeadStatusDisplay(l) || getLeadStatusDisplay(l).trim().length === 0)
                      );
                      const isRowDisabled = false;

                      const isCompletedRow = hasEnteredStatus || (isClaimed && !isActiveInCall);

                      let rowBgClass = 'bg-white text-zinc-900 font-normal hover:bg-blue-50/40 border-gray-200';
                      let cellBgClass = '';

                      if (isActiveInCall) {
                        rowBgClass = 'bg-red-600 text-white font-extrabold border-red-700 hover:bg-red-700';
                        cellBgClass = 'bg-red-600 border-red-700 text-white';
                      } else if (isCompletedRow) {
                        rowBgClass = 'bg-zinc-200 text-zinc-950 font-semibold border-zinc-400 hover:bg-zinc-300/80';
                        cellBgClass = 'bg-zinc-200 border-zinc-400 text-zinc-950';
                      }

                      return (
                        <tr
                          key={lead.id}
                          className={`transition-colors border-b ${rowBgClass}`}
                        >
                          {/* 1. CHECK Column */}
                          <td className={`py-2 px-2 text-center border ${cellBgClass || 'border-gray-300 bg-[#f9fafb]'}`}>
                            <div className="flex items-center justify-center">
                              <button
                                type="button"
                                onClick={() => handleToggleContacted(lead)}
                                className={`w-6 h-6 rounded-lg transition-all flex items-center justify-center shadow-2xs border ${
                                  isActiveInCall
                                    ? isClaimedByMe
                                      ? 'bg-white border-2 border-white text-red-600 shadow-md ring-2 ring-white/70 cursor-pointer active:scale-90'
                                      : 'bg-white/90 border-2 border-white text-red-600 opacity-95 ring-2 ring-white/60 cursor-not-allowed'
                                    : isCompletedRow
                                    ? 'bg-[#00a884] border-[#00a884] text-white cursor-pointer active:scale-90 shadow-sm'
                                    : 'bg-white hover:bg-zinc-100 border-zinc-300 hover:border-black text-transparent cursor-pointer active:scale-90'
                                }`}
                                title={
                                  isClaimedByOther
                                    ? `🔒 ${isActiveInCall ? 'In call with' : 'Contacted by'} ${lead.calledBy} (Locked)`
                                    : isClaimedByMe
                                    ? `✓ ${isActiveInCall ? 'Currently in call with you' : 'Claimed by you'} (${currentUserName}) (Click to start/uncheck)`
                                    : `Click to start call with ${currentUserName}`
                                }
                              >
                                <Check className={`w-3.5 h-3.5 stroke-[3] ${
                                  isActiveInCall ? 'text-red-600' : (isCompletedRow ? 'text-white' : 'text-transparent')
                                }`} />
                              </button>
                            </div>
                          </td>

                          {/* 2. BUSINESS NAME */}
                          <td className={`py-2 px-3 border ${cellBgClass || 'border-gray-300'}`} style={{ width: `${colWidths.businessName || 260}px` }}>
                            <EditableCell
                              leadId={lead.id}
                              field="businessName"
                              value={lead.businessName || ''}
                              placeholder=""
                              disabled={isRowDisabled}
                              className={
                                isActiveInCall
                                  ? 'text-white font-black placeholder:text-white/60'
                                  : 'text-black font-semibold'
                              }
                            />
                          </td>

                          {/* 3. PERSON NAME */}
                          <td className={`py-2 px-3 border ${cellBgClass || 'border-gray-300'}`} style={{ width: `${colWidths.personName || 220}px` }}>
                            <EditableCell
                              leadId={lead.id}
                              field="personName"
                              value={lead.personName || lead.name || ''}
                              placeholder=""
                              disabled={isRowDisabled}
                              className={
                                isActiveInCall
                                  ? 'text-white font-bold placeholder:text-white/60'
                                  : 'text-black font-semibold'
                              }
                            />
                          </td>

                          {/* 4. PHONE NUMBER */}
                          <td className={`py-2 px-3 border ${cellBgClass || 'border-gray-300'}`} style={{ width: `${colWidths.phone || 180}px` }}>
                            <EditableCell
                              leadId={lead.id}
                              field="phone"
                              value={lead.phone || ''}
                              placeholder=""
                              disabled={isRowDisabled}
                              className={
                                isActiveInCall
                                  ? 'text-emerald-200 font-black tracking-wide placeholder:text-emerald-200/60'
                                  : 'text-[#00a884] font-black tracking-wide'
                              }
                            />
                          </td>

                          {/* 5. BDM (Simple text font, no green container box) */}
                          <td className={`py-2 px-3 border text-center font-bold text-xs ${cellBgClass || 'border-gray-300'}`} style={{ width: `${colWidths.bdm || 160}px` }}>
                            {(() => {
                              const caller = getLeadCaller(lead);
                              if (isActiveInCall) {
                                return (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-black text-white border border-black/80 rounded-lg text-xs font-black shadow-sm">
                                    <span className="w-2 h-2 rounded-full bg-red-400 animate-ping" />
                                    <span>🔴 In Call: {caller || currentUserName}</span>
                                  </span>
                                );
                              }
                              if (caller) {
                                return (
                                  <span className="text-zinc-800 font-semibold text-xs">
                                    {caller}
                                  </span>
                                );
                              }
                              return <span className="text-zinc-400 font-normal">—</span>;
                            })()}
                          </td>

                          {/* 6. ACTION Column (Clean, simple status font) */}
                          <td className={`py-2 px-3 border text-center ${cellBgClass || 'border-gray-300'}`} style={{ width: `${colWidths.info || 130}px` }}>
                            <div className="flex flex-col items-center justify-center gap-1">
                              {/* Plain text in black colour above None button */}
                              {((isActiveInCall && !hasEnteredStatus) || shakingPromptLeadId === lead.id) && (
                                <span className="text-[11px] font-black text-black tracking-tight select-none leading-none animate-bounce">
                                  Enter STATUS
                                </span>
                              )}

                              <button
                                type="button"
                                onClick={() => {
                                  setShakingPromptLeadId(null);
                                  openInfoPopup(lead);
                                }}
                                title={hasEnteredStatus ? `Status: ${statusText} (Click to view/edit)` : 'Click to select action & status'}
                                className={`inline-flex items-center justify-center px-3.5 py-1.5 rounded-xl text-xs transition-all shadow-xs cursor-pointer active:scale-95 ${
                                  isActiveInCall
                                    ? 'bg-white hover:bg-zinc-100 text-black font-black border border-white shadow-md'
                                    : hasEnteredStatus
                                    ? 'bg-zinc-200/90 hover:bg-zinc-300 text-zinc-900 border border-zinc-400 font-bold shadow-2xs'
                                    : 'bg-zinc-100 hover:bg-zinc-200 text-black border border-zinc-300 font-bold'
                                } ${shakingPromptLeadId === lead.id ? 'ring-2 ring-black' : ''}`}
                              >
                                <span>{hasEnteredStatus ? statusText : 'None'}</span>
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

            {/* Pagination Controls */}
            {filteredLeads.length > 0 && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-t border-gray-200 bg-[#fbfbfb] text-xs">
                <div className="font-bold text-zinc-600">
                  Showing <span className="text-black font-extrabold">{startIndex + 1}</span> to{' '}
                  <span className="text-black font-extrabold">{Math.min(filteredLeads.length, endIndex)}</span> of{' '}
                  <span className="text-black font-extrabold">{filteredLeads.length}</span> leads
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    disabled={safeCurrentPage <= 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    className="px-2.5 py-1 rounded-lg border border-zinc-300 bg-white hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed font-extrabold text-zinc-700 transition-all cursor-pointer shadow-2xs"
                  >
                    Prev
                  </button>

                  {Array.from({ length: totalPages }).map((_, i) => {
                    const pNum = i + 1;
                    const isNear = Math.abs(pNum - safeCurrentPage) <= 2 || pNum === 1 || pNum === totalPages;
                    if (!isNear && (pNum === 2 || pNum === totalPages - 1)) {
                      return <span key={`ellipsis_${pNum}`} className="px-1 text-zinc-400 font-bold">...</span>;
                    }
                    if (!isNear) return null;

                    const isCurrent = pNum === safeCurrentPage;
                    return (
                      <button
                        key={`page_${pNum}`}
                        type="button"
                        onClick={() => setCurrentPage(pNum)}
                        className={`w-7 h-7 rounded-lg text-xs font-black transition-all flex items-center justify-center cursor-pointer shadow-2xs ${
                          isCurrent
                            ? 'bg-black text-white border border-black'
                            : 'bg-white text-zinc-700 hover:bg-zinc-100 border border-zinc-300'
                        }`}
                      >
                        {pNum}
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    disabled={safeCurrentPage >= totalPages}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    className="px-2.5 py-1 rounded-lg border border-zinc-300 bg-white hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed font-extrabold text-zinc-700 transition-all cursor-pointer shadow-2xs"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

      {/* ══════════════════════════════════════════════════════════════════════
          INFO & FOLLOW-UP POPUP MODAL
      ══════════════════════════════════════════════════════════════════════ */}
      {infoPopupLead && (() => {
        const isClaimed = Boolean(
          infoPopupLead.calledBy &&
          infoPopupLead.calledBy.trim().length > 0 &&
          infoPopupLead.calledBy !== 'Executive User' &&
          infoPopupLead.calledBy !== 'Staff'
        );
        const isClaimedByMe = isClaimed && infoPopupLead.calledBy === currentUserName;
        const isClaimedByOther = false; // Allow all logged-in users to edit any lead

        const round = infoPopupFollowUps[0] || { roundNumber: 1, callChoice: 'PENDING', callStatus: 'PENDING', notesList: [] };
        const currentCallChoice = round.callChoice || 'PENDING';
        const currentStatus = round.callStatus || 'PENDING';
        const notesList = getRoundNotesList(round);

        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 text-black font-sans">
            <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-gray-200 flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in duration-150">

              {/* Header */}
              <div className="px-8 pt-7 pb-5 border-b border-gray-200 flex items-center justify-between bg-[#f8f9fa] rounded-t-2xl gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-2xl font-black text-black tracking-tight truncate">
                      {infoPopupLead.businessName || infoPopupLead.personName || 'Contact Info & Follow-up'}
                    </h3>
                    {isClaimed && (
                      <span className="px-2.5 py-0.5 bg-blue-50 text-blue-900 border border-blue-200 rounded-full text-xs font-black flex-shrink-0">
                        BDM: {infoPopupLead.calledBy}
                      </span>
                    )}
                  </div>
                  {(infoPopupLead.personName || infoPopupLead.phone) && (
                    <p className="text-sm font-bold text-zinc-500 mt-1 truncate">
                      {infoPopupLead.personName ? infoPopupLead.personName : ''}
                      {infoPopupLead.phone ? `${infoPopupLead.personName ? ' · ' : ''}📞 ${infoPopupLead.phone}` : ''}
                    </p>
                  )}
                </div>

                {/* Client Language Dropdown in Header Right Corner */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="flex items-center gap-2 bg-white border border-zinc-300 rounded-xl px-3.5 py-2 shadow-xs">
                    <span className="text-xs font-black text-zinc-600 uppercase tracking-wider">Client Language:</span>
                    <select
                      value={infoPopupLead.clientLanguage || ''}
                      onChange={(e) => setInfoPopupLead(prev => prev ? { ...prev, clientLanguage: e.target.value } : null)}
                      className="text-sm font-extrabold text-black bg-transparent outline-none cursor-pointer"
                    >
                      <option value="">-- Select Language --</option>
                      <option value="Telugu">Telugu</option>
                      <option value="Hindi">Hindi</option>
                      <option value="English">English</option>
                    </select>
                  </div>

                  <button
                    onClick={() => setInfoPopupLead(null)}
                    className="w-9 h-9 rounded-full bg-white hover:bg-gray-200 flex items-center justify-center text-gray-700 transition-all shadow-sm border border-gray-200 cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* View Only Alert Banner if Claimed by Another User */}
              {isClaimedByOther && (
                <div className="mx-8 mt-4 px-4 py-2.5 bg-amber-50 border border-amber-300 rounded-xl text-xs font-black text-amber-900 flex items-center gap-2 shadow-xs">
                  <span>🔒 View-Only Mode: This contact is claimed by <strong>{infoPopupLead.calledBy}</strong>. Only {infoPopupLead.calledBy} has permission to edit, schedule follow-ups, or add notes.</span>
                </div>
              )}

              {/* Body */}
              <div className="overflow-y-auto flex-1 p-7 space-y-6 font-sans">

                {/* Follow up Sub-header */}
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-black text-black uppercase tracking-wider">
                    Follow up
                  </h4>
                  {round.calledBy && (
                    <span className="text-xs font-bold text-zinc-400">
                      by {round.calledBy}
                    </span>
                  )}
                </div>

                {/* Top Row: ACTION (Choice), STATUS (Conditional), FOLLOW UP DATE */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-stretch">
                  {/* 1. ACTION Choice */}
                  <div className="flex flex-col">
                    <label className="text-xs font-black text-zinc-600 uppercase tracking-wider block mb-1.5">
                      ACTION
                    </label>
                    <select
                      value={currentCallChoice}
                      disabled={isClaimedByOther}
                      onChange={(e) => handleFollowUpFieldChange(0, 'callChoice', e.target.value as CallChoiceType)}
                      className={`w-full h-11 px-3.5 rounded-xl border border-zinc-300 bg-zinc-50 text-sm font-bold text-black outline-none shadow-xs ${
                        isClaimedByOther ? 'cursor-not-allowed opacity-80' : 'cursor-pointer focus:bg-white focus:border-black'
                      }`}
                    >
                      <option value="PENDING">Pending</option>
                      <option value="YES">Call - Yes</option>
                      <option value="NO">Call - No</option>
                      <option value="MESSAGE">Message</option>
                      <option value="NOT_ANSWERED">Not answered</option>
                    </select>
                  </div>

                  {/* 2. STATUS (Conditional on Call Choice) */}
                  <div className="flex flex-col">
                    <label className="text-xs font-black text-zinc-600 uppercase tracking-wider block mb-1.5">
                      STATUS
                    </label>
                    {currentCallChoice === 'YES' ? (
                      <select
                        value={currentStatus}
                        disabled={isClaimedByOther}
                        onChange={(e) => handleFollowUpFieldChange(0, 'callStatus', e.target.value as CallStatusType)}
                        className={`w-full h-11 px-3.5 rounded-xl border border-emerald-300 bg-emerald-50 text-sm font-extrabold text-emerald-900 outline-none shadow-xs ${
                          isClaimedByOther ? 'cursor-not-allowed opacity-80' : 'cursor-pointer focus:bg-white focus:border-emerald-600'
                        }`}
                      >
                        <option value="INTERESTED">Interested</option>
                        <option value="NOT_INTERESTED">Not Interested</option>
                        <option value="FOLLOW_UP">Follow up</option>
                      </select>
                    ) : currentCallChoice === 'NO' ? (
                      <div className="w-full h-11 px-3.5 rounded-xl border border-rose-200 bg-rose-50 text-sm font-extrabold text-rose-800 flex items-center justify-center select-none shadow-xs">
                        Call - No
                      </div>
                    ) : currentCallChoice === 'MESSAGE' ? (
                      <div className="w-full h-11 px-3.5 rounded-xl border border-blue-200 bg-blue-50 text-sm font-extrabold text-blue-800 flex items-center justify-center select-none shadow-xs">
                        Message
                      </div>
                    ) : currentCallChoice === 'NOT_ANSWERED' ? (
                      <div className="w-full h-11 px-3.5 rounded-xl border border-amber-200 bg-amber-50 text-sm font-extrabold text-amber-800 flex items-center justify-center select-none shadow-xs">
                        Not answered
                      </div>
                    ) : (
                      <div className="w-full h-11 px-3.5 rounded-xl border border-zinc-200 bg-zinc-50 text-sm font-semibold text-zinc-400 flex items-center justify-center select-none shadow-xs">
                        —
                      </div>
                    )}
                  </div>

                  {/* 3. FOLLOW UP DATE (Calendar Picker) */}
                  <div className="flex flex-col">
                    <label className="text-xs font-black text-zinc-600 uppercase tracking-wider block mb-1.5">
                      FOLLOW UP DATE
                    </label>
                    <div className={`flex items-center gap-1 w-full h-11 rounded-xl px-3 border transition-all shadow-xs ${
                      round.followUpDate 
                        ? 'bg-emerald-50/70 border-emerald-300 focus-within:border-emerald-600 focus-within:bg-white' 
                        : 'bg-zinc-50 border-zinc-300 focus-within:border-black focus-within:bg-white'
                    } ${isClaimedByOther ? 'opacity-80 cursor-not-allowed' : ''}`}>
                      <input
                        type="date"
                        min={new Date().toISOString().split('T')[0]}
                        disabled={isClaimedByOther}
                        value={normalizeDateStr(round.followUpDate || '')}
                        onChange={(e) => handleFollowUpFieldChange(0, 'followUpDate', e.target.value)}
                        className={`w-full bg-transparent text-sm outline-none ${
                          isClaimedByOther ? 'cursor-not-allowed' : 'cursor-pointer'
                        } ${
                          round.followUpDate ? 'text-[#00a884] font-black' : 'text-gray-400 font-medium'
                        }`}
                      />
                      {!isClaimedByOther && round.followUpDate && (
                        <button
                          type="button"
                          onClick={() => handleFollowUpFieldChange(0, 'followUpDate', '')}
                          title="Clear date"
                          className="text-emerald-600 hover:text-red-500 p-0.5 rounded transition-colors cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── Simplified Note Section ── */}
                <div className="space-y-3 pt-2">
                  <label className="text-xs font-black text-zinc-700 uppercase tracking-wider block">
                    Note
                  </label>

                  {/* Enter note input bar (Only if NOT claimed by another user) */}
                  {!isClaimedByOther && (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={noteInputText}
                        onChange={(e) => setNoteInputText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddDirectNote();
                          }
                        }}
                        placeholder="Enter note..."
                        className="flex-1 h-11 px-4 text-sm rounded-xl border border-zinc-300 bg-zinc-50 focus:bg-white focus:border-[#00a884] focus:outline-none transition-all font-semibold text-black shadow-xs"
                      />
                      <button
                        type="button"
                        onClick={handleAddDirectNote}
                        className="h-11 px-5 bg-[#00a884] hover:bg-[#008f70] text-white font-extrabold text-sm rounded-xl transition-all flex items-center gap-1.5 cursor-pointer flex-shrink-0 shadow-sm active:scale-95"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Add Note</span>
                      </button>
                    </div>
                  )}

                  {/* Notes Table (Date, Note with full multi-line display) */}
                  {notesList.length > 0 && (
                    <div className="border border-zinc-200 rounded-xl overflow-hidden shadow-xs mt-3 bg-white">
                      <div className="max-h-64 overflow-y-auto">
                        <table className="w-full text-left border-collapse text-sm">
                          <thead>
                            <tr className="bg-zinc-100/90 text-zinc-700 font-extrabold border-b border-zinc-200 text-xs uppercase tracking-wider sticky top-0 z-10 backdrop-blur-xs">
                              <th className="py-2.5 px-4 w-36">Date</th>
                              <th className="py-2.5 px-4">Note</th>
                              <th className="py-2.5 px-3 w-12 text-center">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-100 font-medium">
                            {notesList.map((noteItem, nIdx) => (
                              <tr key={nIdx} className="hover:bg-zinc-50/80 transition-colors">
                                <td className="py-3 px-4 align-top whitespace-nowrap">
                                  <span className="px-2.5 py-1 text-xs font-extrabold bg-zinc-100 text-zinc-800 border border-zinc-300 rounded-lg inline-flex items-center gap-1 shadow-2xs">
                                    📅 {noteItem.date ? noteItem.date.replace(/-/g, '/') : '—'}
                                  </span>
                                </td>
                                <td className="py-3 px-4 align-top text-black font-semibold text-sm leading-relaxed whitespace-pre-wrap break-words">
                                  {noteItem.text}
                                </td>
                                <td className="py-3 px-3 align-top text-center">
                                  <button
                                    type="button"
                                    onClick={() => handleEditNoteEntry(nIdx)}
                                    title="Edit this note"
                                    className="text-zinc-600 hover:text-[#00a884] hover:bg-emerald-50 p-1.5 rounded-lg transition-colors cursor-pointer inline-flex items-center justify-center"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Contact Details (ONLY DISPLAYED IF EXTRA DATA / COLUMNS EXIST IN THE FILE) ── */}
                {Boolean(
                  (infoPopupLead.role && infoPopupLead.role.trim()) ||
                  (infoPopupLead.email && infoPopupLead.email.trim()) ||
                  (infoPopupLead.businessWebsite && infoPopupLead.businessWebsite.trim()) ||
                  (infoPopupLead.linkedinProfile && infoPopupLead.linkedinProfile.trim()) ||
                  (infoPopupLead.facebookProfile && infoPopupLead.facebookProfile.trim()) ||
                  (infoPopupLead.instaProfile && infoPopupLead.instaProfile.trim()) ||
                  (infoPopupLead.customFields && Object.keys(infoPopupLead.customFields).length > 0)
                ) && (
                  <div className="border border-zinc-200 rounded-xl overflow-hidden bg-zinc-50/50 mt-4 font-sans">
                    <button
                      type="button"
                      onClick={() => setShowMoreInfo(v => !v)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-100 transition-all text-sm font-bold text-gray-700 cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <User className="w-4 h-4 text-[#00a884]" />
                        Lead & Contact Profile Details
                      </span>
                      {showMoreInfo ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </button>

                    {showMoreInfo && (
                      <div className="p-4 border-t border-zinc-200 space-y-3 bg-white">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {Boolean(infoPopupLead.role && infoPopupLead.role.trim()) && (
                            <InfoField
                              icon={<Briefcase className="w-4 h-4 text-gray-400" />}
                              label="Designation / Role"
                              value={infoPopupLead.role || ''}
                              onChange={v => handlePopupLeadFieldEdit('role', v)}
                            />
                          )}
                          {Boolean(infoPopupLead.email && infoPopupLead.email.trim()) && (
                            <InfoField
                              icon={<Mail className="w-4 h-4 text-gray-400" />}
                              label="Email"
                              value={infoPopupLead.email || ''}
                              onChange={v => handlePopupLeadFieldEdit('email', v)}
                            />
                          )}
                          {Boolean(infoPopupLead.businessWebsite && infoPopupLead.businessWebsite.trim()) && (
                            <InfoField
                              icon={<Globe className="w-4 h-4 text-gray-400" />}
                              label="Website"
                              value={infoPopupLead.businessWebsite || ''}
                              onChange={v => handlePopupLeadFieldEdit('businessWebsite', v)}
                              isLink
                            />
                          )}
                          {Boolean(infoPopupLead.linkedinProfile && infoPopupLead.linkedinProfile.trim()) && (
                            <InfoField
                              icon={<Linkedin className="w-4 h-4 text-[#0a66c2]" />}
                              label="LinkedIn Profile"
                              value={infoPopupLead.linkedinProfile || ''}
                              onChange={v => handlePopupLeadFieldEdit('linkedinProfile', v)}
                              isLink
                            />
                          )}
                          {Boolean(infoPopupLead.facebookProfile && infoPopupLead.facebookProfile.trim()) && (
                            <InfoField
                              icon={<Facebook className="w-4 h-4 text-[#1877f2]" />}
                              label="Facebook Profile"
                              value={infoPopupLead.facebookProfile || ''}
                              onChange={v => handlePopupLeadFieldEdit('facebookProfile', v)}
                              isLink
                            />
                          )}
                          {Boolean(infoPopupLead.instaProfile && infoPopupLead.instaProfile.trim()) && (
                            <InfoField
                              icon={<Instagram className="w-4 h-4 text-[#e1306c]" />}
                              label="Instagram Profile"
                              value={infoPopupLead.instaProfile || ''}
                              onChange={v => handlePopupLeadFieldEdit('instaProfile', v)}
                              isLink
                            />
                          )}
                        </div>

                        {/* Extra Columns from uploaded Excel file */}
                        {infoPopupLead.customFields && Object.keys(infoPopupLead.customFields).length > 0 && (
                          <div className="border-t border-gray-200 pt-3 mt-3 space-y-2">
                            <p className="text-xs font-black text-gray-400 uppercase tracking-wider">Extra Excel Columns</p>
                            {Object.entries(infoPopupLead.customFields).map(([k, v]) => (
                              <div key={k} className="flex items-center gap-3 bg-gray-50 p-2.5 rounded-xl border border-gray-200 text-sm">
                                <span className="font-bold text-gray-600 min-w-[120px]">{k}:</span>
                                <span className="font-semibold text-black flex-1 truncate">{String(v)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-7 py-3.5 border-t border-gray-200 bg-gray-50 flex items-center justify-between gap-3 rounded-b-2xl">
                <button
                  type="button"
                  onClick={handleClearLeadFromModal}
                  className="px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-extrabold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs active:scale-95"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Clear / Delete Lead</span>
                </button>

                <div className="flex items-center gap-3 ml-auto">
                  <button
                    type="button"
                    onClick={() => setInfoPopupLead(null)}
                    className="px-5 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-bold text-sm rounded-xl transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveInfoPopup}
                    disabled={infoSaving}
                    className="px-7 py-2.5 bg-black hover:bg-zinc-800 text-white font-black text-sm rounded-xl transition-all shadow-sm active:scale-95 disabled:opacity-60 flex items-center gap-2 cursor-pointer"
                  >
                    {infoSaving ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    <span>{infoSaving ? 'Saving...' : 'Save Changes'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ══════════════════════════════════════════════════════════════════════
          ADD DATA POPUP (FULL CONTACT & ACTION MODAL)
      ══════════════════════════════════════════════════════════════════════ */}
      {showAddPopup && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 text-black font-sans">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-gray-200 flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in duration-150">
            
            {/* Header */}
            <div className="px-7 py-5 border-b border-gray-200 flex items-center justify-between bg-[#f8f9fa] rounded-t-2xl gap-4">
              <h3 className="text-xl font-black text-black tracking-tight flex items-center gap-2">
                <Plus className="w-5 h-5 text-[#00a884]" />
                Add New Contact
              </h3>

              {/* Language Dropdown & Close */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 bg-white border border-zinc-300 rounded-xl px-3 py-1.5 shadow-xs">
                  <span className="text-[11px] font-black text-zinc-600 uppercase tracking-wider">Language:</span>
                  <select
                    value={addForm.clientLanguage || ''}
                    onChange={(e) => setAddForm(f => ({ ...f, clientLanguage: e.target.value }))}
                    className="text-xs font-extrabold text-black bg-transparent outline-none cursor-pointer"
                  >
                    <option value="">-- Language --</option>
                    <option value="Telugu">Telugu</option>
                    <option value="Hindi">Hindi</option>
                    <option value="English">English</option>
                  </select>
                </div>

                <button
                  onClick={() => {
                    setShowAddPopup(false);
                    setAddForm({});
                    setShowAddProfileDetails(false);
                  }}
                  className="w-8 h-8 rounded-full bg-white hover:bg-gray-200 flex items-center justify-center text-gray-700 transition-all shadow-sm border border-gray-200 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 p-7 space-y-5">
              {/* 1. Core Contact Information Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Phone Number (Mandatory) */}
                <div>
                  <label className="text-xs font-black text-black uppercase tracking-wider block mb-1.5">
                    Phone Number <span className="text-[#00a884] font-black">* (Mandatory)</span>
                  </label>
                  <input
                    type="tel"
                    value={addForm.phone || ''}
                    onChange={e => setAddForm(f => ({ ...f, phone: e.target.value, phoneError: '' }))}
                    placeholder=""
                    className={`w-full px-3.5 py-2.5 text-xs font-extrabold text-[#00a884] rounded-xl border ${addForm.phoneError ? 'border-rose-400 bg-rose-50' : 'border-gray-300 bg-gray-50'} focus:bg-white focus:border-[#00a884] focus:outline-none transition-all shadow-xs`}
                  />
                  {addForm.phoneError && <p className="text-rose-600 text-[11px] font-bold mt-1">{addForm.phoneError}</p>}
                </div>

                {/* Business Name */}
                <div>
                  <label className="text-xs font-black text-black uppercase tracking-wider block mb-1.5">
                    Business Name <span className="text-gray-400 font-semibold normal-case">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={addForm.businessName || ''}
                    onChange={e => setAddForm(f => ({ ...f, businessName: e.target.value }))}
                    placeholder=""
                    className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-gray-300 bg-gray-50 focus:bg-white focus:border-black focus:outline-none transition-all shadow-xs"
                  />
                </div>

                {/* Person Name */}
                <div>
                  <label className="text-xs font-black text-black uppercase tracking-wider block mb-1.5">
                    Person Name <span className="text-gray-400 font-semibold normal-case">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={addForm.personName || ''}
                    onChange={e => setAddForm(f => ({ ...f, personName: e.target.value }))}
                    placeholder=""
                    className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-gray-300 bg-gray-50 focus:bg-white focus:border-black focus:outline-none transition-all shadow-xs"
                  />
                </div>

                {/* BDM / Caller Name */}
                <div>
                  <label className="text-xs font-black text-black uppercase tracking-wider block mb-1.5">
                    BDM / Assigned User {((addForm.callChoice && addForm.callChoice !== 'PENDING') || (addForm.callStatus && addForm.callStatus !== 'PENDING') || Boolean(addForm.followUpDate)) ? (
                      <span className="text-[#00a884] font-black">* (Mandatory when status is entered)</span>
                    ) : (
                      <span className="text-gray-400 font-semibold normal-case">(optional)</span>
                    )}
                  </label>
                  <input
                    type="text"
                    value={addForm.calledBy || ''}
                    onChange={e => setAddForm(f => ({ ...f, calledBy: e.target.value, bdmError: '' }))}
                    placeholder=""
                    className={`w-full px-3.5 py-2.5 text-xs font-extrabold text-emerald-950 rounded-xl border ${
                      addForm.bdmError ? 'border-rose-400 bg-rose-50 ring-1 ring-rose-400' : 'border-emerald-300 bg-emerald-50/40'
                    } focus:bg-white focus:border-emerald-600 focus:outline-none transition-all shadow-xs`}
                  />
                  {addForm.bdmError && <p className="text-rose-600 text-[11px] font-bold mt-1">{addForm.bdmError}</p>}
                </div>
              </div>

              {/* 2. Action & Status Section (Identical to None Action Popup) */}
              <div className="pt-2 border-t border-gray-200 space-y-3">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-black text-black uppercase tracking-wider">
                    ACTION & STATUS (OPTIONAL)
                  </h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-stretch">
                  {/* Action Choice */}
                  <div className="flex flex-col">
                    <label className="text-[11px] font-black text-zinc-600 uppercase tracking-wider block mb-1">
                      ACTION
                    </label>
                    <select
                      value={addForm.callChoice || 'PENDING'}
                      onChange={(e) => {
                        const val = e.target.value as CallChoiceType;
                        setAddForm(f => ({
                          ...f,
                          callChoice: val,
                          callStatus: val === 'YES' ? (f.callStatus || 'INTERESTED') : (val === 'NO' ? 'NOT_CONNECTED' : 'PENDING'),
                        }));
                      }}
                      className="w-full h-10 px-3 rounded-xl border border-zinc-300 bg-zinc-50 text-xs font-bold text-black outline-none shadow-xs focus:bg-white focus:border-black cursor-pointer"
                    >
                      <option value="PENDING">Pending</option>
                      <option value="YES">Call - Yes</option>
                      <option value="NO">Call - No</option>
                      <option value="MESSAGE">Message</option>
                      <option value="NOT_ANSWERED">Not answered</option>
                    </select>
                  </div>

                  {/* Status */}
                  <div className="flex flex-col">
                    <label className="text-[11px] font-black text-zinc-600 uppercase tracking-wider block mb-1">
                      STATUS
                    </label>
                    {addForm.callChoice === 'YES' ? (
                      <select
                        value={addForm.callStatus || 'INTERESTED'}
                        onChange={(e) => setAddForm(f => ({ ...f, callStatus: e.target.value }))}
                        className="w-full h-10 px-3 rounded-xl border border-emerald-300 bg-emerald-50 text-xs font-extrabold text-emerald-900 outline-none shadow-xs focus:bg-white focus:border-emerald-600 cursor-pointer"
                      >
                        <option value="INTERESTED">Interested</option>
                        <option value="NOT_INTERESTED">Not Interested</option>
                        <option value="FOLLOW_UP">Follow up</option>
                      </select>
                    ) : addForm.callChoice === 'NO' ? (
                      <div className="w-full h-10 px-3 rounded-xl border border-rose-200 bg-rose-50 text-xs font-extrabold text-rose-800 flex items-center justify-center select-none shadow-xs">
                        Call - No
                      </div>
                    ) : addForm.callChoice === 'MESSAGE' ? (
                      <div className="w-full h-10 px-3 rounded-xl border border-blue-200 bg-blue-50 text-xs font-extrabold text-blue-800 flex items-center justify-center select-none shadow-xs">
                        Message
                      </div>
                    ) : addForm.callChoice === 'NOT_ANSWERED' ? (
                      <div className="w-full h-10 px-3 rounded-xl border border-amber-200 bg-amber-50 text-xs font-extrabold text-amber-800 flex items-center justify-center select-none shadow-xs">
                        Not answered
                      </div>
                    ) : (
                      <div className="w-full h-10 px-3 rounded-xl border border-zinc-200 bg-zinc-100 text-xs font-bold text-zinc-400 flex items-center justify-center select-none shadow-xs">
                        Pending
                      </div>
                    )}
                  </div>

                  {/* Follow Up Date */}
                  <div className="flex flex-col">
                    <label className="text-[11px] font-black text-zinc-600 uppercase tracking-wider block mb-1">
                      FOLLOW UP DATE
                    </label>
                    <input
                      type="date"
                      min={new Date().toISOString().split('T')[0]}
                      value={addForm.followUpDate || ''}
                      onChange={(e) => setAddForm(f => ({ ...f, followUpDate: e.target.value }))}
                      className="w-full h-10 px-3 rounded-xl border border-zinc-300 bg-zinc-50 text-xs font-bold text-black outline-none shadow-xs focus:bg-white focus:border-black cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* 3. Note */}
              <div>
                <label className="text-xs font-black text-black uppercase tracking-wider block mb-1.5">
                  NOTE <span className="text-gray-400 font-semibold normal-case">(optional)</span>
                </label>
                <textarea
                  rows={2}
                  value={addForm.note || ''}
                  onChange={e => setAddForm(f => ({ ...f, note: e.target.value }))}
                  placeholder=""
                  className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-gray-300 bg-gray-50 focus:bg-white focus:border-black focus:outline-none transition-all shadow-xs resize-none"
                />
              </div>

              {/* 4. Collapsible Lead Profile Details */}
              <div className="pt-2 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowAddProfileDetails(prev => !prev)}
                  className="flex items-center justify-between w-full text-left py-1 text-xs font-black text-zinc-600 hover:text-black transition-colors"
                >
                  <span className="flex items-center gap-1.5 uppercase tracking-wider">
                    <span>📋</span>
                    <span>Lead & Contact Profile Details (Website, Email, Socials)</span>
                  </span>
                  <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showAddProfileDetails ? 'rotate-180' : ''}`} />
                </button>

                {showAddProfileDetails && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 pt-3 border-t border-dashed border-gray-200">
                    <div>
                      <label className="text-[11px] font-black text-zinc-500 uppercase tracking-wider block mb-1">Email</label>
                      <input
                        type="email"
                        value={addForm.email || ''}
                        onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
                        placeholder="e.g. info@business.com"
                        className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-gray-300 bg-gray-50 focus:bg-white focus:border-black outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-black text-zinc-500 uppercase tracking-wider block mb-1">Role / Designation</label>
                      <input
                        type="text"
                        value={addForm.role || ''}
                        onChange={e => setAddForm(f => ({ ...f, role: e.target.value }))}
                        placeholder="e.g. Founder / Manager"
                        className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-gray-300 bg-gray-50 focus:bg-white focus:border-black outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-black text-zinc-500 uppercase tracking-wider block mb-1">Business Website</label>
                      <input
                        type="url"
                        value={addForm.businessWebsite || ''}
                        onChange={e => setAddForm(f => ({ ...f, businessWebsite: e.target.value }))}
                        placeholder="e.g. https://example.com"
                        className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-gray-300 bg-gray-50 focus:bg-white focus:border-black outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-black text-zinc-500 uppercase tracking-wider block mb-1">LinkedIn Profile</label>
                      <input
                        type="text"
                        value={addForm.linkedinProfile || ''}
                        onChange={e => setAddForm(f => ({ ...f, linkedinProfile: e.target.value }))}
                        placeholder="e.g. linkedin.com/in/username"
                        className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-gray-300 bg-gray-50 focus:bg-white focus:border-black outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-black text-zinc-500 uppercase tracking-wider block mb-1">Facebook Profile</label>
                      <input
                        type="text"
                        value={addForm.facebookProfile || ''}
                        onChange={e => setAddForm(f => ({ ...f, facebookProfile: e.target.value }))}
                        placeholder="e.g. facebook.com/page"
                        className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-gray-300 bg-gray-50 focus:bg-white focus:border-black outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-black text-zinc-500 uppercase tracking-wider block mb-1">Instagram Profile</label>
                      <input
                        type="text"
                        value={addForm.instaProfile || ''}
                        onChange={e => setAddForm(f => ({ ...f, instaProfile: e.target.value }))}
                        placeholder="e.g. instagram.com/handle"
                        className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-gray-300 bg-gray-50 focus:bg-white focus:border-black outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-7 py-4 border-t border-gray-200 bg-[#f8f9fa] rounded-b-2xl flex items-center justify-between">
              <button
                onClick={() => {
                  setShowAddPopup(false);
                  setAddForm({});
                  setShowAddProfileDetails(false);
                }}
                className="px-4 py-2 text-xs font-extrabold text-gray-700 hover:text-black transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleAddData}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#00a884] hover:bg-[#008f70] text-white font-extrabold text-xs rounded-xl transition-all shadow-md active:scale-95 cursor-pointer"
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
                          <td className="p-3 font-extrabold text-indigo-800 bg-indigo-50/80 rounded">{formatDateDDMMYYYY(getLeadFollowUpDate(lead))}</td>
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
                          <td className="p-3 font-extrabold text-amber-800 bg-amber-50/80 rounded">{formatDateDDMMYYYY(getLeadFollowUpDate(lead))}</td>
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

      {/* ── UPLOAD COLD CALLS SHEET POPUP MODAL ── */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 text-black font-sans">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden animate-in fade-in zoom-in duration-150">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-zinc-50">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-[#00a884] flex items-center justify-center shadow-xs">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-black">Upload Cold Calls Sheet</h3>
                  <p className="text-xs font-semibold text-zinc-500">Upload Excel document (.xlsx, .csv) into your cold calls list</p>
                </div>
              </div>
              <button
                onClick={() => setShowUploadModal(false)}
                className="w-8 h-8 rounded-full bg-white hover:bg-gray-200 flex items-center justify-center text-gray-700 transition-all border border-gray-200 cursor-pointer shadow-xs"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body Form */}
            <form onSubmit={handleUploadSubmit} className="p-6 space-y-4 font-sans">
              {/* Excel File Input */}
              <div>
                <label className="block text-xs font-black text-zinc-700 uppercase tracking-wider mb-1.5">
                  Select Excel / CSV Document <span className="text-[#00a884]">*</span>
                </label>
                <label className="flex flex-col items-center justify-center border-2 border-dashed border-zinc-300 hover:border-[#00a884] bg-zinc-50 hover:bg-emerald-50/40 rounded-xl p-8 transition-all cursor-pointer">
                  <FileSpreadsheet className="w-10 h-10 text-[#00a884] mb-2" />
                  <span className="text-xs font-extrabold text-black text-center px-2">
                    {uploadFile ? uploadFile.name : 'Click to browse and choose Excel or CSV file'}
                  </span>
                  <span className="text-[11px] text-zinc-500 mt-1">Supports .xlsx, .xls, .csv files</span>
                  <input
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setUploadFile(e.target.files[0]);
                      }
                    }}
                  />
                </label>
              </div>

              {/* Footer Buttons */}
              <div className="pt-3 flex items-center justify-end gap-2 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-black text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploading || !uploadFile}
                  className="px-5 py-2.5 bg-[#00a884] hover:bg-[#008f70] text-white text-xs font-extrabold rounded-xl transition-all shadow-sm active:scale-95 disabled:opacity-60 cursor-pointer flex items-center gap-1.5"
                >
                  {isUploading ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Uploading...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      <span>Upload & Import Leads</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── CENTERED CRM CUSTOM ALERT / NOTICE POPUP MODAL ── */}
      {alertModal && alertModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[99999] flex items-center justify-center p-4 text-black font-sans animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-gray-200 overflow-hidden transform animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-zinc-50/80">
              <div className="flex items-center gap-2.5">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-base shadow-2xs ${
                  alertModal.type === 'error' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-700'
                }`}>
                  {alertModal.type === 'error' ? '✕' : '⚠️'}
                </div>
                <h3 className="text-base font-black text-black tracking-tight">{alertModal.title}</h3>
              </div>
              <button
                onClick={() => setAlertModal(null)}
                className="w-7 h-7 rounded-full bg-white hover:bg-gray-200 flex items-center justify-center text-gray-700 transition-all border border-gray-200 cursor-pointer shadow-xs"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Message Body */}
            <div className="p-6 text-sm font-semibold text-zinc-800 leading-relaxed">
              {alertModal.message}
            </div>

            {/* Footer */}
            <div className="px-6 py-3.5 border-t border-gray-100 bg-zinc-50/50 flex justify-end">
              <button
                type="button"
                onClick={() => setAlertModal(null)}
                className="px-6 py-2 bg-[#00a884] hover:bg-[#008f70] text-white font-extrabold text-xs rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer"
              >
                OK
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
