'use client';

import React, { useState } from 'react';
import { LeftRail } from '../components/LeftRail';
import { Sidebar } from '../components/Sidebar';
import { ChatWindow } from '../components/ChatWindow';
import { CrmDrawer } from '../components/CrmDrawer';
import { QrCodeModal } from '../components/QrCodeModal';
import { SyncLoadingScreen } from '../components/SyncLoadingScreen';
import { useSocket } from '../context/SocketContext';

export default function Home() {
  const [activeRailTab, setActiveRailTab] = useState<string>('chats');
  const [isCrmOpen, setIsCrmOpen] = useState<boolean>(true);
  const { sessionState, isHistorySyncing, chats } = useSocket();

  // Show SyncLoadingScreen right after QR pairing when history is downloading
  const showLoading = sessionState.status === 'CONNECTED' && (isHistorySyncing || chats.length === 0);

  return (
    <main className="w-screen h-screen flex overflow-hidden bg-wa-bg relative select-none">
      {/* 1. Official WhatsApp Web Left Rail Navigation */}
      <LeftRail 
        activeTab={activeRailTab} 
        setActiveTab={setActiveRailTab} 
        onOpenCrm={() => setIsCrmOpen(!isCrmOpen)} 
      />

      {/* 2. Left Sidebar (Search, Filter Pills, Chat List) */}
      <Sidebar />

      {/* 3. Center Conversation Window (Header, Messages, Composer) */}
      <ChatWindow isCrmOpen={isCrmOpen} toggleCrm={() => setIsCrmOpen(!isCrmOpen)} />

      {/* 4. Right CRM Overlay Drawer (Lead Status, Follow-ups, Notes, Tags) */}
      <CrmDrawer isOpen={isCrmOpen} onClose={() => setIsCrmOpen(false)} />

      {/* 5. QR Code Pairing Modal (when disconnected) */}
      <QrCodeModal />

      {/* 6. WhatsApp Web Syncing Progress Screen (after QR pairing) */}
      {showLoading && <SyncLoadingScreen />}
    </main>
  );
}
