'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { Chat, Message, SessionState } from '../types/chat';

const getBackendUrl = () => {
  if (process.env.NEXT_PUBLIC_BACKEND_URL) return process.env.NEXT_PUBLIC_BACKEND_URL;
  if (typeof window !== 'undefined') return window.location.origin;
  return 'http://localhost:5000';
};

interface SocketContextType {
  socket: Socket | null;
  sessionState: SessionState;
  chats: Chat[];
  messages: Record<string, Message[]>; // chatJid -> Message[]
  activeChatJid: string | null;
  setActiveChatJid: (jid: string | null) => void;
  sendMessage: (chatJid: string, text: string) => Promise<void>;
  disconnectSession: () => Promise<void>;
  reconnectSession: () => Promise<void>;
  updateCrmMetadata: (jid: string, data: {
    leadStatus?: 'INTERESTED' | 'WARM_INTERESTED' | 'NOT_INTERESTED' | 'UNASSIGNED';
    followUpDate?: string;
    notes?: string;
    tags?: string[];
  }) => Promise<void>;
  isHistorySyncing: boolean;
  syncedMessageCount: number;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const SocketProvider = ({ children }: { children: ReactNode }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [sessionState, setSessionState] = useState<SessionState>({
    status: 'DISCONNECTED',
    currentQrCode: null,
    meJid: null,
  });
  const [chats, setChats] = useState<Chat[]>([]);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [activeChatJid, setActiveChatJid] = useState<string | null>(null);
  const [isHistorySyncing, setIsHistorySyncing] = useState<boolean>(false);
  const [syncedMessageCount, setSyncedMessageCount] = useState<number>(0);

  useEffect(() => {
    const s = io(getBackendUrl(), {
      transports: ['websocket', 'polling'],
      reconnection: true,
    });

    setSocket(s);

    s.on('connect', () => {
      console.log('[SocketContext] Socket connected to backend');
    });

    s.on('connection_status', (data: SessionState) => {
      console.log('[SocketContext] Connection status update:', data.status);
      setSessionState(data);
      if (data.status === 'CONNECTED') {
        setIsHistorySyncing(true);
      }
    });

    s.on('qr_code', ({ qr }: { qr: string | null }) => {
      setSessionState((prev) => ({
        ...prev,
        currentQrCode: qr,
        status: qr ? 'QR_READY' : prev.status,
      }));
      if (qr) {
        setIsHistorySyncing(false);
      }
    });

    s.on('chats_updated', (updatedChats: Chat[]) => {
      setChats(updatedChats);
      if (updatedChats.length > 0) {
        // Smooth transition out of loading screen
        setTimeout(() => setIsHistorySyncing(false), 2000);
      }
    });

    s.on('new_message', (msg: Message) => {
      setMessages((prev) => {
        const list = prev[msg.chatJid] || [];
        const exists = list.some((m) => m.id === msg.id);
        if (exists) return prev;
        return {
          ...prev,
          [msg.chatJid]: [...list, msg].sort((a, b) => a.timestamp - b.timestamp),
        };
      });
    });

    s.on('message_status', ({ id, chatJid, status }: { id: string; chatJid: string; status: Message['status'] }) => {
      setMessages((prev) => {
        const list = prev[chatJid];
        if (!list) return prev;
        return {
          ...prev,
          [chatJid]: list.map((m) => (m.id === id ? { ...m, status } : m)),
        };
      });
    });

    s.on('history_synced', ({ chats: syncedChats, messageCount }: { chats: Chat[]; messageCount: number }) => {
      console.log(`[SocketContext] History sync completed! Received ${messageCount} messages.`);
      setChats(syncedChats);
      setIsHistorySyncing(false);
      setSyncedMessageCount(messageCount);
    });

    return () => {
      s.disconnect();
    };
  }, []);

  // Fetch messages when active chat changes
  useEffect(() => {
    if (!activeChatJid) return;
    fetch(`${getBackendUrl()}/api/messages/${encodeURIComponent(activeChatJid)}`)
      .then((res) => res.json())
      .then((msgList: Message[]) => {
        setMessages((prev) => ({
          ...prev,
          [activeChatJid]: msgList,
        }));
      })
      .catch((err) => console.error('Error fetching messages:', err));
  }, [activeChatJid]);

  const sendMessage = async (chatJid: string, text: string) => {
    try {
      const res = await fetch(`${getBackendUrl()}/api/messages/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatJid, text }),
      });
      if (!res.ok) {
        throw new Error('Failed to send message');
      }
    } catch (err) {
      console.error('[SocketContext] Send message error:', err);
    }
  };

  const disconnectSession = async () => {
    try {
      await fetch(`${getBackendUrl()}/api/session/disconnect`, { method: 'POST' });
    } catch (err) {
      console.error('[SocketContext] Disconnect error:', err);
    }
  };

  const reconnectSession = async () => {
    try {
      await fetch(`${getBackendUrl()}/api/session/connect`, { method: 'POST' });
    } catch (err) {
      console.error('[SocketContext] Reconnect error:', err);
    }
  };

  const updateCrmMetadata = async (
    jid: string,
    data: {
      leadStatus?: 'INTERESTED' | 'WARM_INTERESTED' | 'NOT_INTERESTED' | 'UNASSIGNED';
      followUpDate?: string;
      notes?: string;
      tags?: string[];
    }
  ) => {
    // Optimistic UI update
    setChats((prev) =>
      prev.map((c) => (c.jid === jid ? { ...c, ...data } : c))
    );

    try {
      await fetch(`${getBackendUrl()}/api/crm/contact/${encodeURIComponent(jid)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } catch (err) {
      console.error('[SocketContext] Update CRM metadata error:', err);
    }
  };

  return (
    <SocketContext.Provider
      value={{
        socket,
        sessionState,
        chats,
        messages,
        activeChatJid,
        setActiveChatJid,
        sendMessage,
        disconnectSession,
        reconnectSession,
        updateCrmMetadata,
        isHistorySyncing,
        syncedMessageCount,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};
