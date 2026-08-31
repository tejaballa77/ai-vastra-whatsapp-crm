'use client';

import React, { useState, useRef } from 'react';
import { X, User, Key, Upload, Check } from 'lucide-react';

interface AdminProfileModalProps {
  onClose: () => void;
  onSaveSuccess: () => void;
}

export function AdminProfileModal({ onClose, onSaveSuccess }: AdminProfileModalProps) {
  const [displayName, setDisplayName] = useState(
    () => localStorage.getItem('crm_admin_display_name') || 'Admin'
  );
  const [username, setUsername] = useState(
    () => localStorage.getItem('crm_admin_username') || 'admin'
  );
  const [avatarUrl, setAvatarUrl] = useState(
    () => localStorage.getItem('crm_admin_avatar') || ''
  );

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('File size must be under 2MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (evt) => {
      if (evt.target?.result) {
        setAvatarUrl(evt.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    const storedPass = localStorage.getItem('crm_admin_password') || 'Nicedigitals@2025';

    // If changing password or username, require valid current password authorization
    const isPasswordChange = Boolean(newPassword || confirmPassword);

    if (isPasswordChange) {
      if (currentPassword !== storedPass) {
        setError('Current password is incorrect. Please enter valid current password to authorize change.');
        return;
      }
      if (newPassword.length < 6) {
        setError('New password must be at least 6 characters.');
        return;
      }
      if (newPassword !== confirmPassword) {
        setError('New password and confirm password do not match.');
        return;
      }
    }

    setIsSaving(true);

    setTimeout(() => {
      localStorage.setItem('crm_admin_display_name', displayName.trim() || 'Admin');
      localStorage.setItem('crm_admin_username', username.trim() || 'admin');
      if (avatarUrl) {
        localStorage.setItem('crm_admin_avatar', avatarUrl);
      }
      if (isPasswordChange && newPassword) {
        localStorage.setItem('crm_admin_password', newPassword);
      }

      setIsSaving(false);
      setSuccessMsg('✓ Admin profile settings updated successfully!');
      setTimeout(() => {
        onSaveSuccess();
        onClose();
      }, 800);
    }, 300);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 text-black font-sans">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-zinc-200 flex flex-col max-h-[90vh] overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-zinc-100 flex items-center justify-between bg-white">
          <h3 className="text-xl font-extrabold text-black">Admin Profile Settings</h3>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center text-zinc-600 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="overflow-y-auto p-6 space-y-5 flex-1">

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl">
              {error}
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-xl flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Profile Picture Upload Circle */}
          <div className="flex flex-col items-center justify-center space-y-2">
            <input
              type="file"
              ref={avatarInputRef}
              onChange={handleAvatarChange}
              accept="image/png,image/jpeg,image/jpg"
              className="hidden"
            />
            <div
              onClick={() => avatarInputRef.current?.click()}
              className="w-24 h-24 rounded-full border-2 border-dashed border-purple-400 p-1 flex items-center justify-center cursor-pointer hover:border-purple-600 transition-all bg-purple-50/30 group relative overflow-hidden"
              title="Click to upload profile picture"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="Admin Avatar" className="w-full h-full rounded-full object-cover" />
              ) : (
                <User className="w-10 h-10 text-zinc-700 group-hover:scale-110 transition-transform" />
              )}
            </div>
            <p className="text-[11px] text-zinc-400 font-semibold">
              Click to upload picture (JPG, PNG. Max 2MB)
            </p>
          </div>

          {/* Display Name */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-zinc-700 uppercase tracking-wider block">DISPLAY NAME</label>
            <div className="relative">
              <User className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Admin"
                className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-semibold text-black focus:bg-white focus:border-black outline-none transition-all"
              />
            </div>
          </div>

          {/* Login Username */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-zinc-700 uppercase tracking-wider block">LOGIN USERNAME</label>
            <div className="relative">
              <User className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="admin"
                className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-semibold text-black focus:bg-white focus:border-black outline-none transition-all"
              />
            </div>
          </div>

          {/* Change Password Divider */}
          <div className="relative my-4 text-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-200"></div>
            </div>
            <span className="relative bg-white px-3 text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest">
              CHANGE PASSWORD
            </span>
          </div>

          {/* Current Password */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-zinc-700 uppercase tracking-wider block">CURRENT PASSWORD</label>
            <div className="relative">
              <Key className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                placeholder="Enter current password to authorize change"
                className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-semibold text-black focus:bg-white focus:border-black outline-none transition-all"
              />
            </div>
          </div>

          {/* New & Confirm Password */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-zinc-700 uppercase tracking-wider block">NEW PASSWORD</label>
              <div className="relative">
                <Key className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="At least 6 chars"
                  className="w-full pl-9 pr-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-black focus:bg-white focus:border-black outline-none transition-all"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-zinc-700 uppercase tracking-wider block">CONFIRM PASSWORD</label>
              <div className="relative">
                <Key className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="w-full pl-9 pr-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-black focus:bg-white focus:border-black outline-none transition-all"
                />
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 flex items-center justify-end gap-3 border-t border-zinc-100">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-xs font-bold text-zinc-700 hover:bg-zinc-100 rounded-xl border border-zinc-200 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2.5 bg-black hover:bg-zinc-800 text-white font-extrabold text-xs rounded-xl transition-all shadow-md active:scale-95 disabled:opacity-60"
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
