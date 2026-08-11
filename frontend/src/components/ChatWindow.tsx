'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import { 
  Send, 
  Paperclip, 
  Smile, 
  Check, 
  CheckCheck, 
  Search, 
  MoreVertical, 
  PanelRightOpen, 
  PanelRightClose,
  Sparkles
} from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';

interface ChatWindowProps {
  isCrmOpen: boolean;
  toggleCrm: () => void;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({ isCrmOpen, toggleCrm }) => {
  const { chats, messages, activeChatJid, sendMessage } = useSocket();
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeChat = chats.find((c) => c.jid === activeChatJid);
  const messageList = activeChatJid ? messages[activeChatJid] || [] : [];

  // Auto-scroll to bottom of messages instantly (latest message at bottom)
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
    }
  }, [activeChatJid, messageList]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || !activeChatJid) return;
    const textToSend = inputText;
    setInputText('');
    await sendMessage(activeChatJid, textToSend);
  };

  const renderStatusTicks = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <Check className="w-3.5 h-3.5 text-wa-textSecondary" />;
      case 'SENT':
        return <Check className="w-3.5 h-3.5 text-wa-textSecondary" />;
      case 'DELIVERED':
        return <CheckCheck className="w-3.5 h-3.5 text-wa-textSecondary" />;
      case 'READ':
        return <CheckCheck className="w-3.5 h-3.5 text-sky-400" />;
      default:
        return <Check className="w-3.5 h-3.5 text-wa-textSecondary" />;
    }
  };

  if (!activeChatJid || !activeChat) {
    return (
      <div className="flex-1 h-full bg-wa-bg border-r border-wa-border flex flex-col items-center justify-center p-8 text-center select-none">
        <div className="w-24 h-24 rounded-full bg-wa-header flex items-center justify-center mb-6 text-wa-textSecondary">
          <Sparkles className="w-12 h-12 text-wa-accent" />
        </div>
        <h2 className="text-2xl font-light text-wa-textPrimary mb-2">AI Vastra CRM Workspace</h2>
        <p className="text-sm text-wa-textSecondary max-w-md">
          Select a chat to start messaging in real time. WhatsApp Multi-Device acts as the single source of truth.
        </p>
      </div>
    );
  }

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

  const displayName = formatChatDisplayName(activeChat);
  const cleanPhone = (activeChat.phone || activeChat.jid || '').split('@')[0].replace(/\D/g, '');
  const phoneSub = cleanPhone.length === 12 && cleanPhone.startsWith('91') 
    ? `+91 ${cleanPhone.slice(2, 7)} ${cleanPhone.slice(7)}` 
    : `+${cleanPhone}`;

  return (
    <div className="flex-1 h-full bg-wa-chatBg wa-chat-pattern flex flex-col min-w-0 border-r border-wa-border relative">
      {/* Top Chat Header */}
      <div className="h-16 px-4 bg-wa-header flex items-center justify-between border-b border-wa-border flex-shrink-0">
        <div className="flex items-center space-x-3 min-w-0 cursor-pointer" onClick={toggleCrm}>
          <div className="w-10 h-10 rounded-full overflow-hidden bg-wa-sidebar flex items-center justify-center flex-shrink-0">
            {activeChat.avatarUrl ? (
              <img src={activeChat.avatarUrl} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-wa-accent/20 flex items-center justify-center text-wa-accent font-semibold">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-wa-textPrimary truncate">{displayName}</h3>
            <p className="text-xs text-wa-textSecondary truncate">
              {activeChat.isGroup ? 'Group Chat' : phoneSub}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-2">
          <button
            onClick={toggleCrm}
            title={isCrmOpen ? 'Close CRM Drawer' : 'Open CRM Drawer'}
            className={`p-2 rounded-full transition-colors ${
              isCrmOpen ? 'bg-wa-accent/20 text-wa-accent' : 'text-wa-textSecondary hover:bg-wa-hover'
            }`}
          >
            {isCrmOpen ? <PanelRightClose className="w-5 h-5" /> : <PanelRightOpen className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Message Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messageList.map((msg) => {
          const isOutbound = msg.fromMe;
          const text = msg.text || '';

          // 1. Center System Notifications (E2E encryption notices, group notices)
          if (text === '[E2E_NOTIFICATION]' || text.includes('end-to-end encrypted') || text.includes('Messages and calls are end-to-end')) {
            return (
              <div key={msg.id} className="flex justify-center my-2 select-none">
                <div className="bg-wa-header text-[11px] text-amber-200/80 px-3 py-1 rounded-md max-w-[85%] text-center border border-amber-500/20 shadow-sm">
                  🔒 Messages and calls are end-to-end encrypted.
                </div>
              </div>
            );
          }

          // 2. Hide raw [CHAT] artifact label
          const cleanText = text === '[CHAT]' || text === 'Contact' ? '' : text;

          // 3. Format Deleted / Revoked Messages
          const isRevoked = text === '[REVOKED]' || text === 'This message was deleted';
          
          return (
            <div
              key={msg.id}
              className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[65%] rounded-lg px-3 py-2 shadow-sm text-sm relative group ${
                  isOutbound
                    ? 'bg-wa-outgoingBubble text-wa-textPrimary rounded-tr-none'
                    : 'bg-wa-incomingBubble text-wa-textPrimary rounded-tl-none'
                }`}
              >
                {/* Only show sender name in Group Chats */}
                {!isOutbound && activeChat.isGroup && msg.senderName && (
                  <span className="block text-[11px] font-semibold text-wa-accent mb-0.5">
                    {msg.senderName}
                  </span>
                )}

                {isRevoked ? (
                  <p className="italic text-wa-textSecondary/80 text-xs flex items-center space-x-1">
                    <span>🚫 This message was deleted</span>
                  </p>
                ) : (
                  cleanText && <p className="whitespace-pre-wrap break-words leading-relaxed">{cleanText}</p>
                )}

                <div className="flex items-center justify-end space-x-1 mt-1 text-[10px] text-wa-textSecondary/80">
                  <span>{format(new Date(msg.timestamp), 'h:mm a')}</span>
                  {isOutbound && renderStatusTicks(msg.status)}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Bottom Composer */}
      <div className="h-16 px-4 bg-wa-header flex items-center space-x-3 border-t border-wa-border flex-shrink-0">
        <button className="text-wa-textSecondary hover:text-wa-textPrimary transition-colors">
          <Smile className="w-6 h-6" />
        </button>
        <button className="text-wa-textSecondary hover:text-wa-textPrimary transition-colors">
          <Paperclip className="w-6 h-6" />
        </button>

        <form onSubmit={handleSend} className="flex-1">
          <input
            type="text"
            placeholder="Type a message..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            className="w-full bg-wa-sidebar text-sm text-wa-textPrimary placeholder-wa-textSecondary rounded-lg px-4 py-2.5 focus:outline-none"
          />
        </form>

        <button
          onClick={() => handleSend()}
          className="p-2.5 rounded-full bg-wa-accent text-wa-bg hover:bg-wa-accent/90 transition-colors shadow-md"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
