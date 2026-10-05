'use client';

import React, { useState } from 'react';
import { Check, Download, Facebook, FileSpreadsheet, Instagram, Linkedin, MessageSquare, PhoneCall } from 'lucide-react';
import * as XLSX from 'xlsx';
import { getBackendUrl } from '../config';
import { Chat } from '../types/chat';

interface SettingsModuleProps {
  chats: Chat[];
}

type BackupBlock = 'whatsapp' | 'cold-calls' | 'instagram' | 'linkedin' | 'facebook';

const cleanDash = (value: unknown): string => {
  const text = String(value ?? '').trim();
  if (!text || text === '—' || text.includes('â') || text.includes('Ã')) return '-';
  return text;
};

const notesToText = (notesList: unknown, notes?: string): string => {
  if (Array.isArray(notesList) && notesList.length > 0) {
    const parsed = notesList
      .map((note) => {
        if (typeof note === 'string') return note.trim();
        if (note && typeof note === 'object') {
          const item = note as { text?: string; date?: string };
          return [item.text, item.date ? `(${item.date})` : ''].filter(Boolean).join(' ').trim();
        }
        return '';
      })
      .filter(Boolean);
    if (parsed.length > 0) return parsed.join('\n');
  }
  return cleanDash(notes);
};

const isSavedCrmChat = (chat: Chat): boolean => {
  const hasStatus = Boolean(chat.leadStatus && chat.leadStatus !== 'UNASSIGNED');
  const hasCall = Boolean(chat.callStatus);
  const hasFollow = Boolean(chat.followUpDate && chat.followUpDate.trim().length > 0 && chat.followUpDate !== '—');
  const hasNotes = Boolean((chat.notesList && chat.notesList.length > 0) || (chat.notes && chat.notes.trim().length > 0));
  return hasStatus || hasCall || hasFollow || hasNotes || (chat as any).manuallySaved === true;
};

const chatMatchesPlatform = (chat: Chat, platform: 'whatsapp' | 'instagram' | 'linkedin' | 'facebook'): boolean => {
  const jid = String(chat.jid || '').toLowerCase();
  const phone = String(chat.phone || '').toLowerCase();
  if (platform === 'instagram') return jid.includes('instagram') || phone.includes('instagram');
  if (platform === 'linkedin') return jid.includes('linkedin') || phone.includes('linkedin');
  if (platform === 'facebook') return jid.includes('facebook') || phone.includes('facebook');
  return !jid.includes('instagram') && !jid.includes('linkedin') && !jid.includes('facebook');
};

