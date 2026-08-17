'use client';

import React, { useState, useEffect } from 'react';
import { Bot, Save, Sparkles, Check, Send, Key, Cpu, ShieldCheck } from 'lucide-react';
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

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [testMessage, setTestMessage] = useState('');
  const [testResult, setTestResult] = useState<any>(null);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    fetch(`${getBackendUrl()}/api/ai/knowledge-base`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.kb) {
          setKb(data.kb);
        }
      })
      .catch((err) => console.error('Error fetching KB:', err));
  }, []);

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
            <h2 className="text-xl font-bold text-[#111b21]">OpenAI LLM & AI Knowledge Base Settings</h2>
            <p className="text-xs text-gray-500">Train OpenAI GPT-4o with custom company documents, pricing catalogs, and FAQs.</p>
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
        <div className="flex items-center gap-2 text-[#00a884] font-bold text-sm">
          <Key className="w-4 h-4" />
          <span>OpenAI API Key & LLM Model Selection</span>
        </div>
        <p className="text-xs text-gray-500">
          Enter your OpenAI API key (`sk-proj-...` from platform.openai.com) so GPT-4o analyzes incoming customer questions against your uploaded documents.
        </p>

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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Knowledge Base Forms (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Company Profile */}
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-[#111b21] uppercase tracking-wider text-gray-500">Company Overview & Greeting</h3>

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
              <label className="block text-xs font-bold text-gray-700 mb-1">Company Description & Mission</label>
              <textarea
                rows={3}
                value={kb.companyDescription || ''}
                onChange={(e) => setKb({ ...kb, companyDescription: e.target.value })}
                placeholder="Describe what your business does..."
                className="w-full p-2.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#00a884]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Default Greeting Message</label>
              <input
                type="text"
                value={kb.greetingMessage || ''}
                onChange={(e) => setKb({ ...kb, greetingMessage: e.target.value })}
                className="w-full p-2.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#00a884]"
              />
            </div>
          </div>

          {/* Products, Services & Pricing Catalog */}
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-[#111b21] uppercase tracking-wider text-gray-500">Products, Plans & Demo Video Links</h3>
            <p className="text-xs text-gray-500">Add exact package names, prices, features, and demo links so GPT-4o answers pricing inquiries accurately.</p>

            <textarea
              rows={5}
              value={kb.productsAndPricing || ''}
              onChange={(e) => setKb({ ...kb, productsAndPricing: e.target.value })}
              placeholder="e.g. Growth Pack: ₹4,999/month - Includes 50 Shoots. Pro Pack: ₹9,999/month..."
              className="w-full p-3 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#00a884] font-mono"
            />
          </div>

          {/* FAQs & Document Knowledge */}
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-[#111b21] uppercase tracking-wider text-gray-500">Product Policies, Document Knowledge & FAQs</h3>

            <textarea
              rows={6}
              value={kb.faqsAndAnswers || ''}
              onChange={(e) => setKb({ ...kb, faqsAndAnswers: e.target.value })}
              placeholder="Paste all product rules, refund policies, FAQs, and brand guidelines here..."
              className="w-full p-3 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#00a884]"
            />
          </div>
        </div>

        {/* Right Column: AI Sandbox Test Tool */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
            <div className="flex items-center gap-2 text-[#00a884] font-bold text-sm">
              <Sparkles className="w-4 h-4" />
              <span>Interactive GPT-4o Test Sandbox</span>
            </div>
            <p className="text-xs text-gray-500">Type any customer question below to test how GPT-4o analyzes your documents and responds in real time!</p>

            <form onSubmit={handleTestAi} className="space-y-3">
              <textarea
                rows={3}
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                placeholder="e.g., Can I upgrade my plan mid-month?"
                className="w-full p-3 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#00a884]"
              />

              <button
                type="submit"
                disabled={isTesting || !testMessage.trim()}
                className="w-full py-2.5 bg-[#00a884] text-white font-bold text-xs rounded-xl hover:bg-[#008f70] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isTesting ? 'GPT-4o Analyzing...' : 'Test GPT-4o Auto-Reply'}</span>
              </button>
            </form>

            {testResult && (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2 mt-4">
                <div className="flex items-center justify-between text-xs font-bold text-emerald-800">
                  <span>🤖 GPT-4o Auto-Reply:</span>
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
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Human Override Safety Rule</h4>
            <p className="text-xs text-gray-500 leading-relaxed">
              If a human sales rep types a message manually to a client on WhatsApp, the AI Agent automatically **pauses for 10 minutes** for that customer so it never interrupts human conversations.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
