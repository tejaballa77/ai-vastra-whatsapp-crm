'use client';

import React, { useState } from 'react';
import { Sidebar } from '../components/Sidebar';
import { ChatWindow } from '../components/ChatWindow';
import { CrmDrawer } from '../components/CrmDrawer';
import { QrCodeModal } from '../components/QrCodeModal';
import { SyncLoadingScreen } from '../components/SyncLoadingScreen';
import { useSocket } from '../context/SocketContext';

export default function Home() {
  const [isCrmOpen, setIsCrmOpen] = useState<boolean>(true);
  const { sessionState, isHistorySyncing, chats } = useSocket();

  // Show SyncLoadingScreen right after QR pairing when history is downloading
  const showLoading = sessionState.status === 'CONNECTED' && (isHistorySyncing || chats.length === 0);

  return (
    <main className="w-screen h-screen flex overflow-hidden bg-wa-bg relative select-none">
      {/* 1. Left Sidebar (Platform Switcher, Search, Chat List) */}
      <Sidebar />

      {/* 2. Center Conversation Window (Chat Header, Messages, Input) */}
      <ChatWindow isCrmOpen={isCrmOpen} toggleCrm={() => setIsCrmOpen(!isCrmOpen)} />

      {/* 3. Right CRM Overlay Drawer (Lead Status, Follow-ups, Notes, Tags) */}
      <CrmDrawer isOpen={isCrmOpen} onClose={() => setIsCrmOpen(false)} />

      {/* 4. QR Code Pairing Modal (when disconnected) */}
      <QrCodeModal />

      {/* 5. WhatsApp Web Syncing Progress Screen (after QR pairing) */}
      {showLoading && <SyncLoadingScreen />}
    </main>
  );
}
