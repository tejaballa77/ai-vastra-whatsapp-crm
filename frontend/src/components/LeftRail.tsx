'use client';

import React from 'react';
import { 
  MessageSquare, 
  Phone, 
  CircleDot, 
  Users, 
  Sparkles, 
  Archive, 
  Star, 
  Settings, 
  User 
} from 'lucide-react';

interface LeftRailProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenCrm: () => void;
}

export const LeftRail: React.FC<LeftRailProps> = ({ activeTab, setActiveTab, onOpenCrm }) => {
  return (
    <div className="w-[60px] h-full bg-wa-header border-r border-wa-border flex flex-col items-center justify-between py-3 select-none flex-shrink-0">
      {/* Top Main Navigation Icons */}
      <div className="flex flex-col items-center space-y-4 w-full">
        {/* Chats Tab */}
        <button
          onClick={() => setActiveTab('chats')}
          title="Chats"
          className={`w-10 h-10 rounded-full flex items-center justify-center relative transition-all ${
            activeTab === 'chats'
              ? 'bg-wa-hover text-wa-accent'
              : 'text-wa-textSecondary hover:bg-wa-hover hover:text-wa-textPrimary'
          }`}
        >
          <MessageSquare className="w-5 h-5" />
          {activeTab === 'chats' && (
            <div className="absolute left-0 w-1 h-5 bg-wa-accent rounded-r" />
          )}
        </button>

        {/* Calls Tab */}
        <button
          onClick={() => setActiveTab('calls')}
          title="Calls"
          className={`w-10 h-10 rounded-full flex items-center justify-center relative transition-all ${
            activeTab === 'calls'
              ? 'bg-wa-hover text-wa-accent'
              : 'text-wa-textSecondary hover:bg-wa-hover hover:text-wa-textPrimary'
          }`}
        >
          <Phone className="w-5 h-5" />
        </button>

        {/* Status / Stories Tab */}
        <button
          onClick={() => setActiveTab('status')}
          title="Status"
          className={`w-10 h-10 rounded-full flex items-center justify-center relative transition-all ${
            activeTab === 'status'
              ? 'bg-wa-hover text-wa-accent'
              : 'text-wa-textSecondary hover:bg-wa-hover hover:text-wa-textPrimary'
          }`}
        >
          <CircleDot className="w-5 h-5" />
        </button>

        {/* Communities Tab */}
        <button
          onClick={() => setActiveTab('communities')}
          title="Communities"
          className={`w-10 h-10 rounded-full flex items-center justify-center relative transition-all ${
            activeTab === 'communities'
              ? 'bg-wa-hover text-wa-accent'
              : 'text-wa-textSecondary hover:bg-wa-hover hover:text-wa-textPrimary'
          }`}
        >
          <Users className="w-5 h-5" />
        </button>

        {/* Meta AI / Assistant Tab */}
        <button
          onClick={() => setActiveTab('ai')}
          title="AI Vastra Assistant"
          className={`w-10 h-10 rounded-full flex items-center justify-center relative transition-all ${
            activeTab === 'ai'
              ? 'bg-emerald-500/20 text-wa-accent'
              : 'text-wa-textSecondary hover:bg-wa-hover hover:text-wa-accent'
          }`}
        >
          <Sparkles className="w-5 h-5 text-wa-accent" />
        </button>
      </div>

      {/* Bottom Settings & CRM Icons */}
      <div className="flex flex-col items-center space-y-4 w-full">
        {/* CRM Settings Toggle */}
        <button
          onClick={onOpenCrm}
          title="CRM Lead Panel"
          className="w-10 h-10 rounded-full flex items-center justify-center text-wa-textSecondary hover:bg-wa-hover hover:text-wa-accent transition-all"
        >
          <Settings className="w-5 h-5" />
        </button>

        {/* Profile Avatar */}
        <div className="w-9 h-9 rounded-full bg-wa-accent/20 border border-wa-accent/30 flex items-center justify-center text-wa-accent font-semibold text-sm cursor-pointer hover:opacity-90">
          <User className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
};
