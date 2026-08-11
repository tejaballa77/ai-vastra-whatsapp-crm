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
  Tag
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

  const [activePlatform, setActivePlatform] = useState<'whatsapp' | 'instagram'>('whatsapp');
  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'followups'>('all');
  const [searchQuery, setSearchQuery] = useState('');

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

  return (
    <div className="w-[400px] min-w-[340px] h-full bg-wa-sidebar border-r border-wa-border flex flex-col select-none">
      {/* Sidebar Top Header */}
      <div className="h-16 px-4 bg-wa-header flex items-center justify-between border-b border-wa-border">
        {/* Left Platform Switcher Icons */}
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
          
          <button 
            onClick={() => setActivePlatform('instagram')}
            title="Instagram Direct Messages"
            className={`p-2 rounded-full transition-all ${
              activePlatform === 'instagram' 
                ? 'bg-pink-500/20 text-pink-400' 
                : 'text-wa-textSecondary hover:bg-wa-hover'
            }`}
          >
            <Instagram className="w-5 h-5" />
          </button>
        </div>

        {/* Connection Status & Account Controls */}
        <div className="flex items-center space-x-3">
          {sessionState.status === 'CONNECTED' ? (
            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs font-medium text-emerald-400">Connected</span>
            </div>
          ) : sessionState.status === 'QR_READY' || sessionState.status === 'CONNECTING' ? (
            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 animate-pulse">
              <QrCode className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-xs font-medium text-amber-400">Scan QR</span>
            </div>
          ) : (
            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-rose-500/10 border border-rose-500/20">
              <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
              <span className="text-xs font-medium text-rose-400">Offline</span>
            </div>
          )}

          {sessionState.status === 'CONNECTED' ? (
            <button
              onClick={disconnectSession}
              title="Disconnect Session"
              className="p-2 text-wa-textSecondary hover:text-rose-400 hover:bg-wa-hover rounded-full transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={reconnectSession}
              title="Reconnect Session"
              className="p-2 text-wa-textSecondary hover:text-wa-accent hover:bg-wa-hover rounded-full transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
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
            className="w-full bg-transparent text-sm text-wa-textPrimary placeholder-wa-textSecondary focus:outline-none"
          />
        </div>
      </div>

      {/* Filter Tabs (All, Unread, Follow-ups) */}
      <div className="px-3 py-2 border-b border-wa-border flex items-center space-x-2">
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
            return (
              <div
                key={chat.jid}
                onClick={() => setActiveChatJid(chat.jid)}
                className={`px-4 py-3 flex items-center cursor-pointer transition-colors ${
                  isActive ? 'bg-wa-hover' : 'hover:bg-wa-header/60'
                }`}
              >
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
                    <span className="text-[11px] text-wa-textSecondary whitespace-nowrap">
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
                        <span className="w-5 h-5 rounded-full bg-wa-accent text-wa-bg font-bold text-[10px] flex items-center justify-center">
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
