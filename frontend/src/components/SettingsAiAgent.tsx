'use client';

import React, { useState, useEffect } from 'react';
import { Bot, Save, Sparkles, Check, Send, Key, FileText, Upload, Trash2, Database, ShieldCheck } from 'lucide-react';
import { getBackendUrl } from '../config';

export function SettingsAiAgent() {
  const [kb, setKb] = useState<any>({
    enabled: true,
    openAiApiKey: '',
    openAiModel: 'gpt-4o-mini',
    companyName: 'AI Vastra',
    companyDescription: '',
    productsAndPricing: '',
    faqsAndAnswers: '',
    greetingMessage: '',
    aiTone: 'Professional, polite, enthusiastic, and helpful sales specialist',
    humanOverrideMinutes: 10,
  });

  const [documents, setDocuments] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [testMessage, setTestMessage] = useState('');
  const [testResult, setTestResult] = useState<any>(null);
  const [isTesting, setIsTesting] = useState(false);

  const fetchDocuments = () => {
    fetch(`${getBackendUrl()}/api/ai/documents`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.documents) {
          setDocuments(data.documents);
        }
      })
      .catch((err) => console.error('Error fetching documents:', err));
  };

  useEffect(() => {
    fetch(`${getBackendUrl()}/api/ai/knowledge-base`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.kb) {
          setKb(data.kb);
        }
      })
      .catch((err) => console.error('Error fetching KB:', err));

    fetchDocuments();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    setIsUploading(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${getBackendUrl()}/api/ai/documents/upload`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        fetchDocuments();
      } else {
        alert(`Upload error: ${data.error || 'Failed to process document'}`);
      }
    } catch (err) {
      console.error('Error uploading document:', err);
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleDeleteDocument = async (id: string) => {
    if (!confirm('Are you sure you want to remove this document from the RAG pipeline?')) return;
    try {
      const res = await fetch(`${getBackendUrl()}/api/ai/documents/${id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        fetchDocuments();
      }
    } catch (err) {
      console.error('Error deleting document:', err);
    }
  };

  const handleSaveKb = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`${getBackendUrl()}/api/ai/knowledge-base`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(kb),
      });
      const data = await res.json();
      if (data.success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2500);
      }
    } catch (err) {
      console.error('Error saving KB:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestAi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testMessage.trim()) return;

    setIsTesting(true);
    setTestResult(null);

    try {
      const res = await fetch(`${getBackendUrl()}/api/ai/test-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: testMessage.trim() }),
      });
      const data = await res.json();
      if (data.success && data.response) {
        setTestResult(data.response);
      }
    } catch (err) {
      console.error('Error testing AI:', err);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#f0f2f5] text-[#111b21]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#00a884]/15 text-[#00a884] flex items-center justify-center font-bold">
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#111b21]">RAG Document Engine & Human Employee AI Agent</h2>
            <p className="text-xs text-gray-500">Upload multiple FAQ & product policy documents. GPT-4o acts as a company employee to answer client messages.</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Master Switch */}
          <div className="flex items-center gap-3 bg-gray-100 px-4 py-2 rounded-xl border border-gray-200">
            <span className="text-xs font-bold text-gray-700">AI Auto-Replies</span>
            <button
              onClick={() => setKb({ ...kb, enabled: !kb.enabled })}
              className={`w-12 h-6 rounded-full transition-colors relative p-1 ${
                kb.enabled ? 'bg-[#00a884]' : 'bg-gray-400'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white transition-transform ${
                  kb.enabled ? 'translate-x-6' : 'translate-x-0'
                }`}
              ></div>
            </button>
          </div>

          <button
            onClick={handleSaveKb}
            disabled={isSaving}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#00a884] text-white font-bold text-xs rounded-xl hover:bg-[#008f70] transition-all shadow-md active:scale-95 disabled:opacity-50"
          >
            {saveSuccess ? (
              <>
                <Check className="w-4 h-4 text-white" />
                <span>Saved & Active!</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>{isSaving ? 'Saving...' : 'Save Knowledge Base'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* OpenAI API Key Section */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#00a884] font-bold text-sm">
            <Key className="w-4 h-4" />
            <span>OpenAI API Key & LLM Model Selection</span>
          </div>

          <div className="flex items-center gap-2 text-xs font-bold bg-emerald-50 text-emerald-800 px-3 py-1 rounded-full border border-emerald-200">
            <Database className="w-3.5 h-3.5 text-[#00a884]" />
            <span>RAG Engine Active ({documents.length} Docs Loaded)</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-gray-700 mb-1">OpenAI API Key (sk-...)</label>
            <input
              type="password"
              value={kb.openAiApiKey || ''}
              onChange={(e) => setKb({ ...kb, openAiApiKey: e.target.value })}
              placeholder="sk-proj-..."
              className="w-full p-2.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#00a884] font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Select AI Model</label>
            <select
              value={kb.openAiModel || 'gpt-4o-mini'}
              onChange={(e) => setKb({ ...kb, openAiModel: e.target.value })}
              className="w-full p-2.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#00a884] font-semibold"
            >
              <option value="gpt-4o-mini">GPT-4o-mini (Fast & Recommended)</option>
              <option value="gpt-4o">GPT-4o (Maximum Intelligence)</option>
              <option value="gpt-3.5-turbo">GPT-3.5-Turbo</option>
            </select>
          </div>
        </div>
      </div>

      {/* RAG MULTI-DOCUMENT FILE UPLOADER SECTION */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-[#111b21] uppercase tracking-wider flex items-center gap-2">
              <Upload className="w-4 h-4 text-[#00a884]" />
              <span>RAG Document Knowledge Pipeline (Upload Multiple Files)</span>
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Upload FAQ sheets, product manuals, policy documents, or pricing sheets (`.pdf`, `.txt`, `.docx`, `.csv`, `.md`).
            </p>
          </div>

          <label className="inline-flex items-center gap-2 px-4 py-2 bg-[#00a884] text-white font-bold text-xs rounded-xl hover:bg-[#008f70] transition-all cursor-pointer shadow-md">
            <Upload className="w-3.5 h-3.5" />
            <span>{isUploading ? 'Uploading...' : '+ Upload Document File'}</span>
            <input
              type="file"
              onChange={handleFileUpload}
              accept=".pdf,.txt,.docx,.csv,.md,.json"
              className="hidden"
              disabled={isUploading}
            />
          </label>
        </div>

        {/* List of Uploaded RAG Documents */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
          {documents.length === 0 ? (
            <div className="col-span-full p-6 text-center text-xs text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
              No custom files uploaded yet. Click "+ Upload Document File" above to upload FAQs and policy documents!
            </div>
          ) : (
            documents.map((doc) => (
              <div key={doc.id} className="p-3.5 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs flex-shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-[#111b21] truncate" title={doc.originalName}>
                      {doc.originalName}
                    </h4>
                    <p className="text-[11px] text-gray-400">
                      {(doc.size / 1024).toFixed(1)} KB • {new Date(doc.uploadedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => handleDeleteDocument(doc.id)}
                  className="p-1.5 text-gray-400 hover:text-rose-600 transition-colors"
                  title="Remove Document"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Knowledge Base Forms (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Company Profile & Employee Tone */}
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-[#111b21] uppercase tracking-wider text-gray-500">Employee Persona & Company Overview</h3>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Company / Brand Name</label>
              <input
                type="text"
                value={kb.companyName || ''}
                onChange={(e) => setKb({ ...kb, companyName: e.target.value })}
                className="w-full p-2.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#00a884]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Employee Sales Persona & Chat Tone</label>
              <input
                type="text"
                value={kb.aiTone || ''}
                onChange={(e) => setKb({ ...kb, aiTone: e.target.value })}
                placeholder="Professional, polite, enthusiastic sales representative..."
                className="w-full p-2.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#00a884]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Company Description & Mission</label>
              <textarea
                rows={3}
                value={kb.companyDescription || ''}
                onChange={(e) => setKb({ ...kb, companyDescription: e.target.value })}
                placeholder="Describe what your business does..."
                className="w-full p-2.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#00a884]"
              />
            </div>
          </div>

          {/* Products, Services & Pricing Catalog */}
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-[#111b21] uppercase tracking-wider text-gray-500">Products, Plans & Demo Video Links</h3>

            <textarea
              rows={4}
              value={kb.productsAndPricing || ''}
              onChange={(e) => setKb({ ...kb, productsAndPricing: e.target.value })}
              placeholder="e.g. Growth Pack: ₹4,999/month - Includes 50 Shoots. Pro Pack: ₹9,999/month..."
              className="w-full p-3 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#00a884] font-mono"
            />
          </div>

          {/* Text FAQs */}
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-[#111b21] uppercase tracking-wider text-gray-500">Text FAQs & Direct Policies</h3>

            <textarea
              rows={4}
              value={kb.faqsAndAnswers || ''}
              onChange={(e) => setKb({ ...kb, faqsAndAnswers: e.target.value })}
              placeholder="Paste additional text FAQs, rules, and guidelines here..."
              className="w-full p-3 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#00a884]"
            />
          </div>
        </div>

        {/* Right Column: AI Sandbox Test Tool */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
            <div className="flex items-center gap-2 text-[#00a884] font-bold text-sm">
              <Sparkles className="w-4 h-4" />
              <span>Interactive RAG & GPT-4o Sandbox</span>
            </div>
            <p className="text-xs text-gray-500">Type any customer question below to test how RAG retrieves relevant document knowledge and GPT-4o frames the reply!</p>

            <form onSubmit={handleTestAi} className="space-y-3">
              <textarea
                rows={3}
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                placeholder="e.g., What happens if I want to cancel my subscription?"
                className="w-full p-3 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#00a884]"
              />

              <button
                type="submit"
                disabled={isTesting || !testMessage.trim()}
                className="w-full py-2.5 bg-[#00a884] text-white font-bold text-xs rounded-xl hover:bg-[#008f70] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isTesting ? 'RAG & GPT-4o Thinking...' : 'Test AI Auto-Reply'}</span>
              </button>
            </form>

            {testResult && (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2 mt-4">
                <div className="flex items-center justify-between text-xs font-bold text-emerald-800">
                  <span>🤖 GPT-4o Employee Auto-Reply:</span>
                  {testResult.autoTagStatus && (
                    <span className="px-2 py-0.5 bg-emerald-200 text-emerald-900 rounded-full text-[10px]">
                      Auto-Tag: {testResult.autoTagStatus}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-800 whitespace-pre-wrap italic bg-white p-3 rounded-lg border border-emerald-100">
                  {testResult.text || 'No reply generated.'}
                </p>
              </div>
            )}
          </div>

          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-3">
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Human Employee Safety Rule</h4>
            <p className="text-xs text-gray-500 leading-relaxed">
              If a human sales rep types a message manually to a client on WhatsApp, the AI Agent automatically **pauses for 10 minutes** for that customer so it never interrupts human conversations.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
