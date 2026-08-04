'use client';

import React, { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import { 
  User, 
  Phone, 
  Calendar, 
  FileText, 
  Tag, 
  X, 
  Check, 
  Clock, 
  ThumbsUp, 
  Flame, 
  ThumbsDown,
  Sparkles,
  Pencil
} from 'lucide-react';

interface CrmDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CrmDrawer: React.FC<CrmDrawerProps> = ({ isOpen, onClose }) => {
  const { chats, activeChatJid, updateCrmMetadata } = useSocket();

  const activeChat = chats.find((c) => c.jid === activeChatJid);

  const [leadStatus, setLeadStatus] = useState<string>('UNASSIGNED');
  const [followUpDate, setFollowUpDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [tagInput, setTagInput] = useState<string>('');
  const [tags, setTags] = useState<string[]>([]);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');

  // Sync state when active chat changes
  useEffect(() => {
    if (activeChat) {
      setLeadStatus(activeChat.leadStatus || 'UNASSIGNED');
      setFollowUpDate(activeChat.followUpDate || '');
      setNotes(activeChat.notes || '');
      setTags(activeChat.tags || []);
    }
  }, [activeChat]);

  // Debounced auto-save for notes & fields
  useEffect(() => {
    if (!activeChatJid) return;
    const timer = setTimeout(() => {
      setSaveStatus('saving');
      updateCrmMetadata(activeChatJid, {
        leadStatus: leadStatus as any,
        followUpDate: followUpDate || undefined,
        notes,
        tags,
      }).then(() => setSaveStatus('saved'));
    }, 400);

    return () => clearTimeout(timer);
  }, [leadStatus, followUpDate, notes, tags, activeChatJid]);

  if (!isOpen || !activeChat) return null;

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      if (!tags.includes(tagInput.trim())) {
        setTags([...tags, tagInput.trim()]);
      }
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const displayName = activeChat?.name || activeChat?.jid?.split('@')[0] || 'Unknown';

  return (
    <div className="w-[360px] h-full bg-wa-sidebar border-l border-wa-border flex flex-col select-none z-10">
      {/* Header */}
      <div className="h-16 px-4 bg-wa-header flex items-center justify-between border-b border-wa-border">
        <div className="flex items-center space-x-2">
          <Sparkles className="w-5 h-5 text-wa-accent" />
          <h3 className="text-sm font-semibold text-wa-textPrimary">CRM Lead Workspace</h3>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-[11px] text-wa-textSecondary">
            {saveStatus === 'saving' ? 'Saving...' : 'Autosaved'}
          </span>
          <button onClick={onClose} className="p-1 text-wa-textSecondary hover:text-wa-textPrimary rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Content Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Contact Info Card */}
        <div className="flex flex-col items-center p-4 rounded-xl bg-wa-header border border-wa-border/50 text-center">
          <div className="w-20 h-20 rounded-full overflow-hidden bg-wa-sidebar flex items-center justify-center mb-3 text-wa-accent font-bold text-2xl">
            {activeChat.avatarUrl ? (
              <img src={activeChat.avatarUrl} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              displayName.charAt(0).toUpperCase()
            )}
          </div>
          
          {/* Inline Editable Name */}
          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={displayName}
              onChange={async (e) => {
                const newName = e.target.value;
                if (!activeChatJid) return;
                await fetch('http://localhost:5000/api/contacts/name', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ jid: activeChatJid, name: newName }),
                });
              }}
              className="text-base font-semibold text-wa-textPrimary bg-transparent text-center focus:bg-wa-sidebar focus:outline-none rounded px-2 py-0.5 border border-transparent focus:border-wa-accent"
            />
            <Pencil className="w-3.5 h-3.5 text-wa-textSecondary" />
          </div>

          <p className="text-xs text-wa-textSecondary flex items-center justify-center mt-1">
            <Phone className="w-3.5 h-3.5 mr-1" />
            {activeChat.jid.split('@')[0]}
          </p>
        </div>

        {/* Lead Status Selection */}
        <div>
          <label className="text-xs font-semibold text-wa-textSecondary uppercase tracking-wider block mb-2">
            Lead Status
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setLeadStatus('INTERESTED')}
              className={`p-2.5 rounded-lg border text-xs font-medium flex flex-col items-center justify-center transition-all ${
                leadStatus === 'INTERESTED'
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500'
                  : 'bg-wa-header border-wa-border text-wa-textSecondary hover:bg-wa-hover'
              }`}
            >
              <ThumbsUp className="w-4 h-4 mb-1" />
              Interested
            </button>

            <button
              onClick={() => setLeadStatus('WARM_INTERESTED')}
              className={`p-2.5 rounded-lg border text-xs font-medium flex flex-col items-center justify-center transition-all ${
                leadStatus === 'WARM_INTERESTED'
                  ? 'bg-amber-500/20 text-amber-400 border-amber-500'
                  : 'bg-wa-header border-wa-border text-wa-textSecondary hover:bg-wa-hover'
              }`}
            >
              <Flame className="w-4 h-4 mb-1" />
              Warm
            </button>

            <button
              onClick={() => setLeadStatus('NOT_INTERESTED')}
              className={`p-2.5 rounded-lg border text-xs font-medium flex flex-col items-center justify-center transition-all ${
                leadStatus === 'NOT_INTERESTED'
                  ? 'bg-rose-500/20 text-rose-400 border-rose-500'
                  : 'bg-wa-header border-wa-border text-wa-textSecondary hover:bg-wa-hover'
              }`}
            >
              <ThumbsDown className="w-4 h-4 mb-1" />
              Not Interested
            </button>
          </div>
        </div>

        {/* Follow-up Date */}
        <div>
          <label className="text-xs font-semibold text-wa-textSecondary uppercase tracking-wider block mb-2">
            Follow-up Schedule
          </label>
          <div className="relative flex items-center bg-wa-header border border-wa-border rounded-lg px-3 py-2">
            <Calendar className="w-4 h-4 text-wa-textSecondary mr-2" />
            <input
              type="date"
              value={followUpDate}
              onChange={(e) => setFollowUpDate(e.target.value)}
              className="bg-transparent text-xs text-wa-textPrimary focus:outline-none w-full"
            />
          </div>
        </div>

        {/* Notes Area */}
        <div>
          <label className="text-xs font-semibold text-wa-textSecondary uppercase tracking-wider block mb-2">
            CRM Notes
          </label>
          <div className="bg-wa-header border border-wa-border rounded-lg p-3">
            <textarea
              rows={4}
              placeholder="Add key notes about customer requirements..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-transparent text-xs text-wa-textPrimary placeholder-wa-textSecondary focus:outline-none resize-none"
            />
          </div>
        </div>

        {/* Tags Section */}
        <div>
          <label className="text-xs font-semibold text-wa-textSecondary uppercase tracking-wider block mb-2">
            Tags
          </label>
          <div className="bg-wa-header border border-wa-border rounded-lg p-2.5 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <span
                  key={t}
                  className="px-2 py-1 text-xs bg-wa-accent/20 text-wa-accent rounded-md flex items-center space-x-1"
                >
                  <span>{t}</span>
                  <X
                    className="w-3 h-3 cursor-pointer hover:text-white"
                    onClick={() => handleRemoveTag(t)}
                  />
                </span>
              ))}
            </div>
            <input
              type="text"
              placeholder="Type tag & press Enter..."
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleAddTag}
              className="w-full bg-transparent text-xs text-wa-textPrimary placeholder-wa-textSecondary focus:outline-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
