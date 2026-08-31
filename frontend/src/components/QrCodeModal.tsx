'use client';

import React from 'react';
import { useSocket } from '../context/SocketContext';
import { QrCode, Smartphone, RefreshCw, X, LogOut, CheckCircle2 } from 'lucide-react';
import { getBackendUrl } from '../config';

interface QrCodeModalProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export const QrCodeModal = ({ isOpen, onClose }: QrCodeModalProps) => {
  const { sessionState, reconnectSession } = useSocket();

  const isExplicitlyOpen = isOpen !== undefined ? isOpen : sessionState.status !== 'CONNECTED';

  if (!isExplicitlyOpen) {
    return null;
  }

  const handleResetSession = async () => {
    try {
      await fetch(`${getBackendUrl()}/api/session/reset`, { method: 'POST' });
      reconnectSession();
    } catch (err) {
      console.error('Failed to reset session:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 select-none font-sans">
      <div className="max-w-3xl w-full bg-white border border-zinc-200 rounded-3xl shadow-2xl p-8 flex flex-col md:flex-row items-center justify-between space-y-6 md:space-y-0 md:space-x-8 relative animate-in fade-in zoom-in duration-150">
        
        {/* Close button */}
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center text-zinc-700 transition-all cursor-pointer shadow-xs"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Left Column: Instructions */}
        <div className="flex-1 space-y-5 text-black">
          <div className="flex items-center space-x-3">
            <div className="p-3 rounded-2xl bg-emerald-500 text-white shadow-md">
              <Smartphone className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-xl font-black text-black tracking-tight">Connect WhatsApp to AI CRM</h1>
              <p className="text-xs font-semibold text-zinc-500">Scan to link your account for 24/7 AI Auto-Replies</p>
            </div>
          </div>

          {sessionState.status === 'CONNECTED' ? (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-300 space-y-3">
              <div className="flex items-center gap-2 text-emerald-800 font-extrabold text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>WhatsApp is currently Connected!</span>
              </div>
              <p className="text-xs text-emerald-700 font-medium leading-relaxed">
                Your WhatsApp account is active in the cloud and ready to send AI Auto-Replies.
              </p>
              <div className="pt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleResetSession}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black rounded-xl transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Disconnect & Link Another Number</span>
                </button>
              </div>
            </div>
          ) : (
            <ol className="space-y-3 text-sm text-zinc-700 font-medium">
              <li className="flex items-start space-x-3">
                <span className="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center font-bold text-xs flex-shrink-0">1</span>
                <span>Open <strong>WhatsApp</strong> on your mobile phone.</span>
              </li>
              <li className="flex items-start space-x-3">
                <span className="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center font-bold text-xs flex-shrink-0">2</span>
                <span>Tap <strong>Menu (3 dots)</strong> or <strong>Settings</strong> and select <strong>Linked Devices</strong>.</span>
              </li>
              <li className="flex items-start space-x-3">
                <span className="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center font-bold text-xs flex-shrink-0">3</span>
                <span>Tap on <strong>Link a Device</strong>.</span>
              </li>
              <li className="flex items-start space-x-3">
                <span className="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center font-bold text-xs flex-shrink-0">4</span>
                <span>Point your phone camera at this screen to scan the QR code.</span>
              </li>
            </ol>
          )}

          <div className="pt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={reconnectSession}
              className="inline-flex items-center space-x-2 px-4 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-black text-xs font-bold rounded-xl transition-all border border-zinc-300 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4 text-emerald-600" />
              <span>Refresh QR Code</span>
            </button>
          </div>
        </div>

        {/* Right Column: Dynamic Live QR Code Display */}
        <div className="flex flex-col items-center justify-center p-6 bg-zinc-50 rounded-2xl border border-zinc-300 min-w-[270px]">
          {sessionState.status === 'CONNECTED' ? (
            <div className="w-56 h-56 flex flex-col items-center justify-center text-center space-y-2">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shadow-inner">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <p className="text-sm font-black text-emerald-900">Linked & Active</p>
              <p className="text-xs font-semibold text-zinc-500">Cloud session active</p>
            </div>
          ) : sessionState.currentQrCode ? (
            <div className="flex flex-col items-center space-y-3">
              <div className="p-3 bg-white rounded-2xl border-2 border-emerald-500 shadow-md">
                <img
                  src={sessionState.currentQrCode}
                  alt="WhatsApp Link QR Code"
                  className="w-52 h-52 object-contain rounded-lg"
                />
              </div>
              <p className="text-xs font-black text-emerald-700 animate-pulse">
                Scan this QR code with WhatsApp
              </p>
            </div>
          ) : (
            <div className="w-56 h-56 flex flex-col items-center justify-center text-zinc-400 space-y-3">
              <RefreshCw className="w-8 h-8 animate-spin text-emerald-600" />
              <span className="text-xs font-bold text-zinc-600">Generating live QR code...</span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
