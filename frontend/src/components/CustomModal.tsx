'use client';

import React from 'react';
import { AlertCircle, CheckCircle2, HelpCircle, X } from 'lucide-react';

interface CustomModalProps {
  isOpen: boolean;
  type?: 'confirm' | 'alert' | 'danger';
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function CustomModal({
  isOpen,
  type = 'confirm',
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onClose,
}: CustomModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[99999] flex items-center justify-center p-4 text-black font-sans animate-fade-in">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-zinc-200 p-6 md:p-7 space-y-5 transform transition-all scale-100">
        
        {/* Header with Icon & Close */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {type === 'danger' ? (
              <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-6 h-6" />
              </div>
            ) : type === 'alert' ? (
              <div className="w-11 h-11 rounded-2xl bg-blue-100 text-[#0066cc] flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
            ) : (
              <div className="w-11 h-11 rounded-2xl bg-zinc-100 text-black flex items-center justify-center flex-shrink-0">
                <HelpCircle className="w-6 h-6" />
              </div>
            )}
            <div>
              <h3 className="text-lg font-extrabold text-black tracking-tight">{title}</h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center text-zinc-600 transition-all flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Message */}
        <p className="text-sm font-medium text-zinc-600 leading-relaxed pl-1">
          {message}
        </p>

        {/* Footer Actions */}
        <div className="pt-3 flex items-center justify-end gap-3 border-t border-zinc-100">
          {type !== 'alert' && (
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-xs font-bold text-zinc-700 hover:bg-zinc-100 rounded-xl border border-zinc-200 transition-all"
            >
              {cancelText}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`px-6 py-2.5 text-white font-extrabold text-xs rounded-xl transition-all shadow-md active:scale-95 ${
              type === 'danger'
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-black hover:bg-zinc-800'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
