'use client';

import React, { useState, useEffect } from 'react';
import { getBackendUrl } from '../config';
import { 
  Users, 
  MessageSquare, 
  PhoneCall, 
  Mail, 
  Settings, 
  ExternalLink,
  Flame,
  ThumbsUp,
  ThumbsDown,
  Calendar,
  Phone,
  Download,
  ListTodo,
  X,
  ChevronRight,
  Copy,
  Check,
  Search,
  FileText,
  LogOut,
  User as UserIcon,
  Bot,
  QrCode
} from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { Chat } from '../types/chat';
import { ColdCallsModule } from './ColdCallsModule';
import { SettingsModule } from './SettingsModule';
import { AdminProfileModal } from './AdminProfileModal';
import { CustomModal } from './CustomModal';
import { QrCodeModal } from './QrCodeModal';

export function WhatsAppCrmModule() {
  const [showAdminModal, setShowAdminModal] = useState<boolean>(false);
  const [showLogoutModal, setShowLogoutModal] = useState<boolean>(false);
  const [adminDisplayName, setAdminDisplayName] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('crm_user_name') || localStorage.getItem('crm_admin_display_name') || 'Executive User';
    }
    return 'Executive User';
  });
  const [adminUsername, setAdminUsername] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const user = localStorage.getItem('crm_user_name') || localStorage.getItem('crm_admin_username') || 'user';
      return user.toLowerCase().replace(/\s+/g, '_');
    }
    return 'user';
  });
  const [adminAvatar, setAdminAvatar] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('crm_admin_avatar') || '';
    }
    return '';
  });

  const refreshAdminProfile = () => {
    if (typeof window !== 'undefined') {
      const user = localStorage.getItem('crm_user_name') || localStorage.getItem('crm_admin_display_name') || 'Executive User';
      setAdminDisplayName(user);
      setAdminUsername(user.toLowerCase().replace(/\s+/g, '_'));
      setAdminAvatar(localStorage.getItem('crm_admin_avatar') || '');

      // Register active user in backend on component mount
      fetch(`${getBackendUrl()}/api/users/active`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user }),
      }).catch(() => {});
    }
  };

  useEffect(() => {
    const registerUser = () => {
      if (typeof window !== 'undefined') {
        const user = localStorage.getItem('crm_user_name') || localStorage.getItem('crm_admin_display_name') || 'Executive User';
        if (user && user !== 'Staff' && user !== 'Executive User') {
          fetch(`${getBackendUrl()}/api/users/active`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user }),
          }).catch(() => {});
        }
      }
    };

    registerUser();
    const interval = setInterval(registerUser, 4000);
    return () => clearInterval(interval);
  }, []);

  const [activeNav, setActiveNav] = useState<'whatsapp' | 'calls' | 'emails' | 'settings'>('whatsapp');
  const [coldCallsSubPage, setColdCallsSubPage] = useState<'analytics' | 'sheet' | 'database'>('sheet');
  const [tableFilter, setTableFilter] = useState<'ALL' | 'INTERESTED' | 'WARM' | 'NOT_INTERESTED' | 'CALLS' | 'FOLLOWUPS'>('ALL');
  const [modalCategory, setModalCategory] = useState<'INTERESTED' | 'WARM' | 'NOT_INTERESTED' | 'CALLS' | 'FOLLOWUPS' | null>(null);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showInterestedModal, setShowInterestedModal] = useState(false);
  const [showScheduledModal, setShowScheduledModal] = useState(false);
  const [showFollowupsTodayModal, setShowFollowupsTodayModal] = useState(false);
  const [editingContact, setEditingContact] = useState<Chat | null>(null);
  const [forwardDateInput, setForwardDateInput] = useState<string>('');
  const [editStatus, setEditStatus] = useState<string>('UNASSIGNED');
  const [editCallStatus, setEditCallStatus] = useState<string>('NO');
  const [editNotesList, setEditNotesList] = useState<string[]>([]);
  const [editNoteInputText, setEditNoteInputText] = useState<string>('');
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);
  const [saveSuccessToast, setSaveSuccessToast] = useState<boolean>(false);
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [aiEnabled, setAiEnabled] = useState<boolean>(false);
  const [showQrModal, setShowQrModal] = useState<boolean>(false);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(true);
  const [showClearConfirmModal, setShowClearConfirmModal] = useState<boolean>(false);
  const [contactToClear, setContactToClear] = useState<Chat | null>(null);

  const { sessionState, chats: rawChats, updateCrmMetadata } = useSocket();

  const [hasLoadedOnce, setHasLoadedOnce] = useState<boolean>(false);

  useEffect(() => {
    if (rawChats && Array.isArray(rawChats)) {
      if (rawChats.length > 0) {
        setIsLoadingData(false);
        setHasLoadedOnce(true);
      } else {
        const timer = setTimeout(() => {
          setIsLoadingData(false);
          setHasLoadedOnce(true);
        }, 3000);
        return () => clearTimeout(timer);
      }
    }
  }, [rawChats]);

  useEffect(() => {
    fetch(`${getBackendUrl()}/api/ai/status`)
      .then(res => res.json())
      .then(data => {
        if (typeof data.enabled === 'boolean') setAiEnabled(data.enabled);
      })
      .catch(() => {});
  }, []);

  const toggleAiAutoReplies = async () => {
    try {
      const nextState = !aiEnabled;
      setAiEnabled(nextState);
      const res = await fetch(`${getBackendUrl()}/api/ai/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextState }),
      });
      const data = await res.json();
      if (typeof data.enabled === 'boolean') setAiEnabled(data.enabled);
    } catch (err) {
      console.error('Failed to toggle AI auto-reply:', err);
    }
  };

  const BAD_NAMES = new Set(['.', 'contact', 'unsaved contact', 'unknown contact', 'whatsapp contact', 'ai vastra sales agent', 'ai sales agent', 'ai vastra', 'me', '']);
  const canonicalPhone = (raw: string) => {
    const digits = (raw || '').replace(/\D/g, '');
    if (!digits || digits.length > 15 || digits.length < 7) return '';
    if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
    if (digits.length === 13 && digits.startsWith('091')) return digits.slice(3);
    return digits;
  };

  const getCleanDisplayContact = (chat: any) => {
    const rawNum = (chat.phone || chat.jid || '').split('@')[0].replace(/\D/g, '');
    let tenDigit = rawNum;
    if (rawNum.length === 12 && rawNum.startsWith('91')) tenDigit = rawNum.slice(2);
    if (rawNum.length === 13 && rawNum.startsWith('091')) tenDigit = rawNum.slice(3);
    
    let formattedPhone = '';
    if (tenDigit.length === 10) {
      formattedPhone = `+91 ${tenDigit.slice(0, 5)} ${tenDigit.slice(5)}`;
    } else if (rawNum.length > 0 && rawNum.length <= 12) {
      formattedPhone = `+${rawNum}`;
    } else {
      formattedPhone = tenDigit.length === 10 ? `+91 ${tenDigit}` : (rawNum ? `+${rawNum}` : 'WhatsApp Contact');
    }

    let nameRaw = (chat.name || '').trim();
    if (nameRaw) {
      nameRaw = nameRaw.replace(/\s*\+?\d{8,15}$/, '').trim();
    }

    const isLidDigits = /^\d{13,}$/.test(nameRaw.replace(/\D/g, ''));
    const isBadName = !nameRaw || BAD_NAMES.has(nameRaw.toLowerCase()) || nameRaw.includes('@') || isLidDigits;

    const displayName = isBadName ? formattedPhone : nameRaw;
    return { displayName, formattedPhone, cleanPhone: tenDigit || rawNum };
  };

  const chatsMap = new Map<string, (typeof rawChats)[0]>();
  for (const c of rawChats) {
    if (!c.jid) continue;
    if (c.jid.endsWith('@lid')) {
      continue;
    }
    let phoneDigits = (c.phone || '').replace(/\D/g, '');
    if (!phoneDigits && c.jid.endsWith('@s.whatsapp.net')) {
      phoneDigits = c.jid.split('@')[0].replace(/\D/g, '');
    }
    const tenDigit = canonicalPhone(phoneDigits);

    let dedupeKey = `jid_${c.jid}`;
    if (tenDigit && tenDigit.length === 10) {
      dedupeKey = `phone_${tenDigit}`;
    } else if (phoneDigits && phoneDigits.length >= 7) {
      dedupeKey = `phone_${phoneDigits}`;
    }

    if (!chatsMap.has(dedupeKey)) {
      chatsMap.set(dedupeKey, c);
    } else {
      const existing = chatsMap.get(dedupeKey)!;
      // Prioritize the chat object that has the most recent activity / explicit data
      const pickChat = (c.updatedAt || c.lastMessageAt || 0) >= (existing.updatedAt || existing.lastMessageAt || 0) ? c : existing;
      const otherChat = pickChat === c ? existing : c;

      const mergedLeadStatus = (pickChat.leadStatus && pickChat.leadStatus !== 'UNASSIGNED') 
        ? pickChat.leadStatus 
        : (otherChat.leadStatus && otherChat.leadStatus !== 'UNASSIGNED' ? otherChat.leadStatus : 'UNASSIGNED');

      const mergedCallStatus = pickChat.callStatus !== undefined && pickChat.callStatus !== null ? pickChat.callStatus : otherChat.callStatus;
      const mergedFollowUpDate = (pickChat.followUpDate && pickChat.followUpDate.trim() !== '' && pickChat.followUpDate !== '—') ? pickChat.followUpDate : (otherChat.followUpDate || '');

      // Combine unique notes from both entries
      const notesSet = new Set<string>();
      const collectNotes = (item: typeof c) => {
        if (item.notesList && Array.isArray(item.notesList)) {
          item.notesList.forEach(n => {
            if (typeof n === 'string' && n.trim()) notesSet.add(n.trim());
          });
        } else if (item.notes && item.notes.trim()) {
          notesSet.add(item.notes.trim());
        }
      };
      collectNotes(pickChat);
      collectNotes(otherChat);

      const mergedNotesList = Array.from(notesSet);
      const mergedNotes = mergedNotesList.join('\n\n');

      const curNameBad = !pickChat.name || BAD_NAMES.has(pickChat.name.toLowerCase().trim()) || pickChat.name.length <= 1;
      const existNameBad = !otherChat.name || BAD_NAMES.has(otherChat.name.toLowerCase().trim()) || otherChat.name.length <= 1;
      const bestName = !curNameBad ? pickChat.name : (!existNameBad ? otherChat.name : pickChat.name);

      chatsMap.set(dedupeKey, {
        ...otherChat,
        ...pickChat,
        name: bestName,
        leadStatus: mergedLeadStatus || 'UNASSIGNED',
        callStatus: mergedCallStatus,
        followUpDate: mergedFollowUpDate,
        notes: mergedNotes,
        notesList: mergedNotesList,
        manuallySaved: Boolean(existing.manuallySaved || c.manuallySaved),
        updatedAt: Math.max(existing.updatedAt || 0, c.updatedAt || 0, Date.now()),
      });
    }
  }

  const chats = Array.from(chatsMap.values());

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

  const formatDateDDMMYYYY = (dStr?: string) => {
    if (!dStr || dStr.trim() === '' || dStr === '—') return '—';
    const s = dStr.trim();
    if (s.includes('-')) {
      const parts = s.split('-');
      if (parts[0].length === 4) {
        // YYYY-MM-DD -> DD/MM/YYYY
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      } else if (parts[0].length === 2 && parts[2]?.length === 4) {
        // DD-MM-YYYY -> DD/MM/YYYY
        return `${parts[0]}/${parts[1]}/${parts[2]}`;
      }
    }
    if (s.includes('/')) {
      const parts = s.split('/');
      if (parts[0].length === 4) {
        // YYYY/MM/DD -> DD/MM/YYYY
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return s;
    }
    return s;
  };

  const todayLocalStr = getLocalYYYYMMDD();

  // Compute 100% DYNAMIC real stats from database chats (Default 0)
  const interestedChats = chats.filter((c) => c.leadStatus === 'INTERESTED');
  const warmChats = chats.filter((c) => isPureAutoWarmLead(c));
  const notInterestedChats = chats.filter((c) => c.leadStatus === 'NOT_INTERESTED');
  const unassignedChats = chats.filter((c) => !c.leadStatus || c.leadStatus === 'UNASSIGNED');

  const interestedCount = interestedChats.length;
  const warmCount = warmChats.length;
  const notInterestedCount = notInterestedChats.length;
  const unassignedCount = unassignedChats.length;

  const callsYesChats = chats.filter((c) => c.callStatus === 'YES');
  const scheduledFollowupChatsList = chats.filter(c => {
    return Boolean(c.followUpDate && c.followUpDate.trim().length > 0 && c.followUpDate !== '—');
  });
  const followupTodayChatsList = chats.filter(c => {
    const normF = normalizeDateStr(c.followUpDate);
    return normF === todayLocalStr;
  });

  const callsYesCount = callsYesChats.length;
  const followUpsCount = scheduledFollowupChatsList.length;

  // Helper to check if a chat is a pure unedited auto-reply warm lead
  function isPureAutoWarmLead(c: Chat) {
    const isWarmStatus = c.leadStatus === 'WARM' || c.leadStatus === 'WARM_INTERESTED' || (c as any).isAutoWarm === true;
    if (!isWarmStatus) return false;

    const hasNotes = Boolean((c.notesList && c.notesList.length > 0) || (c.notes && c.notes.trim().length > 0));
    const hasFollowUp = Boolean(c.followUpDate && c.followUpDate.trim().length > 0 && c.followUpDate !== '—');
    const hasCallStatus = Boolean(c.callStatus && c.callStatus !== undefined && c.callStatus !== null && (c.callStatus as any) !== 'None');
    const isManuallySaved = (c as any).manuallySaved === true;

    if (isManuallySaved || hasNotes || hasFollowUp || hasCallStatus) return false;
    return true;
  }

  const savedLeads = chats.filter((c) => {
    const hasStatus = Boolean(c.leadStatus && c.leadStatus !== 'UNASSIGNED');
    const hasCall = Boolean(c.callStatus && c.callStatus !== undefined && c.callStatus !== null && (c.callStatus as any) !== 'None');
    const hasFollow = Boolean(c.followUpDate && c.followUpDate.trim().length > 0 && c.followUpDate !== '—');
    const hasNotes = Boolean((c.notesList && c.notesList.length > 0) || (c.notes && c.notes.trim().length > 0));
    const isManuallySaved = (c as any).manuallySaved === true;
    
    return hasStatus || hasCall || hasFollow || hasNotes || isManuallySaved;
  });

  // All Tab Leads: All saved/edited CRM leads EXCLUDING pure unedited auto-warm leads
  const allTabLeads = savedLeads.filter(c => !isPureAutoWarmLead(c));

  // Warm Tab Leads: All warm leads (both pure auto-warm and edited warm leads)
  const warmTabLeads = chats.filter(c => c.leadStatus === 'WARM' || c.leadStatus === 'WARM_INTERESTED' || isPureAutoWarmLead(c));

  // Sort lists so latest updated comes on top
  allTabLeads.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  warmTabLeads.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  // Filter table leads based on selected sub-filter and search
  const baseLeads = tableFilter === 'WARM' ? warmTabLeads : (tableFilter === 'ALL' ? allTabLeads : savedLeads);
  const filteredTableLeads = baseLeads
    .filter((c) => {
      const matchesSearch =
        (c.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.phone || c.jid || '').toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (tableFilter === 'INTERESTED') return c.leadStatus === 'INTERESTED';
      if (tableFilter === 'WARM') return c.leadStatus === 'WARM' || c.leadStatus === 'WARM_INTERESTED' || isPureAutoWarmLead(c);
      if (tableFilter === 'NOT_INTERESTED') return c.leadStatus === 'NOT_INTERESTED';
      if (tableFilter === 'CALLS') return c.callStatus === 'YES';
      if (tableFilter === 'FOLLOWUPS') return Boolean(c.followUpDate && c.followUpDate.trim().length > 0 && c.followUpDate !== '—');

      return true;
    })
    .sort((a, b) => {
      const timeA = Math.max(a.updatedAt || 0, (a as any).callTimestamp || 0, a.lastMessageAt || 0);
      const timeB = Math.max(b.updatedAt || 0, (b as any).callTimestamp || 0, b.lastMessageAt || 0);
      return timeB - timeA;
    });

  const handleCopyPhone = (phoneNum: string) => {
    const clean = phoneNum.replace(/\D/g, '');
    navigator.clipboard.writeText(clean);
    setCopiedPhone(clean);
    setTimeout(() => setCopiedPhone(null), 2000);
  };

  // Open specific WhatsApp Web chat using deep-link
  const handleOpenSpecificChat = (phoneNum?: string) => {
    if (phoneNum) {
      const cleanDigits = phoneNum.replace(/\D/g, '');
      if (cleanDigits.length >= 10) {
        window.open(`https://web.whatsapp.com/send?phone=${cleanDigits}`, '_blank');
        return;
      }
    }
    window.open('https://web.whatsapp.com', '_blank');
  };

  const [clearTargetChat, setClearTargetChat] = useState<Chat | null>(null);

  // Clear a lead from CRM & reset AI auto-replies so future messages are treated as a brand new lead
  const handleClearLead = (chat: Chat) => {
    setClearTargetChat(chat);
  };

  // Export Leads to CSV for telecallers
  const handleExportCsv = () => {
    const exportData = savedLeads.map((c) => ({
      Name: c.name || 'Unsaved Contact',
      Phone: c.phone || c.jid.split('@')[0],
      LeadStatus: c.leadStatus === 'INTERESTED' ? 'Interested' : c.leadStatus === 'WARM_INTERESTED' ? 'Warm' : c.leadStatus === 'NOT_INTERESTED' ? 'Not Interested' : 'Unassigned',
      CallStatus: c.callStatus || 'No Selection',
      FollowUpDate: c.followUpDate || 'None',
      Notes: (c.notesList || [c.notes || '']).join(' | '),
    }));

    if (exportData.length === 0) {
      alert('No saved leads available to export yet.');
      return;
    }

    const headers = ['Name', 'Phone', 'LeadStatus', 'CallStatus', 'FollowUpDate', 'Notes'];
    const csvRows = [
      headers.join(','),
      ...exportData.map((row) =>
        headers.map((field) => `"${(row as any)[field] || ''}"`).join(',')
      ),
    ];

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AIVastra_Saved_Leads_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Helper to get modal contacts
  const getModalContacts = () => {
    switch (modalCategory) {
      case 'INTERESTED':
        return interestedChats;
      case 'WARM':
        return warmChats;
      case 'NOT_INTERESTED':
        return notInterestedChats;
      case 'CALLS':
        return callsYesChats;
      case 'FOLLOWUPS':
        return scheduledFollowupChatsList;
      default:
        return [];
    }
  };

  const handlePerformClearChat = async (target: Chat) => {
    if (!target) return;
    const targetJid = target.jid || (target.phone ? `${target.phone}@s.whatsapp.net` : '');
    const targetPhone = target.phone ? target.phone.replace(/\D/g, '') : '';

    setEditingContact(null);
    setClearTargetChat(null);

    try {
      if (targetJid) {
        await fetch(`${getBackendUrl()}/api/chats/${encodeURIComponent(targetJid)}`, { method: 'DELETE' }).catch(() => {});
      }
      await fetch(`${getBackendUrl()}/api/crm/contact/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jid: targetJid, phone: targetPhone, name: target.name }),
      }).catch(() => {});
    } catch (err) {
      console.error('Failed to clear lead:', err);
    }
  };

  const getModalTitle = () => {
    switch (modalCategory) {
      case 'INTERESTED':
        return `👍 Interested Leads (${interestedCount})`;
      case 'WARM':
        return `🔥 Warm Leads (${warmCount})`;
      case 'NOT_INTERESTED':
        return `👎 Not Interested Leads (${notInterestedCount})`;
      case 'CALLS':
        return `📞 Calls Requested / Yes (${callsYesCount})`;
      case 'FOLLOWUPS':
        return `📅 Scheduled Follow-ups (${followUpsCount})`;
      default:
        return 'Lead Details';
    }
  };

  return (
    <div className="w-screen h-screen flex overflow-hidden bg-white text-black">
      <aside className="w-64 bg-white text-black flex flex-col justify-between p-4 flex-shrink-0 select-none border-r border-zinc-200">
        <div>
          {/* Top Logo Box */}
          <div className="px-4 py-3.5 mb-6 bg-white rounded-2xl border border-zinc-200 shadow-sm flex items-center justify-center">
            <img src="/ai_vastra_logo.png" alt="Ai Vastra" className="w-full h-auto max-h-11 object-contain" />
          </div>

          <nav className="space-y-2">
            <button
              onClick={() => setActiveNav('whatsapp')}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-base transition-all cursor-pointer ${
                activeNav === 'whatsapp' ? 'bg-black text-white shadow-md font-extrabold' : 'text-zinc-700 hover:bg-zinc-100 hover:text-black font-semibold'
              }`}
            >
              <MessageSquare className="w-5 h-5" />
              <span className="flex-1 text-left">WhatsApp</span>
            </button>

            <button
              onClick={() => {
                setActiveNav('calls');
                setColdCallsSubPage('sheet');
              }}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-base transition-all cursor-pointer ${
                activeNav === 'calls' ? 'bg-black text-white shadow-md font-extrabold' : 'text-zinc-700 hover:bg-zinc-100 hover:text-black font-semibold'
              }`}
            >
              <PhoneCall className="w-5 h-5" />
              <span className="flex-1 text-left">Cold Calls</span>
            </button>

            <button
              onClick={() => setActiveNav('emails')}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-base transition-all cursor-pointer ${
                activeNav === 'emails' ? 'bg-black text-white shadow-md font-extrabold' : 'text-zinc-700 hover:bg-zinc-100 hover:text-black font-semibold'
              }`}
            >
              <Mail className="w-5 h-5" />
              <span>Emails</span>
              <span className="ml-auto text-xs bg-[#f4f4f5] text-zinc-500 border border-zinc-200 px-2.5 py-0.5 rounded-full font-semibold">Soon</span>
            </button>

            <button
              onClick={() => setActiveNav('settings')}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-base transition-all cursor-pointer ${
                activeNav === 'settings' ? 'bg-black text-white shadow-md font-extrabold' : 'text-zinc-700 hover:bg-zinc-100 hover:text-black font-semibold'
              }`}
            >
              <Settings className="w-5 h-5" />
              <span className="flex-1 text-left">Settings</span>
            </button>
          </nav>
        </div>

        {/* Bottom Sidebar: Admin Profile Block + Logout Icon Button */}
        <div className="pt-4 border-t border-zinc-200 flex items-center justify-between gap-2 mt-auto">
          <button
            onClick={() => setShowAdminModal(true)}
            className="flex-1 flex items-center gap-3 p-3 rounded-2xl bg-[#f4f4f5] hover:bg-zinc-200/80 border border-zinc-200/80 transition-all text-left group overflow-hidden cursor-pointer"
            title="Open Admin Profile Settings"
          >
            <div className="w-9 h-9 rounded-full bg-black text-white font-bold flex items-center justify-center text-xs flex-shrink-0 overflow-hidden border border-black">
              {adminAvatar ? (
                <img src={adminAvatar} alt="Admin" className="w-full h-full object-cover" />
              ) : (
                <UserIcon className="w-5 h-5 text-white" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-extrabold text-black truncate">{adminDisplayName}</h4>
              <p className="text-[11px] text-zinc-500 font-semibold truncate">@{adminUsername}</p>
            </div>
          </button>

          <button
            onClick={() => setShowLogoutModal(true)}
            className="p-3 rounded-2xl bg-[#f4f4f5] hover:bg-rose-50 hover:text-rose-600 text-zinc-700 border border-zinc-200/80 transition-all flex-shrink-0 cursor-pointer"
            title="Log Out of CRM"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden bg-white text-black">
        <header className="h-16 bg-white border-b border-zinc-200 px-6 flex items-center justify-between flex-shrink-0">
          <h2 className="text-2xl font-extrabold text-black tracking-tight">
            {activeNav === 'whatsapp' ? 'WhatsApp CRM Dashboard' : activeNav === 'calls' ? 'Cold Calls Lead List' : activeNav === 'settings' ? 'CRM Settings & Backup Center' : 'Emails'}
          </h2>

          {/* Launch WhatsApp Web button, WhatsApp QR button, & AI Auto-Replies Toggle (ONLY for WhatsApp module) */}
          {activeNav === 'whatsapp' && (
            <div className="flex items-center gap-3">
              {/* WhatsApp QR Modal Trigger Button */}
              <button
                type="button"
                onClick={() => setShowQrModal(true)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black transition-all border shadow-xs cursor-pointer ${
                  sessionState.status === 'CONNECTED'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100 shadow-2xs'
                    : 'bg-zinc-100 border-zinc-300 text-zinc-800 hover:bg-zinc-200 shadow-2xs'
                }`}
                title="Click to view WhatsApp QR Code or change connected number"
              >
                <QrCode className="w-4 h-4 text-[#00a884]" />
                <span>WhatsApp QR</span>
                {sessionState.status === 'CONNECTED' && (
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse ml-0.5" />
                )}
              </button>

              {/* AI Auto-Replies Toggle Switch */}
              <button
                type="button"
                onClick={toggleAiAutoReplies}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all border shadow-xs cursor-pointer ${
                  aiEnabled
                    ? 'bg-emerald-600 border-emerald-700 text-white shadow-emerald-100'
                    : 'bg-zinc-100 border-zinc-300 text-zinc-700 hover:bg-zinc-200'
                }`}
                title="Toggle AI Auto-Replies on incoming customer WhatsApp messages"
              >
                <Bot className="w-4 h-4" />
                <span>AI Auto-Replies:</span>
                <span className={`px-2 py-0.5 rounded-md text-[11px] font-black ${aiEnabled ? 'bg-white text-emerald-800' : 'bg-zinc-300 text-zinc-800'}`}>
                  {aiEnabled ? 'ON' : 'OFF'}
                </span>
              </button>

              <button
                onClick={() => handleOpenSpecificChat()}
                className="px-4 py-2 bg-black hover:bg-zinc-800 text-white font-bold text-sm rounded-xl transition-all flex items-center gap-2 shadow-sm cursor-pointer"
              >
                <span>Launch WhatsApp Web</span>
                <ExternalLink className="w-4 h-4" />
              </button>
            </div>
          )}
        </header>

        {activeNav === 'whatsapp' && (
          <div className="flex-1 overflow-y-auto p-6 bg-zinc-50/50">
            <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-xl font-extrabold text-black flex items-center gap-2">
                    <FileText className="w-6 h-6 text-black" />
                    <span>Whatsapp Data</span>
                  </h3>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <div className="relative">
                    <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search name or number..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 pr-4 py-2 bg-zinc-100 border border-zinc-300 rounded-xl text-sm font-medium text-black focus:outline-none focus:border-black w-56"
                    />
                  </div>

                  <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-xl border border-zinc-200 flex-wrap">
                    <button
                      onClick={() => setTableFilter('ALL')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        tableFilter === 'ALL' ? 'bg-black text-white shadow-sm' : 'text-zinc-700 hover:text-black'
                      }`}
                    >
                      All ({allTabLeads.length})
                    </button>
                    <button
                      onClick={() => setTableFilter('INTERESTED')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        tableFilter === 'INTERESTED' ? 'bg-black text-white shadow-sm' : 'text-zinc-700 hover:text-black'
                      }`}
                    >
                      Interested ({interestedCount})
                    </button>
                    <button
                      onClick={() => setTableFilter('WARM')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        tableFilter === 'WARM' ? 'bg-black text-white shadow-sm' : 'text-zinc-700 hover:text-black'
                      }`}
                    >
                      Warm ({warmTabLeads.length})
                    </button>
                    <button
                      onClick={() => setTableFilter('NOT_INTERESTED')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        tableFilter === 'NOT_INTERESTED' ? 'bg-black text-white shadow-sm' : 'text-zinc-700 hover:text-black'
                      }`}
                    >
                      Not Interested ({notInterestedCount})
                    </button>
                    <button
                      onClick={() => setTableFilter('FOLLOWUPS')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        tableFilter === 'FOLLOWUPS' ? 'bg-black text-white shadow-sm' : 'text-zinc-700 hover:text-black'
                      }`}
                    >
                      Follow ups ({followUpsCount})
                    </button>
                    <button
                      onClick={() => setTableFilter('CALLS')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        tableFilter === 'CALLS' ? 'bg-black text-white shadow-sm' : 'text-zinc-700 hover:text-black'
                      }`}
                    >
                      Calls ({callsYesCount})
                    </button>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto border border-zinc-200 rounded-xl">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-zinc-100 text-black font-extrabold border-b border-zinc-200 text-xs uppercase tracking-wider">
                      <th className="p-4">Contact Name / Phone</th>
                      <th className="p-4">Lead Status</th>
                      <th className="p-4">Call Status</th>
                      <th className="p-4">Follow-up Date</th>
                      <th className="p-4">Latest CRM Notes</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 bg-white font-medium">
                    {(isLoadingData && !hasLoadedOnce) ? (
                      <tr>
                        <td colSpan={6} className="p-14 text-center bg-zinc-50/50">
                          <div className="flex flex-col items-center justify-center gap-3">
                            <div className="w-8 h-8 border-4 border-black border-t-transparent rounded-full animate-spin"></div>
                            <span className="font-extrabold text-sm text-black">⚡ Connecting to CRM Server & Syncing WhatsApp Contacts...</span>
                            <span className="text-xs font-semibold text-zinc-400">Please wait while your contacts are being loaded.</span>
                          </div>
                        </td>
                      </tr>
                    ) : filteredTableLeads.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-10 text-center text-zinc-500 italic text-sm">
                          No saved contact settings found matching filter. Enter contact info on WhatsApp Web via Extension!
                        </td>
                      </tr>
                    ) : (
                      filteredTableLeads.map((chat) => {
                        const { displayName, formattedPhone, cleanPhone } = getCleanDisplayContact(chat);

                        return (
                          <tr key={chat.jid} className="hover:bg-zinc-50 transition-colors border-b border-zinc-100">
                            <td className="p-4 align-middle">
                              <div className="font-extrabold text-black text-base">{displayName}</div>
                            </td>

                            <td className="p-4 align-middle">
                              {chat.leadStatus === 'INTERESTED' && (
                                <span className="px-3 py-1 text-xs font-extrabold bg-black text-white rounded-md inline-block">
                                  Interested
                                </span>
                              )}
                              {(chat.leadStatus === 'WARM' || chat.leadStatus === 'WARM_INTERESTED') && (
                                <span className="px-3 py-1 text-xs font-extrabold bg-amber-500 text-white rounded-md inline-flex items-center gap-1">
                                  🔥 Warm
                                </span>
                              )}
                              {chat.leadStatus === 'NOT_INTERESTED' && (
                                <span className="px-3 py-1 text-xs font-extrabold bg-zinc-200 text-zinc-800 rounded-md inline-block">
                                  Not Interested
                                </span>
                              )}
                              {(!chat.leadStatus || chat.leadStatus === 'UNASSIGNED') && (
                                <span className="px-2 py-0.5 text-xs text-zinc-400 italic">Unassigned</span>
                              )}
                            </td>

                            <td className="p-4 align-middle">
                              {chat.callStatus === 'YES' || (chat.callStatus as any) === true ? (
                                <span className="px-3 py-1 text-xs font-extrabold bg-black text-white rounded-md inline-block">
                                  Yes
                                </span>
                              ) : chat.callStatus === 'NO' || (chat.callStatus as any) === false ? (
                                <span className="px-3 py-1 text-xs font-extrabold bg-black text-white rounded-md inline-block">
                                  No
                                </span>
                              ) : (
                                <span className="text-zinc-400 text-xs font-semibold">None</span>
                              )}
                            </td>

                            <td className="p-4 align-middle">
                              {chat.followUpDate ? (
                                <span className="px-3 py-1 text-xs font-extrabold bg-zinc-100 text-black border border-black rounded-md inline-flex items-center gap-1">
                                  📅 {formatDateDDMMYYYY(chat.followUpDate)}
                                </span>
                              ) : (
                <span className="text-zinc-400 text-xs">None</span>
                              )}
                            </td>

                            <td className="p-4 min-w-[280px] max-w-md align-middle">
                              {(() => {
                                const allNotes: string[] = [];
                                if (chat.notesList && Array.isArray(chat.notesList) && chat.notesList.length > 0) {
                                  chat.notesList.forEach(n => {
                                    let txt = '';
                                    if (typeof n === 'string' && n.trim()) txt = n.trim();
                                    else if (n && typeof n === 'object' && (n as any).text) txt = ((n as any).text + ((n as any).date ? ` (${(n as any).date})` : '')).trim();
                                    
                                    if (txt) {
                                      const lower = txt.toLowerCase();
                                      if (!allNotes.some(existing => existing.toLowerCase() === lower)) {
                                        allNotes.push(txt);
                                      }
                                    }
                                  });
                                } else if (chat.notes && chat.notes.trim()) {
                                  const txt = chat.notes.trim();
                                  const lower = txt.toLowerCase();
                                  if (!allNotes.some(existing => existing.toLowerCase() === lower)) {
                                    allNotes.push(txt);
                                  }
                                }

                                if (allNotes.length === 0) {
                                  return <span className="text-zinc-400 text-xs italic">No notes</span>;
                                }

                                return (
                                  <div className="space-y-1.5 py-1">
                                    {allNotes.map((noteText, nIdx) => (
                                      <div key={nIdx} className="text-sm font-medium text-zinc-900 leading-relaxed break-words whitespace-pre-wrap">
                                        <span className="font-extrabold text-black mr-1">{nIdx + 1}.</span>
                                        <span className="italic">"{noteText}"</span>
                                      </div>
                                    ))}
                                  </div>
                                );
                              })()}
                            </td>

                            <td className="p-4 text-right align-middle">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => {
                                    const parsedNotes: string[] = [];
                                    if (chat.notesList && Array.isArray(chat.notesList) && chat.notesList.length > 0) {
                                      chat.notesList.forEach(n => {
                                        if (typeof n === 'string' && n.trim()) parsedNotes.push(n.trim());
                                        else if (n && typeof n === 'object' && (n as any).text) parsedNotes.push(((n as any).text + ((n as any).date ? ` (${(n as any).date})` : '')).trim());
                                      });
                                    } else if (chat.notes && chat.notes.trim()) {
                                      parsedNotes.push(chat.notes.trim());
                                    }

                                    setEditingContact(chat);
                                    setForwardDateInput(chat.followUpDate || '');
                                    setEditStatus(chat.leadStatus || 'UNASSIGNED');
                                    setEditCallStatus(chat.callStatus || '');
                                    setEditNotesList(parsedNotes);
                                    setEditNoteInputText('');
                                    setSaveSuccessToast(false);
                                  }}
                                  className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-extrabold text-xs rounded-xl border border-indigo-200 transition-all inline-flex items-center gap-1.5 shadow-sm active:scale-95 whitespace-nowrap"
                                  title="Edit lead details or forward follow-up date"
                                >
                                  <span>Edit / Forward ⏩</span>
                                </button>
                                <button
                                  onClick={() => handleOpenSpecificChat(chat.phone || chat.jid)}
                                  className="px-3.5 py-2 bg-black hover:bg-zinc-800 text-white font-bold text-xs rounded-xl transition-all inline-flex items-center gap-1.5 shadow-sm active:scale-95 whitespace-nowrap"
                                  title={`Open Chat for ${chat.name || chat.phone} directly in WhatsApp Web`}
                                >
                                  <span>Open Chat</span>
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeNav === 'calls' && (
          <ColdCallsModule subPage={coldCallsSubPage} onSubPageChange={setColdCallsSubPage} />
        )}

        {activeNav === 'settings' && (
          <SettingsModule chats={chats} />
        )}
      </main>

      {/* 3. CLICKABLE LEAD DETAILS MODAL POPUP */}
      {modalCategory && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[80vh]">
            <div className="px-6 py-4 bg-[#f0f2f5] border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-[#111b21]">{getModalTitle()}</h3>
              <button
                onClick={() => setModalCategory(null)}
                className="w-8 h-8 rounded-full bg-white hover:bg-gray-200 flex items-center justify-center text-gray-600 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-3.5 flex-1">
              {getModalContacts().length === 0 ? (
                <div className="p-12 text-center text-sm text-gray-400">
                  No contacts found in this category yet.
                </div>
              ) : (
                getModalContacts().map((chat) => {
                  const { displayName, formattedPhone, cleanPhone } = getCleanDisplayContact(chat);

                  return (
                    <div key={chat.jid} className="p-4 rounded-xl bg-gray-50 border border-gray-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#00a884]/15 text-[#00a884] font-bold flex items-center justify-center text-base flex-shrink-0">
                          {displayName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-[#111b21]">{displayName}</h4>
                          {chat.notesList && chat.notesList.length > 0 && (
                            <p className="text-xs text-purple-700 mt-1 italic">📝 "{chat.notesList[0]}"</p>
                          )}
                        </div>
                      </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {chat.callStatus === 'YES' && (
                        <span className="px-2 py-0.5 text-[10px] font-bold bg-purple-100 text-purple-700 rounded-full">
                          Call: Yes
                        </span>
                      )}
                      {chat.followUpDate && (
                        <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-700 rounded-full">
                          Follow-up: {formatDateDDMMYYYY(chat.followUpDate)}
                        </span>
                      )}
                      <button
                        onClick={() => {
                          setModalCategory(null);
                          handleOpenSpecificChat(chat.phone || chat.jid);
                        }}
                        className="px-3 py-1.5 bg-[#00a884] text-white text-xs font-semibold rounded-lg hover:bg-[#008f70] transition-all flex items-center gap-1"
                      >
                        <span>Chat</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
            </div>
          </div>
        </div>
      )}

      {/* ── STATUS BREAKDOWN POPUP MODAL ── */}
      {showStatusModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 text-black font-sans">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden animate-in fade-in zoom-in duration-150">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-zinc-50">
              <div>
                <h3 className="text-lg font-black text-black flex items-center gap-2">
                  <PhoneCall className="w-5 h-5 text-black" />
                  Status Breakdown
                </h3>
                <p className="text-xs font-semibold text-zinc-500 mt-0.5">Summary of WhatsApp lead statuses</p>
              </div>
              <button onClick={() => setShowStatusModal(false)} className="w-8 h-8 rounded-full bg-white hover:bg-gray-200 flex items-center justify-center text-gray-700 transition-all border border-gray-200 shadow-sm">
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Body */}
            <div className="p-6 space-y-3 font-sans">
              {([
                ['Interested', interestedCount, '👍'],
                ['Warm', warmCount, '🔥'],
                ['Not Interested', notInterestedCount, '👎'],
              ] as [string, number, string][]).map(([label, count, emoji]) => (
                <div key={label} className="p-4 rounded-xl border border-zinc-200 bg-zinc-50 flex items-center justify-between">
                  <div className="flex items-center gap-2.5 text-sm font-extrabold text-black">
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
          <div className="bg-white w-full max-w-6xl rounded-2xl shadow-2xl border border-gray-200 flex flex-col max-h-[85vh] overflow-hidden animate-in fade-in zoom-in duration-150">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-purple-50/60">
              <div>
                <h3 className="text-lg font-black text-purple-950 flex items-center gap-2">
                  <Users className="w-5 h-5 text-purple-600" />
                  Interested Leads ({interestedCount})
                </h3>
                <p className="text-xs font-semibold text-purple-700 mt-0.5">High potential WhatsApp clients</p>
              </div>
              <button onClick={() => setShowInterestedModal(false)} className="w-8 h-8 rounded-full bg-white hover:bg-gray-200 flex items-center justify-center text-gray-700 transition-all border border-gray-200 shadow-sm">
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Table Body */}
            <div className="overflow-y-auto flex-1 p-6">
              {interestedChats.length === 0 ? (
                <div className="p-12 text-center text-xs text-gray-400 font-semibold bg-gray-50 rounded-xl border border-gray-200">
                  No interested contacts recorded yet.
                </div>
              ) : (
                <div className="border border-gray-200 rounded-xl overflow-x-auto shadow-sm">
                  <table className="w-full text-left border-collapse text-xs min-w-[700px]">
                    <thead>
                      <tr className="bg-gray-100 text-gray-700 font-extrabold border-b border-gray-200 uppercase tracking-wider">
                        <th className="p-3.5 w-12 text-center">#</th>
                        <th className="p-3.5 min-w-[140px]">Contact Name</th>
                        <th className="p-3.5 min-w-[140px]">Phone</th>
                        <th className="p-3.5 min-w-[100px] text-center">Status</th>
                        <th className="p-3.5 min-w-[240px]">Note</th>
                        <th className="p-3.5 w-28 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white font-medium">
                      {interestedChats.map((chat, idx) => {
                        const { displayName, formattedPhone, cleanPhone } = getCleanDisplayContact(chat);
                        const noteContent = chat.notes || (Array.isArray(chat.notesList) ? chat.notesList.join('\n') : '') || '—';
                        return (
                          <tr key={chat.jid} className="hover:bg-purple-50/30 transition-colors">
                            <td className="p-3.5 text-center text-gray-400 font-mono font-bold">{idx + 1}</td>
                            <td className="p-3.5 font-extrabold text-black">{displayName}</td>
                            <td className="p-3.5 font-extrabold text-[#00a884]">📞 {formattedPhone}</td>
                            <td className="p-3.5 text-center">
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-800">
                                Interested
                              </span>
                            </td>
                            <td className="p-3.5 text-gray-700 font-medium whitespace-pre-wrap break-words max-w-[280px]">
                              {noteContent}
                            </td>
                            <td className="p-3.5 text-center whitespace-nowrap">
                              <button
                                onClick={() => { setShowInterestedModal(false); handleOpenSpecificChat(cleanPhone); }}
                                className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs rounded-lg transition-all shadow-sm"
                              >
                                Chat ↗
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
          <div className="bg-white w-full max-w-6xl rounded-2xl shadow-2xl border border-gray-200 flex flex-col max-h-[85vh] overflow-hidden animate-in fade-in zoom-in duration-150">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-indigo-50/80">
              <div>
                <h3 className="text-lg font-black text-indigo-950 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-indigo-600" />
                  Follow-ups Scheduled ({scheduledFollowupChatsList.length})
                </h3>
                <p className="text-xs font-semibold text-indigo-700 mt-0.5">All contacts scheduled for future follow-up dates</p>
              </div>
              <button onClick={() => setShowScheduledModal(false)} className="w-8 h-8 rounded-full bg-white hover:bg-gray-200 flex items-center justify-center text-gray-700 transition-all border border-gray-200 shadow-sm">
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Table Body */}
            <div className="overflow-y-auto flex-1 p-6">
              {scheduledFollowupChatsList.length === 0 ? (
                <div className="p-12 text-center text-xs text-gray-400 font-semibold bg-gray-50 rounded-xl border border-gray-200">
                  No scheduled follow-up contacts found.
                </div>
              ) : (
                <div className="border border-gray-200 rounded-xl overflow-x-auto shadow-sm">
                  <table className="w-full text-left border-collapse text-xs min-w-[750px]">
                    <thead>
                      <tr className="bg-gray-100 text-gray-700 font-extrabold border-b border-gray-200 uppercase tracking-wider">
                        <th className="p-3.5 w-12 text-center">#</th>
                        <th className="p-3.5 min-w-[140px]">Contact Name</th>
                        <th className="p-3.5 min-w-[140px]">Phone</th>
                        <th className="p-3.5 min-w-[130px] font-extrabold text-indigo-700">Follow-up Date</th>
                        <th className="p-3.5 min-w-[240px]">Note</th>
                        <th className="p-3.5 w-28 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white font-medium">
                      {scheduledFollowupChatsList.map((chat, idx) => {
                        const { displayName, formattedPhone, cleanPhone } = getCleanDisplayContact(chat);
                        const noteContent = chat.notes || (Array.isArray(chat.notesList) ? chat.notesList.join('\n') : '') || '—';
                        return (
                          <tr key={chat.jid} className="hover:bg-indigo-50/30 transition-colors">
                            <td className="p-3.5 text-center text-gray-400 font-mono font-bold">{idx + 1}</td>
                            <td className="p-3.5 font-extrabold text-black">{displayName}</td>
                            <td className="p-3.5 font-extrabold text-[#00a884]">📞 {formattedPhone}</td>
                            <td className="p-3.5 font-extrabold text-indigo-800 bg-indigo-50/80">📅 {formatDateDDMMYYYY(chat.followUpDate)}</td>
                            <td className="p-3.5 text-gray-700 font-medium whitespace-pre-wrap break-words max-w-[280px]">
                              {noteContent}
                            </td>
                            <td className="p-3.5 text-center whitespace-nowrap">
                              <button
                                onClick={() => { setShowScheduledModal(false); handleOpenSpecificChat(cleanPhone); }}
                                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-lg transition-all shadow-sm"
                              >
                                Chat ↗
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
          <div className="bg-white w-full max-w-6xl rounded-2xl shadow-2xl border border-gray-200 flex flex-col max-h-[85vh] overflow-hidden animate-in fade-in zoom-in duration-150">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-amber-50/60">
              <div>
                <h3 className="text-lg font-black text-amber-950 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-amber-600" />
                  Follow-ups Today ({followupTodayChatsList.length})
                </h3>
                <p className="text-xs font-semibold text-amber-700 mt-0.5">Contacts scheduled for follow-up today ({formatDateDDMMYYYY(todayLocalStr)})</p>
              </div>
              <button onClick={() => setShowFollowupsTodayModal(false)} className="w-8 h-8 rounded-full bg-white hover:bg-gray-200 flex items-center justify-center text-gray-700 transition-all border border-gray-200 shadow-sm">
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Table Body */}
            <div className="overflow-y-auto flex-1 p-6">
              {followupTodayChatsList.length === 0 ? (
                <div className="p-12 text-center text-xs text-gray-400 font-semibold bg-gray-50 rounded-xl border border-gray-200">
                  No scheduled follow-up contacts found for today ({formatDateDDMMYYYY(todayLocalStr)}).
                </div>
              ) : (
                <div className="border border-gray-200 rounded-xl overflow-x-auto shadow-sm">
                  <table className="w-full text-left border-collapse text-xs min-w-[850px]">
                    <thead>
                      <tr className="bg-gray-100 text-gray-700 font-extrabold border-b border-gray-200 uppercase tracking-wider">
                        <th className="p-3.5 w-12 text-center">#</th>
                        <th className="p-3.5 min-w-[130px]">Contact Name</th>
                        <th className="p-3.5 min-w-[140px]">Phone</th>
                        <th className="p-3.5 min-w-[130px] font-extrabold text-amber-700">Follow-up Date</th>
                        <th className="p-3.5 min-w-[200px]">Note</th>
                        <th className="p-3.5 min-w-[220px] font-extrabold text-indigo-700">Forward Date</th>
                        <th className="p-3.5 w-28 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white font-medium">
                      {followupTodayChatsList.map((chat, idx) => {
                        const { displayName, formattedPhone, cleanPhone } = getCleanDisplayContact(chat);
                        const noteContent = chat.notes || (Array.isArray(chat.notesList) ? chat.notesList.join('\n') : '') || '—';
                        return (
                          <tr key={chat.jid} className="hover:bg-amber-50/30 transition-colors">
                            <td className="p-3.5 text-center text-gray-400 font-mono font-bold">{idx + 1}</td>
                            <td className="p-3.5 font-extrabold text-black">{displayName}</td>
                            <td className="p-3.5 font-extrabold text-[#00a884]">📞 {formattedPhone}</td>
                            <td className="p-3.5 font-extrabold text-amber-800 bg-amber-50/80">
                              📅 {formatDateDDMMYYYY(chat.followUpDate)}
                            </td>
                            <td className="p-3.5 text-gray-700 font-medium whitespace-pre-wrap break-words max-w-[240px]">
                              {noteContent}
                            </td>
                            <td className="p-3.5">
                              <div className="flex items-center gap-2 bg-indigo-50 p-1.5 rounded-lg border border-indigo-200 w-max">
                                <input
                                  type="date"
                                  defaultValue=""
                                  min={todayLocalStr}
                                  onChange={async (e) => {
                                    const newDate = e.target.value;
                                    if (!newDate) return;
                                    await updateCrmMetadata(chat.jid, {
                                      followUpDate: newDate,
                                    });
                                  }}
                                  className="px-2.5 py-1 bg-white border border-indigo-300 rounded-md text-xs text-indigo-950 font-bold outline-none cursor-pointer hover:border-indigo-600 focus:border-indigo-600 transition-all shadow-sm"
                                  title="Select new date to forward follow-up directly"
                                />
                                <span className="text-[11px] font-extrabold text-indigo-700 pr-1 flex items-center gap-0.5 select-none">
                                  Forward ⏩
                                </span>
                              </div>
                            </td>
                            <td className="p-3.5 text-center whitespace-nowrap">
                              <button
                                onClick={() => { setShowFollowupsTodayModal(false); handleOpenSpecificChat(cleanPhone); }}
                                className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs rounded-lg transition-all shadow-sm inline-flex items-center gap-1"
                              >
                                Chat ↗
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
            {/* Footer */}
            <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex justify-end">
              <button onClick={() => setShowFollowupsTodayModal(false)} className="px-5 py-2 bg-black hover:bg-zinc-800 text-white font-bold text-xs rounded-xl transition-all shadow-sm">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT / FORWARD LEAD MODAL (EXACT MATCH WITH WHATSAPP EXTENSION UI) ── */}
      {editingContact && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 text-black font-sans">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-[#e9edef] flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in duration-150">
            {/* Header matching Extension */}
            <div className="h-[56px] bg-[#f0f2f5] border-b border-[#e9edef] flex items-center justify-between px-4 flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-amber-500 font-extrabold text-base">⚡</span>
                <span className="font-extrabold text-sm text-[#111b21]">AI CRM</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (editingContact) {
                      setClearTargetChat(editingContact);
                    }
                  }}
                  className="px-3 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-extrabold text-xs rounded-xl border border-rose-200 transition-all flex items-center gap-1 shadow-2xs active:scale-95 cursor-pointer"
                  title="Clear lead completely from CRM & reset AI auto-replies"
                >
                  <span>🗑️ Clear Lead</span>
                </button>
                <button
                  onClick={() => setEditingContact(null)}
                  className="w-7 h-7 rounded-full hover:bg-[#e9edef] flex items-center justify-center text-[#667781] transition-colors text-base font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Save Success Toast Banner */}
            {saveSuccessToast && (
              <div className="bg-[#00a884] text-white py-2 px-4 text-xs font-extrabold text-center transition-all animate-in fade-in">
                ✓ Contact info saved successfully!
              </div>
            )}

            {/* Body matching Extension Sidebar */}
            <div className="overflow-y-auto flex-1 p-4 space-y-4">
              {/* Contact Card */}
              <div className="bg-[#f0f2f5] border border-[#e9edef] rounded-xl p-3.5 text-center flex flex-col items-center shadow-sm">
                <div className="w-14 h-14 rounded-full bg-white border-2 border-white shadow-sm flex items-center justify-center font-black text-xl text-gray-700 uppercase mb-1.5">
                  {getCleanDisplayContact(editingContact).displayName.slice(0, 2)}
                </div>
                <div className="text-sm font-extrabold text-[#111b21]">
                  {getCleanDisplayContact(editingContact).displayName}
                </div>
                <div className="text-xs font-bold text-[#00a884] mt-0.5">
                  📞 {getCleanDisplayContact(editingContact).formattedPhone}
                </div>
              </div>

              {/* CALL Section */}
              <div>
                <div className="text-[11px] font-bold text-[#667781] uppercase tracking-wider mb-1.5">CALL</div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditCallStatus('YES')}
                    className={`py-2 rounded-lg text-xs font-bold border transition-all text-center ${
                      editCallStatus === 'YES'
                        ? 'bg-[#111b21] text-white border-[#111b21] shadow-sm'
                        : 'bg-[#f0f2f5] hover:bg-[#e9edef] text-[#111b21] border-[#e9edef]'
                    }`}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditCallStatus('NO')}
                    className={`py-2 rounded-lg text-xs font-bold border transition-all text-center ${
                      editCallStatus === 'NO'
                        ? 'bg-[#111b21] text-white border-[#111b21] shadow-sm'
                        : 'bg-[#f0f2f5] hover:bg-[#e9edef] text-[#111b21] border-[#e9edef]'
                    }`}
                  >
                    No
                  </button>
                </div>
              </div>

              {/* LEAD STATUS Section */}
              <div>
                <div className="text-[11px] font-bold text-[#667781] uppercase tracking-wider mb-1.5">LEAD STATUS</div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditStatus('INTERESTED')}
                    className={`py-2 px-1 rounded-lg text-xs font-bold border transition-all text-center ${
                      editStatus === 'INTERESTED'
                        ? 'bg-[#e7fce8] text-[#0f5132] border-[#25d366] shadow-sm'
                        : 'bg-[#f0f2f5] hover:bg-[#e9edef] text-[#111b21] border-[#e9edef]'
                    }`}
                  >
                    👍 Interested
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditStatus('WARM_INTERESTED')}
                    className={`py-2 px-1 rounded-lg text-xs font-bold border transition-all text-center ${
                      editStatus === 'WARM_INTERESTED' || editStatus === 'WARM'
                        ? 'bg-[#fff8e1] text-[#b78103] border-[#ffb300] shadow-sm'
                        : 'bg-[#f0f2f5] hover:bg-[#e9edef] text-[#111b21] border-[#e9edef]'
                    }`}
                  >
                    🔥 Warm
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditStatus('NOT_INTERESTED')}
                    className={`py-2 px-1 rounded-lg text-xs font-bold border transition-all text-center ${
                      editStatus === 'NOT_INTERESTED'
                        ? 'bg-[#ffebee] text-[#c62828] border-[#e53935] shadow-sm'
                        : 'bg-[#f0f2f5] hover:bg-[#e9edef] text-[#111b21] border-[#e9edef]'
                    }`}
                  >
                    👎 Not Interested
                  </button>
                </div>
              </div>

              {/* FOLLOW-UP SCHEDULE Section */}
              <div>
                <div className="text-[11px] font-bold text-[#667781] uppercase tracking-wider mb-1.5">FOLLOW-UP SCHEDULE</div>
                <input
                  type="date"
                  value={forwardDateInput}
                  min={todayLocalStr}
                  onChange={(e) => setForwardDateInput(e.target.value)}
                  className="w-full p-2.5 bg-[#f0f2f5] border border-[#e9edef] rounded-lg text-xs font-bold text-[#111b21] outline-none focus:border-[#00a884] transition-all"
                />
              </div>

              {/* CRM NOTES Section */}
              <div>
                <div className="text-[11px] font-bold text-[#667781] uppercase tracking-wider mb-1.5">CRM NOTES</div>
                <textarea
                  rows={3}
                  value={editNoteInputText}
                  onChange={(e) => setEditNoteInputText(e.target.value)}
                  placeholder="Add key note about customer requirements..."
                  className="w-full p-2.5 bg-[#f0f2f5] border border-[#e9edef] rounded-lg text-xs text-[#111b21] outline-none focus:bg-white focus:border-[#00a884] transition-all"
                />
                <button
                  type="button"
                  onClick={() => {
                    const text = editNoteInputText.trim();
                    if (!text) return;
                    setEditNotesList([...editNotesList, text]);
                    setEditNoteInputText('');
                  }}
                  className="w-full py-2 bg-[#f0f2f5] hover:bg-[#e9edef] text-[#111b21] font-bold text-xs rounded-lg border border-[#e9edef] mt-1.5 transition-all shadow-sm active:scale-95"
                >
                  + Add Note
                </button>

                {/* Notes List */}
                {editNotesList.length > 0 && (
                  <div className="mt-2.5 max-h-[140px] overflow-y-auto space-y-1.5">
                    {editNotesList.map((n, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 p-2 bg-[#f7f7f7] border border-[#e5e5e5] rounded-lg"
                      >
                        <span className="flex-1 text-xs text-[#111b21] leading-relaxed break-words font-medium">
                          <span className="font-bold mr-1">{i + 1}.</span> {n}
                        </span>
                        <button
                          type="button"
                          onClick={() => setEditNotesList(editNotesList.filter((_, idx) => idx !== i))}
                          title="Delete this note"
                          className="text-[#cc0000] hover:bg-[#ffeef0] p-1 rounded text-xs transition-colors flex-shrink-0"
                        >
                          🗑️
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Save & Clear Buttons */}
              {/* Save Button */}
              <div className="pt-2">
                <button
                  type="button"
                  disabled={isSavingEdit}
                  onClick={async () => {
                    if (!editingContact) return;
                    setIsSavingEdit(true);
                    try {
                      let finalNotesList = [...editNotesList];
                      if (editNoteInputText.trim()) {
                        finalNotesList.push(editNoteInputText.trim());
                      }

                      await updateCrmMetadata(editingContact.jid, {
                        followUpDate: forwardDateInput || undefined,
                        leadStatus: editStatus as any,
                        callStatus: editCallStatus as any,
                        notes: finalNotesList.join('\n\n'),
                        notesList: finalNotesList,
                        isAutoWarm: false,
                        manuallySaved: true,
                      } as any);

                      setSaveSuccessToast(true);
                      setTimeout(() => {
                        setEditingContact(null);
                        setSaveSuccessToast(false);
                      }, 500);
                    } finally {
                      setIsSavingEdit(false);
                    }
                  }}
                  className="w-full py-3 bg-[#00a884] hover:bg-[#008f6f] text-white font-extrabold text-xs rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {isSavingEdit ? 'Saving...' : '💾 Save Contact Info'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAdminModal && (
        <AdminProfileModal
          onClose={() => setShowAdminModal(false)}
          onSaveSuccess={refreshAdminProfile}
        />
      )}

      {/* WhatsApp QR Code Link Modal */}
      <QrCodeModal
        isOpen={showQrModal}
        onClose={() => setShowQrModal(false)}
      />

      {/* Sleek Custom Middle-Screen Logout Confirmation Modal */}
      <CustomModal
        isOpen={showLogoutModal}
        type="danger"
        title="Log Out of Ai Vastra CRM?"
        message="Are you sure you want to log out of your session? You will need to enter your username and password again to sign back in."
        confirmText="Log Out Now"
        cancelText="Cancel"
        onClose={() => setShowLogoutModal(false)}
        onConfirm={() => {
          localStorage.removeItem('crm_authenticated');
          window.location.reload();
        }}
      />

      {/* Sleek Custom Confirmation Modal for Clearing Lead */}
      <CustomModal
        isOpen={Boolean(clearTargetChat)}
        type="danger"
        title={`Clear lead for ${clearTargetChat?.name || clearTargetChat?.phone}?`}
        message="Are you sure you want to clear all CRM data for this contact? This will remove the lead from the CRM dashboard and archive the data."
        confirmText="Yes, Clear"
        cancelText="Cancel"
        onClose={() => setClearTargetChat(null)}
        onConfirm={() => {
          if (clearTargetChat) {
            handlePerformClearChat(clearTargetChat);
            setEditingContact(null);
          }
        }}
      />
    </div>
  );
}
