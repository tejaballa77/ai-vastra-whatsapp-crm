'use client';

import React from 'react';
import { WhatsAppCrmModule } from '../components/WhatsAppCrmModule';
import { QrCodeModal } from '../components/QrCodeModal';
import { SyncLoadingScreen } from '../components/SyncLoadingScreen';
import { useSocket } from '../context/SocketContext';

export default function Home() {
  const { sessionState, isHistorySyncing, chats } = useSocket();

  // Show SyncLoadingScreen right after QR pairing when history is downloading
  const showLoading = sessionState.status === 'CONNECTED' && (isHistorySyncing || chats.length === 0);

  return (
    <main className="w-screen h-screen flex overflow-hidden bg-wa-bg relative select-none">
      <WhatsAppCrmModule />

      {/* QR Code Pairing Modal (when disconnected) */}
      <QrCodeModal />

      {/* WhatsApp Web Syncing Progress Screen (after QR pairing) */}
      {showLoading && <SyncLoadingScreen />}
    </main>
  );
}
