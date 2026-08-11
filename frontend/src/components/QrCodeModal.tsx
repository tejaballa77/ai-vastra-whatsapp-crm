'use client';

import React from 'react';
import { useSocket } from '../context/SocketContext';
import { QrCode, Smartphone, RefreshCw, CheckCircle2 } from 'lucide-react';

export const QrCodeModal = () => {
  const { sessionState, reconnectSession } = useSocket();

  if (sessionState.status === 'CONNECTED') {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-wa-bg/95 backdrop-blur-md flex items-center justify-center p-4 select-none">
      <div className="max-w-3xl w-full bg-wa-sidebar border border-wa-border rounded-2xl shadow-2xl p-8 flex flex-col md:flex-row items-center justify-between space-y-6 md:space-y-0 md:space-x-8">
        
        {/* Left Column: Instructions */}
        <div className="flex-1 space-y-6">
          <div className="flex items-center space-x-3">
            <div className="p-3 rounded-xl bg-wa-accent/20 text-wa-accent">
              <Smartphone className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-wa-textPrimary">Use AI Vastra CRM on WhatsApp</h1>
              <p className="text-xs text-wa-textSecondary">Real-time WhatsApp Web Synchronization</p>
            </div>
          </div>

          <ol className="space-y-3 text-sm text-wa-textPrimary">
            <li className="flex items-start space-x-3">
              <span className="w-6 h-6 rounded-full bg-wa-header flex items-center justify-center font-bold text-xs text-wa-accent flex-shrink-0">1</span>
              <span>Open <strong>WhatsApp</strong> on your mobile phone.</span>
            </li>
            <li className="flex items-start space-x-3">
              <span className="w-6 h-6 rounded-full bg-wa-header flex items-center justify-center font-bold text-xs text-wa-accent flex-shrink-0">2</span>
              <span>Tap <strong>Menu</strong> or <strong>Settings</strong> and select <strong>Linked Devices</strong>.</span>
            </li>
            <li className="flex items-start space-x-3">
              <span className="w-6 h-6 rounded-full bg-wa-header flex items-center justify-center font-bold text-xs text-wa-accent flex-shrink-0">3</span>
              <span>Tap on <strong>Link a Device</strong>.</span>
            </li>
            <li className="flex items-start space-x-3">
              <span className="w-6 h-6 rounded-full bg-wa-header flex items-center justify-center font-bold text-xs text-wa-accent flex-shrink-0">4</span>
              <span>Point your phone camera to this screen to capture the code.</span>
            </li>
          </ol>

          <div className="pt-2">
            <button
              onClick={reconnectSession}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-wa-header hover:bg-wa-hover text-wa-textPrimary text-xs font-semibold rounded-lg transition-colors border border-wa-border"
            >
              <RefreshCw className="w-4 h-4 text-wa-accent" />
              <span>Refresh Connection</span>
            </button>
          </div>
        </div>

        {/* Right Column: Dynamic Live QR Code Display */}
        <div className="flex flex-col items-center justify-center p-6 bg-white rounded-xl shadow-inner border border-gray-200 min-w-[260px]">
          {sessionState.currentQrCode ? (
            <div className="flex flex-col items-center space-y-3">
              <img
                src={sessionState.currentQrCode}
                alt="WhatsApp Link QR Code"
                className="w-56 h-56 object-contain rounded-lg"
              />
              <p className="text-xs font-semibold text-gray-600 animate-pulse">
                Scan QR code with your WhatsApp app
              </p>
            </div>
          ) : (
            <div className="w-56 h-56 flex flex-col items-center justify-center text-gray-400 space-y-3">
              <RefreshCw className="w-8 h-8 animate-spin text-emerald-600" />
              <span className="text-xs font-medium text-gray-600">Generating QR code...</span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
