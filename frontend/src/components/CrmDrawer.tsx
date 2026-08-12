'use client';

import React, { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import { 
  Phone, 
  Calendar, 
  FileText, 
  X, 
  ThumbsUp, 
  Flame, 
  ThumbsDown,
  Pencil,
  Plus,
  Trash2
} from 'lucide-react';

interface CrmDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CrmDrawer: React.FC<CrmDrawerProps> = ({ isOpen, onClose }) => {
  const { chats, activeChatJid, updateCrmMetadata } = useSocket();

  const activeChat = chats.find((c) => c.jid === activeChatJid);

  const [leadStatus, setLeadStatus] = useState<string>('UNASSIGNED');
  const [callStatus, setCallStatus] = useState<'YES' | 'NO' | undefined>(undefined);
  const [followUpDate, setFollowUpDate] = useState<string>('');
  const [newNoteInput, setNewNoteInput] = useState<string>('');
  const [notesList, setNotesList] = useState<string[]>([]);

  // Sync state ONLY when active chat changes
  useEffect(() => {
    if (activeChat) {
      setLeadStatus(activeChat.leadStatus || 'UNASSIGNED');
      setCallStatus(activeChat.callStatus);
      setFollowUpDate(activeChat.followUpDate || '');
      
      const existingList = activeChat.notesList || (activeChat.notes ? [activeChat.notes] : []);
      setNotesList(existingList);
    }
  }, [activeChatJid]);

  const updateAndSave = (updates: {
    leadStatus?: string;
    callStatus?: 'YES' | 'NO';
    followUpDate?: string;
    notesList?: string[];
  }) => {
    if (!activeChatJid) return;
    const newLeadStatus = updates.leadStatus !== undefined ? updates.leadStatus : leadStatus;
    const newCallStatus = updates.callStatus !== undefined ? updates.callStatus : callStatus;
    const newFollowUp = updates.followUpDate !== undefined ? updates.followUpDate : followUpDate;
    const newNotes = updates.notesList !== undefined ? updates.notesList : notesList;

    if (updates.leadStatus !== undefined) setLeadStatus(newLeadStatus);
    if (updates.callStatus !== undefined) setCallStatus(newCallStatus);
    if (updates.followUpDate !== undefined) setFollowUpDate(newFollowUp);
    if (updates.notesList !== undefined) setNotesList(newNotes);

    updateCrmMetadata(activeChatJid, {
      leadStatus: newLeadStatus as any,
      callStatus: newCallStatus,
      followUpDate: newFollowUp || undefined,
      notes: newNotes.join('\n\n'),
      notesList: newNotes,
    });
  };

  if (!isOpen || !activeChat) return null;

  const handleAddNote = () => {
    if (!newNoteInput.trim()) return;
    const updated = [newNoteInput.trim(), ...notesList];
    setNewNoteInput('');
    updateAndSave({ notesList: updated });
  };

  const handleDeleteNote = (index: number) => {
    const updated = notesList.filter((_, i) => i !== index);
    updateAndSave({ notesList: updated });
  };

  const displayName = activeChat?.name || activeChat?.jid?.split('@')[0] || 'Unknown';
  
  // Clean phone number formatting (never display raw 13+ digit numbers)
  const rawDigits = activeChat?.phone || activeChat?.jid?.split('@')[0].replace(/\D/g, '') || '';
  const cleanPhone = rawDigits.length > 12
    ? 'WhatsApp Contact'
    : (rawDigits.length === 12 && rawDigits.startsWith('91')
      ? `+91 ${rawDigits.slice(2, 7)} ${rawDigits.slice(7)}`
      : (rawDigits.length === 10 ? `+91 ${rawDigits.slice(0, 5)} ${rawDigits.slice(5)}` : `+${rawDigits}`));

  return (
    <div className="w-[360px] h-full bg-wa-sidebar border-l border-wa-border flex flex-col select-none z-10">
      {/* 1. Header - Clean Contact Info */}
      <div className="h-16 px-4 bg-wa-header flex items-center justify-between border-b border-wa-border flex-shrink-0">
        <h3 className="text-base font-semibold text-wa-textPrimary">Contact Info</h3>
        <button onClick={onClose} className="p-1.5 text-wa-textSecondary hover:text-wa-textPrimary hover:bg-wa-hover rounded-full transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Contact Info Card */}
        <div className="flex flex-col items-center p-4 rounded-xl bg-wa-header border border-wa-border/50 text-center shadow-sm">
          <div className="w-20 h-20 rounded-full overflow-hidden bg-wa-sidebar flex items-center justify-center mb-3 text-wa-accent font-bold text-2xl shadow-inner">
            {activeChat.avatarUrl ? (
              <img src={activeChat.avatarUrl} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              displayName.charAt(0).toUpperCase()
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            <h4 className="text-base font-semibold text-wa-textPrimary">{displayName}</h4>
          </div>

          <p className="text-xs text-wa-textSecondary flex items-center justify-center mt-1">
            <Phone className="w-3.5 h-3.5 mr-1" />
            {cleanPhone}
          </p>
        </div>

        {/* 2. LEAD STATUS */}
        <div>
          <label className="text-xs font-semibold text-wa-textSecondary uppercase tracking-wider block mb-2">
            Lead Status
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => updateAndSave({ leadStatus: 'INTERESTED' })}
              className={`p-2.5 rounded-lg border text-xs font-medium flex flex-col items-center justify-center transition-all ${
                leadStatus === 'INTERESTED'
                  ? 'bg-emerald-500/20 text-emerald-600 border-emerald-500 font-semibold'
                  : 'bg-wa-header border-wa-border text-wa-textSecondary hover:bg-wa-hover'
              }`}
            >
              <ThumbsUp className="w-4 h-4 mb-1" />
              Interested
            </button>

            <button
              onClick={() => updateAndSave({ leadStatus: 'WARM_INTERESTED' })}
              className={`p-2.5 rounded-lg border text-xs font-medium flex flex-col items-center justify-center transition-all ${
                leadStatus === 'WARM_INTERESTED'
                  ? 'bg-amber-500/20 text-amber-600 border-amber-500 font-semibold'
                  : 'bg-wa-header border-wa-border text-wa-textSecondary hover:bg-wa-hover'
              }`}
            >
              <Flame className="w-4 h-4 mb-1" />
              Warm
            </button>

            <button
              onClick={() => updateAndSave({ leadStatus: 'NOT_INTERESTED' })}
              className={`p-2.5 rounded-lg border text-xs font-medium flex flex-col items-center justify-center transition-all ${
                leadStatus === 'NOT_INTERESTED'
                  ? 'bg-rose-500/20 text-rose-600 border-rose-500 font-semibold'
                  : 'bg-wa-header border-wa-border text-wa-textSecondary hover:bg-wa-hover'
              }`}
            >
              <ThumbsDown className="w-4 h-4 mb-1" />
              Not Interested
            </button>
          </div>
        </div>

        {/* 2. CALL Status Selection (Yes / No) */}
        <div>
          <label className="text-xs font-semibold text-wa-textSecondary uppercase tracking-wider block mb-2">
            Call
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => updateAndSave({ callStatus: 'YES' })}
              className={`py-2 px-4 rounded-lg border text-xs font-semibold flex items-center justify-center space-x-2 transition-all ${
                callStatus === 'YES'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                  : 'bg-wa-header border-wa-border text-wa-textSecondary hover:bg-wa-hover'
              }`}
            >
              <span>Yes</span>
            </button>

            <button
              onClick={() => updateAndSave({ callStatus: 'NO' })}
              className={`py-2 px-4 rounded-lg border text-xs font-semibold flex items-center justify-center space-x-2 transition-all ${
                callStatus === 'NO'
                  ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                  : 'bg-wa-header border-wa-border text-wa-textSecondary hover:bg-wa-hover'
              }`}
            >
              <span>No</span>
            </button>
          </div>
        </div>

        {/* 3. FOLLOW-UP SCHEDULE */}
        <div>
          <label className="text-xs font-semibold text-wa-textSecondary uppercase tracking-wider block mb-2">
            Follow-up Schedule
          </label>
          <div className="relative flex items-center bg-wa-header border border-wa-border rounded-lg px-3 py-2">
            <Calendar className="w-4 h-4 text-wa-textSecondary mr-2" />
            <input
              type="date"
              value={followUpDate}
              onChange={(e) => updateAndSave({ followUpDate: e.target.value })}
              className="bg-transparent text-xs text-wa-textPrimary focus:outline-none w-full cursor-pointer"
            />
          </div>
        </div>

        {/* 4. CRM NOTES (Multiple Notes with + Add Button) */}
        <div>
          <label className="text-xs font-semibold text-wa-textSecondary uppercase tracking-wider block mb-2">
            CRM Notes
          </label>

          <div className="space-y-3">
            {/* Input + Add Note Button */}
            <div className="bg-wa-header border border-wa-border rounded-lg p-2.5 space-y-2">
              <textarea
                rows={2}
                placeholder="Add key note about customer requirements..."
                value={newNoteInput}
                onChange={(e) => setNewNoteInput(e.target.value)}
                className="w-full bg-transparent text-xs text-wa-textPrimary placeholder-wa-textSecondary focus:outline-none resize-none"
              />
              <button
                type="button"
                onClick={handleAddNote}
                className="w-full py-1.5 bg-wa-accent hover:bg-emerald-600 text-white rounded-md text-xs font-semibold flex items-center justify-center space-x-1 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Note</span>
              </button>
            </div>

            {/* List of Saved Notes */}
            {notesList.length > 0 && (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {notesList.map((noteText, idx) => (
                  <div key={idx} className="bg-wa-header/80 border border-wa-border/70 rounded-lg p-2.5 flex items-start justify-between space-x-2">
                    <p className="text-xs text-wa-textPrimary whitespace-pre-wrap flex-1 leading-relaxed">{noteText}</p>
                    <button
                      onClick={() => handleDeleteNote(idx)}
                      className="text-wa-textSecondary hover:text-rose-500 transition-colors p-0.5"
                      title="Delete Note"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 5. TAGS Section Completely Removed */}
      </div>
    </div>
  );
};
