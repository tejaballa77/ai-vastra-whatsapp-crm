'use client';

import React, { useState } from 'react';
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
  FileText
} from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { SettingsAiAgent } from './SettingsAiAgent';

export function WhatsAppCrmModule() {
  const [activeNav, setActiveNav] = useState<'whatsapp' | 'calls' | 'emails' | 'settings'>('whatsapp');
  const [tableFilter, setTableFilter] = useState<'ALL' | 'INTERESTED' | 'WARM' | 'NOT_INTERESTED' | 'CALLS' | 'FOLLOWUPS'>('ALL');
  const [modalCategory, setModalCategory] = useState<'INTERESTED' | 'WARM' | 'NOT_INTERESTED' | 'CALLS' | 'FOLLOWUPS' | null>(null);
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const { chats: rawChats } = useSocket();

  // Deduplicate chats strictly by canonical 10-digit phone number
  const BAD_NAMES = new Set(['.', 'contact', 'unsaved contact', 'unknown contact', '']);
  const canonicalPhone = (raw: string) => {
    const digits = (raw || '').replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
    if (digits.length === 13 && digits.startsWith('091')) return digits.slice(3);
    return digits;
  };

  const chatsMap = new Map<string, (typeof rawChats)[0]>();
  for (const c of rawChats) {
    const cleanNum = (c.phone || c.jid.split('@')[0] || '').replace(/\D/g, '');
    const dedupeKey = canonicalPhone(cleanNum) || c.jid;
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
  const followUpChats = chats.filter((c) => Boolean(c.followUpDate));

  const callsYesCount = callsYesChats.length;
  const followUpsCount = followUpChats.length;
  const unreadChatsCount = chats.filter((c) => (c.unreadCount || 0) > 0).length;

  // Filtered chats where ANY contact info settings have been entered by user
  const savedLeads = chats.filter(
    (c) =>
      (c.leadStatus && c.leadStatus !== 'UNASSIGNED') ||
      c.callStatus === 'YES' ||
      Boolean(c.followUpDate) ||
      (c.notesList && c.notesList.length > 0) ||
      Boolean(c.notes)
  );

  // Filter table leads based on selected sub-filter and search
  const filteredTableLeads = savedLeads.filter((c) => {
    const matchesSearch =
      (c.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.phone || c.jid || '').toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (tableFilter === 'INTERESTED') return c.leadStatus === 'INTERESTED';
    if (tableFilter === 'WARM') return c.leadStatus === 'WARM_INTERESTED';
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
    <div className="w-screen h-screen flex overflow-hidden bg-[#f0f2f5] text-[#111b21] font-sans">
      {/* 1. Main Left Navigation Bar (WhatsApp placed 1st on Top) */}
      <aside className="w-64 bg-[#111b21] text-white flex flex-col justify-between p-4 flex-shrink-0 select-none">
        <div>
          <div className="flex items-center gap-3 px-2 py-4 mb-6 border-b border-gray-800">
            <div className="w-9 h-9 rounded-xl bg-[#00a884] flex items-center justify-center text-white font-bold text-lg shadow-md">
              ⚡
            </div>
            <div>
              <h1 className="font-bold text-base tracking-wide text-white">AI Vastra CRM</h1>
              <p className="text-xs text-gray-400">Multichannel Workspace</p>
            </div>
          </div>

          <nav className="space-y-1.5">
            {/* 1. WhatsApp placed first at the top */}
            <button
              onClick={() => setActiveNav('whatsapp')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeNav === 'whatsapp' ? 'bg-[#00a884] text-white shadow-sm' : 'text-gray-300 hover:bg-gray-800/60'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span className="flex-1 text-left font-semibold">WhatsApp</span>
              {unreadChatsCount > 0 && (
                <span className="px-2 py-0.5 text-[11px] font-bold bg-[#25d366] text-white rounded-full">
                  {unreadChatsCount}
                </span>
              )}
            </button>

            {/* 2. Cold Calls */}
            <button
              onClick={() => setActiveNav('calls')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeNav === 'calls' ? 'bg-[#00a884] text-white shadow-sm' : 'text-gray-300 hover:bg-gray-800/60'
              }`}
            >
              <PhoneCall className="w-4 h-4" />
              <span>Cold Calls</span>
              <span className="ml-auto text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">Soon</span>
            </button>

            {/* 3. Emails */}
            <button
              onClick={() => setActiveNav('emails')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeNav === 'emails' ? 'bg-[#00a884] text-white shadow-sm' : 'text-gray-300 hover:bg-gray-800/60'
              }`}
            >
              <Mail className="w-4 h-4" />
              <span>Emails</span>
              <span className="ml-auto text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">Soon</span>
            </button>

            {/* 4. Settings & AI Agent */}
            <button
              onClick={() => setActiveNav('settings')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeNav === 'settings' ? 'bg-[#00a884] text-white shadow-sm' : 'text-gray-300 hover:bg-gray-800/60'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>Settings & AI Agent</span>
            </button>
          </nav>
        </div>

        <div className="p-3 rounded-xl bg-gray-900 border border-gray-800 text-xs text-gray-400">
          <div className="flex items-center gap-2 mb-1 text-white font-medium">
            <span className="w-2 h-2 rounded-full bg-[#25d366] animate-pulse"></span>
            WhatsApp Web Extension
          </div>
          <p className="text-[11px] text-gray-400">Extension active on web.whatsapp.com</p>
        </div>
      </aside>

      {/* 2. Main Workspace Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden bg-[#f0f2f5]">
        {/* Top Header Bar */}
        <header className="h-16 bg-white border-b border-gray-200 px-6 flex items-center justify-between flex-shrink-0 shadow-sm">
          <div className="flex items-center gap-6">
            <h2 className="text-xl font-bold text-[#111b21]">WhatsApp CRM Dashboard</h2>
          </div>

          <div className="flex items-center gap-3">
            {/* Export CSV Button for Telecallers */}
            <button
              onClick={handleExportCsv}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-gray-100 text-gray-700 font-semibold text-xs rounded-xl hover:bg-gray-200 transition-all border border-gray-300"
              title="Export Saved Leads to CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Leads ({savedLeads.length})</span>
            </button>

            {/* Direct Launch WhatsApp Web Primary Button */}
            <button
              onClick={() => handleOpenSpecificChat()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#00a884] text-white font-semibold text-xs rounded-xl hover:bg-[#008f70] transition-all shadow-md active:scale-95"
            >
              <span>🚀 Launch WhatsApp Web</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        </header>

        {/* Dynamic Dashboard Content */}
        {activeNav === 'whatsapp' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Block 1: Executive Stat Cards (INTERESTED, WARM, NOT INTERESTED - DEFAULT 0) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-5">
              {/* Interested Card */}
              <div 
                onClick={() => setModalCategory('INTERESTED')}
                className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center justify-between cursor-pointer hover:border-emerald-500 hover:shadow-md transition-all group"
              >
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Interested</p>
                  <h3 className="text-2xl font-bold text-emerald-600">{interestedCount}</h3>
                  <p className="text-[11px] text-emerald-600 font-medium mt-1 flex items-center gap-1 group-hover:underline">
                    Click to view leads <ChevronRight className="w-3 h-3" />
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-emerald-50 text-[#00a884] flex items-center justify-center">
                  <ThumbsUp className="w-6 h-6" />
                </div>
              </div>

              {/* Warm Card */}
              <div 
                onClick={() => setModalCategory('WARM')}
                className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center justify-between cursor-pointer hover:border-amber-500 hover:shadow-md transition-all group"
              >
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Warm</p>
                  <h3 className="text-2xl font-bold text-amber-600">{warmCount}</h3>
                  <p className="text-[11px] text-amber-600 font-medium mt-1 flex items-center gap-1 group-hover:underline">
                    Click to view leads <ChevronRight className="w-3 h-3" />
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Flame className="w-6 h-6" />
                </div>
              </div>

              {/* Not Interested Card */}
              <div 
                onClick={() => setModalCategory('NOT_INTERESTED')}
                className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center justify-between cursor-pointer hover:border-rose-500 hover:shadow-md transition-all group"
              >
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Not Interested</p>
                  <h3 className="text-2xl font-bold text-rose-600">{notInterestedCount}</h3>
                  <p className="text-[11px] text-rose-600 font-medium mt-1 flex items-center gap-1 group-hover:underline">
                    Click to view leads <ChevronRight className="w-3 h-3" />
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                  <ThumbsDown className="w-6 h-6" />
                </div>
              </div>

              {/* Calls & Follow-ups Card */}
              <div 
                onClick={() => setModalCategory('FOLLOWUPS')}
                className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center justify-between cursor-pointer hover:border-purple-500 hover:shadow-md transition-all group"
              >
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Calls & Follow-ups</p>
                  <h3 className="text-2xl font-bold text-purple-600">{callsYesCount + followUpsCount}</h3>
                  <p className="text-[11px] text-purple-600 font-medium mt-1 flex items-center gap-1 group-hover:underline">
                    Calls ({callsYesCount}) • Dates ({followUpsCount})
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                  <Calendar className="w-6 h-6" />
                </div>
              </div>
            </div>

            {/* Block 2: SAVED LEAD REGISTRY & FOLLOW-UP TABLE */}
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold text-[#111b21] flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#00a884]" />
                    <span>Saved Lead Registry & Contact Settings</span>
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Shows all chats where contact info (Status, Call Yes/No, Follow-up date, Notes) was entered on WhatsApp Web.
                  </p>
                </div>

                {/* Sub-Filters & Search */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search name or number..."
                      className="pl-8 pr-3 py-1.5 text-xs bg-gray-100 border border-gray-200 rounded-lg focus:outline-none focus:border-[#00a884]"
                    />
                  </div>

                  <div className="flex items-center bg-gray-100 p-1 rounded-lg border border-gray-200">
                    <button
                      onClick={() => setTableFilter('ALL')}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                        tableFilter === 'ALL' ? 'bg-white text-[#111b21] shadow-sm' : 'text-gray-600'
                      }`}
                    >
                      All ({savedLeads.length})
                    </button>
                    <button
                      onClick={() => setTableFilter('INTERESTED')}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                        tableFilter === 'INTERESTED' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-600'
                      }`}
                    >
                      Interested ({interestedCount})
                    </button>
                    <button
                      onClick={() => setTableFilter('WARM')}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                        tableFilter === 'WARM' ? 'bg-amber-500 text-white shadow-sm' : 'text-gray-600'
                      }`}
                    >
                      Warm ({warmCount})
                    </button>
                    <button
                      onClick={() => setTableFilter('CALLS')}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                        tableFilter === 'CALLS' ? 'bg-purple-600 text-white shadow-sm' : 'text-gray-600'
                      }`}
                    >
                      Calls ({callsYesCount})
                    </button>
                  </div>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto border border-gray-200 rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#f0f2f5] text-gray-600 font-bold border-b border-gray-200">
                      <th className="p-3">Contact Name / Phone</th>
                      <th className="p-3">Lead Status</th>
                      <th className="p-3">Call Status</th>
                      <th className="p-3">Follow-up Date</th>
                      <th className="p-3">Latest CRM Notes</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {filteredTableLeads.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-gray-400 italic">
                          No saved contact settings found matching filter. Enter contact info on WhatsApp Web via Extension!
                        </td>
                      </tr>
                    ) : (
                      filteredTableLeads.map((chat) => {
                        const cleanPhone = (chat.phone || chat.jid.split('@')[0]).replace(/\D/g, '');
                        const formattedPhone = cleanPhone.length === 12 && cleanPhone.startsWith('91')
                          ? `+91 ${cleanPhone.slice(2, 7)} ${cleanPhone.slice(7)}`
                          : `+${cleanPhone}`;

                        return (
                          <tr key={chat.jid} className="hover:bg-gray-50 transition-colors">
                            <td className="p-3">
                              <div className="font-bold text-[#111b21]">{chat.name || 'Unsaved Contact'}</div>
                              <div className="text-gray-500 font-medium text-[11px] flex items-center gap-1.5 mt-0.5">
                                <span>📞 {formattedPhone}</span>
                                <button
                                  onClick={() => handleCopyPhone(cleanPhone)}
                                  className="text-gray-400 hover:text-gray-700"
                                  title="Copy Phone Number"
                                >
                                  {copiedPhone === cleanPhone ? (
                                    <Check className="w-3 h-3 text-emerald-600" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                </button>
                              </div>
                            </td>

                            <td className="p-3">
                              {chat.leadStatus === 'INTERESTED' && (
                                <span className="px-2.5 py-1 text-[11px] font-bold bg-emerald-100 text-emerald-800 rounded-full border border-emerald-200">
                                  👍 Interested
                                </span>
                              )}
                              {chat.leadStatus === 'WARM_INTERESTED' && (
                                <span className="px-2.5 py-1 text-[11px] font-bold bg-amber-100 text-amber-800 rounded-full border border-amber-200">
                                  🔥 Warm
                                </span>
                              )}
                              {chat.leadStatus === 'NOT_INTERESTED' && (
                                <span className="px-2.5 py-1 text-[11px] font-bold bg-rose-100 text-rose-800 rounded-full border border-rose-200">
                                  👎 Not Interested
                                </span>
                              )}
                              {(!chat.leadStatus || chat.leadStatus === 'UNASSIGNED') && (
                                <span className="px-2 py-0.5 text-[10px] text-gray-400 italic">Unassigned</span>
                              )}
                            </td>

                            <td className="p-3">
                              {chat.callStatus === 'YES' ? (
                                <span className="px-2 py-0.5 text-[11px] font-bold bg-purple-100 text-purple-700 rounded-full">
                                  Call: Yes
                                </span>
                              ) : (
                                <span className="text-gray-400 text-[11px]">No</span>
                              )}
                            </td>

                            <td className="p-3">
                              {chat.followUpDate ? (
                                <span className="px-2 py-0.5 text-[11px] font-bold bg-amber-100 text-amber-800 rounded-full flex items-center gap-1 w-max">
                                  📅 {chat.followUpDate}
                                </span>
                              ) : (
                                <span className="text-gray-400 text-[11px]">None</span>
                              )}
                            </td>

                            <td className="p-3 max-w-xs">
                              {chat.notesList && chat.notesList.length > 0 ? (
                                <p className="truncate text-gray-700 italic" title={chat.notesList[0]}>
                                  "{chat.notesList[0]}"
                                </p>
                              ) : (
                                <span className="text-gray-400 text-[11px]">No notes</span>
                              )}
                            </td>

                            <td className="p-3 text-right">
                              <button
                                onClick={() => handleOpenSpecificChat(chat.phone || chat.jid)}
                                className="px-3.5 py-1.5 bg-[#00a884] text-white font-bold text-[11px] rounded-lg hover:bg-[#008f70] transition-all inline-flex items-center gap-1.5 shadow-sm active:scale-95"
                                title={`Open Chat for ${chat.name || chat.phone} directly in WhatsApp Web`}
                              >
                                <span>Open Chat</span>
                                <ExternalLink className="w-3 h-3" />
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

            {/* Block 3: Dynamic Live Lead Activity Feed */}
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-[#111b21]">Latest WhatsApp Activity Feed</h3>
                <span className="text-xs text-gray-500 font-medium">{chats.length} active chats</span>
              </div>

              <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
                {chats.length === 0 ? (
                  <div className="w-full p-8 text-center text-xs text-gray-400">
                    No active WhatsApp chats synced yet.
                  </div>
                ) : (
                  chats.slice(0, 10).map((chat) => (
                    <div 
                      key={chat.jid} 
                      className="p-3.5 hover:bg-gray-50/90 transition-all flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white"
                    >
                      {/* Left: Avatar & Contact Details */}
                      <div className="flex items-center gap-3 min-w-[240px]">
                        <div className="w-9 h-9 rounded-full bg-[#00a884]/15 text-[#00a884] font-bold flex items-center justify-center text-xs flex-shrink-0">
                          {(chat.name || 'W').charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold truncate text-[#111b21]" title={chat.name || chat.phone || ''}>
                            {chat.name || chat.phone || 'WhatsApp Contact'}
                          </h4>
                          <p className="text-[11px] text-gray-500 font-medium">
                            📞 {chat.phone ? `+${chat.phone}` : chat.jid.split('@')[0]}
                          </p>
                        </div>
                      </div>

                      {/* Middle: Message Preview & Notes */}
                      <div className="flex-1 min-w-0 flex items-center gap-2.5">
                        <div className="bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200/60 text-xs text-gray-700 italic truncate flex-1">
                          "{chat.lastMessagePreview || 'New inquiry received'}"
                        </div>
                        {chat.notesList && chat.notesList.length > 0 && (
                          <span className="text-[11px] bg-purple-50 text-purple-700 px-2.5 py-1 rounded-md font-medium border border-purple-200 flex-shrink-0 truncate max-w-[200px]">
                            📝 {chat.notesList[0]}
                          </span>
                        )}
                      </div>

                      {/* Right: Status Badge & Action */}
                      <div className="flex items-center gap-2.5 flex-shrink-0 justify-end">
                        {chat.leadStatus === 'INTERESTED' && (
                          <span className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                            👍 Interested
                          </span>
                        )}
                        {chat.leadStatus === 'WARM_INTERESTED' && (
                          <span className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                            🔥 Warm
                          </span>
                        )}
                        {chat.leadStatus === 'NOT_INTERESTED' && (
                          <span className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-rose-50 text-rose-700 border border-rose-200">
                            👎 Not Interested
                          </span>
                        )}

                        <button
                          onClick={() => handleOpenSpecificChat(chat.phone || chat.jid)}
                          className="px-3 py-1.5 text-xs font-semibold text-[#00a884] bg-[#00a884]/10 hover:bg-[#00a884]/20 rounded-lg flex items-center gap-1.5 transition-all"
                        >
                          <span>Open Chat</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {activeNav === 'settings' && (
          <div className="flex-1 overflow-y-auto">
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
                getModalContacts().map((chat) => (
                  <div key={chat.jid} className="p-4 rounded-xl bg-gray-50 border border-gray-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#00a884]/15 text-[#00a884] font-bold flex items-center justify-center text-base flex-shrink-0">
                        {(chat.name || 'W').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-[#111b21]">{chat.name || 'Unsaved Contact'}</h4>
                        <p className="text-xs text-gray-500 font-medium flex items-center gap-1">
                          <span>📞 +{chat.phone || chat.jid.split('@')[0]}</span>
                          <button
                            onClick={() => handleCopyPhone(chat.phone || chat.jid.split('@')[0])}
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
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
