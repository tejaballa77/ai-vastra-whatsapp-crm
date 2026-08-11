'use client';

import React, { useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { 
  Search, 
  Plus, 
  MoreVertical, 
  CheckCircle2, 
  AlertCircle, 
  QrCode,
  LogOut,
  Sun,
  Moon,
  Check,
  CheckCheck,
  Camera,
  FileText
} from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';

export const Sidebar = () => {
  const { 
    chats, 
    activeChatJid, 
    setActiveChatJid, 
    sessionState, 
    disconnectSession, 
    reconnectSession 
  } = useSocket();

  const [activeTab, setActiveTab] = useState<'all' | 'favourites' | 'unread' | 'groups'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    if (nextTheme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  };

  const formatChatDisplayName = (chat: any) => {
    if (!chat) return 'Unknown';
    const name = chat.name || '';
    if (name && name !== 'Unsaved Contact' && !name.startsWith('1489') && !name.startsWith('14') && !name.startsWith('15') && !name.startsWith('16')) {
      return name;
    }
    const clean = (chat.phone || chat.jid || '').split('@')[0].replace(/\D/g, '');
    if (clean.length === 12 && clean.startsWith('91')) {
      const ten = clean.slice(2);
      return `+91 ${ten.slice(0, 5)} ${ten.slice(5)}`;
    }
    if (clean.length === 10) {
      return `+91 ${clean.slice(0, 5)} ${clean.slice(5)}`;
    }
    return clean ? `+${clean}` : 'Unsaved Contact';
  };

  const formatTimestamp = (ts: number) => {
    if (!ts) return '';
    const date = new Date(ts);
    if (isToday(date)) return format(date, 'h:mm a').toLowerCase();
    if (isYesterday(date)) return 'Yesterday';
    return format(date, 'dd/MM/yyyy');
  };

  const getAvatarBgColor = (jid: string) => {
    const bgList = ['#d8fdd2', '#fde3d2', '#d2e5fd', '#fdf3d2', '#e1d2fd', '#fdd2e9'];
    let hash = 0;
    for (let i = 0; i < jid.length; i++) hash = jid.charCodeAt(i) + ((hash << 5) - hash);
    return bgList[Math.abs(hash) % bgList.length];
  };

  const getAvatarTextColor = (jid: string) => {
    const textList = ['#007a5a', '#b75800', '#0052b7', '#9e7b00', '#6300b7', '#b70068'];
    let hash = 0;
    for (let i = 0; i < jid.length; i++) hash = jid.charCodeAt(i) + ((hash << 5) - hash);
    return textList[Math.abs(hash) % textList.length];
  };

  const getLeadStatusBadge = (status?: string) => {
    switch (status) {
      case 'INTERESTED':
        return <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/15 text-emerald-600 rounded-full border border-emerald-500/30">Interested</span>;
      case 'WARM_INTERESTED':
        return <span className="px-2 py-0.5 text-[10px] font-semibold bg-amber-500/15 text-amber-600 rounded-full border border-amber-500/30">Warm</span>;
      case 'NOT_INTERESTED':
        return <span className="px-2 py-0.5 text-[10px] font-semibold bg-rose-500/15 text-rose-600 rounded-full border border-rose-500/30">Not Interested</span>;
      default:
        return null;
    }
  };

  // Filter chats by tab and search query
  const filteredChats = chats.filter((chat) => {
    if (!chat || !chat.jid) return false;

    const name = formatChatDisplayName(chat);
    const matchesSearch = name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      chat.jid.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (activeTab === 'unread') return chat.unreadCount > 0;
    if (activeTab === 'groups') return chat.isGroup;
    if (activeTab === 'favourites') return Boolean(chat.followUpDate);

    return true;
  });

  return (
    <div className="w-[410px] min-w-[350px] h-full bg-wa-sidebar border-r border-wa-border flex flex-col select-none flex-shrink-0">
      {/* Sidebar Top Header (WhatsApp Logo + Controls) */}
      <div className="h-[59px] px-4 bg-wa-header flex items-center justify-between border-b border-wa-border flex-shrink-0">
        <h1 className="text-xl font-bold text-wa-textPrimary tracking-tight">WhatsApp</h1>

        <div className="flex items-center space-x-2">
          {/* Theme Switcher (Sun / Moon) */}
          <button
            onClick={toggleTheme}
            title={theme === 'light' ? 'Switch to Dark Theme' : 'Switch to Light Theme'}
            className="p-2 text-wa-textSecondary hover:text-wa-textPrimary hover:bg-wa-hover rounded-full transition-colors"
          >
            {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
          </button>

          {/* New Chat Button */}
          <button
            title="New Chat"
            className="p-2 text-wa-textSecondary hover:text-wa-textPrimary hover:bg-wa-hover rounded-full transition-colors"
          >
            <Plus className="w-5 h-5" />
          </button>

          {/* Connection Status Icon */}
          {sessionState.status === 'CONNECTED' ? (
            <button
              onClick={disconnectSession}
              title="Session Connected (Click to Disconnect)"
              className="p-2 text-emerald-500 hover:bg-wa-hover rounded-full transition-colors"
            >
              <CheckCircle2 className="w-5 h-5" />
            </button>
          ) : sessionState.status === 'QR_READY' || sessionState.status === 'CONNECTING' ? (
            <button
              onClick={reconnectSession}
              title="Connecting / Scan QR"
              className="p-2 text-amber-500 hover:bg-wa-hover rounded-full transition-colors animate-pulse"
            >
              <QrCode className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={reconnectSession}
              title="Offline (Click to Reconnect)"
              className="p-2 text-rose-500 hover:bg-wa-hover rounded-full transition-colors"
            >
              <AlertCircle className="w-5 h-5" />
            </button>
          )}

          {/* Menu Dots */}
          <button
            title="Menu"
            className="p-2 text-wa-textSecondary hover:text-wa-textPrimary hover:bg-wa-hover rounded-full transition-colors"
          >
            <MoreVertical className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Search Bar Section */}
      <div className="p-2 bg-wa-sidebar">
        <div className="h-9 px-3 bg-wa-header rounded-lg flex items-center space-x-3 border border-transparent focus-within:border-wa-accent transition-all">
          <Search className="w-4 h-4 text-wa-textSecondary flex-shrink-0" />
          <input
            type="text"
            placeholder="Search or start new chat"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent text-sm text-wa-textPrimary placeholder-wa-textSecondary focus:outline-none"
          />
        </div>
      </div>

      {/* Filter Tabs (All, Favourites, Unread, Groups, +) */}
      <div className="px-3 py-1.5 border-b border-wa-border flex items-center space-x-1.5 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveTab('all')}
          className={`px-3 py-1 text-xs font-medium rounded-full transition-all ${
            activeTab === 'all'
              ? 'bg-[#e7fce3] text-[#008069] dark:bg-wa-accent dark:text-wa-bg font-semibold'
              : 'bg-wa-header text-wa-textSecondary hover:bg-wa-hover'
          }`}
        >
          All
        </button>
        <button
          onClick={() => setActiveTab('favourites')}
          className={`px-3 py-1 text-xs font-medium rounded-full transition-all ${
            activeTab === 'favourites'
              ? 'bg-[#e7fce3] text-[#008069] dark:bg-wa-accent dark:text-wa-bg font-semibold'
              : 'bg-wa-header text-wa-textSecondary hover:bg-wa-hover'
          }`}
        >
          Favourites
        </button>
        <button
          onClick={() => setActiveTab('unread')}
          className={`px-3 py-1 text-xs font-medium rounded-full transition-all ${
            activeTab === 'unread'
              ? 'bg-[#e7fce3] text-[#008069] dark:bg-wa-accent dark:text-wa-bg font-semibold'
              : 'bg-wa-header text-wa-textSecondary hover:bg-wa-hover'
          }`}
        >
          Unread
        </button>
        <button
          onClick={() => setActiveTab('groups')}
          className={`px-3 py-1 text-xs font-medium rounded-full transition-all ${
            activeTab === 'groups'
              ? 'bg-[#e7fce3] text-[#008069] dark:bg-wa-accent dark:text-wa-bg font-semibold'
              : 'bg-wa-header text-wa-textSecondary hover:bg-wa-hover'
          }`}
        >
          Groups
        </button>
        <button
          className="w-7 h-7 rounded-full bg-wa-header flex items-center justify-center text-wa-textSecondary hover:bg-wa-hover transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto divide-y divide-wa-border/40">
        {filteredChats.length === 0 ? (
          <div className="p-8 text-center text-wa-textSecondary text-sm">
            {searchQuery ? 'No conversations matching search.' : 'No chats synced yet.'}
          </div>
        ) : (
          filteredChats.map((chat) => {
            const isActive = chat.jid === activeChatJid;
            const displayName = formatChatDisplayName(chat);
            const initial = displayName.replace(/\+/g, '').charAt(0).toUpperCase();

            return (
              <div
                key={chat.jid}
                onClick={() => setActiveChatJid(chat.jid)}
                className={`h-[72px] px-3.5 flex items-center space-x-3 cursor-pointer transition-colors ${
                  isActive ? 'bg-wa-hover' : 'hover:bg-wa-hover/60'
                }`}
              >
                {/* 49px Circular Avatar */}
                <div className="w-[49px] h-[49px] rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 relative">
                  {chat.avatarUrl ? (
                    <img src={chat.avatarUrl} alt={displayName} className="w-full h-full object-cover" />
                  ) : (
                    <div 
                      className="w-full h-full flex items-center justify-center font-medium text-lg"
                      style={{ 
                        backgroundColor: getAvatarBgColor(chat.jid), 
                        color: getAvatarTextColor(chat.jid) 
                      }}
                    >
                      {initial}
                    </div>
                  )}
                </div>

                {/* Right Content Block */}
                <div className="flex-1 min-w-0 h-full flex flex-col justify-center border-b border-wa-border/30">
                  {/* Top Row: Name + Timestamp */}
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[16px] font-medium text-wa-textPrimary truncate max-w-[210px]">
                      {displayName}
                    </span>
                    <span className={`text-[12px] flex-shrink-0 ${
                      chat.unreadCount > 0 ? 'text-[#25d366] font-medium' : 'text-wa-textSecondary'
                    }`}>
                      {formatTimestamp(chat.lastMessageAt)}
                    </span>
                  </div>

                  {/* Bottom Row: Message Preview + Unread Badge / Lead Status */}
                  <div className="flex items-center justify-between text-[14px] text-wa-textSecondary">
                    <div className="flex items-center space-x-1 truncate max-w-[230px]">
                      {chat.lastMessagePreview?.toLowerCase().includes('photo') ? (
                        <div className="flex items-center space-x-1 text-wa-textSecondary">
                          <Camera className="w-3.5 h-3.5 text-wa-textSecondary" />
                          <span>Photo</span>
                        </div>
                      ) : (
                        <span className="truncate">{chat.lastMessagePreview || 'Click to open conversation'}</span>
                      )}
                    </div>

                    <div className="flex items-center space-x-1.5 flex-shrink-0 ml-1">
                      {getLeadStatusBadge(chat.leadStatus)}
                      {chat.unreadCount > 0 && (
                        <span className="min-w-[19px] h-[19px] px-1 rounded-full bg-[#25d366] text-white text-[11px] font-semibold flex items-center justify-center">
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
