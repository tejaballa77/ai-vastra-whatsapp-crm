'use client';

import React, { useState, useEffect } from 'react';
import { Database, MessageSquare, PhoneCall, Check, FileSpreadsheet, Clock, Folder, Save, Play } from 'lucide-react';
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

  // Automated Schedule State
  const [backupEnabled, setBackupEnabled] = useState<boolean>(true);
  const [backupTime, setBackupTime] = useState<string>('21:00');
  const [folderPath, setFolderPath] = useState<string>('/home/crm-nicedigitals/htdocs/crm.nicedigitalsgroup.com/backend/backups');
  const [lastBackupDate, setLastBackupDate] = useState<string>('');
  const [savingSchedule, setSavingSchedule] = useState<boolean>(false);
  const [scheduleSuccessMsg, setScheduleSuccessMsg] = useState<string>('');
  const [scheduleErrMsg, setScheduleErrMsg] = useState<string>('');

  useEffect(() => {
    fetch(`${getBackendUrl()}/api/settings/backup`)
      .then(res => res.json())
      .then(data => {
        if (data && data.success && data.settings) {
          const s = data.settings;
          if (typeof s.enabled === 'boolean') setBackupEnabled(s.enabled);
          if (s.backupTime) setBackupTime(s.backupTime);
          if (s.folderPath) setFolderPath(s.folderPath);
          if (s.lastBackupDate) setLastBackupDate(s.lastBackupDate);
        }
      })
      .catch(() => {});
  }, []);

  const handleSaveSchedule = async (runNow: boolean = false) => {
    try {
      setSavingSchedule(true);
      setScheduleSuccessMsg('');
      setScheduleErrMsg('');

      // Save settings
      const saveRes = await fetch(`${getBackendUrl()}/api/settings/backup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: backupEnabled,
          backupTime,
          folderPath: folderPath.trim(),
        }),
      });
      const saveData = await saveRes.json();
      if (saveData.success && saveData.settings) {
        if (typeof saveData.settings.enabled === 'boolean') setBackupEnabled(saveData.settings.enabled);
        if (typeof saveData.settings.backupTime === 'string') setBackupTime(saveData.settings.backupTime);
        if (typeof saveData.settings.folderPath === 'string') setFolderPath(saveData.settings.folderPath);
      }

      if (runNow) {
        // Trigger immediate backup execution on server
        const runRes = await fetch(`${getBackendUrl()}/api/settings/backup/run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folderPath: folderPath.trim() }),
        });
        const runData = await runRes.json();
        if (runData.success) {
          setScheduleSuccessMsg(`✅ ${runData.message}`);
          // Trigger instant browser download for both files
          handleDownloadWhatsappBackup();
          handleDownloadColdCallsBackup();
        } else {
          setScheduleErrMsg(`❌ ${runData.message}`);
        }
      } else if (saveData.success) {
        setScheduleSuccessMsg('✅ Schedule settings saved successfully!');
      }

      setSavingSchedule(false);
      setTimeout(() => setScheduleSuccessMsg(''), 5000);
    } catch (err: any) {
      console.error('Error saving schedule settings:', err);
      setScheduleErrMsg(`❌ Error: ${err.message}`);
      setSavingSchedule(false);
    }
  };

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
            CRM Settings & Automated Backup Center
          </h1>
          <p className="text-sm font-semibold text-zinc-500 mt-1">
            Configure automated daily IST Excel downloads, destination folder paths, and manual backup exports.
          </p>
        </div>

        {/* ── 1. AUTOMATED DAILY IST BACKUP SCHEDULE BOX ── */}
        <div className="bg-white border border-zinc-200/80 rounded-3xl p-6 shadow-xs space-y-6">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-zinc-900">Automated Daily Backup Schedule (IST)</h3>
                <p className="text-xs font-semibold text-zinc-500">
                  Automatically generates and saves both WhatsApp & Cold Calls Excel files to your specified folder every day.
                </p>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={backupEnabled}
                onChange={(e) => setBackupEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1.5 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-zinc-500" />
                Select Daily Backup Time (IST 24-Hour Format)
              </label>
              <input
                type="time"
                value={backupTime}
                onChange={(e) => setBackupTime(e.target.value)}
                className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-extrabold text-black focus:outline-none focus:border-black transition-all"
              />
              <p className="text-[11px] text-zinc-500 font-semibold mt-1">
                Current setting: <span className="text-black font-extrabold">{backupTime} IST</span>
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1.5 flex items-center gap-1.5">
                <Folder className="w-4 h-4 text-zinc-500" />
                Root Folder Path for Automated Downloads
              </label>
              <input
                type="text"
                value={folderPath}
                onChange={(e) => setFolderPath(e.target.value)}
                placeholder="/home/crm-nicedigitals/htdocs/crm.nicedigitalsgroup.com/backend/backups"
                className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold text-black focus:outline-none focus:border-black transition-all"
              />
              <p className="text-[11px] text-zinc-500 font-semibold mt-1">
                Both files saved with date: <span className="text-black font-extrabold">WhatsApp_Backup_DD-MM-YYYY.xlsx</span> & <span className="text-black font-extrabold">ColdCalls_Backup_DD-MM-YYYY.xlsx</span>
              </p>
            </div>
          </div>

          {scheduleSuccessMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-extrabold text-emerald-800 break-words">
              {scheduleSuccessMsg}
            </div>
          )}

          {scheduleErrMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-extrabold text-rose-800 break-words">
              {scheduleErrMsg}
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => handleSaveSchedule(false)}
              disabled={savingSchedule}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-black hover:bg-zinc-800 text-white rounded-xl text-xs font-black transition-all cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              Save Schedule Settings
            </button>

            <button
              type="button"
              onClick={() => handleSaveSchedule(true)}
              disabled={savingSchedule}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all cursor-pointer disabled:opacity-50"
            >
              <Play className="w-4 h-4" />
              Save & Test Run Backup Now
            </button>
          </div>
        </div>

        {/* ── 2. MANUAL INSTANT EXCEL BACKUP DOWNLOAD BOXES ── */}
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
