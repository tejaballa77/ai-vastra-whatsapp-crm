'use client';

import React, { useState } from 'react';
import { 
  Users, 
  MessageSquare, 
  Bot, 
  PhoneCall, 
  Mail, 
  Settings, 
  ExternalLink,
  Flame,
  ThumbsUp,
  ThumbsDown,
  Calendar,
  Phone,
  RefreshCcw,
  Sparkles
} from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { Sidebar } from './Sidebar';
import { ChatWindow } from './ChatWindow';
import { CrmDrawer } from './CrmDrawer';

export function WhatsAppCrmModule() {
  const [activeNav, setActiveNav] = useState<'whatsapp' | 'calls' | 'emails' | 'settings'>('whatsapp');
  const [subTab, setSubTab] = useState<'dashboard' | 'chats'>('dashboard');
  const [chatViewMode, setChatViewMode] = useState<'embedded' | 'native'>('embedded');
  const [isCrmOpen, setIsCrmOpen] = useState<boolean>(true);
  const { chats } = useSocket();

  // Compute 100% DYNAMIC real stats from database chats
  const interestedCount = chats.filter((c) => c.leadStatus === 'INTERESTED').length;
  const warmCount = chats.filter((c) => c.leadStatus === 'WARM_INTERESTED').length;
  const notInterestedCount = chats.filter((c) => c.leadStatus === 'NOT_INTERESTED').length;
  const unassignedCount = chats.filter((c) => !c.leadStatus || c.leadStatus === 'UNASSIGNED').length;
  const activeLeadsCount = interestedCount + warmCount;

  const callsYesCount = chats.filter((c) => c.callStatus === 'YES').length;
  const followUpsCount = chats.filter((c) => Boolean(c.followUpDate)).length;
  const unreadChatsCount = chats.filter((c) => (c.unreadCount || 0) > 0).length;

  // Compute New Leads Today dynamically
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const newLeadsTodayCount = chats.filter((c) => (c.lastMessageAt || 0) >= todayStart).length || unreadChatsCount;

  return (
    <div className="w-screen h-screen flex overflow-hidden bg-[#f0f2f5] text-[#111b21] font-sans">
      {/* 1. Main Left Navigation Bar (WhatsApp placed 1st on Top) */}
      <aside className="w-64 bg-[#111b21] text-white flex flex-col justify-between p-4 flex-shrink-0">
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
          <p className="text-[11px] text-gray-400">Chrome Extension active on web.whatsapp.com</p>
        </div>
      </aside>

      {/* 2. Main Workspace Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden bg-[#f0f2f5]">
        {/* Top Header Bar */}
        <header className="h-16 bg-white border-b border-gray-200 px-6 flex items-center justify-between flex-shrink-0 shadow-sm">
          <div className="flex items-center gap-6">
            <h2 className="text-xl font-bold text-[#111b21]">WhatsApp CRM</h2>

            {/* Sub-Tabs: Dashboard | Chats */}
            {activeNav === 'whatsapp' && (
              <div className="flex items-center bg-[#f0f2f5] p-1 rounded-full border border-gray-200">
                <button
                  onClick={() => setSubTab('dashboard')}
                  className={`px-5 py-1.5 text-xs font-semibold rounded-full transition-all ${
                    subTab === 'dashboard'
                      ? 'bg-[#00a884] text-white shadow-sm'
                      : 'text-gray-600 hover:text-black'
                  }`}
                >
                  Dashboard
                </button>

                <button
                  onClick={() => setSubTab('chats')}
                  className={`px-5 py-1.5 text-xs font-semibold rounded-full transition-all ${
                    subTab === 'chats'
                      ? 'bg-[#00a884] text-white shadow-sm'
                      : 'text-gray-600 hover:text-black'
                  }`}
                >
                  Chats
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {subTab === 'chats' && (
              <div className="flex items-center gap-2 bg-[#f0f2f5] p-1 rounded-lg border border-gray-200">
                <button
                  onClick={() => setChatViewMode('embedded')}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                    chatViewMode === 'embedded' ? 'bg-[#00a884] text-white' : 'text-gray-600'
                  }`}
                >
                  WhatsApp Web Iframe
                </button>
                <button
                  onClick={() => setChatViewMode('native')}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                    chatViewMode === 'native' ? 'bg-[#00a884] text-white' : 'text-gray-600'
                  }`}
                >
                  CRM Native View
                </button>
              </div>
            )}

            <a
              href="https://web.whatsapp.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#00a884]/10 text-[#00a884] font-semibold text-xs rounded-full hover:bg-[#00a884]/20 transition-all border border-[#00a884]/30"
            >
              <span>Popout Tab</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </header>

        {/* Dynamic Body Content */}
        <div className="flex-1 overflow-hidden flex">
          {activeNav === 'whatsapp' && subTab === 'dashboard' && (
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Stat Cards Grid (100% DYNAMIC counts) */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">New Leads Today</p>
                    <h3 className="text-2xl font-bold text-[#111b21]">{newLeadsTodayCount}</h3>
                    <p className="text-[11px] text-emerald-600 font-medium mt-1">Inbound today</p>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                    <Users className="w-6 h-6" />
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Active Leads</p>
                    <h3 className="text-2xl font-bold text-[#111b21]">{activeLeadsCount}</h3>
                    <p className="text-[11px] text-emerald-600 font-medium mt-1">Interested ({interestedCount}) & Warm ({warmCount})</p>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-emerald-50 text-[#00a884] flex items-center justify-center">
                    <Flame className="w-6 h-6" />
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Calls Scheduled</p>
                    <h3 className="text-2xl font-bold text-[#111b21]">{callsYesCount}</h3>
                    <p className="text-[11px] text-blue-600 font-medium mt-1">Call status set to "Yes"</p>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                    <Phone className="w-6 h-6" />
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Follow-ups Scheduled</p>
                    <h3 className="text-2xl font-bold text-[#111b21]">{followUpsCount}</h3>
                    <p className="text-[11px] text-amber-600 font-medium mt-1">Active follow-up dates</p>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                    <Calendar className="w-6 h-6" />
                  </div>
                </div>
              </div>

              {/* Lower Section: Dynamic Lead Pipeline Breakdown & Recent Activity */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Pipeline Breakdown */}
                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                  <h3 className="text-base font-bold text-[#111b21]">Lead Pipeline Breakdown</h3>
                  
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-xs font-semibold mb-1.5">
                        <span className="flex items-center gap-1.5 text-emerald-700">
                          <ThumbsUp className="w-3.5 h-3.5" /> Interested
                        </span>
                        <span>{interestedCount} leads</span>
                      </div>
                      <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-[#00a884] rounded-full transition-all duration-500" 
                          style={{ width: `${chats.length > 0 ? (interestedCount / chats.length) * 100 : 0}%` }}
                        ></div>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs font-semibold mb-1.5">
                        <span className="flex items-center gap-1.5 text-amber-600">
                          <Flame className="w-3.5 h-3.5" /> Warm
                        </span>
                        <span>{warmCount} leads</span>
                      </div>
                      <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-amber-500 rounded-full transition-all duration-500" 
                          style={{ width: `${chats.length > 0 ? (warmCount / chats.length) * 100 : 0}%` }}
                        ></div>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs font-semibold mb-1.5">
                        <span className="flex items-center gap-1.5 text-rose-600">
                          <ThumbsDown className="w-3.5 h-3.5" /> Not Interested
                        </span>
                        <span>{notInterestedCount} leads</span>
                      </div>
                      <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-rose-500 rounded-full transition-all duration-500" 
                          style={{ width: `${chats.length > 0 ? (notInterestedCount / chats.length) * 100 : 0}%` }}
                        ></div>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs font-semibold mb-1.5 text-gray-500">
                        <span>Unassigned / New</span>
                        <span>{unassignedCount} leads</span>
                      </div>
                      <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gray-400 rounded-full transition-all duration-500" 
                          style={{ width: `${chats.length > 0 ? (unassignedCount / chats.length) * 100 : 0}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Dynamic Recent Lead Activity Feed */}
                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-[#111b21]">Recent Lead Activity</h3>
                    <span className="text-xs text-gray-400 font-medium">{chats.length} synced chats</span>
                  </div>
                  <div className="space-y-3.5 max-h-[320px] overflow-y-auto pr-1">
                    {chats.length === 0 ? (
                      <div className="p-8 text-center text-xs text-gray-400">
                        No active WhatsApp chats synced yet.
                      </div>
                    ) : (
                      chats.slice(0, 6).map((chat) => (
                        <div key={chat.jid} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100 hover:bg-gray-100/80 transition-all">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-full bg-[#00a884]/15 text-[#00a884] font-bold flex items-center justify-center flex-shrink-0 text-sm">
                              {(chat.name || 'W').charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <h4 className="text-xs font-semibold truncate text-[#111b21]">
                                {chat.name || chat.phone || 'WhatsApp Contact'}
                              </h4>
                              <p className="text-[11px] text-gray-500 truncate">
                                {chat.lastMessagePreview || 'New inquiry received'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            {chat.leadStatus === 'INTERESTED' && (
                              <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-700 rounded-full">
                                Interested
                              </span>
                            )}
                            {chat.leadStatus === 'WARM_INTERESTED' && (
                              <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-700 rounded-full">
                                Warm
                              </span>
                            )}
                            {chat.leadStatus === 'NOT_INTERESTED' && (
                              <span className="px-2 py-0.5 text-[10px] font-bold bg-rose-100 text-rose-700 rounded-full">
                                Not Interested
                              </span>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeNav === 'whatsapp' && subTab === 'chats' && (
            <div className="w-full h-full flex overflow-hidden">
              {chatViewMode === 'embedded' ? (
                /* Direct Embedded WhatsApp Web Iframe inside the CRM Chats view */
                <iframe
                  src="https://web.whatsapp.com"
                  title="WhatsApp Web Direct Integration"
                  className="w-full h-full border-0 bg-white"
                  allow="microphone; camera; clipboard-read; clipboard-write; notifications"
                />
              ) : (
                /* Native CRM Workspace View */
                <>
                  <Sidebar />
                  <ChatWindow isCrmOpen={isCrmOpen} toggleCrm={() => setIsCrmOpen(!isCrmOpen)} />
                  <CrmDrawer isOpen={isCrmOpen} onClose={() => setIsCrmOpen(false)} />
                </>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
