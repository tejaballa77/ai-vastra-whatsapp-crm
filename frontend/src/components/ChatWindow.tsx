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
  Sparkles,
  Camera,
  FileText,
  Video,
  Phone,
  Lock,
  Mic,
  Plus
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
        return <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb]" />;
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
        <h2 className="text-2xl font-light text-wa-textPrimary mb-2">WhatsApp for Web</h2>
        <p className="text-sm text-wa-textSecondary max-w-md">
          Send and receive messages without keeping your phone online. Use AI Vastra CRM to manage leads and follow-ups.
        </p>
        <div className="mt-8 flex items-center space-x-2 text-xs text-wa-textSecondary">
          <Lock className="w-3.5 h-3.5" />
          <span>End-to-end encrypted</span>
        </div>
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
      <div className="h-[59px] px-4 bg-wa-header flex items-center justify-between border-b border-wa-border flex-shrink-0">
        <div className="flex items-center space-x-3 min-w-0 cursor-pointer" onClick={toggleCrm}>
          <div className="w-10 h-10 rounded-full overflow-hidden bg-wa-sidebar flex items-center justify-center flex-shrink-0">
            {activeChat.avatarUrl ? (
              <img src={activeChat.avatarUrl} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-wa-accent/20 flex items-center justify-center text-wa-accent font-semibold text-lg">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          <div className="min-w-0">
            <h3 className="text-base font-medium text-wa-textPrimary truncate leading-tight">{displayName}</h3>
            <p className="text-xs text-wa-textSecondary truncate">
              {activeChat.isGroup ? 'Group Chat' : 'click here for contact info'}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-3 text-wa-textSecondary">
          <button title="Video call" className="p-2 hover:text-wa-textPrimary hover:bg-wa-hover rounded-full transition-colors">
            <Video className="w-5 h-5" />
          </button>

          <button title="Voice call" className="p-2 hover:text-wa-textPrimary hover:bg-wa-hover rounded-full transition-colors">
            <Phone className="w-5 h-5" />
          </button>

          <div className="w-px h-5 bg-wa-border mx-1" />

          <button title="Search..." className="p-2 hover:text-wa-textPrimary hover:bg-wa-hover rounded-full transition-colors">
            <Search className="w-5 h-5" />
          </button>

          <button
            onClick={toggleCrm}
            title={isCrmOpen ? 'Close CRM Drawer' : 'Open CRM Drawer'}
            className={`p-2 rounded-full transition-colors ${
              isCrmOpen ? 'bg-wa-accent/20 text-wa-accent' : 'hover:text-wa-textPrimary hover:bg-wa-hover'
            }`}
          >
            {isCrmOpen ? <PanelRightClose className="w-5 h-5" /> : <PanelRightOpen className="w-5 h-5" />}
          </button>

          <button title="Menu" className="p-2 hover:text-wa-textPrimary hover:bg-wa-hover rounded-full transition-colors">
            <MoreVertical className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Message Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Encrypted Notice Banner */}
        <div className="flex justify-center my-2">
          <div className="px-3 py-1.5 bg-[#ffeecd] dark:bg-[#182229] rounded-lg text-[12.5px] text-[#54656f] dark:text-[#8696a0] shadow-sm flex items-center space-x-1.5 max-w-md text-center">
            <Lock className="w-3.5 h-3.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
            <span>Messages and calls are end-to-end encrypted. No one outside of this chat can read or listen.</span>
          </div>
        </div>

        {messageList.map((msg) => {
          const isOutbound = msg.fromMe;
          const isImage = msg.mediaType === 'image' || Boolean(msg.mediaUrl) || (msg.text && (msg.text.startsWith('data:image') || msg.text.startsWith('http') && (msg.text.includes('.jpg') || msg.text.includes('.png') || msg.text.includes('.webp'))));
          const isPhotoText = !isImage && msg.text && (msg.text.toLowerCase() === 'photo' || msg.text.toLowerCase() === '📷 image' || msg.text.toLowerCase().includes('2 photos') || msg.text.toLowerCase() === 'photo');
          const isDocument = msg.mediaType === 'document' || (msg.text && (msg.text.endsWith('.pdf') || msg.text.endsWith('.doc')));

          return (
            <div
              key={msg.id}
              className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[65%] rounded-lg px-3 py-1.5 shadow-sm text-[14.2px] relative group ${
                  isOutbound
                    ? 'bg-wa-outgoingBubble text-wa-textPrimary rounded-tr-none'
                    : 'bg-wa-incomingBubble text-wa-textPrimary rounded-tl-none'
                }`}
              >
                {!isOutbound && msg.senderName && (
                  <span className="block text-[12px] font-semibold text-wa-accent mb-0.5">
                    {msg.senderName}
                  </span>
                )}

                {/* Photo Preview Card */}
                {isImage && (
                  <div className="mb-1.5 rounded-md overflow-hidden max-w-xs bg-black/10 border border-white/10">
                    <img 
                      src={msg.mediaUrl || msg.text} 
                      alt="Photo" 
                      className="w-full max-h-64 object-cover cursor-pointer hover:opacity-95 transition-opacity" 
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  </div>
                )}

                {/* Photo Attachment Placeholder */}
                {isPhotoText && (
                  <div className="mb-1 flex items-center space-x-2 px-2.5 py-1.5 bg-black/10 rounded border border-white/10 text-emerald-600 dark:text-emerald-400">
                    <Camera className="w-4 h-4 flex-shrink-0" />
                    <span className="text-xs font-medium">📷 Photo</span>
                  </div>
                )}

                {/* Document Card */}
                {isDocument && (
                  <div className="mb-1 flex items-center space-x-2 px-2.5 py-1.5 bg-black/10 rounded border border-white/10 text-amber-600 dark:text-amber-400">
                    <FileText className="w-4 h-4 flex-shrink-0" />
                    <span className="text-xs font-medium truncate">{msg.text || 'Document.pdf'}</span>
                  </div>
                )}

                {/* Message Text */}
                {(!isImage || (msg.text && !msg.text.startsWith('data:image') && !msg.text.startsWith('http'))) && (
                  <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.text}</p>
                )}

                <div className="flex items-center justify-end space-x-1 mt-0.5 text-[11px] text-wa-textSecondary/80 float-right ml-2 -mb-0.5">
                  <span>{format(new Date(msg.timestamp), 'h:mm a').toLowerCase()}</span>
                  {isOutbound && renderStatusTicks(msg.status)}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Bottom Composer (WhatsApp Web Bottom Bar) */}
      <form onSubmit={handleSend} className="h-[62px] px-4 bg-wa-header flex items-center space-x-3 border-t border-wa-border flex-shrink-0">
        <button type="button" className="text-wa-textSecondary hover:text-wa-textPrimary transition-colors p-1.5">
          <Smile className="w-6 h-6" />
        </button>

        <button type="button" className="text-wa-textSecondary hover:text-wa-textPrimary transition-colors p-1.5">
          <Plus className="w-6 h-6" />
        </button>

        <div className="flex-1 h-10 px-4 bg-wa-sidebar rounded-lg flex items-center border border-transparent focus-within:border-wa-accent transition-all">
          <input
            type="text"
            placeholder="Type a message"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            className="w-full bg-transparent text-sm text-wa-textPrimary placeholder-wa-textSecondary focus:outline-none"
          />
        </div>

        {inputText.trim() ? (
          <button
            type="submit"
            className="w-10 h-10 rounded-full bg-wa-accent text-white flex items-center justify-center hover:opacity-90 transition-opacity flex-shrink-0"
          >
            <Send className="w-5 h-5" />
          </button>
        ) : (
          <button
            type="button"
            className="text-wa-textSecondary hover:text-wa-textPrimary transition-colors p-1.5"
          >
            <Mic className="w-6 h-6" />
          </button>
        )}
      </form>
    </div>
  );
};
