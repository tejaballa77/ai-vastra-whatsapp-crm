'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Bot, Save, Sparkles, Check, Send, Key, FileText, Upload, Trash2, Database, RefreshCw, User, MessageSquare } from 'lucide-react';
import { getBackendUrl } from '../config';

interface TestChatMessage {
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
  autoTagStatus?: string;
}

export function SettingsAiAgent() {
  const [kb, setKb] = useState<any>({
    enabled: true,
    openAiApiKey: '',
    openAiModel: 'gpt-4o-mini',
    companyName: 'Nice Digitals',
    companyDescription: '',
    productsAndPricing: '',
    faqsAndAnswers: '',
    greetingMessage: '',
    aiTone: 'Professional, warm, helpful, and human-like',
    humanOverrideMinutes: 10,
    customPrompt: '',
  });

  const [documents, setDocuments] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // ChatGPT-Style Conversational Sandbox State
  const [chatMessages, setChatMessages] = useState<TestChatMessage[]>([
    {
      sender: 'ai',
      text: 'Hello! I am your AI Sales Employee simulator. Ask me any client questions or test scenarios based on your uploaded documents & pricing!',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [testInput, setTestInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isThinking]);

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

  const handleSendTestMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testInput.trim() || isThinking) return;

    const userText = testInput.trim();
    const userMsg: TestChatMessage = {
      sender: 'user',
      text: userText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setChatMessages((prev) => [...prev, userMsg]);
    setTestInput('');
    setIsThinking(true);

    try {
      const res = await fetch(`${getBackendUrl()}/api/ai/test-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userText }),
      });
      const data = await res.json();
      if (data.success && data.response) {
        const aiMsg: TestChatMessage = {
          sender: 'ai',
          text: data.response.text ? data.response.text : '🤖 [No automatic message sent — message deemed off-topic / irrelevant]',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          autoTagStatus: data.response.autoTagStatus
        };
        setChatMessages((prev) => [...prev, aiMsg]);
        // Refresh KB to update live counter
        fetch(`${getBackendUrl()}/api/ai/knowledge-base`).then(r => r.json()).then(d => { if (d.success) setKb(d.kb); });
      }
    } catch (err) {
      console.error('Error testing AI:', err);
      setChatMessages((prev) => [
        ...prev,
        {
          sender: 'ai',
          text: 'Error generating response. Please check server logs or OpenAI API key.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsThinking(false);
    }
  };

  const handleClearChat = () => {
    setChatMessages([
      {
        sender: 'ai',
        text: 'Conversation cleared. Start a new client test dialogue!',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
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
            <h2 className="text-xl font-bold text-[#111b21]">RAG Document Engine & ChatGPT-Style Simulator</h2>
            <p className="text-xs text-gray-500">Upload documents and test back-and-forth client dialogues with your GPT-4o employee AI in real time.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Automatic Messages Counter Badge */}
          <div className="flex items-center gap-2 bg-emerald-50 px-3.5 py-2 rounded-xl border border-emerald-200 text-xs font-bold text-emerald-800">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <span>AI Replies Sent: {kb.aiAutoReplyCount || 0}</span>
          </div>

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

      {/* ── AI PROMPT / AGENT INSTRUCTIONS BLOCK ─────────────────────────────── */}
      <div className="bg-white p-6 rounded-2xl border-2 border-[#00a884]/30 shadow-sm space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-[#111b21] flex items-center gap-2">
              <Bot className="w-4 h-4 text-[#00a884]" />
              <span>AI Prompt — Agent Behaviour Instructions</span>
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Write the rules and guidelines here that control how your AI agent talks to clients.
              These instructions are sent to the AI with every message — this is your agent's "brain".
            </p>
          </div>
          <span className="text-[10px] font-bold bg-[#00a884]/10 text-[#00a884] px-2 py-1 rounded-full whitespace-nowrap">Primary Control</span>
        </div>

        <textarea
          value={kb.customPrompt || ''}
          onChange={(e) => setKb({ ...kb, customPrompt: e.target.value })}
          rows={14}
          placeholder={`Example:\n\nYou are a sales agent for Nice Digitals.\n\nRules:\n1. Only answer from the uploaded document. Never invent prices or features.\n2. If you don't know the answer, say: "Let me confirm this for you! 😊"\n3. Detect the project: if client mentions "try on" → AI Vastra, "catalog" → Catalog Generation, "kiosk" → AI Kiosk\n4. Always share the project website URL when relevant.\n5. Reply like a human — warm, concise, use emojis naturally.`}
          className="w-full p-4 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#00a884] focus:ring-2 focus:ring-[#00a884]/20 font-mono leading-relaxed resize-y transition-all"
        />

        <div className="flex items-center justify-between pt-1">
          <p className="text-[11px] text-gray-400">
            💡 Tip: Include project URLs here so the AI always shares them when clients ask.
          </p>
          <button
            onClick={handleSaveKb}
            disabled={isSaving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#00a884] text-white font-bold text-xs rounded-xl hover:bg-[#008f70] transition-all shadow-sm active:scale-95 disabled:opacity-50"
          >
            {saveSuccess ? (
              <><Check className="w-3.5 h-3.5" /><span>Saved!</span></>
            ) : (
              <><Save className="w-3.5 h-3.5" /><span>{isSaving ? 'Saving...' : 'Save Prompt'}</span></>
            )}
          </button>
        </div>
      </div>

      {/* CHATGPT-STYLE INTERACTIVE TEST SIMULATOR */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col overflow-hidden h-[600px]">
          {/* Chat Simulator Header */}
          <div className="p-4 bg-[#f0f2f5] border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#00a884] text-white flex items-center justify-center font-bold">
                🤖
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#111b21]">ChatGPT-Style AI Test Simulator</h3>
                <p className="text-[11px] text-gray-500">Test client queries against your uploaded documents & pricing</p>
              </div>
            </div>

            <button
              onClick={handleClearChat}
              className="px-2.5 py-1 bg-white border border-gray-300 text-gray-600 rounded-lg text-xs font-semibold hover:bg-gray-100 transition-all flex items-center gap-1"
              title="Clear Conversation"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Reset Chat</span>
            </button>
          </div>

          {/* Chat Messages Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-[#e5ddd5]/30">
            {chatMessages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex gap-2.5 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.sender === 'ai' && (
                  <div className="w-7 h-7 rounded-full bg-[#00a884] text-white font-bold flex items-center justify-center text-xs flex-shrink-0 mt-0.5">
                    🤖
                  </div>
                )}

                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-xs shadow-sm space-y-1 ${
                    msg.sender === 'user'
                      ? 'bg-[#d9fdd3] text-[#111b21] rounded-tr-none'
                      : 'bg-white text-[#111b21] rounded-tl-none border border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 text-[10px] text-gray-400 mb-0.5">
                    <span className="font-bold">{msg.sender === 'user' ? '👤 Client (You)' : '🤖 AI Employee'}</span>
                    <span>{msg.timestamp}</span>
                  </div>

                  <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>

                  {msg.autoTagStatus && (
                    <div className="pt-1">
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-bold">
                        Auto-Tag: {msg.autoTagStatus}
                      </span>
                    </div>
                  )}
                </div>

                {msg.sender === 'user' && (
                  <div className="w-7 h-7 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-xs flex-shrink-0 mt-0.5">
                    👤
                  </div>
                )}
              </div>
            ))}

            {isThinking && (
              <div className="flex gap-2.5 justify-start">
                <div className="w-7 h-7 rounded-full bg-[#00a884] text-white font-bold flex items-center justify-center text-xs flex-shrink-0">
                  🤖
                </div>
                <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-none px-4 py-2 text-xs text-gray-500 italic shadow-sm flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#00a884] animate-ping"></span>
                  RAG Searching documents & GPT-4o thinking...
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat Input Form */}
          <form onSubmit={handleSendTestMessage} className="p-3 bg-white border-t border-gray-200 flex items-center gap-2">
            <input
              type="text"
              value={testInput}
              onChange={(e) => setTestInput(e.target.value)}
              placeholder="Ask a question like a customer (e.g. What are your pricing plans?)..."
              className="flex-1 px-4 py-2.5 text-xs bg-gray-100 border border-gray-200 rounded-xl focus:outline-none focus:border-[#00a884]"
            />
            <button
              type="submit"
              disabled={isThinking || !testInput.trim()}
              className="px-4 py-2.5 bg-[#00a884] text-white font-bold text-xs rounded-xl hover:bg-[#008f70] transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              <span>Send</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
    </div>
  );
}
