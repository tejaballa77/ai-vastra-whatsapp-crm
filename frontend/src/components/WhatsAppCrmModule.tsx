'use client';

import React, { useState } from 'react';
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
  User as UserIcon
} from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { SettingsAiAgent } from './SettingsAiAgent';
import { ColdCallsModule } from './ColdCallsModule';
import { AdminProfileModal } from './AdminProfileModal';
import { CustomModal } from './CustomModal';

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

  const [activeNav, setActiveNav] = useState<'whatsapp' | 'calls' | 'emails' | 'settings'>('whatsapp');
  const [coldCallsSubPage, setColdCallsSubPage] = useState<'analytics' | 'sheet' | 'database'>('analytics');
  const [tableFilter, setTableFilter] = useState<'ALL' | 'INTERESTED' | 'WARM' | 'NOT_INTERESTED' | 'CALLS' | 'FOLLOWUPS'>('ALL');
  const [modalCategory, setModalCategory] = useState<'INTERESTED' | 'WARM' | 'NOT_INTERESTED' | 'CALLS' | 'FOLLOWUPS' | null>(null);
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const { chats: rawChats } = useSocket();

  const BAD_NAMES = new Set(['.', 'contact', 'unsaved contact', 'unknown contact', 'whatsapp contact', '']);
  const canonicalPhone = (raw: string) => {
    const digits = (raw || '').replace(/\D/g, '');
    if (digits.length > 13 || digits.length === 15) return '';
    if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
    if (digits.length === 13 && digits.startsWith('091')) return digits.slice(3);
    if (digits.length === 10) return digits;
    return '';
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
    const rawDigits = (c.phone || c.jid.split('@')[0] || '').replace(/\D/g, '');
    if (c.jid.endsWith('@lid') || rawDigits.length > 13 || rawDigits.length === 15) {
      continue;
    }
    const dedupeKey = canonicalPhone(rawDigits) || c.jid;
    if (!chatsMap.has(dedupeKey)) {
      chatsMap.set(dedupeKey, c);
    } else {
      const existing = chatsMap.get(dedupeKey)!;
      // Prioritize the chat object that has the most recent activity / explicit data
      const pickChat = (c.lastMessageAt || 0) >= (existing.lastMessageAt || 0) ? c : existing;
      const otherChat = pickChat === c ? existing : c;

      const mergedLeadStatus = (pickChat.leadStatus && pickChat.leadStatus !== 'UNASSIGNED') 
        ? pickChat.leadStatus 
        : (otherChat.leadStatus && otherChat.leadStatus !== 'UNASSIGNED' ? otherChat.leadStatus : 'UNASSIGNED');

      const mergedCallStatus = pickChat.callStatus !== undefined ? pickChat.callStatus : otherChat.callStatus;
      const mergedFollowUpDate = pickChat.followUpDate !== undefined ? pickChat.followUpDate : otherChat.followUpDate;
      const mergedNotes = pickChat.notes !== undefined ? pickChat.notes : otherChat.notes;
      const mergedNotesList = pickChat.notesList !== undefined ? pickChat.notesList : (otherChat.notesList || []);

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
        lastMessageAt: Math.max(existing.lastMessageAt || 0, c.lastMessageAt || 0),
      });
    }
  }

  const chats = Array.from(chatsMap.values());

  // Compute 100% DYNAMIC real stats from database chats (Default 0)
  const interestedChats = chats.filter((c) => c.leadStatus === 'INTERESTED');
  const warmChats = chats.filter((c) => c.leadStatus === 'WARM_INTERESTED' || c.leadStatus === 'WARM');
  const notInterestedChats = chats.filter((c) => c.leadStatus === 'NOT_INTERESTED');
  const unassignedChats = chats.filter((c) => !c.leadStatus || c.leadStatus === 'UNASSIGNED');

  const interestedCount = interestedChats.length;
  const warmCount = warmChats.length;
  const notInterestedCount = notInterestedChats.length;
  const unassignedCount = unassignedChats.length;

  const callsYesChats = chats.filter((c) => c.callStatus === 'YES');
  const followUpChats = chats.filter((c) => Boolean(c.followUpDate && c.followUpDate.trim().length > 0 && c.leadStatus !== 'UNASSIGNED'));

  const callsYesCount = callsYesChats.length;
  const followUpsCount = followUpChats.length;

  // Filtered chats where user has actively entered CRM info (Lead Status, Call:Yes, or Notes)
  // If cleared (leadStatus = UNASSIGNED and no notes and callStatus != YES), excluded completely!
  const savedLeads = chats.filter(
    (c) =>
      (c.leadStatus && c.leadStatus !== 'UNASSIGNED') ||
      c.callStatus === 'YES' ||
      (c.notesList && c.notesList.length > 0) ||
      Boolean(c.notes && c.notes.trim().length > 0)
  );

  // Filter for TODAY's WhatsApp Activity Feed only (messages sent or received today)
  const isToday = (ts?: number) => {
    if (!ts || ts <= 0) return false;
    const timeMs = ts < 10000000000 ? ts * 1000 : ts;
    const msgDate = new Date(timeMs);
    const today = new Date();
    return (
      msgDate.getDate() === today.getDate() &&
      msgDate.getMonth() === today.getMonth() &&
      msgDate.getFullYear() === today.getFullYear()
    );
  };

  const todayActivityChats = chats
    .filter((c) => isToday(c.lastMessageAt))
    .sort((a, b) => {
      const tsA = (a.lastMessageAt || 0) < 10000000000 ? (a.lastMessageAt || 0) * 1000 : (a.lastMessageAt || 0);
      const tsB = (b.lastMessageAt || 0) < 10000000000 ? (b.lastMessageAt || 0) * 1000 : (b.lastMessageAt || 0);
      return tsB - tsA;
    });

  // Filter table leads based on selected sub-filter and search
  const filteredTableLeads = savedLeads.filter((c) => {
    const matchesSearch =
      (c.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.phone || c.jid || '').toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (tableFilter === 'INTERESTED') return c.leadStatus === 'INTERESTED';
    if (tableFilter === 'WARM') return c.leadStatus === 'WARM_INTERESTED' || c.leadStatus === 'WARM';
    if (tableFilter === 'NOT_INTERESTED') return c.leadStatus === 'NOT_INTERESTED';
    if (tableFilter === 'CALLS') return c.callStatus === 'YES';
    if (tableFilter === 'FOLLOWUPS') return Boolean(c.followUpDate);

    return true;
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
        return followUpChats;
      default:
        return [];
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
          {/* Top Logo Box matching User Image */}
          <div className="px-4 py-3.5 mb-6 bg-white rounded-2xl border border-zinc-200 shadow-sm flex items-center justify-center">
            <img src="/ai_vastra_logo.png" alt="Ai Vastra" className="w-full h-auto max-h-11 object-contain" />
          </div>

          <nav className="space-y-2">
            <button
              onClick={() => setActiveNav('whatsapp')}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-base transition-all ${
                activeNav === 'whatsapp' ? 'bg-black text-white shadow-md font-extrabold' : 'text-zinc-700 hover:bg-zinc-100 hover:text-black font-semibold'
              }`}
            >
              <MessageSquare className="w-5 h-5" />
              <span className="flex-1 text-left">WhatsApp</span>
            </button>

            <button
              onClick={() => setActiveNav('calls')}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-base transition-all ${
                activeNav === 'calls' ? 'bg-black text-white shadow-md font-extrabold' : 'text-zinc-700 hover:bg-zinc-100 hover:text-black font-semibold'
              }`}
            >
              <PhoneCall className="w-5 h-5" />
              <span className="flex-1 text-left">Cold Calls</span>
            </button>

            <button
              onClick={() => setActiveNav('emails')}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-base transition-all ${
                activeNav === 'emails' ? 'bg-black text-white shadow-md font-extrabold' : 'text-zinc-700 hover:bg-zinc-100 hover:text-black font-semibold'
              }`}
            >
              <Mail className="w-5 h-5" />
              <span>Emails</span>
              <span className="ml-auto text-xs bg-[#f4f4f5] text-zinc-500 border border-zinc-200 px-2.5 py-0.5 rounded-full font-semibold">Soon</span>
            </button>

            <button
              onClick={() => setActiveNav('settings')}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-base transition-all ${
                activeNav === 'settings' ? 'bg-black text-white shadow-md font-extrabold' : 'text-zinc-700 hover:bg-zinc-100 hover:text-black font-semibold'
              }`}
            >
              <Settings className="w-5 h-5" />
              <span>Settings & AI Agent</span>
            </button>
          </nav>
        </div>

        {/* Bottom Sidebar: Admin Profile Block + Logout Icon Button */}
        <div className="pt-4 border-t border-zinc-200 flex items-center justify-between gap-2 mt-auto">
          <button
            onClick={() => setShowAdminModal(true)}
            className="flex-1 flex items-center gap-3 p-3 rounded-2xl bg-[#f4f4f5] hover:bg-zinc-200/80 border border-zinc-200/80 transition-all text-left group overflow-hidden"
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
            className="p-3 rounded-2xl bg-[#f4f4f5] hover:bg-rose-50 hover:text-rose-600 text-zinc-700 border border-zinc-200/80 transition-all flex-shrink-0"
            title="Log Out of CRM"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden bg-white text-black">
        <header className="h-16 bg-white border-b border-zinc-200 px-6 flex items-center justify-between flex-shrink-0">
          <h2 className="text-2xl font-extrabold text-black tracking-tight">
            {activeNav === 'whatsapp' ? 'WhatsApp CRM Dashboard' : activeNav === 'calls' ? (coldCallsSubPage === 'analytics' ? 'Cold Calls Dashboard' : 'Cold Calls Lead List') : 'Settings & AI Agent'}
          </h2>

          {/* COLD CALLS 2-PAGE SELECTOR PILL BAR IN TOP HEADER (Positioned on the FAR RIGHT END with larger size) */}
          {activeNav === 'calls' && (
            <div className="flex items-center gap-2 bg-zinc-100 p-1.5 rounded-2xl border border-zinc-300 shadow-sm ml-auto">
              <button
                onClick={() => setColdCallsSubPage('analytics')}
                className={`px-5 py-2 rounded-xl text-sm font-extrabold transition-all flex items-center gap-2 cursor-pointer ${
                  coldCallsSubPage === 'analytics'
                    ? 'bg-black text-white shadow-md'
                    : 'text-zinc-700 hover:text-black hover:bg-zinc-200'
                }`}
              >
                <span>📊 1. Dashboard</span>
              </button>
              <button
                onClick={() => setColdCallsSubPage('sheet')}
                className={`px-5 py-2 rounded-xl text-sm font-extrabold transition-all flex items-center gap-2 cursor-pointer ${
                  coldCallsSubPage === 'sheet'
                    ? 'bg-black text-white shadow-md'
                    : 'text-zinc-700 hover:text-black hover:bg-zinc-200'
                }`}
              >
                <span>📋 2. Cold Calls List</span>
              </button>
            </div>
          )}

          {/* Launch WhatsApp Web button (ONLY for WhatsApp module) */}
          {activeNav === 'whatsapp' && (
            <button
              onClick={() => handleOpenSpecificChat()}
              className="px-4 py-2 bg-black hover:bg-zinc-800 text-white font-bold text-sm rounded-xl transition-all flex items-center gap-2 shadow-sm"
            >
              <span>Launch WhatsApp Web</span>
              <ExternalLink className="w-4 h-4" />
            </button>
          )}
        </header>

        {activeNav === 'whatsapp' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-zinc-50/50">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              <div 
                onClick={() => setModalCategory('INTERESTED')}
                className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm hover:shadow-md hover:border-black transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-zinc-600 uppercase tracking-wider">INTERESTED</span>
                  <div className="w-9 h-9 rounded-xl bg-zinc-100 flex items-center justify-center text-black">
                    <ThumbsUp className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-3xl font-extrabold text-black mb-1">{interestedCount}</div>
                <span className="text-xs font-bold text-black group-hover:underline flex items-center gap-1">
                  Click to view leads <ChevronRight className="w-3.5 h-3.5" />
                </span>
              </div>

              <div 
                onClick={() => setModalCategory('WARM')}
                className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm hover:shadow-md hover:border-black transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-zinc-600 uppercase tracking-wider">WARM</span>
                  <div className="w-9 h-9 rounded-xl bg-zinc-100 flex items-center justify-center text-black">
                    <Flame className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-3xl font-extrabold text-black mb-1">{warmCount}</div>
                <span className="text-xs font-bold text-black group-hover:underline flex items-center gap-1">
                  Click to view leads <ChevronRight className="w-3.5 h-3.5" />
                </span>
              </div>

              <div 
                onClick={() => setModalCategory('NOT_INTERESTED')}
                className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm hover:shadow-md hover:border-black transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-zinc-600 uppercase tracking-wider">NOT INTERESTED</span>
                  <div className="w-9 h-9 rounded-xl bg-zinc-100 flex items-center justify-center text-black">
                    <ThumbsDown className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-3xl font-extrabold text-black mb-1">{notInterestedCount}</div>
                <span className="text-xs font-bold text-black group-hover:underline flex items-center gap-1">
                  Click to view leads <ChevronRight className="w-3.5 h-3.5" />
                </span>
              </div>

              <div 
                onClick={() => setModalCategory('FOLLOWUPS')}
                className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm hover:shadow-md hover:border-black transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-zinc-600 uppercase tracking-wider">CALLS & FOLLOW-UPS</span>
                  <div className="w-9 h-9 rounded-xl bg-zinc-100 flex items-center justify-center text-black">
                    <Calendar className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-3xl font-extrabold text-black mb-1">{callsYesCount + followUpsCount}</div>
                <span className="text-xs text-zinc-600 font-bold">
                  Calls ({callsYesCount}) • Dates ({followUpsCount})
                </span>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-xl font-extrabold text-black flex items-center gap-2">
                    <FileText className="w-6 h-6 text-black" />
                    Saved Lead Registry & Contact Settings
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

                  <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-xl border border-zinc-200">
                    <button
                      onClick={() => setTableFilter('ALL')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        tableFilter === 'ALL' ? 'bg-black text-white shadow-sm' : 'text-zinc-700 hover:text-black'
                      }`}
                    >
                      All ({savedLeads.length})
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
                      Warm ({warmCount})
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
                    {filteredTableLeads.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-10 text-center text-zinc-500 italic text-sm">
                          No saved contact settings found matching filter. Enter contact info on WhatsApp Web via Extension!
                        </td>
                      </tr>
                    ) : (
                      filteredTableLeads.map((chat) => {
                        const { displayName, formattedPhone, cleanPhone } = getCleanDisplayContact(chat);

                        return (
                          <tr key={chat.jid} className="hover:bg-zinc-50 transition-colors">
                            <td className="p-4">
                              <div className="font-extrabold text-black text-base">{displayName}</div>
                              <div className="text-zinc-600 font-semibold text-xs flex items-center gap-1.5 mt-1">
                                <span>📞 {formattedPhone}</span>
                                <button
                                  onClick={() => handleCopyPhone(cleanPhone)}
                                  className="text-zinc-400 hover:text-black"
                                  title="Copy Phone Number"
                                >
                                  {copiedPhone === cleanPhone ? (
                                    <Check className="w-3.5 h-3.5 text-black" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>
                            </td>

                            <td className="p-4">
                              {chat.leadStatus === 'INTERESTED' && (
                                <span className="px-3 py-1 text-xs font-extrabold bg-black text-white rounded-md">
                                  Interested
                                </span>
                              )}
                              {chat.leadStatus === 'WARM_INTERESTED' && (
                                <span className="px-3 py-1 text-xs font-extrabold bg-zinc-800 text-white rounded-md">
                                  Warm
                                </span>
                              )}
                              {chat.leadStatus === 'NOT_INTERESTED' && (
                                <span className="px-3 py-1 text-xs font-extrabold bg-zinc-200 text-zinc-800 rounded-md">
                                  Not Interested
                                </span>
                              )}
                              {(!chat.leadStatus || chat.leadStatus === 'UNASSIGNED') && (
                                <span className="px-2 py-0.5 text-xs text-zinc-400 italic">Unassigned</span>
                              )}
                            </td>

                            <td className="p-4">
                              {chat.callStatus === 'YES' ? (
                                <span className="px-3 py-1 text-xs font-extrabold bg-black text-white rounded-md">
                                  Call: Yes
                                </span>
                              ) : (
                                <span className="text-zinc-400 text-xs">No</span>
                              )}
                            </td>

                            <td className="p-4">
                              {chat.followUpDate ? (
                                <span className="px-3 py-1 text-xs font-extrabold bg-zinc-100 text-black border border-black rounded-md flex items-center gap-1 w-max">
                                  📅 {chat.followUpDate}
                                </span>
                              ) : (
                                <span className="text-zinc-400 text-xs">None</span>
                              )}
                            </td>

                            <td className="p-4 max-w-xs">
                              {chat.notesList && chat.notesList.length > 0 ? (
                                <p className="truncate text-zinc-800 italic text-sm" title={chat.notesList[0]}>
                                  "{chat.notesList[0]}"
                                </p>
                              ) : (
                                <span className="text-zinc-400 text-xs">No notes</span>
                              )}
                            </td>

                            <td className="p-4 text-right">
                              <button
                                onClick={() => handleOpenSpecificChat(chat.phone || chat.jid)}
                                className="px-4 py-2 bg-black hover:bg-zinc-800 text-white font-bold text-xs rounded-xl transition-all inline-flex items-center gap-1.5 shadow-sm active:scale-95"
                                title={`Open Chat for ${chat.name || chat.phone} directly in WhatsApp Web`}
                              >
                                <span>Open Chat</span>
                                <ExternalLink className="w-3.5 h-3.5" />
                              </button>
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
          <div className="flex-1 overflow-y-auto" ref={el => { if (el) el.scrollTop = 0; }}>
            <SettingsAiAgent />
          </div>
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
                          <p className="text-xs text-gray-500 font-medium flex items-center gap-1">
                            <span>📞 {formattedPhone}</span>
                            <button
                              onClick={() => handleCopyPhone(cleanPhone)}
                              className="text-gray-400 hover:text-gray-700 ml-1"
                              title="Copy Phone Number"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          </p>
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
                          Follow-up: {chat.followUpDate}
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

      {showAdminModal && (
        <AdminProfileModal
          onClose={() => setShowAdminModal(false)}
          onSaveSuccess={refreshAdminProfile}
        />
      )}

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
    </div>
  );
}
