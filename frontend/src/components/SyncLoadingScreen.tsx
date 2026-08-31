'use client';

import React, { useEffect, useState } from 'react';
import { MessageSquare, Lock, Sparkles } from 'lucide-react';

interface SyncLoadingScreenProps {
  onComplete?: () => void;
}

export const SyncLoadingScreen: React.FC<SyncLoadingScreenProps> = ({ onComplete }) => {
  const [progress, setProgress] = useState<number>(10);
  const [statusText, setStatusText] = useState<string>('Connecting to WhatsApp...');

  useEffect(() => {
    const t1 = setTimeout(() => {
      setProgress(35);
      setStatusText('Syncing saved address book contacts...');
    }, 1200);

    const t2 = setTimeout(() => {
      setProgress(65);
      setStatusText('Loading conversation threads & profile photos...');
    }, 2800);

    const t3 = setTimeout(() => {
      setProgress(90);
      setStatusText('Downloading recent message history...');
    }, 4500);

    const t4 = setTimeout(() => {
      setProgress(100);
      setStatusText('Synchronized!');
      if (onComplete) onComplete();
    }, 6000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-50 bg-[#111b21] flex flex-col items-center justify-between py-16 px-4 select-none">
      <div />

      {/* Center WhatsApp Logo & Progress Bar */}
      <div className="flex flex-col items-center max-w-sm w-full space-y-8 text-center">
        {/* Animated Icon */}
        <div className="relative">
          <div className="w-20 h-20 rounded-full bg-wa-accent/20 flex items-center justify-center animate-pulse">
            <MessageSquare className="w-10 h-10 text-wa-accent" />
          </div>
          <Sparkles className="w-5 h-5 text-amber-400 absolute -top-1 -right-1 animate-bounce" />
        </div>

        {/* Title */}
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-wa-textPrimary">AI Vastra CRM</h2>
          <p className="text-xs text-wa-textSecondary">{statusText}</p>
        </div>

        {/* Progress Bar Container */}
        <div className="w-full bg-wa-header h-1.5 rounded-full overflow-hidden relative">
          <div
            className="bg-wa-accent h-full transition-all duration-700 ease-out rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Footer Encryption Note */}
      <div className="flex items-center space-x-2 text-xs text-wa-textSecondary/70">
        <Lock className="w-3.5 h-3.5" />
        <span>End-to-end encrypted real-time synchronization</span>
      </div>
    </div>
  );
};
