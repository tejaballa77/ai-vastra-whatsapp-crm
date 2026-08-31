export interface Chat {
  jid: string;
  name: string;
  phone?: string;
  unreadCount: number;
  lastMessagePreview?: string;
  lastMessageAt: number;
  lastMessageFromMe?: boolean;
  lastMessageStatus?: Message['status'];
  avatarUrl?: string;
  isGroup: boolean;
  leadStatus: 'INTERESTED' | 'WARM_INTERESTED' | 'WARM' | 'NOT_INTERESTED' | 'UNASSIGNED';
  callStatus?: 'YES' | 'NO';
  followUpDate?: string;
  previousFollowUpDate?: string;
  notes?: string;
  notesList?: string[];
  tags: string[];
  aiDisabled?: boolean;
  manuallySaved?: boolean;
  isAutoWarm?: boolean;
  updatedAt?: number;
}

export interface Message {
  id: string;
  chatJid: string;
  senderJid: string;
  senderName?: string;
  fromMe: boolean;
  text: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document' | 'call';
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
