'use client';

import React, { useState } from 'react';
import { Lock, User, Eye, EyeOff, ArrowRight } from 'lucide-react';

interface LoginModuleProps {
  onLoginSuccess: () => void;
}

export function LoginModule({ onLoginSuccess }: LoginModuleProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedUser = username.trim();
    const trimmedPass = password.trim();

    if (!trimmedUser || !trimmedPass) {
      setError('Please enter both username and password.');
      return;
    }

    setLoading(true);

    // Get stored credentials from localStorage (or fallback to defaults)
    const storedUser = localStorage.getItem('crm_admin_username') || 'admin';
    const storedPass = localStorage.getItem('crm_admin_password') || 'Nicedigitals@2025';

    setTimeout(() => {
      if (trimmedUser === storedUser && trimmedPass === storedPass) {
        localStorage.setItem('crm_authenticated', 'true');
        onLoginSuccess();
      } else {
        setError('Invalid username or password. Please try again.');
        setLoading(false);
      }
    }, 400);
  };

  return (
    <div className="w-screen h-screen flex items-center justify-center bg-[#f7f6f2] p-4 text-black font-sans">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-zinc-200/80 p-8 md:p-10 space-y-6">
        
        {/* Top Logo & Title Header */}
        <div className="text-center space-y-3">
          <div className="flex justify-center mb-2">
            <img src="/ai_vastra_logo.png" alt="Ai Vastra Logo" className="h-12 w-auto object-contain" />
          </div>
          <h1 className="text-2xl font-extrabold text-black tracking-tight">Ai Vastra CRM</h1>
          <p className="text-xs text-zinc-500 font-medium">Enter your executive credentials to access the CRM suite</p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl text-center">
            {error}
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Username */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-zinc-700 block">Username</label>
            <div className="relative">
              <User className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                className="w-full pl-10 pr-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-semibold text-black focus:outline-none focus:bg-white focus:border-black transition-all"
                autoFocus
              />
            </div>
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-zinc-700 block">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full pl-10 pr-10 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-semibold text-black focus:outline-none focus:bg-white focus:border-black transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-black transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-[#0066cc] hover:bg-[#0052a3] text-white font-extrabold text-sm rounded-xl transition-all shadow-md active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-60 mt-2"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>Sign In to Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="text-center border-t border-zinc-100 pt-4">
          <p className="text-[11px] text-zinc-400 font-semibold">
            Ai Vastra WhatsApp & Cold Calls CRM Suite © 2026
          </p>
        </div>
      </div>
    </div>
  );
}
