'use client';

import React, { useState } from 'react';
import { Database, MessageSquare, PhoneCall, Check, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import { getBackendUrl } from '../config';
import { Chat } from '../types/chat';

interface SettingsModuleProps {
  chats: Chat[];
}

export function SettingsModule({ chats }: SettingsModuleProps) {
  const [downloadingWhatsapp, setDownloadingWhatsapp] = useState(false);
  const [downloadingColdCalls, setDownloadingColdCalls] = useState(false);
  const [whatsappSuccess, setWhatsappSuccess] = useState(false);
  const [coldCallsSuccess, setColdCallsSuccess] = useState(false);

  // 1. Download WhatsApp Data Excel Spreadsheet (.xlsx)
  const handleDownloadWhatsappBackup = () => {
    try {
      setDownloadingWhatsapp(true);

      const savedLeads = chats.filter((c) => {
        const hasStatus = Boolean(c.leadStatus && c.leadStatus !== 'UNASSIGNED');
        const hasCall = Boolean(c.callStatus && c.callStatus !== undefined && c.callStatus !== null && (c.callStatus as any) !== 'None');
        const hasFollow = Boolean(c.followUpDate && c.followUpDate.trim().length > 0 && c.followUpDate !== '—');
        const hasNotes = Boolean((c.notesList && c.notesList.length > 0) || (c.notes && c.notes.trim().length > 0));
        const isManuallySaved = (c as any).manuallySaved === true;
        return hasStatus || hasCall || hasFollow || hasNotes || isManuallySaved;
      });

      const excelRows = savedLeads.map((c) => {
        const notesStr = Array.isArray(c.notesList) && c.notesList.length > 0
          ? c.notesList.join(' | ')
          : (c.notes || '—');

        return {
          'Contact Name / Phone': c.name || c.phone || (c.jid ? c.jid.split('@')[0] : 'Unsaved'),
          'Lead Status': c.leadStatus || 'UNASSIGNED',
          'Call Status': c.callStatus || '—',
          'Follow-Up Date': c.followUpDate || '—',
          'Latest CRM Notes': notesStr,
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(excelRows.length > 0 ? excelRows : [{
        'Contact Name / Phone': 'No saved data found',
        'Lead Status': '—',
        'Call Status': '—',
        'Follow-Up Date': '—',
        'Latest CRM Notes': '—',
      }]);

      worksheet['!cols'] = [
        { wch: 30 },
        { wch: 20 },
        { wch: 15 },
        { wch: 18 },
        { wch: 60 },
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'WhatsApp_CRM_Data');

      const dateStr = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `AIVastra_WhatsApp_CRM_Backup_${dateStr}.xlsx`);

      setDownloadingWhatsapp(false);
      setWhatsappSuccess(true);
      setTimeout(() => setWhatsappSuccess(false), 3000);
    } catch (err) {
      console.error('Error exporting WhatsApp Excel backup:', err);
      setDownloadingWhatsapp(false);
    }
  };

  // 2. Download Cold Calls Data Excel Spreadsheet (.xlsx)
  const handleDownloadColdCallsBackup = async () => {
    try {
      setDownloadingColdCalls(true);

      const res = await fetch(`${getBackendUrl()}/api/cold-calls`);
      const allLeads = await res.json();

      const excelRows = (Array.isArray(allLeads) ? allLeads : []).map((l: any) => {
        const notesStr = Array.isArray(l.notesList) && l.notesList.length > 0
          ? l.notesList.map((n: any) => (typeof n === 'string' ? n : (n.text || ''))).join(' | ')
          : (l.note || '—');

        return {
          'Business Name': l.businessName || l.company || '—',
          'Person Name': l.personName || l.name || '—',
          'Phone Number': l.phone || '—',
          'BDM': l.calledBy || '—',
          'Call Status': l.callChoice || l.callOutcome || l.callStatus || '—',
          'Follow-Up Date': l.followUpDate || '—',
          'Notes': notesStr,
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(excelRows.length > 0 ? excelRows : [{
        'Business Name': 'No cold call data found',
        'Person Name': '—',
        'Phone Number': '—',
        'BDM': '—',
        'Call Status': '—',
        'Follow-Up Date': '—',
        'Notes': '—',
      }]);

      worksheet['!cols'] = [
        { wch: 28 },
        { wch: 25 },
        { wch: 18 },
        { wch: 15 },
        { wch: 18 },
        { wch: 18 },
        { wch: 55 },
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Cold_Calls_All_Data');

      const dateStr = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `AIVastra_Cold_Calls_Backup_${dateStr}.xlsx`);

      setDownloadingColdCalls(false);
      setColdCallsSuccess(true);
      setTimeout(() => setColdCallsSuccess(false), 3000);
    } catch (err) {
      console.error('Error exporting Cold Calls Excel backup:', err);
      setDownloadingColdCalls(false);
    }
  };

  return (
    <div className="flex-1 p-8 overflow-y-auto bg-[#fafafa]">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-black text-zinc-900 flex items-center gap-3 tracking-tight">
            <Database className="w-7 h-7 text-black" />
            CRM Backup Center
          </h1>
          <p className="text-sm font-semibold text-zinc-500 mt-1">
            Manually export and download instant Excel backups for WhatsApp CRM and Cold Calls data.
          </p>
        </div>

        {/* ── MANUAL INSTANT EXCEL BACKUP DOWNLOAD BOXES ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* WhatsApp Data Backup Box */}
          <div className="bg-white border border-zinc-200/80 rounded-3xl p-6 shadow-xs flex flex-col justify-between hover:border-zinc-300 transition-all">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                <MessageSquare className="w-6 h-6" />
              </div>

              <div>
                <h3 className="text-lg font-extrabold text-zinc-900">WhatsApp Data</h3>
                <p className="text-xs font-semibold text-zinc-500 mt-1 leading-relaxed">
                  Export all saved WhatsApp CRM contacts, lead statuses, scheduled calls, follow-up dates, and CRM notes into Excel format.
                </p>
              </div>

              <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-100 flex items-center justify-between text-xs">
                <span className="font-semibold text-zinc-600">Excel Header Columns:</span>
                <span className="font-extrabold text-zinc-900">5 Columns</span>
              </div>
            </div>

            <div className="pt-6">
              <button
                type="button"
                onClick={handleDownloadWhatsappBackup}
                disabled={downloadingWhatsapp}
                className="w-full flex items-center justify-center gap-2.5 px-5 py-3.5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white rounded-2xl font-extrabold text-sm transition-all shadow-md shadow-emerald-600/20 cursor-pointer disabled:opacity-50"
              >
                {whatsappSuccess ? (
                  <>
                    <Check className="w-5 h-5" />
                    Downloaded Excel File!
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="w-5 h-5" />
                    Download Backup Data (.xlsx)
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Cold Calls Data Backup Box */}
          <div className="bg-white border border-zinc-200/80 rounded-3xl p-6 shadow-xs flex flex-col justify-between hover:border-zinc-300 transition-all">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
                <PhoneCall className="w-6 h-6" />
              </div>

              <div>
                <h3 className="text-lg font-extrabold text-zinc-900">Cold Calls Data</h3>
                <p className="text-xs font-semibold text-zinc-500 mt-1 leading-relaxed">
                  Export all Cold Call leads from the ALL section with Business Name, Person Name, Phone, BDM, Call Status, and Notes.
                </p>
              </div>

              <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-100 flex items-center justify-between text-xs">
                <span className="font-semibold text-zinc-600">Excel Header Columns:</span>
                <span className="font-extrabold text-zinc-900">7 Columns</span>
              </div>
            </div>

            <div className="pt-6">
              <button
                type="button"
                onClick={handleDownloadColdCallsBackup}
                disabled={downloadingColdCalls}
                className="w-full flex items-center justify-center gap-2.5 px-5 py-3.5 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white rounded-2xl font-extrabold text-sm transition-all shadow-md shadow-blue-600/20 cursor-pointer disabled:opacity-50"
              >
                {coldCallsSuccess ? (
                  <>
                    <Check className="w-5 h-5" />
                    Downloaded Excel File!
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="w-5 h-5" />
                    Download Backup Data (.xlsx)
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
