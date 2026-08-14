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
  FileText,
  Download,
  Image,
  Info,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  Video
} from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';

interface ChatWindowProps {
  isCrmOpen: boolean;
  toggleCrm: () => void;
}

const getBackendUrl = () => {
  if (process.env.NEXT_PUBLIC_BACKEND_URL) return process.env.NEXT_PUBLIC_BACKEND_URL;
  if (typeof window !== 'undefined') return window.location.origin;
  return 'http://localhost:5000';
};

export const ChatWindow: React.FC<ChatWindowProps> = ({ isCrmOpen, toggleCrm }) => {
  const { chats, messages, activeChatJid, sendMessage } = useSocket();
  const [inputText, setInputText] = useState('');
  const [apiMessages, setApiMessages] = useState<any[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeChat = chats.find((c) => c.jid === activeChatJid);

  const cleanJid = activeChatJid ? activeChatJid.split('@')[0] : '';
  const socketMsgs = activeChatJid ? (messages[activeChatJid] || messages[cleanJid] || messages[`${cleanJid}@s.whatsapp.net`] || []) : [];

  useEffect(() => {
    if (!activeChatJid) return;
    const url = `${getBackendUrl()}/api/messages/${encodeURIComponent(activeChatJid)}`;
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setApiMessages(data);
        }
      })
      .catch((err) => console.error('Error fetching chat messages:', err));
  }, [activeChatJid]);

  const messageList = socketMsgs.length >= apiMessages.length ? socketMsgs : apiMessages;

  // Header Subtitle Cleanup
  const cleanPhoneNum = activeChatJid ? activeChatJid.split('@')[0].replace(/\D/g, '') : '';
  const phoneSub = cleanPhoneNum.length > 12 
    ? 'WhatsApp Contact' 
    : (cleanPhoneNum.length === 12 && cleanPhoneNum.startsWith('91')
      ? `+91 ${cleanPhoneNum.slice(2, 7)} ${cleanPhoneNum.slice(7)}`
      : (cleanPhoneNum.length === 10 ? `+91 ${cleanPhoneNum.slice(0, 5)} ${cleanPhoneNum.slice(5)}` : `+${cleanPhoneNum}`));

  const renderCallCard = (msg: any) => {
    const text = msg.text || '';
    const isCall = text.includes('Voice call') || text.includes('Video call') || text.includes('Missed') || msg.mediaType === 'call';
    if (!isCall) return null;

    const isMissed = text.includes('Missed') || (!msg.fromMe && (text.includes('Voice call') || text === '[CALL_LOG]'));
    const isVideo = text.includes('Video');

    if (isMissed) {
      return (
        <div className="my-1.5 p-3 rounded-xl bg-white border border-wa-border flex items-center space-x-3 min-w-[210px] shadow-sm select-none">
          <div className="w-10 h-10 rounded-full bg-red-100/80 flex items-center justify-center text-rose-600 shadow-inner flex-shrink-0">
            <Phone className="w-5 h-5 transform -rotate-45" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-[#111b21]">Missed {isVideo ? 'video' : 'voice'} call</p>
            <p className="text-[11px] text-[#667781]">Click to call back</p>
          </div>
        </div>
      );
    }

    const duration = text.replace(/Voice call|Video call|Missed voice call/gi, '').trim() || '1 minute';

    return (
      <div className="my-1.5 p-3 rounded-xl bg-white/90 border border-wa-border flex items-center space-x-3 min-w-[210px] shadow-sm select-none">
        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-slate-800 shadow-sm border border-wa-border flex-shrink-0">
          <Phone className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-[#111b21]">{isVideo ? 'Video call' : 'Voice call'}</p>
          <p className="text-[11px] text-[#667781]">{duration}</p>
        </div>
      </div>
    );
  };

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
        return (
          <div className="flex -space-x-1.5 items-center" title="Delivered">
            <Check className="w-3.5 h-3.5 text-wa-textSecondary" />
            <Check className="w-3.5 h-3.5 text-wa-textSecondary" />
          </div>
        );
      case 'READ':
        return (
          <div className="flex -space-x-1.5 items-center" title="Read">
            <Check className="w-3.5 h-3.5 text-sky-400" />
            <Check className="w-3.5 h-3.5 text-sky-400" />
          </div>
        );
      default:
        return (
          <div className="flex -space-x-1.5 items-center">
            <Check className="w-3.5 h-3.5 text-wa-textSecondary" />
            <Check className="w-3.5 h-3.5 text-wa-textSecondary" />
          </div>
        );
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

  const renderMediaCard = (msg: any) => {
    const text = msg.text || '';
    const fileName = msg.fileName || (text && (text.endsWith('.pdf') || text.endsWith('.jpg') || text.endsWith('.jpeg') || text.endsWith('.png')) ? text : undefined);
    
    const isDoc = msg.mediaType === 'document' || (text && text.endsWith('.pdf')) || (fileName && fileName.endsWith('.pdf'));
    const isImg = msg.mediaType === 'image' || (text && /\.(jpg|jpeg|png|webp)$/i.test(text)) || (fileName && /\.(jpg|jpeg|png|webp)$/i.test(fileName)) || text === '[IMAGE]' || text === 'Photo';

    const hasValidUrl = msg.mediaUrl && typeof msg.mediaUrl === 'string' && (msg.mediaUrl.startsWith('http://') || msg.mediaUrl.startsWith('https://') || msg.mediaUrl.startsWith('data:'));

    if (isDoc) {
      const docName = fileName || (text.endsWith('.pdf') ? text : 'Document.pdf');
      return (
        <div className="my-1.5 p-2.5 rounded-lg bg-wa-header/90 border border-wa-border flex items-center justify-between min-w-[220px] max-w-[300px] shadow-sm select-none">
          <div className="flex items-center space-x-3 min-w-0 mr-2">
            <div className="w-9 h-9 rounded bg-rose-500/20 text-rose-400 flex items-center justify-center flex-shrink-0 font-bold text-[11px]">
              PDF
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-wa-textPrimary truncate">{docName}</p>
              <p className="text-[10px] text-wa-textSecondary">PDF Document</p>
            </div>
          </div>
          {hasValidUrl ? (
            <a
              href={msg.mediaUrl}
              target="_blank"
              rel="noopener noreferrer"
              download={docName}
              className="p-2 rounded-full hover:bg-wa-hover text-wa-accent transition-colors flex-shrink-0"
              title="Download Document"
            >
              <Download className="w-4 h-4" />
            </a>
          ) : (
            <div 
              onClick={() => alert(`Document file: ${docName}`)} 
              className="p-2 text-wa-accent hover:bg-wa-hover rounded-full cursor-pointer flex-shrink-0" 
              title="View Document"
            >
              <FileText className="w-4 h-4" />
            </div>
          )}
        </div>
      );
    }

    if (isImg) {
      return (
        <div className="my-1.5 rounded-lg overflow-hidden border border-wa-border bg-wa-header/40 max-w-[280px]">
          {hasValidUrl ? (
            <img src={msg.mediaUrl} alt={fileName || 'Photo'} className="w-full max-h-60 object-cover rounded-t-lg" />
          ) : (
            <div className="p-3 flex items-center space-x-2.5 text-wa-accent bg-wa-accent/10">
              <Image className="w-5 h-5 flex-shrink-0" />
              <span className="text-xs font-medium truncate">{fileName || 'Photo Attachment'}</span>
            </div>
          )}
        </div>
      );
    }

    return null;
  };

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

        {/* Action Controls - Info Button (i symbol with circle) */}
        <div className="flex items-center space-x-2">
          <button
            onClick={toggleCrm}
            title={isCrmOpen ? 'Close Contact Info' : 'Open Contact Info'}
            className={`p-2 rounded-full transition-colors ${
              isCrmOpen ? 'bg-wa-accent/20 text-wa-accent' : 'text-wa-textSecondary hover:bg-wa-hover'
            }`}
          >
            <Info className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Message Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {(() => {
          let lastDateLabel = '';

          return messageList.map((msg) => {
            const isOutbound = msg.fromMe;
            const text = msg.text || '';

            // Date Divider logic
            const rawTs = msg.timestamp || Date.now();
            const msgDate = new Date(rawTs < 10000000000 ? rawTs * 1000 : rawTs);
            let currentDateLabel = '';
            if (isToday(msgDate)) currentDateLabel = 'Today';
            else if (isYesterday(msgDate)) currentDateLabel = 'Yesterday';
            else currentDateLabel = format(msgDate, 'MMMM d, yyyy');

            let showDateDivider = false;
            if (currentDateLabel !== lastDateLabel) {
              lastDateLabel = currentDateLabel;
              showDateDivider = true;
            }

            // Hide system encryption notices
            if (text === '[E2E_NOTIFICATION]' || text.includes('end-to-end encrypted') || text.includes('Messages and calls are end-to-end')) {
              return null;
            }

            // Call Card
            const callCard = renderCallCard(msg);

            // Media Card
            const mediaCard = renderMediaCard(msg);

            // Clean Text
            let cleanText = text;
            if (cleanText === '[INTERACTIVE]' || cleanText === '[CHAT]' || cleanText === 'Contact' || cleanText === '[DOCUMENT]' || cleanText === '[IMAGE]' || cleanText === 'Photo' || cleanText === '[CALL_LOG]') {
              cleanText = '';
            }

            const isRevoked = text === '[REVOKED]' || text === 'This message was deleted';

            if (!cleanText && !mediaCard && !callCard && !isRevoked) {
              return null;
            }

            return (
              <React.Fragment key={msg.id}>
                {showDateDivider && (
                  <div className="flex justify-center my-3">
                    <div className="bg-white border border-wa-border/50 shadow-sm text-[11px] text-[#54656f] px-3 py-1 rounded-md font-medium select-none">
                      {currentDateLabel}
                    </div>
                  </div>
                )}

                <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[65%] rounded-lg px-3 py-2 shadow-sm text-sm relative group ${
                      isOutbound
                        ? 'bg-wa-outgoingBubble text-wa-textPrimary rounded-tr-none'
                        : 'bg-wa-incomingBubble text-wa-textPrimary rounded-tl-none'
                    }`}
                  >
                    {!isOutbound && activeChat?.isGroup && msg.senderName && (
                      <span className="block text-[11px] font-semibold text-wa-accent mb-0.5">
                        {msg.senderName}
                      </span>
                    )}

                    {callCard}
                    {mediaCard}

                    {isRevoked ? (
                      <p className="italic text-wa-textSecondary/80 text-xs flex items-center space-x-1">
                        <span>🚫 This message was deleted</span>
                      </p>
                    ) : (
                      cleanText && cleanText !== msg.fileName && <p className="whitespace-pre-wrap break-words leading-relaxed mt-0.5">{cleanText}</p>
                    )}

                    <div className="flex items-center justify-end space-x-1 mt-1 text-[10px] text-wa-textSecondary/80">
                      <span>{format(msgDate, 'h:mm a')}</span>
                      {isOutbound && renderStatusTicks(msg.status)}
                    </div>
                  </div>
                </div>
              </React.Fragment>
            );
          });
        })()}
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