export function SettingsModule({ chats }: SettingsModuleProps) {
  const [downloading, setDownloading] = useState<BackupBlock | null>(null);
  const [success, setSuccess] = useState<BackupBlock | null>(null);

  const finishSuccess = (block: BackupBlock) => {
    setDownloading(null);
    setSuccess(block);
    setTimeout(() => setSuccess(null), 2500);
  };

  const downloadWorkbook = (rows: Record<string, string>[], sheetName: string, fileName: string, widths: number[]) => {
    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = widths.map((wch) => ({ wch }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, fileName);
  };

  const downloadSocialBackup = (block: Exclude<BackupBlock, 'cold-calls'>) => {
    setDownloading(block);
    try {
      const dateStr = new Date().toISOString().slice(0, 10);
      const title = block === 'whatsapp' ? 'WhatsApp' : block === 'instagram' ? 'Instagram' : block === 'linkedin' ? 'LinkedIn' : 'Facebook';
      const rows = chats
        .filter((chat) => chatMatchesPlatform(chat, block))
        .filter(isSavedCrmChat)
        .map((chat) => ({
          [block === 'whatsapp' ? 'Name / Phone' : 'Name / Username']: cleanDash(chat.name || chat.phone || chat.jid?.split('@')[0]),
          'Lead Status': cleanDash(chat.leadStatus || 'UNASSIGNED'),
          ...(block !== 'whatsapp'
            ? { 'BDM / Language': `${cleanDash((chat as any).assignedUser || (chat as any).calledBy)} / ${cleanDash((chat as any).clientLanguage || (chat as any).language)}` }
            : {}),
          'Follow-up Date': cleanDash(chat.followUpDate),
          'CRM Notes': notesToText(chat.notesList, chat.notes),
          ...(block === 'whatsapp'
            ? { BDM: cleanDash((chat as any).assignedUser || (chat as any).calledBy) }
            : {}),
        }));

      const fallback = block === 'whatsapp'
        ? { 'Name / Phone': 'No saved data found', 'Lead Status': '-', 'Follow-up Date': '-', 'CRM Notes': '-', BDM: '-' }
        : { 'Name / Username': 'No saved data found', 'Lead Status': '-', 'BDM / Language': '- / -', 'Follow-up Date': '-', 'CRM Notes': '-' };

      downloadWorkbook(
        rows.length > 0 ? rows : [fallback],
        `${title}_Backup`,
        `${title}_backup_${dateStr}.xlsx`,
        block === 'whatsapp' ? [30, 18, 18, 60, 18] : [30, 18, 24, 18, 60]
      );
      finishSuccess(block);
    } catch (error) {
      console.error(`Failed to download ${block} backup`, error);
      setDownloading(null);
    }
  };

  const downloadColdCallsBackup = async () => {
    setDownloading('cold-calls');
    try {
      const dateStr = new Date().toISOString().slice(0, 10);
      const res = await fetch(`${getBackendUrl()}/api/cold-calls`);
      const leads = await res.json();
      const rows = (Array.isArray(leads) ? leads : []).map((lead: any) => ({
        'Phone Number': cleanDash(lead.phone),
        'Business Name': cleanDash(lead.businessName || lead.company),
        'Person Name': cleanDash(lead.personName || lead.name),
        'Follow Up Date': cleanDash(lead.followUpDate || lead.followUps?.[0]?.followUpDate),
        Note: notesToText(lead.notesList || lead.followUps?.[0]?.notesList, lead.note || lead.followUps?.[0]?.note),
        BDM: cleanDash(lead.calledBy || lead.followUps?.[0]?.calledBy),
        Action: cleanDash(lead.callStatus || lead.callChoice || lead.callOutcome),
      }));

      downloadWorkbook(
        rows.length > 0 ? rows : [{
          'Phone Number': 'No saved data found',
          'Business Name': '-',
          'Person Name': '-',
          'Follow Up Date': '-',
          Note: '-',
          BDM: '-',
          Action: '-',
        }],
        'Cold_Calls_Backup',
        `Cold_Calls_backup_${dateStr}.xlsx`,
        [18, 28, 24, 18, 60, 24, 18]
      );
      finishSuccess('cold-calls');
    } catch (error) {
      console.error('Failed to download cold calls backup', error);
      setDownloading(null);
    }
  };

  const cards: Array<{
    key: BackupBlock;
    title: string;
    description: string;
    icon: React.ReactNode;
    buttonClass: string;
    onClick: () => void;
  }> = [
    {
      key: 'whatsapp',
      title: 'WhatsApp',
      description: 'Download WhatsApp CRM table data in Excel format.',
      icon: <MessageSquare className="w-6 h-6" />,
      buttonClass: 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20',
      onClick: () => downloadSocialBackup('whatsapp'),
    },
    {
      key: 'cold-calls',
      title: 'Cold Calls',
      description: 'Download Cold Calls table data in Excel format.',
      icon: <PhoneCall className="w-6 h-6" />,
      buttonClass: 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20',
      onClick: downloadColdCallsBackup,
    },
    {
      key: 'instagram',
      title: 'Instagram',
      description: 'Download Instagram CRM table data in Excel format.',
      icon: <Instagram className="w-6 h-6" />,
      buttonClass: 'bg-pink-600 hover:bg-pink-700 shadow-pink-600/20',
      onClick: () => downloadSocialBackup('instagram'),
    },
    {
      key: 'linkedin',
      title: 'LinkedIn',
      description: 'Download LinkedIn CRM table data in Excel format.',
      icon: <Linkedin className="w-6 h-6" />,
      buttonClass: 'bg-sky-700 hover:bg-sky-800 shadow-sky-700/20',
      onClick: () => downloadSocialBackup('linkedin'),
    },
    {
      key: 'facebook',
      title: 'Facebook',
      description: 'Download Facebook CRM table data in Excel format.',
      icon: <Facebook className="w-6 h-6" />,
      buttonClass: 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/20',
      onClick: () => downloadSocialBackup('facebook'),
    },
  ];

  return (
    <div className="flex-1 p-8 overflow-y-auto bg-[#fafafa]">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-black text-zinc-900 flex items-center gap-3 tracking-tight">
            <Download className="w-7 h-7 text-black" />
            Download Backup
          </h1>
          <p className="text-sm font-semibold text-zinc-500 mt-1">
            Download each CRM block separately as an Excel file.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {cards.map((card) => {
            const isDownloading = downloading === card.key;
            const isSuccess = success === card.key;
            return (
              <div key={card.key} className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm hover:border-zinc-300 transition-all">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-zinc-100 text-zinc-900 flex items-center justify-center border border-zinc-200">
                    {card.icon}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-extrabold text-zinc-900">{card.title}</h3>
                    <p className="text-xs font-semibold text-zinc-500 mt-1 leading-relaxed">{card.description}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={card.onClick}
                  disabled={Boolean(downloading)}
                  className={`mt-6 w-full flex items-center justify-center gap-2.5 px-5 py-3.5 text-white rounded-2xl font-extrabold text-sm transition-all shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] ${card.buttonClass}`}
                >
                  {isSuccess ? (
                    <>
                      <Check className="w-5 h-5" />
                      Downloaded
                    </>
                  ) : (
                    <>
                      <FileSpreadsheet className="w-5 h-5" />
                      {isDownloading ? 'Preparing Excel...' : 'Download Excel'}
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
