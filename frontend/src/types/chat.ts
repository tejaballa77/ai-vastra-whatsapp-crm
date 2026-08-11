export interface Chat {
  jid: string;
  name: string;
  phone?: string;
  unreadCount: number;
  lastMessagePreview?: string;
  lastMessageAt: number;
  avatarUrl?: string;
  isGroup: boolean;
  leadStatus: 'INTERESTED' | 'WARM_INTERESTED' | 'NOT_INTERESTED' | 'UNASSIGNED';
  followUpDate?: string;
  notes?: string;
  tags: string[];
}

export interface Message {
  id: string;
  chatJid: string;
  senderJid: string;
  senderName?: string;
  fromMe: boolean;
  text: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
  fileName?: string;
  timestamp: number;
  status: 'PENDING' | 'SENT' | 'DELIVERED' | 'READ';
}

export type ConnectionStatus = 'DISCONNECTED' | 'CONNECTING' | 'QR_READY' | 'CONNECTED';

export interface SessionState {
  status: ConnectionStatus;
  currentQrCode: string | null;
  meJid: string | null;
}
