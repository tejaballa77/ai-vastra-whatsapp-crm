'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  PhoneCall, 
  Upload, 
  Search, 
  X, 
  Calendar, 
  Trash2, 
  Check, 
  Clock, 
  FileSpreadsheet, 
  Info, 
  ExternalLink,
  Phone,
  Flame,
  ThumbsUp,
  ThumbsDown,
  Building,
  Plus
} from 'lucide-react';
import * as XLSX from 'xlsx';

export interface ColdCallLead {
  id: string;
  name: string;
  phone: string;
  company?: string;
  customFields?: Record<string, any>;
  callStatus?: 'YES' | 'NO' | 'PENDING' | 'INTERESTED' | 'NOT_INTERESTED';
  followUpDate?: string;
  notes?: string;
  notesList?: string[];
  createdAt: number;
  updatedAt: number;
}

const getBackendUrl = () => {
  if (process.env.NEXT_PUBLIC_BACKEND_URL) return process.env.NEXT_PUBLIC_BACKEND_URL;
  if (typeof window !== 'undefined') return window.location.origin;
  return 'http://localhost:5000';
};

export function ColdCallsModule() {
  const [leads, setLeads] = useState<ColdCallLead[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterTab, setFilterTab] = useState<'ALL' | 'INTERESTED' | 'WARM' | 'NOT_INTERESTED' | 'PENDING' | 'FOLLOWUPS'>('ALL');
  
  // Selected lead for large Info modal popup
  const [selectedLead, setSelectedLead] = useState<ColdCallLead | null>(null);
  const [modalFormData, setModalFormData] = useState<{
    callStatus: 'YES' | 'NO' | 'PENDING' | 'INTERESTED' | 'NOT_INTERESTED';
    followUpDate: string;
    noteInput: string;
    notesList: string[];
  }>({
    callStatus: 'PENDING',
    followUpDate: '',
    noteInput: '',
    notesList: [],
  });

  const [showSaveToast, setShowSaveToast] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string>('Info saved successfully!');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch cold call leads from backend on mount
  useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${getBackendUrl()}/api/cold-calls`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setLeads(data);
      }
    } catch (err) {
      console.error('Error fetching cold calls:', err);
    } finally {
      setLoading(false);
    }
  };

  // Helper for dynamic current date (DD-MM-YYYY)
  const getTodayFormattedDate = () => {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  };

  // Handle Excel / CSV File Upload & Parsing
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const reader = new FileReader();

    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (rows.length === 0) {
          alert('Uploaded Excel file is empty.');
          setIsUploading(false);
          return;
        }

        // Map excel columns dynamically
        const parsedLeads: Partial<ColdCallLead>[] = rows.map((row, idx) => {
          const keys = Object.keys(row);
          
          // Detect name column
          const nameKey = keys.find(k => /name|contact|person|lead/i.test(k)) || keys[0];
          // Detect phone column
          const phoneKey = keys.find(k => /phone|mobile|number|contact.*no|cell/i.test(k)) || keys[1] || '';
          // Detect company / info column
          const companyKey = keys.find(k => /company|org|business|brand|info|details/i.test(k)) || '';

          const name = String(row[nameKey] || '').trim() || `Lead ${idx + 1}`;
          const rawPhone = String(row[phoneKey] || '').trim();
          const company = companyKey ? String(row[companyKey] || '').trim() : '';

          // Keep all extra fields
          const customFields: Record<string, any> = {};
          keys.forEach(k => {
            if (k !== nameKey && k !== phoneKey && k !== companyKey) {
              customFields[k] = row[k];
            }
          });

          return {
            name,
            phone: rawPhone,
            company,
            customFields,
            callStatus: 'PENDING',
            followUpDate: '',
            notes: '',
            notesList: [],
          };
        });

        // Send to backend
        const res = await fetch(`${getBackendUrl()}/api/cold-calls/import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leads: parsedLeads }),
        });

        const data = await res.json();
        if (data.success && Array.isArray(data.leads)) {
          setLeads(data.leads);
          setToastMessage(`Successfully uploaded ${data.leads.length} leads!`);
          setShowSaveToast(true);
          setTimeout(() => setShowSaveToast(false), 5000);
        }
      } catch (err) {
        console.error('Error parsing Excel file:', err);
        alert('Failed to parse Excel file. Please ensure it is a valid .xlsx or .csv file.');
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };

    reader.readAsBinaryString(file);
  };

  // Open Lead Info Modal
  const handleOpenInfoModal = (lead: ColdCallLead) => {
    setSelectedLead(lead);
    setModalFormData({
      callStatus: lead.callStatus || 'PENDING',
      followUpDate: lead.followUpDate || '',
      noteInput: '',
      notesList: lead.notesList ? [...lead.notesList] : (lead.notes ? [lead.notes] : []),
    });
  };

  // Add Note with Dynamic Date
  const handleAddNote = () => {
    const txt = modalFormData.noteInput.trim();
    if (!txt) return;

    const dateTag = `(${getTodayFormattedDate()})`;
    const formattedNote = txt.includes('(') && txt.includes(')') ? txt : `${txt} ${dateTag}`;

    setModalFormData(prev => ({
      ...prev,
      noteInput: '',
      notesList: [formattedNote, ...prev.notesList],
    }));
  };

  // Delete Note from list
  const handleDeleteNote = (idx: number) => {
    setModalFormData(prev => ({
      ...prev,
      notesList: prev.notesList.filter((_, i) => i !== idx),
    }));
  };

  // Save Lead Info to Backend
  const handleSaveLeadInfo = async () => {
    if (!selectedLead) return;

    let finalNotesList = [...modalFormData.notesList];
    if (modalFormData.noteInput.trim()) {
      const dateTag = `(${getTodayFormattedDate()})`;
      const formattedNote = modalFormData.noteInput.includes('(') ? modalFormData.noteInput.trim() : `${modalFormData.noteInput.trim()} ${dateTag}`;
      finalNotesList = [formattedNote, ...finalNotesList];
    }

    const payload = {
      callStatus: modalFormData.callStatus,
      followUpDate: modalFormData.followUpDate,
      notes: finalNotesList.join('\n\n'),
      notesList: finalNotesList,
    };

    try {
      const res = await fetch(`${getBackendUrl()}/api/cold-calls/${selectedLead.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success && data.lead) {
        // Update local state
        setLeads(prev => prev.map(l => l.id === selectedLead.id ? data.lead : l));
        setSelectedLead(data.lead);

        // Show 5-second success toast
        setToastMessage('Info saved successfully!');
        setShowSaveToast(true);
        setTimeout(() => setShowSaveToast(false), 5000);
      }
    } catch (err) {
      console.error('Error updating cold call lead:', err);
      alert('Failed to save info. Please check your connection.');
    }
  };

  // Clear all leads
  const handleClearAllLeads = async () => {
    if (!confirm('Are you sure you want to remove all cold call leads?')) return;
    try {
      await fetch(`${getBackendUrl()}/api/cold-calls`, { method: 'DELETE' });
      setLeads([]);
      if (selectedLead) setSelectedLead(null);
    } catch (err) {
      console.error('Error clearing leads:', err);
    }
  };

  // Filtered Leads
  const filteredLeads = leads.filter(l => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = 
      (l.name || '').toLowerCase().includes(q) ||
      (l.phone || '').toLowerCase().includes(q) ||
      (l.company || '').toLowerCase().includes(q) ||
      (l.notes || '').toLowerCase().includes(q);

    if (!matchesSearch) return false;

    if (filterTab === 'INTERESTED') return l.callStatus === 'INTERESTED';
    if (filterTab === 'WARM') return l.callStatus === 'YES';
    if (filterTab === 'NOT_INTERESTED') return l.callStatus === 'NOT_INTERESTED';
    if (filterTab === 'PENDING') return !l.callStatus || l.callStatus === 'PENDING';
    if (filterTab === 'FOLLOWUPS') return Boolean(l.followUpDate && l.followUpDate.trim().length > 0);

    return true;
  });

  const interestedCount = leads.filter(l => l.callStatus === 'INTERESTED').length;
  const warmCount = leads.filter(l => l.callStatus === 'YES').length;
  const notInterestedCount = leads.filter(l => l.callStatus === 'NOT_INTERESTED').length;
  const followUpsCount = leads.filter(l => Boolean(l.followUpDate)).length;

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#f0f2f5]">
      {/* 5-SECOND SAVE TOAST NOTIFICATION */}
      {showSaveToast && (
        <div className="fixed top-6 right-6 z-50 bg-[#111b21] text-white px-5 py-3.5 rounded-2xl shadow-2xl border border-emerald-500/30 flex items-center gap-3 animate-in slide-in-from-top-4 duration-300">
          <div className="w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center flex-shrink-0">
            <Check className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs font-bold text-emerald-400">Success</p>
            <p className="text-xs font-medium text-gray-200">{toastMessage}</p>
          </div>
        </div>
      )}

      {/* HEADER SECTION: Title & Upload Excel Button */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-xl bg-[#00a884]/15 text-[#00a884] flex items-center justify-center font-bold">
              <PhoneCall className="w-4 h-4" />
            </div>
            <h2 className="text-xl font-bold text-[#111b21]">Cold Calls Lead Center</h2>
          </div>
          <p className="text-xs text-gray-500">
            Upload contact lists from Excel/CSV, manage telecaller discussions, schedule follow-ups, and log dynamic dated notes.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".xlsx, .xls, .csv"
            className="hidden"
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#00a884] text-white font-bold text-xs rounded-xl hover:bg-[#008f70] transition-all shadow-md active:scale-95 disabled:opacity-50"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>{isUploading ? 'Parsing File...' : 'Upload Excel / CSV Sheet'}</span>
          </button>

          {leads.length > 0 && (
            <button
              onClick={handleClearAllLeads}
              className="px-3.5 py-2.5 bg-gray-100 hover:bg-rose-50 hover:text-rose-600 text-gray-600 font-semibold text-xs rounded-xl transition-all border border-gray-200"
              title="Clear all leads"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* FILTER & SEARCH BAR */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          <button
            onClick={() => setFilterTab('ALL')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
              filterTab === 'ALL' ? 'bg-[#111b21] text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            All ({leads.length})
          </button>
          <button
            onClick={() => setFilterTab('INTERESTED')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
              filterTab === 'INTERESTED' ? 'bg-emerald-600 text-white' : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
            }`}
          >
            👍 Interested ({interestedCount})
          </button>
          <button
            onClick={() => setFilterTab('WARM')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
              filterTab === 'WARM' ? 'bg-amber-600 text-white' : 'text-amber-700 bg-amber-50 hover:bg-amber-100'
            }`}
          >
            🔥 Warm ({warmCount})
          </button>
          <button
            onClick={() => setFilterTab('NOT_INTERESTED')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
              filterTab === 'NOT_INTERESTED' ? 'bg-rose-600 text-white' : 'text-rose-700 bg-rose-50 hover:bg-rose-100'
            }`}
          >
            👎 Not Interested ({notInterestedCount})
          </button>
          <button
            onClick={() => setFilterTab('FOLLOWUPS')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
              filterTab === 'FOLLOWUPS' ? 'bg-purple-600 text-white' : 'text-purple-700 bg-purple-50 hover:bg-purple-100'
            }`}
          >
            📅 Follow-ups ({followUpsCount})
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative min-w-[260px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search name, phone, company..."
            className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-[#00a884] focus:outline-none transition-all"
          />
        </div>
      </div>

      {/* ROW-BY-ROW LEADS TABLE */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-gray-400">Loading cold call leads...</div>
        ) : filteredLeads.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center mx-auto">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-700">No cold call leads found</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {leads.length === 0 
                  ? 'Click "Upload Excel / CSV Sheet" above to import your contact numbers.' 
                  : 'No leads match your search or filter criteria.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-200 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Contact Name</th>
                  <th className="py-3 px-4">Mobile Number</th>
                  <th className="py-3 px-4">Company / Info</th>
                  <th className="py-3 px-4">Call Status</th>
                  <th className="py-3 px-4">Follow-up Date</th>
                  <th className="py-3 px-4">Latest Notes</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs text-[#111b21]">
                {filteredLeads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-gray-50/80 transition-all">
                    {/* 1. Name */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-[#00a884]/15 text-[#00a884] font-bold flex items-center justify-center text-xs flex-shrink-0">
                          {(lead.name || 'C').charAt(0).toUpperCase()}
                        </div>
                        <span className="font-bold text-[#111b21]">{lead.name || 'Unsaved Contact'}</span>
                      </div>
                    </td>

                    {/* 2. Phone */}
                    <td className="py-3 px-4">
                      <span className="font-semibold text-gray-700 flex items-center gap-1">
                        📞 {lead.phone || 'No Number'}
                      </span>
                    </td>

                    {/* 3. Company / Info */}
                    <td className="py-3 px-4">
                      <span className="text-gray-600 truncate max-w-[200px] block">
                        {lead.company || lead.customFields?.City || lead.customFields?.Info || '—'}
                      </span>
                    </td>

                    {/* 4. Call Status */}
                    <td className="py-3 px-4">
                      {lead.callStatus === 'INTERESTED' ? (
                        <span className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                          👍 Interested
                        </span>
                      ) : lead.callStatus === 'YES' ? (
                        <span className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                          🔥 Warm
                        </span>
                      ) : lead.callStatus === 'NOT_INTERESTED' ? (
                        <span className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-rose-50 text-rose-700 border border-rose-200">
                          👎 Not Interested
                        </span>
                      ) : (
                        <span className="text-gray-400 italic">Pending</span>
                      )}
                    </td>

                    {/* 5. Follow-up Date */}
                    <td className="py-3 px-4">
                      {lead.followUpDate ? (
                        <span className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-purple-50 text-purple-700 border border-purple-200">
                          📅 {lead.followUpDate}
                        </span>
                      ) : (
                        <span className="text-gray-400">None</span>
                      )}
                    </td>

                    {/* 6. Latest Notes */}
                    <td className="py-3 px-4">
                      {lead.notesList && lead.notesList.length > 0 ? (
                        <span className="italic text-gray-600 truncate max-w-[220px] block" title={lead.notesList[0]}>
                          "{lead.notesList[0]}"
                        </span>
                      ) : lead.notes ? (
                        <span className="italic text-gray-600 truncate max-w-[220px] block">
                          "{lead.notes}"
                        </span>
                      ) : (
                        <span className="text-gray-400 italic">No notes</span>
                      )}
                    </td>

                    {/* 7. Action: INFO Button */}
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleOpenInfoModal(lead)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#00a884]/10 hover:bg-[#00a884]/20 text-[#00a884] font-bold text-xs rounded-lg transition-all"
                      >
                        <Info className="w-3.5 h-3.5" />
                        <span>Info</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* LARGE DETAILED LEAD INFO MODAL POP-UP */}
      {selectedLead && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-[#f0f2f5] border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#00a884]/15 text-[#00a884] font-bold flex items-center justify-center text-sm">
                  {(selectedLead.name || 'C').charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#111b21]">{selectedLead.name || 'Contact Info'}</h3>
                  <p className="text-xs text-gray-500 font-medium">📞 {selectedLead.phone || 'No phone'}</p>
                </div>
              </div>

              <button
                onClick={() => setSelectedLead(null)}
                className="w-8 h-8 rounded-full bg-white hover:bg-gray-200 flex items-center justify-center text-gray-600 transition-all shadow-sm"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              {/* Company & Custom Fields Info Card */}
              {selectedLead.company || (selectedLead.customFields && Object.keys(selectedLead.customFields).length > 0) ? (
                <div className="p-4 rounded-xl bg-gray-50 border border-gray-200/80 space-y-2">
                  <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Building className="w-3.5 h-3.5" />
                    <span>Company & Sheet Information</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    {selectedLead.company && (
                      <div>
                        <span className="text-gray-400">Company: </span>
                        <span className="font-semibold text-gray-800">{selectedLead.company}</span>
                      </div>
                    )}
                    {selectedLead.customFields && Object.entries(selectedLead.customFields).map(([k, v]) => (
                      <div key={k}>
                        <span className="text-gray-400">{k}: </span>
                        <span className="font-semibold text-gray-800">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* 1. Call Status Selector */}
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-2">
                  Lead Status / Response
                </label>
                <div className="grid grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setModalFormData(p => ({ ...p, callStatus: 'INTERESTED' }))}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border ${
                      modalFormData.callStatus === 'INTERESTED'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                        : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    👍 Interested
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalFormData(p => ({ ...p, callStatus: 'YES' }))}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border ${
                      modalFormData.callStatus === 'YES'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                        : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    🔥 Warm
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalFormData(p => ({ ...p, callStatus: 'NOT_INTERESTED' }))}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border ${
                      modalFormData.callStatus === 'NOT_INTERESTED'
                        ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                        : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    👎 Not Interested
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalFormData(p => ({ ...p, callStatus: 'PENDING' }))}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border ${
                      modalFormData.callStatus === 'PENDING'
                        ? 'bg-gray-800 text-white border-gray-800 shadow-sm'
                        : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    Pending
                  </button>
                </div>
              </div>

              {/* 2. Follow-up Schedule Date Picker */}
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-2">
                  Follow-up Schedule Date
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={modalFormData.followUpDate}
                    onChange={(e) => setModalFormData(p => ({ ...p, followUpDate: e.target.value }))}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-[#00a884] focus:outline-none transition-all"
                  />
                </div>
              </div>

              {/* 3. Multiple CRM Notes Block */}
              <div className="space-y-2.5">
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">
                  CRM Notes & Telecaller Log
                </label>
                <textarea
                  rows={3}
                  value={modalFormData.noteInput}
                  onChange={(e) => setModalFormData(p => ({ ...p, noteInput: e.target.value }))}
                  placeholder="Add key note about customer requirements, discussion, price quotation..."
                  className="w-full p-3 text-xs rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-[#00a884] focus:outline-none transition-all"
                />

                <button
                  type="button"
                  onClick={handleAddNote}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#00a884]/15 hover:bg-[#00a884]/25 text-[#00a884] font-bold text-xs rounded-xl transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Add Note</span>
                </button>

                {/* Multiple Notes List with Dynamic Date & Delete Symbol */}
                {modalFormData.notesList.length > 0 && (
                  <div className="space-y-2 mt-3 max-h-48 overflow-y-auto">
                    {modalFormData.notesList.map((note, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl bg-gray-50 border border-gray-200/80 flex items-start justify-between gap-3 text-xs"
                      >
                        <p className="text-gray-800 leading-relaxed flex-1">{note}</p>
                        <button
                          type="button"
                          onClick={() => handleDeleteNote(idx)}
                          className="text-gray-400 hover:text-rose-600 transition-colors p-1"
                          title="Delete note"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer: Save Info Button */}
            <div className="px-6 py-4 bg-[#f0f2f5] border-t border-gray-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setSelectedLead(null)}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 transition-colors"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSaveLeadInfo}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#00a884] text-white font-bold text-xs rounded-xl hover:bg-[#008f70] transition-all shadow-md active:scale-95"
              >
                <span>💾 Save Info</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
