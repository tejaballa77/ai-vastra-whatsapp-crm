'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  PhoneCall,
  Search,
  X,
  Trash2,
  Check,
  FileSpreadsheet,
  ExternalLink,
  Plus,
  Save,
  ChevronDown,
  ChevronUp,
  Pencil,
  Info,
  Linkedin,
  Facebook,
  Instagram,
  Globe,
  Mail,
  Phone,
  User,
  Briefcase,
} from 'lucide-react';
import * as XLSX from 'xlsx';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ColdCallLead {
  id: string;
  // Primary table columns
  businessName: string;
  personName: string;
  phone: string;
  // Hidden in table, shown in popup
  businessWebsite?: string;
  role?: string;
  email?: string;
  linkedinProfile?: string;
  facebookProfile?: string;
  instaProfile?: string;
  // Notes with timestamps
  note?: string;           // original note from Excel
  notesList?: NoteEntry[]; // user-added notes with timestamps
  // Legacy / compatibility
  name?: string;
  company?: string;
  customFields?: Record<string, any>;
  callStatus?: 'YES' | 'NO' | 'PENDING' | 'INTERESTED' | 'NOT_INTERESTED';
  followUpDate?: string;
  createdAt: number;
  updatedAt: number;
}

interface NoteEntry {
  text: string;
  date: string; // DD-MM-YYYY
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getBackendUrl = () => {
  if (process.env.NEXT_PUBLIC_BACKEND_URL) return process.env.NEXT_PUBLIC_BACKEND_URL;
  if (typeof window !== 'undefined') return window.location.origin;
  return 'http://localhost:5000';
};

const getTodayDate = (): string => {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()}`;
};

// Map raw Excel header to our field keys
const mapExcelRow = (row: Record<string, any>, idx: number): Partial<ColdCallLead> => {
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const found = Object.keys(row).find(rk => rk.toLowerCase().replace(/[\s_-]/g, '').includes(k.toLowerCase()));
      if (found !== undefined && row[found] !== undefined && row[found] !== '') {
        return String(row[found]).trim();
      }
    }
    return '';
  };

  const businessName  = get('businessname', 'business', 'company', 'brand', 'org') || '';
  const personName    = get('personname', 'person', 'contact', 'name', 'lead') || '';
  const phone         = get('phonenumber', 'phone', 'mobile', 'cell', 'number') || '';
  const businessWebsite = get('businesswebsite', 'website', 'url', 'web') || '';
  const role          = get('role', 'designation', 'position', 'title') || '';
  const email         = get('email', 'mail') || '';
  const linkedinProfile = get('linkedin', 'linkedinprofile') || '';
  const facebookProfile = get('facebook', 'facebookprofile', 'fb') || '';
  const instaProfile  = get('insta', 'instagram', 'instaprofile') || '';
  const note          = get('note', 'notes', 'remark', 'comment', 'description') || '';

  const phoneDigits = phone.replace(/\D/g, '');
  const id = phoneDigits.length >= 8 ? phoneDigits : `lead_${Date.now()}_${idx}`;

  return {
    id,
    businessName,
    personName,
    phone,
    businessWebsite,
    role,
    email,
    linkedinProfile,
    facebookProfile,
    instaProfile,
    note,
    notesList: [],
    callStatus: 'PENDING',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
};

// ─── Component ────────────────────────────────────────────────────────────────

export function ColdCallsModule() {
  const [leads, setLeads] = useState<ColdCallLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'ALL' | 'INTERESTED' | 'WARM' | 'NOT_INTERESTED' | 'PENDING' | 'FOLLOWUPS'>('ALL');

  // Global edit mode — like Excel: one toggle to enable / disable editing entire table
  const [isEditMode, setIsEditMode] = useState(false);

  // Inline edit tracking: Map<leadId, partial changes>
  const [editedRows, setEditedRows] = useState<Map<string, Partial<ColdCallLead>>>(new Map());
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Note popup
  const [notePopupLead, setNotePopupLead] = useState<ColdCallLead | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [showMoreInfo, setShowMoreInfo] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);

  // Add Data popup
  const [showAddPopup, setShowAddPopup] = useState(false);
  const [addForm, setAddForm] = useState<Partial<ColdCallLead & { phoneError: string }>>({});

  // Upload
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Fetch ───────────────────────────────────────────────────────────────────
  const fetchLeads = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${getBackendUrl()}/api/cold-calls`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setLeads(data as ColdCallLead[]);
      }
    } catch (e) {
      console.error('fetchLeads error', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  // ── Upload Excel ─────────────────────────────────────────────────────────────
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
        if (!rows.length) { alert('File is empty.'); return; }

        const parsedLeads = rows.map((r, i) => mapExcelRow(r, i));

        const res = await fetch(`${getBackendUrl()}/api/cold-calls/import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leads: parsedLeads }),
        });
        const data = await res.json();
        if (data.success && Array.isArray(data.leads)) {
          setLeads(data.leads);
          triggerSaveToast('saved');
        }
      } catch (err) {
        console.error('Upload error', err);
        alert('Failed to parse file. Please use a valid .xlsx or .csv file.');
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  // ── Inline Edit ──────────────────────────────────────────────────────────────
  const handleCellEdit = (leadId: string, field: keyof ColdCallLead, value: string) => {
    setEditedRows(prev => {
      const next = new Map(prev);
      next.set(leadId, { ...(next.get(leadId) || {}), [field]: value });
      return next;
    });
    // Optimistically update displayed leads
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, [field]: value } : l));
  };

  // ── Save All Edits ────────────────────────────────────────────────────────────
  const handleSaveAll = async () => {
    setSaveStatus('saving');
    try {
      if (editedRows.size > 0) {
        await Promise.all(
          Array.from(editedRows.entries()).map(([id, partial]) =>
            fetch(`${getBackendUrl()}/api/cold-calls/${id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(partial),
            })
          )
        );
        setEditedRows(new Map());
      }
      // Exit edit mode on save
      setIsEditMode(false);
      triggerSaveToast('saved');
    } catch (e) {
      console.error('Save error', e);
      setSaveStatus('idle');
    }
  };

  const triggerSaveToast = (status: 'saved') => {
    setSaveStatus(status);
    setTimeout(() => setSaveStatus('idle'), 3000);
  };

  // ── Note Popup ───────────────────────────────────────────────────────────────
  const openNotePopup = (lead: ColdCallLead) => {
    // Merge any inline edits
    const edited = editedRows.get(lead.id) || {};
    setNotePopupLead({ ...lead, ...edited });
    setNoteInput('');
    setShowMoreInfo(false);
  };

  const handleAddNoteToPopup = () => {
    const txt = noteInput.trim();
    if (!txt || !notePopupLead) return;
    const newEntry: NoteEntry = { text: txt, date: getTodayDate() };
    const updatedNotesList = [newEntry, ...(notePopupLead.notesList || [])];
    setNotePopupLead(prev => prev ? { ...prev, notesList: updatedNotesList } : null);
    setNoteInput('');
  };

  const handleDeleteNoteFromPopup = (idx: number) => {
    setNotePopupLead(prev => {
      if (!prev) return null;
      return { ...prev, notesList: (prev.notesList || []).filter((_, i) => i !== idx) };
    });
  };

  const handleEditNoteText = (idx: number, text: string) => {
    setNotePopupLead(prev => {
      if (!prev) return null;
      const updated = [...(prev.notesList || [])];
      updated[idx] = { ...updated[idx], text };
      return { ...prev, notesList: updated };
    });
  };

  // Fields inside popup that can be edited
  const handlePopupFieldEdit = (field: keyof ColdCallLead, value: string) => {
    setNotePopupLead(prev => prev ? { ...prev, [field]: value } : null);
  };

  const handleSaveNotePopup = async () => {
    if (!notePopupLead) return;
    setNoteSaving(true);
    try {
      const payload: Partial<ColdCallLead> = {
        businessName:     notePopupLead.businessName,
        personName:       notePopupLead.personName,
        phone:            notePopupLead.phone,
        businessWebsite:  notePopupLead.businessWebsite,
        role:             notePopupLead.role,
        email:            notePopupLead.email,
        linkedinProfile:  notePopupLead.linkedinProfile,
        facebookProfile:  notePopupLead.facebookProfile,
        instaProfile:     notePopupLead.instaProfile,
        note:             notePopupLead.note,
        notesList:        notePopupLead.notesList || [],
        callStatus:       notePopupLead.callStatus,
        followUpDate:     notePopupLead.followUpDate,
      };
      const res = await fetch(`${getBackendUrl()}/api/cold-calls/${notePopupLead.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success && data.lead) {
        setLeads(prev => prev.map(l => l.id === notePopupLead.id ? data.lead : l));
        // Remove from edited rows since saved
        setEditedRows(prev => { const n = new Map(prev); n.delete(notePopupLead.id); return n; });
        triggerSaveToast('saved');
        setNotePopupLead(null);
      }
    } catch (e) {
      console.error('Save note error', e);
      alert('Failed to save. Check your connection.');
    } finally {
      setNoteSaving(false);
    }
  };

  // ── Add Data Popup ────────────────────────────────────────────────────────────
  const handleAddData = async () => {
    if (!addForm.phone || addForm.phone.replace(/\D/g, '').length < 8) {
      setAddForm(f => ({ ...f, phoneError: 'Phone number is required!' }));
      return;
    }
    const phoneDigits = (addForm.phone || '').replace(/\D/g, '');
    const newLead: Partial<ColdCallLead> = {
      id: phoneDigits || `lead_${Date.now()}`,
      businessName:    addForm.businessName    || '',
      personName:      addForm.personName      || '',
      phone:           addForm.phone           || '',
      businessWebsite: addForm.businessWebsite || '',
      role:            addForm.role            || '',
      email:           addForm.email           || '',
      linkedinProfile: addForm.linkedinProfile || '',
      facebookProfile: addForm.facebookProfile || '',
      instaProfile:    addForm.instaProfile    || '',
      note:            addForm.note            || '',
      notesList:       [],
      callStatus:      'PENDING',
    };
    try {
      const res = await fetch(`${getBackendUrl()}/api/cold-calls/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads: [newLead] }),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.leads)) {
        setLeads(data.leads);
        triggerSaveToast('saved');
        setShowAddPopup(false);
        setAddForm({});
      }
    } catch (e) {
      console.error('Add data error', e);
    }
  };

  // ── Clear All ─────────────────────────────────────────────────────────────────
  const handleClearAll = async () => {
    if (!confirm('Remove all cold call leads? This cannot be undone.')) return;
    await fetch(`${getBackendUrl()}/api/cold-calls`, { method: 'DELETE' });
    setLeads([]);
    setEditedRows(new Map());
  };

  // ── Filter ────────────────────────────────────────────────────────────────────
  const filteredLeads = leads.filter(l => {
    const q = searchQuery.toLowerCase();
    const match =
      (l.businessName || '').toLowerCase().includes(q) ||
      (l.personName || l.name || '').toLowerCase().includes(q) ||
      (l.phone || '').includes(q) ||
      (l.note || '').toLowerCase().includes(q);
    if (!match) return false;
    if (filterTab === 'INTERESTED') return l.callStatus === 'INTERESTED';
    if (filterTab === 'WARM') return l.callStatus === 'YES';
    if (filterTab === 'NOT_INTERESTED') return l.callStatus === 'NOT_INTERESTED';
    if (filterTab === 'PENDING') return !l.callStatus || l.callStatus === 'PENDING';
    if (filterTab === 'FOLLOWUPS') return Boolean(l.followUpDate);
    return true;
  });



  const [activePage, setActivePage] = useState<'analytics' | 'registry'>('analytics');

  // Calculate Today's Scheduled Follow-ups
  const todayStr = getTodayDate();
  const followUpsDueTodayLeads = leads.filter(l => {
    if (!l.followUpDate) return false;
    const fDate = l.followUpDate.trim();
    return fDate === todayStr || fDate === new Date().toISOString().slice(0, 10);
  });

  const callsMadeTodayCount = leads.filter(l => {
    if (!l.updatedAt) return false;
    const d = new Date(l.updatedAt);
    const today = new Date();
    return (
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear() &&
      l.callStatus && l.callStatus !== 'PENDING'
    );
  }).length;

  const counts = {
    all: leads.length,
    interested: leads.filter(l => l.callStatus === 'INTERESTED').length,
    warm: leads.filter(l => l.callStatus === 'YES').length,
    notInterested: leads.filter(l => l.callStatus === 'NOT_INTERESTED').length,
    followups: leads.filter(l => Boolean(l.followUpDate)).length,
    followupsToday: followUpsDueTodayLeads.length,
    callsToday: callsMadeTodayCount,
  };

  // ── Editable Cell Component ───────────────────────────────────────────────────
  const EditableCell = ({
    leadId, field, value, placeholder = '', className = '', editMode = false
  }: {
    leadId: string;
    field: keyof ColdCallLead;
    value: string;
    placeholder?: string;
    className?: string;
    editMode?: boolean;
  }) => {
    const [localVal, setLocalVal] = useState(value);

    useEffect(() => { setLocalVal(value); }, [value]);

    const commit = (val: string) => {
      if (val !== value) handleCellEdit(leadId, field, val);
    };

    if (editMode) {
      return (
        <input
          value={localVal}
          onChange={e => { setLocalVal(e.target.value); commit(e.target.value); }}
          onKeyDown={e => { if (e.key === 'Escape') setLocalVal(value); }}
          className={`w-full px-2 py-1.5 text-sm border border-black rounded-lg outline-none bg-zinc-50 focus:bg-white transition-all font-semibold text-black ${className}`}
          placeholder={placeholder || '—'}
        />
      );
    }
    // View mode — plain text, no icons
    return (
      <span className={`text-sm font-semibold ${value ? 'text-black' : 'text-zinc-400'} ${className}`}>
        {value || ''}
      </span>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-zinc-50/50 text-black">

      {/* ── TOAST ───────────────────────────────────────────────────────────── */}
      {saveStatus !== 'idle' && (
        <div className="fixed top-5 right-5 z-[9999] bg-black text-white px-6 py-3 rounded-2xl shadow-2xl border border-zinc-700 flex items-center gap-3">
          {saveStatus === 'saving' ? (
            <div className="w-6 h-6 rounded-full border-2 border-white border-t-transparent animate-spin" />
          ) : (
            <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center text-black font-bold">
              ✓
            </div>
          )}
          <span className="text-sm font-bold">{saveStatus === 'saving' ? 'Saving...' : '✓ Saved'}</span>
        </div>
      )}

      {/* ── MODULE HEADER & PAGE SWITCHER TABS ─────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-4 space-y-4">
        {/* PAGE 1 vs PAGE 2 SUB-PAGE SWITCHER */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActivePage('analytics')}
              className={`px-5 py-2.5 rounded-xl text-sm font-extrabold transition-all border ${
                activePage === 'analytics'
                  ? 'bg-black text-white border-black shadow-sm'
                  : 'bg-zinc-100 text-zinc-700 border-zinc-200 hover:bg-zinc-200 hover:text-black'
              }`}
            >
              📊 Page 1: Analytics & Today's Follow-ups
            </button>

            <button
              onClick={() => setActivePage('registry')}
              className={`px-5 py-2.5 rounded-xl text-sm font-extrabold transition-all border ${
                activePage === 'registry'
                  ? 'bg-black text-white border-black shadow-sm'
                  : 'bg-zinc-100 text-zinc-700 border-zinc-200 hover:bg-zinc-200 hover:text-black'
              }`}
            >
              📋 Page 2: Cold Calls Excel Table ({leads.length})
            </button>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          PAGE 1: ANALYTICS & TODAY'S FOLLOW-UPS
      ══════════════════════════════════════════════════════════════════════ */}
      {activePage === 'analytics' && (
        <div className="space-y-6">
          {/* 5 Count Boxes */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {/* Box 1: Calls Made Today */}
            <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm space-y-2">
              <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Calls Made Today</div>
              <div className="text-3xl font-extrabold text-black">{counts.callsToday}</div>
              <p className="text-xs text-zinc-400 font-semibold">Calls logged today</p>
            </div>

            {/* Box 2: Interested */}
            <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm space-y-2">
              <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Interested</div>
              <div className="text-3xl font-extrabold text-black">{counts.interested}</div>
              <p className="text-xs text-zinc-400 font-semibold">Marked Interested</p>
            </div>

            {/* Box 3: Warm */}
            <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm space-y-2">
              <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Warm</div>
              <div className="text-3xl font-extrabold text-black">{counts.warm}</div>
              <p className="text-xs text-zinc-400 font-semibold">Marked Warm</p>
            </div>

            {/* Box 4: Total Follow-ups Needed */}
            <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm space-y-2">
              <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Total Follow-ups</div>
              <div className="text-3xl font-extrabold text-black">{counts.followups}</div>
              <p className="text-xs text-zinc-400 font-semibold">Future dates set</p>
            </div>

            {/* Box 5: Follow-ups Due TODAY */}
            <div className="bg-white p-5 rounded-2xl border-2 border-black shadow-md space-y-2 bg-zinc-50">
              <div className="text-xs font-extrabold text-black uppercase tracking-wider">Follow-ups Due Today</div>
              <div className="text-3xl font-extrabold text-black">{counts.followupsToday}</div>
              <p className="text-xs text-black font-extrabold">Requires action today!</p>
            </div>
          </div>

          {/* Info List of Today's Scheduled Follow-ups */}
          <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-4">
              <div>
                <h3 className="text-xl font-extrabold text-black flex items-center gap-2">
                  <span>📅 Info List of Today's Scheduled Follow-ups</span>
                </h3>
                <p className="text-xs text-zinc-500 font-medium mt-0.5">Leads scheduled to be called specifically today ({todayStr})</p>
              </div>
              <span className="px-3 py-1 bg-black text-white text-xs font-bold rounded-full">
                {followUpsDueTodayLeads.length} Due Today
              </span>
            </div>

            {followUpsDueTodayLeads.length === 0 ? (
              <div className="p-12 text-center text-sm text-zinc-400 italic bg-zinc-50 rounded-xl border border-zinc-200">
                No follow-ups scheduled for today ({todayStr}). All clear!
              </div>
            ) : (
              <div className="divide-y divide-zinc-200 border border-zinc-200 rounded-xl overflow-hidden">
                {followUpsDueTodayLeads.map((lead) => (
                  <div key={lead.id} className="p-4 hover:bg-zinc-50 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-extrabold text-black">{lead.personName || lead.businessName || 'Contact'}</span>
                        {lead.businessName && lead.personName && (
                          <span className="text-xs text-zinc-500 font-semibold">({lead.businessName})</span>
                        )}
                      </div>
                      <div className="text-xs text-zinc-600 font-semibold flex items-center gap-3">
                        <span>📞 {lead.phone}</span>
                        {lead.callStatus && (
                          <span className="px-2 py-0.5 bg-zinc-100 text-black border border-black rounded text-[10px] font-bold">
                            {lead.callStatus}
                          </span>
                        )}
                      </div>
                      {lead.note && (
                        <p className="text-xs text-zinc-700 italic">"{lead.note}"</p>
                      )}
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      <button
                        onClick={() => openNotePopup(lead)}
                        className="px-3.5 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-black border border-zinc-300 font-bold text-xs rounded-lg transition-all"
                      >
                        Notes / Edit
                      </button>
                      {lead.phone && (
                        <button
                          onClick={() => window.open(`https://web.whatsapp.com/send?phone=${lead.phone.replace(/\D/g, '')}`, '_blank')}
                          className="px-4 py-2 bg-black hover:bg-zinc-800 text-white font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 shadow-sm"
                        >
                          <span>Open WhatsApp</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          PAGE 2: COLD CALLS EXCEL SPREADSHEET TABLE
      ══════════════════════════════════════════════════════════════════════ */}
      {activePage === 'registry' && (
        <div className="space-y-4">
          {/* Row 1: Filter pills */}
          <div className="bg-white rounded-xl border border-zinc-200 p-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 overflow-x-auto">
              {([
                ['ALL', `All (${counts.all})`, 'bg-black text-white', 'text-zinc-700 bg-zinc-100 hover:bg-zinc-200'],
                ['INTERESTED', `Interested (${counts.interested})`, 'bg-black text-white', 'text-zinc-700 bg-zinc-100 hover:bg-zinc-200'],
                ['WARM', `Warm (${counts.warm})`, 'bg-black text-white', 'text-zinc-700 bg-zinc-100 hover:bg-zinc-200'],
                ['NOT_INTERESTED', `Not Interested (${counts.notInterested})`, 'bg-black text-white', 'text-zinc-700 bg-zinc-100 hover:bg-zinc-200'],
                ['FOLLOWUPS', `Follow-ups (${counts.followups})`, 'bg-black text-white', 'text-zinc-700 bg-zinc-100 hover:bg-zinc-200'],
              ] as [string, string, string, string][]).map(([tab, label, active, inactive]) => (
                <button
                  key={tab}
                  onClick={() => setFilterTab(tab as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${filterTab === tab ? active : inactive}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Row 2: TOOLBAR - Edit Table + Search Box BESIDE IT on left | Action Buttons on right */}
          <div className="bg-white rounded-xl border border-zinc-200 p-3 flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Left Side: Edit Table Button + Search Box EXACTLY BESIDE IT */}
            <div className="flex items-center gap-3 flex-1">
              <button
                onClick={() => {
                  if (isEditMode) {
                    handleSaveAll();
                  } else {
                    setIsEditMode(true);
                  }
                }}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl font-extrabold text-xs transition-all shadow-sm flex-shrink-0 ${
                  isEditMode
                    ? 'bg-black text-white hover:bg-zinc-800'
                    : 'bg-zinc-100 text-black border border-zinc-300 hover:bg-zinc-200'
                }`}
                title={isEditMode ? 'Exit edit mode' : 'Enable edit mode'}
              >
                {isEditMode ? (
                  <><X className="w-4 h-4" /><span>Done Editing</span></>
                ) : (
                  <><Pencil className="w-4 h-4" /><span>Edit Table</span></>
                )}
              </button>

              {/* Search Box EXACTLY BESIDE Edit Table button */}
              <div className="relative min-w-[280px] flex-1 max-w-md">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search name, phone, business..."
                  className="w-full pl-9 pr-4 py-2 text-sm font-medium rounded-xl border border-zinc-300 bg-zinc-50 focus:bg-white focus:border-black focus:outline-none transition-all text-black"
                />
              </div>
            </div>

            {/* Right Side: Save, Add Data, Upload Excel, Clear buttons */}
            <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
              {/* Save Button */}
              <button
                onClick={handleSaveAll}
                disabled={saveStatus === 'saving'}
                className="inline-flex items-center gap-2 px-4 py-2 bg-black hover:bg-zinc-800 text-white font-bold text-xs rounded-xl transition-all shadow-sm active:scale-95 disabled:opacity-60"
              >
                {saveStatus === 'saving' ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : saveStatus === 'saved' ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>{saveStatus === 'saved' ? 'Saved ✓' : 'Save'}</span>
              </button>

              {/* Add Data Button */}
              <button
                onClick={() => { setAddForm({}); setShowAddPopup(true); }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-100 hover:bg-zinc-200 border border-zinc-300 text-black font-bold text-xs rounded-xl transition-all shadow-sm active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Add Data</span>
              </button>

              {/* Upload Excel */}
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".xlsx,.xls,.csv" className="hidden" />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-100 hover:bg-zinc-200 border border-zinc-300 text-black font-bold text-xs rounded-xl transition-all shadow-sm active:scale-95 disabled:opacity-60"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>{isUploading ? 'Uploading...' : 'Upload Excel'}</span>
              </button>

              {/* Clear All */}
              {leads.length > 0 && (
                <button
                  onClick={handleClearAll}
                  className="p-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl transition-all border border-zinc-300"
                  title="Clear all leads"
                >
                  <Trash2 className="w-4 h-4 text-black" />
                </button>
              )}
            </div>
          </div>

          {/* ── EXACT EXCEL FILE UI SPREADSHEET TABLE ───────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-300 shadow-sm overflow-hidden font-sans">
            {loading ? (
              <div className="p-16 text-center text-sm text-gray-500 font-semibold">Loading spreadsheet...</div>
            ) : filteredLeads.length === 0 ? (
              <div className="p-16 text-center space-y-3 bg-white">
                <div className="w-12 h-12 rounded-2xl bg-gray-100 text-gray-500 flex items-center justify-center mx-auto border border-gray-300">
                  <FileSpreadsheet className="w-6 h-6 text-gray-700" />
                </div>
                <p className="text-base font-extrabold text-black">No spreadsheet data</p>
                <p className="text-xs text-gray-500 font-semibold">
                  {leads.length === 0 ? 'Upload an Excel sheet to populate rows.' : 'No rows match your search.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse border border-gray-300 text-sm">
                  {/* Excel Column Headers: #, BUSINESS NAME, PERSON NAME, PHONE NUMBER, NOTE, STATUS */}
                  <thead>
                    <tr className="bg-[#f3f4f6] text-gray-700 font-bold border-b border-gray-300 text-xs uppercase tracking-wider">
                      <th className="py-2.5 px-3 w-12 text-center border border-gray-300 bg-[#e5e7eb] text-gray-800">#</th>
                      <th className="py-2.5 px-3 border border-gray-300">BUSINESS NAME</th>
                      <th className="py-2.5 px-3 border border-gray-300">PERSON NAME</th>
                      <th className="py-2.5 px-3 border border-gray-300">PHONE NUMBER</th>
                      <th className="py-2.5 px-3 border border-gray-300 text-center">NOTE</th>
                      <th className="py-2.5 px-3 border border-gray-300 text-center">STATUS</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white text-gray-900 font-normal">
                    {filteredLeads.map((lead, idx) => {
                      const hasNotes = (lead.notesList && lead.notesList.length > 0) || Boolean(lead.note);
                      return (
                        <tr key={lead.id} className="hover:bg-blue-50/40 transition-colors">
                          {/* Row Index Column (Excel 1, 2, 3...) */}
                          <td className="py-2 px-3 text-center bg-[#f3f4f6] text-gray-500 font-mono text-xs font-semibold border border-gray-300 select-none">
                            {idx + 1}
                          </td>

                          {/* Business Name Cell */}
                          <td className="py-2 px-3 border border-gray-300 font-semibold text-black">
                            <EditableCell
                              leadId={lead.id}
                              field="businessName"
                              value={lead.businessName || ''}
                              placeholder="Business name"
                              editMode={isEditMode}
                            />
                          </td>

                          {/* Person Name Cell (PLAIN TEXT NO AVATAR) */}
                          <td className="py-2 px-3 border border-gray-300 font-semibold text-black">
                            <EditableCell
                              leadId={lead.id}
                              field="personName"
                              value={lead.personName || lead.name || ''}
                              placeholder="Person name"
                              editMode={isEditMode}
                            />
                          </td>

                          {/* Phone Number Cell */}
                          <td className="py-2 px-3 border border-gray-300 font-semibold text-black">
                            <EditableCell
                              leadId={lead.id}
                              field="phone"
                              value={lead.phone || ''}
                              placeholder="Phone number"
                              editMode={isEditMode}
                            />
                          </td>

                          {/* Note Cell */}
                          <td className="py-2 px-3 border border-gray-300 text-center">
                            <button
                              onClick={() => openNotePopup(lead)}
                              title="Click to view / add notes"
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold transition-all ${
                                hasNotes
                                  ? 'bg-[#6b21a8] text-white hover:bg-purple-900 shadow-sm'
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-300'
                              }`}
                            >
                              <span>Note</span>
                              {hasNotes && (
                                <span className="w-4 h-4 rounded-full bg-white text-purple-900 text-[10px] font-black flex items-center justify-center">
                                  {(lead.notesList?.length || 0) + (lead.note ? 1 : 0)}
                                </span>
                              )}
                            </button>
                          </td>

                          {/* Status Cell */}
                          <td className="py-2 px-3 border border-gray-300 text-center">
                            {lead.callStatus === 'INTERESTED' ? (
                              <span className="px-2.5 py-0.5 text-xs font-bold rounded bg-emerald-100 text-emerald-800 border border-emerald-300">Interested</span>
                            ) : lead.callStatus === 'YES' ? (
                              <span className="px-2.5 py-0.5 text-xs font-bold rounded bg-amber-100 text-amber-800 border border-amber-300">Warm</span>
                            ) : lead.callStatus === 'NOT_INTERESTED' ? (
                              <span className="px-2.5 py-0.5 text-xs font-bold rounded bg-rose-100 text-rose-800 border border-rose-300">Not Int.</span>
                            ) : (
                              <span className="text-gray-400 italic text-xs">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}



      {/* ══════════════════════════════════════════════════════════════════════
          NOTE POPUP
      ══════════════════════════════════════════════════════════════════════ */}
      {notePopupLead && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-gray-200 flex flex-col max-h-[90vh]">

            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between bg-[#f0f2f5] rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#00a884]/15 text-[#00a884] font-bold flex items-center justify-center text-sm flex-shrink-0">
                  {((notePopupLead.personName || notePopupLead.businessName || 'C').charAt(0)).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#111b21]">
                    {notePopupLead.businessName || notePopupLead.personName || 'Contact'}
                  </h3>
                  <p className="text-[11px] text-gray-500">
                    {notePopupLead.personName || ''}{notePopupLead.phone ? ` · 📞 ${notePopupLead.phone}` : ''}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setNotePopupLead(null)}
                className="w-8 h-8 rounded-full bg-white hover:bg-gray-200 flex items-center justify-center text-gray-600 transition-all shadow-sm"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 p-5 space-y-5">

              {/* ── Call Status ───────────────────────────────────────────── */}
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-2">Lead Status</label>
                <div className="flex gap-2 flex-wrap">
                  {([
                    ['INTERESTED', '👍 Interested', 'bg-emerald-600'],
                    ['YES', '🔥 Warm', 'bg-amber-500'],
                    ['NOT_INTERESTED', '👎 Not Interested', 'bg-rose-600'],
                    ['PENDING', '⏳ Pending', 'bg-gray-700'],
                  ] as [string, string, string][]).map(([val, label, activeClass]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => handlePopupFieldEdit('callStatus', val as any)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                        notePopupLead.callStatus === val
                          ? `${activeClass} text-white border-transparent shadow-sm`
                          : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Follow-up Date ────────────────────────────────────────── */}
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-2">Follow-up Date</label>
                <input
                  type="date"
                  value={notePopupLead.followUpDate || ''}
                  onChange={e => handlePopupFieldEdit('followUpDate', e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-[#00a884] focus:outline-none transition-all"
                />
              </div>

              {/* ── Notes Section ─────────────────────────────────────────── */}
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Notes</label>

                {/* Original note from Excel */}
                {notePopupLead.note && (
                  <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs">
                    <div className="text-[10px] font-bold text-blue-400 uppercase mb-1">From Excel</div>
                    <input
                      value={notePopupLead.note}
                      onChange={e => handlePopupFieldEdit('note', e.target.value)}
                      className="w-full bg-transparent text-blue-900 outline-none text-xs"
                    />
                  </div>
                )}

                {/* Add new note */}
                <div className="flex gap-2">
                  <textarea
                    rows={2}
                    value={noteInput}
                    onChange={e => setNoteInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddNoteToPopup(); } }}
                    placeholder="Type a note and press Enter or click + Add Note..."
                    className="flex-1 p-3 text-xs rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-[#00a884] focus:outline-none transition-all resize-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddNoteToPopup}
                    className="self-end px-3 py-2 bg-[#00a884]/15 hover:bg-[#00a884]/25 text-[#00a884] font-bold text-xs rounded-xl transition-all flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                </div>

                {/* Saved notes list */}
                {(notePopupLead.notesList || []).length > 0 && (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {(notePopupLead.notesList || []).map((n, i) => (
                      <div key={i} className="p-3 rounded-xl bg-gray-50 border border-gray-200 flex items-start gap-2">
                        <div className="flex-1 space-y-1">
                          <input
                            value={n.text}
                            onChange={e => handleEditNoteText(i, e.target.value)}
                            className="w-full bg-transparent text-xs text-gray-800 outline-none"
                          />
                          <p className="text-[10px] text-gray-400">📅 {n.date}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteNoteFromPopup(i)}
                          className="text-gray-400 hover:text-rose-600 transition-colors p-1 flex-shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── More Info Toggle ──────────────────────────────────────── */}
              <div className="border-t border-gray-100 pt-4">
                <button
                  type="button"
                  onClick={() => setShowMoreInfo(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-200 transition-all text-xs font-bold text-gray-700"
                >
                  <span className="flex items-center gap-2">
                    <Info className="w-3.5 h-3.5 text-[#00a884]" />
                    More Info
                  </span>
                  {showMoreInfo ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </button>

                {showMoreInfo && (
                  <div className="mt-3 space-y-3 px-1">
                    {/* Business Name */}
                    <InfoField
                      icon={<Briefcase className="w-3.5 h-3.5 text-gray-400" />}
                      label="Business Name"
                      value={notePopupLead.businessName || ''}
                      onChange={v => handlePopupFieldEdit('businessName', v)}
                    />
                    {/* Business Website */}
                    <InfoField
                      icon={<Globe className="w-3.5 h-3.5 text-gray-400" />}
                      label="Business Website"
                      value={notePopupLead.businessWebsite || ''}
                      onChange={v => handlePopupFieldEdit('businessWebsite', v)}
                      isLink
                    />
                    {/* Person Name */}
                    <InfoField
                      icon={<User className="w-3.5 h-3.5 text-gray-400" />}
                      label="Person Name"
                      value={notePopupLead.personName || ''}
                      onChange={v => handlePopupFieldEdit('personName', v)}
                    />
                    {/* Role */}
                    <InfoField
                      icon={<Briefcase className="w-3.5 h-3.5 text-gray-400" />}
                      label="Role"
                      value={notePopupLead.role || ''}
                      onChange={v => handlePopupFieldEdit('role', v)}
                    />
                    {/* Phone */}
                    <InfoField
                      icon={<Phone className="w-3.5 h-3.5 text-gray-400" />}
                      label="Phone Number"
                      value={notePopupLead.phone || ''}
                      onChange={v => handlePopupFieldEdit('phone', v)}
                    />
                    {/* Email */}
                    <InfoField
                      icon={<Mail className="w-3.5 h-3.5 text-gray-400" />}
                      label="Email"
                      value={notePopupLead.email || ''}
                      onChange={v => handlePopupFieldEdit('email', v)}
                    />
                    {/* LinkedIn */}
                    <InfoField
                      icon={<Linkedin className="w-3.5 h-3.5 text-[#0a66c2]" />}
                      label="LinkedIn Profile"
                      value={notePopupLead.linkedinProfile || ''}
                      onChange={v => handlePopupFieldEdit('linkedinProfile', v)}
                      isLink
                    />
                    {/* Facebook */}
                    <InfoField
                      icon={<Facebook className="w-3.5 h-3.5 text-[#1877f2]" />}
                      label="Facebook Profile"
                      value={notePopupLead.facebookProfile || ''}
                      onChange={v => handlePopupFieldEdit('facebookProfile', v)}
                      isLink
                    />
                    {/* Instagram */}
                    <InfoField
                      icon={<Instagram className="w-3.5 h-3.5 text-[#e1306c]" />}
                      label="Instagram Profile"
                      value={notePopupLead.instaProfile || ''}
                      onChange={v => handlePopupFieldEdit('instaProfile', v)}
                      isLink
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-gray-200 bg-[#f0f2f5] rounded-b-2xl flex items-center justify-between">
              <button
                onClick={() => setNotePopupLead(null)}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 transition-colors"
              >
                Close
              </button>
              <button
                onClick={handleSaveNotePopup}
                disabled={noteSaving}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#00a884] hover:bg-[#008f70] text-white font-bold text-xs rounded-xl transition-all shadow-md active:scale-95 disabled:opacity-60"
              >
                {noteSaving ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>{noteSaving ? 'Saving...' : '💾 Save Info'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          ADD DATA POPUP
      ══════════════════════════════════════════════════════════════════════ */}
      {showAddPopup && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-gray-200 flex flex-col max-h-[90vh]">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between bg-[#f0f2f5] rounded-t-2xl">
              <h3 className="text-sm font-bold text-[#111b21] flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#00a884]" />
                Add New Contact
              </h3>
              <button onClick={() => setShowAddPopup(false)} className="w-8 h-8 rounded-full bg-white hover:bg-gray-200 flex items-center justify-center text-gray-600 transition-all">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-5 space-y-3">
              {/* Phone — mandatory */}
              <div>
                <label className="text-[10px] font-bold text-gray-700 uppercase tracking-wider block mb-1">
                  Phone Number <span className="text-rose-600">*</span>
                </label>
                <input
                  type="tel"
                  value={addForm.phone || ''}
                  onChange={e => setAddForm(f => ({ ...f, phone: e.target.value, phoneError: '' }))}
                  placeholder="e.g. 9773266714"
                  className={`w-full px-3 py-2 text-xs rounded-xl border ${addForm.phoneError ? 'border-rose-400 bg-rose-50' : 'border-gray-200 bg-gray-50'} focus:bg-white focus:border-[#00a884] focus:outline-none transition-all`}
                />
                {addForm.phoneError && <p className="text-rose-600 text-[10px] mt-1">{addForm.phoneError}</p>}
              </div>

              {/* Other optional fields */}
              {([
                ['businessName', 'Business Name', 'e.g. RnB Fashion'],
                ['personName', 'Person Name', 'e.g. Rambhibai Bhatiya'],
                ['businessWebsite', 'Business Website', 'https://...'],
                ['role', 'Role / Designation', 'e.g. Owner, CEO'],
                ['email', 'Email', 'e.g. info@example.com'],
                ['linkedinProfile', 'LinkedIn Profile', 'https://linkedin.com/in/...'],
                ['facebookProfile', 'Facebook Profile', 'https://facebook.com/...'],
                ['instaProfile', 'Instagram Profile', 'https://instagram.com/...'],
                ['note', 'Note', 'Any initial note or remark...'],
              ] as [string, string, string][]).map(([field, label, ph]) => (
                <div key={field}>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                    {label} <span className="text-gray-400 font-normal normal-case">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={(addForm as any)[field] || ''}
                    onChange={e => setAddForm(f => ({ ...f, [field]: e.target.value }))}
                    placeholder={ph}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-[#00a884] focus:outline-none transition-all"
                  />
                </div>
              ))}
            </div>

            <div className="px-5 py-4 border-t border-gray-200 bg-[#f0f2f5] rounded-b-2xl flex items-center justify-between">
              <button onClick={() => setShowAddPopup(false)} className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleAddData}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#00a884] hover:bg-[#008f70] text-white font-bold text-xs rounded-xl transition-all shadow-md active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Contact</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Info Field Helper Component ──────────────────────────────────────────────
function InfoField({
  icon, label, value, onChange, isLink = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (v: string) => void;
  isLink?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-shrink-0 w-6 flex items-center justify-center">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-0.5">{label}</p>
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={`Enter ${label.toLowerCase()}...`}
            className="flex-1 px-2 py-1 text-xs rounded-lg border border-gray-200 bg-gray-50 focus:bg-white focus:border-[#00a884] focus:outline-none transition-all min-w-0"
          />
          {isLink && value && (
            <a
              href={value.startsWith('http') ? value : `https://${value}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-[#00a884] transition-colors flex-shrink-0"
              title="Open link"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
