'use client';

import React, { useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { 
  MessageSquare, 
  Instagram, 
  Search, 
  Filter, 
  LogOut, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  QrCode,
  User,
  Tag,
  X,
  MoreVertical
} from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';

const getBackendUrl = () => {
  if (process.env.NEXT_PUBLIC_BACKEND_URL) return process.env.NEXT_PUBLIC_BACKEND_URL;
  if (typeof window !== 'undefined') return window.location.origin;
  return 'http://localhost:5000';
};

export const Sidebar = () => {
  const { 
    chats, 
    activeChatJid, 
    setActiveChatJid, 
    sessionState, 
    disconnectSession, 
    reconnectSession 
  } = useSocket();

  const [activePlatform, setActivePlatform] = useState<'whatsapp' | 'instagram'>('whatsapp');
  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'followups'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAddChatOpen, setIsAddChatOpen] = useState(false);
  const [newPhoneInput, setNewPhoneInput] = useState('');
  const [newNameInput, setNewNameInput] = useState('');
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedJids, setSelectedJids] = useState<string[]>([]);

  const formatChatDisplayName = (chat: any) => {
    if (!chat) return 'Unsaved Contact';
    const clean = (chat.phone || chat.jid || '').split('@')[0].replace(/\D/g, '');
    const name = chat.name || '';

    // If chat.name is a real saved contact name (e.g. BALAJEE TEXTILE, Durga Rao Sir, Nikhil Amartex, etc.)
    if (name && name !== 'Unsaved Contact' && name !== clean && !name.includes('@') && clean.length <= 12 && !/^\d{13,}$/.test(name.replace(/\D/g, ''))) {
      return name;
    }

    if (clean.length === 12 && clean.startsWith('91')) {
      const ten = clean.slice(2);
      return `+91 ${ten.slice(0, 5)} ${ten.slice(5)}`;
    }
    if (clean.length === 10) {
      return `+91 ${clean.slice(0, 5)} ${clean.slice(5)}`;
    }
    if (clean.length > 12) {
      return 'Unsaved Contact';
    }
    return clean ? `+${clean}` : 'Unsaved Contact';
  };

  // Filter chats by platform, tab, and search query
  const filteredChats = chats.filter((chat) => {
    if (!chat || !chat.jid) return false;

    const name = formatChatDisplayName(chat);
    const matchesSearch = name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      chat.jid.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    // Filter tabs
    if (activeTab === 'unread') return chat.unreadCount > 0;
    if (activeTab === 'followups') return Boolean(chat.followUpDate);

    return true;
  });

  const formatTimestamp = (ts: number) => {
    if (!ts) return '';
    const date = new Date(ts);
    if (isToday(date)) return format(date, 'h:mm a');
    if (isYesterday(date)) return 'Yesterday';
    return format(date, 'dd/MM/yyyy');
  };

  const getLeadStatusBadge = (status?: string) => {
    switch (status) {
      case 'INTERESTED':
        return <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 rounded-full border border-emerald-500/30">Interested</span>;
      case 'WARM_INTERESTED':
        return <span className="px-2 py-0.5 text-[10px] font-semibold bg-amber-500/20 text-amber-400 rounded-full border border-amber-500/30">Warm</span>;
      case 'NOT_INTERESTED':
        return <span className="px-2 py-0.5 text-[10px] font-semibold bg-rose-500/20 text-rose-400 rounded-full border border-rose-500/30">Not Interested</span>;
      default:
        return null;
    }
  };

  const handleCreateChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPhoneInput.trim()) return;

    try {
      const res = await fetch(`${getBackendUrl()}/api/chats/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: newPhoneInput.trim(), name: newNameInput.trim() }),
      });
      const data = await res.json();
      if (data.success && data.chat) {
        setActiveChatJid(data.chat.jid);
        setIsAddChatOpen(false);
        setNewPhoneInput('');
        setNewNameInput('');
      }
    } catch (err) {
      console.error('Error creating chat:', err);
    }
  };

  const handleDeleteSelectedChats = async () => {
    const toDelete = selectedJids.length > 0 ? selectedJids : (activeChatJid ? [activeChatJid] : []);
    if (toDelete.length === 0) return;

    if (confirm(`Delete ${toDelete.length} selected chat(s)?`)) {
      for (const jid of toDelete) {
        try {
          await fetch(`${getBackendUrl()}/api/chats/${encodeURIComponent(jid)}`, { method: 'DELETE' });
        } catch (err) {
          console.error('Error deleting chat:', err);
        }
      }
      setSelectedJids([]);
      setIsSelectMode(false);
      setIsMenuOpen(false);
      if (activeChatJid && toDelete.includes(activeChatJid)) {
        setActiveChatJid(null);
      }
    }
  };

  const toggleSelectJid = (jid: string) => {
    setSelectedJids((prev) => 
      prev.includes(jid) ? prev.filter((item) => item !== jid) : [...prev, jid]
    );
  };

  return (
    <div className="w-[400px] min-w-[340px] h-full bg-wa-sidebar border-r border-wa-border flex flex-col select-none relative">
      {/* Start New Chat Modal */}
      {isAddChatOpen && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-wa-header border border-wa-border rounded-xl p-5 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-wa-textPrimary">Start New Chat</h3>
              <button onClick={() => setIsAddChatOpen(false)} className="text-wa-textSecondary hover:text-wa-textPrimary">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateChat} className="space-y-3">
              <div>
                <label className="block text-xs text-wa-textSecondary mb-1">Phone Number (with Country Code)</label>
                <input
                  type="text"
                  placeholder="e.g. 919876543210 or 9876543210"
                  value={newPhoneInput}
                  onChange={(e) => setNewPhoneInput(e.target.value)}
                  className="w-full px-3 py-2 bg-wa-sidebar border border-wa-border rounded-lg text-sm text-wa-textPrimary focus:outline-none focus:border-wa-accent"
                  required
                />
              </div>

              <div>
                <label className="block text-xs text-wa-textSecondary mb-1">Contact Name (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. John Lead"
                  value={newNameInput}
                  onChange={(e) => setNewNameInput(e.target.value)}
                  className="w-full px-3 py-2 bg-wa-sidebar border border-wa-border rounded-lg text-sm text-wa-textPrimary focus:outline-none focus:border-wa-accent"
                />
              </div>

              <div className="flex space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddChatOpen(false)}
                  className="flex-1 py-2 bg-wa-sidebar hover:bg-wa-hover text-wa-textSecondary rounded-lg text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-wa-accent hover:bg-emerald-600 text-wa-bg rounded-lg text-xs font-semibold"
                >
                  Start Chat
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sidebar Top Header */}
      <div className="h-16 px-4 bg-wa-header flex items-center justify-between border-b border-wa-border">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <button 
              onClick={() => setActivePlatform('whatsapp')}
              title="WhatsApp Workspace"
              className={`p-2 rounded-full transition-all ${
                activePlatform === 'whatsapp' 
                  ? 'bg-wa-accent/20 text-wa-accent' 
                  : 'text-wa-textSecondary hover:bg-wa-hover'
              }`}
            >
              <MessageSquare className="w-5 h-5" />
            </button>
            <span className="text-sm font-semibold text-wa-textPrimary">WhatsApp</span>
          </div>

          <button
            onClick={() => setIsAddChatOpen(true)}
            title="Start New Chat"
            className="p-1.5 bg-wa-accent/20 text-wa-accent hover:bg-wa-accent/30 rounded-full transition-colors"
          >
            <span className="text-base font-bold leading-none px-1">+</span>
          </button>
        </div>

        <div className="flex items-center space-x-2 relative">
          {sessionState.status === 'CONNECTED' ? (
            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs font-medium text-emerald-400">Connected</span>
            </div>
          ) : (
            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20">
              <QrCode className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-xs font-medium text-amber-400">Scan QR</span>
            </div>
          )}

          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            title="Menu Options"
            className="p-2 text-wa-textSecondary hover:bg-wa-hover rounded-full transition-colors"
          >
            <MoreVertical className="w-5 h-5" />
          </button>

          {isMenuOpen && (
            <div className="absolute right-0 top-12 w-48 bg-wa-header border border-wa-border rounded-xl shadow-2xl py-1 z-50 text-sm">
              <button
                onClick={() => {
                  setIsSelectMode(!isSelectMode);
                  setIsMenuOpen(false);
                }}
                className="w-full px-4 py-2 text-left hover:bg-wa-hover text-wa-textPrimary flex items-center space-x-2"
              >
                <span>{isSelectMode ? '✓ Cancel selection' : '1. Select chats'}</span>
              </button>

              <button
                onClick={handleDeleteSelectedChats}
                className="w-full px-4 py-2 text-left hover:bg-wa-hover text-rose-400 flex items-center space-x-2"
              >
                <span>2. Delete chats</span>
              </button>

              <button
                onClick={() => {
                  setIsMenuOpen(false);
                  disconnectSession();
                }}
                className="w-full px-4 py-2 text-left hover:bg-wa-hover text-wa-textSecondary flex items-center space-x-2 border-t border-wa-border/50 mt-1"
              >
                <span>3. Log out</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Search Input Bar */}
      <div className="p-2 bg-wa-sidebar">
        <div className="relative flex items-center bg-wa-header rounded-lg px-3 py-1.5">
          <Search className="w-4 h-4 text-wa-textSecondary mr-3" />
          <input
            type="text"
            placeholder="Search or start new chat..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent text-sm text-wa-textPrimary focus:outline-none placeholder-wa-textSecondary/60"
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center space-x-2 px-3 py-2 bg-wa-sidebar border-b border-wa-border">
        <button
          onClick={() => setActiveTab('all')}
          className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
            activeTab === 'all'
              ? 'bg-wa-accent text-wa-bg'
              : 'bg-wa-header text-wa-textSecondary hover:bg-wa-hover'
          }`}
        >
          All
        </button>
        <button
          onClick={() => setActiveTab('unread')}
          className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
            activeTab === 'unread'
              ? 'bg-wa-accent text-wa-bg'
              : 'bg-wa-header text-wa-textSecondary hover:bg-wa-hover'
          }`}
        >
          Unread
        </button>
        <button
          onClick={() => setActiveTab('followups')}
          className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
            activeTab === 'followups'
              ? 'bg-wa-accent text-wa-bg'
              : 'bg-wa-header text-wa-textSecondary hover:bg-wa-hover'
          }`}
        >
          Follow-ups
        </button>
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto divide-y divide-wa-border/50">
        {filteredChats.length === 0 ? (
          <div className="p-8 text-center text-wa-textSecondary text-sm">
            {searchQuery ? 'No conversations matching search.' : 'No chats synced yet.'}
          </div>
        ) : (
          [...filteredChats]
            .sort((a, b) => {
              let tsA = a.lastMessageAt || 0;
              let tsB = b.lastMessageAt || 0;
              if (tsA > 0 && tsA < 10000000000) tsA *= 1000;
              if (tsB > 0 && tsB < 10000000000) tsB *= 1000;
              return tsB - tsA;
            })
            .map((chat) => {
              const isActive = chat.jid === activeChatJid;
              const displayName = formatChatDisplayName(chat);
              const isSelected = selectedJids.includes(chat.jid);
              return (
                <div
                  key={chat.jid}
                  onClick={() => isSelectMode ? toggleSelectJid(chat.jid) : setActiveChatJid(chat.jid)}
                  className={`px-4 py-3 flex items-center cursor-pointer transition-colors ${
                    isActive ? 'bg-wa-hover' : 'hover:bg-wa-header/60'
                  }`}
                >
                  {isSelectMode && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectJid(chat.jid)}
                      className="mr-3 w-4 h-4 accent-wa-accent rounded cursor-pointer"
                    />
                  )}

                  {/* Avatar */}
                  <div className="relative w-12 h-12 rounded-full overflow-hidden bg-wa-header flex items-center justify-center flex-shrink-0 mr-3">
                    {chat.avatarUrl ? (
                      <img src={chat.avatarUrl} alt={displayName} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-wa-accent/20 flex items-center justify-center text-wa-accent font-semibold text-lg">
                        {displayName.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>

                  {/* Chat Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="text-sm font-semibold text-wa-textPrimary truncate mr-2">
                        {displayName}
                      </h4>
                      <span className={`text-[11px] whitespace-nowrap ${chat.unreadCount > 0 ? 'text-[#25d366] font-semibold' : 'text-wa-textSecondary'}`}>
                        {formatTimestamp(chat.lastMessageAt)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <p className="text-xs text-wa-textSecondary truncate mr-2">
                        {chat.lastMessagePreview === '[REVOKED]'
                          ? '🚫 This message was deleted'
                          : chat.lastMessagePreview === '[E2E_NOTIFICATION]'
                          ? '🔒 Encryption notice'
                          : chat.lastMessagePreview === '[CHAT]'
                          ? '👤 Contact Card'
                          : chat.lastMessagePreview || 'No messages'}
                      </p>
                      
                      <div className="flex items-center space-x-1.5 flex-shrink-0">
                        {getLeadStatusBadge(chat.leadStatus)}
                        
                        {chat.unreadCount > 0 && (
                          <span className="w-5 h-5 rounded-full bg-[#25d366] text-white font-bold text-[11px] flex items-center justify-center shadow-sm">
                            {chat.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
        )}
      </div>
    </div>
  );
};
