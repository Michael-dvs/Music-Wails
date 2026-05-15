import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, Star, ChevronUp, Shield, User as UserIcon, Settings } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function UserBadge() {
  const { user, profile, isAdmin, signOut } = useAuth();
  const [showMenu, setShowMenu] = useState(false);

  if (!user) return null;

  const displayName = profile?.username ?? user.email?.split('@')[0] ?? 'User';
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <div className="relative">
      {/* Pop-up menu */}
      <AnimatePresence>
        {showMenu && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowMenu(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute bottom-full left-0 right-0 mb-2 z-50 bg-[#1c1c1e] border border-[#3a3a3c] rounded-xl shadow-2xl overflow-hidden"
            >
              {/* User info header */}
              <div className="px-3 py-3 border-b border-[#2c2c2e]">
                <p className="text-[13px] font-semibold text-white truncate">{displayName}</p>
                <p className="text-[11px] text-[var(--app-text-secondary)] truncate">{user.email}</p>
              </div>

              {/* Role badge */}
              {isAdmin && (
                <div className="px-3 py-2 border-b border-[#2c2c2e] flex items-center space-x-2">
                  <Shield className="w-3.5 h-3.5 text-brand-400" />
                  <span className="text-[11px] text-brand-400 font-medium">Administrator</span>
                </div>
              )}

              {/* Actions */}
              <button
                onClick={() => { setShowMenu(false); }}
                className="w-full flex items-center space-x-2.5 px-3 py-2.5 text-[13px] text-[var(--app-text-secondary)] hover:text-white hover:bg-white/5 transition-colors"
              >
                <UserIcon className="w-4 h-4" />
                <span>Profile</span>
              </button>

              <button
                onClick={() => { setShowMenu(false); }}
                className="w-full flex items-center space-x-2.5 px-3 py-2.5 text-[13px] text-[var(--app-text-secondary)] hover:text-white hover:bg-white/5 transition-colors"
              >
                <Settings className="w-4 h-4" />
                <span>Settings</span>
              </button>

              <button
                onClick={() => { setShowMenu(false); }}
                className="w-full flex items-center space-x-2.5 px-3 py-2.5 text-[13px] text-[var(--app-text-secondary)] hover:text-white hover:bg-white/5 transition-colors border-b border-[#2c2c2e]"
              >
                <Star className="w-4 h-4" />
                <span>Favorit Saya</span>
              </button>

              <button
                onClick={() => { signOut(); setShowMenu(false); }}
                className="w-full flex items-center space-x-2.5 px-3 py-2.5 text-[13px] text-red-400 hover:text-red-300 hover:bg-red-500/5 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Keluar</span>
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Trigger button */}
      <button
        onClick={() => setShowMenu(v => !v)}
        className="w-full flex items-center space-x-2.5 px-2 py-2 rounded-xl hover:bg-white/5 transition-all duration-200 group"
      >
        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center flex-shrink-0 text-[11px] font-bold text-white shadow-md shadow-brand-500/20">
          {initials}
        </div>
        {/* Name */}
        <div className="flex-1 min-w-0 text-left">
          <p className="text-[12px] font-semibold text-white truncate leading-tight">{displayName}</p>
          {isAdmin && (
            <p className="text-[10px] text-brand-400">Admin</p>
          )}
        </div>
        <ChevronUp
          className={`w-3.5 h-3.5 text-[var(--app-text-secondary)] transition-transform duration-200 ${
            showMenu ? 'rotate-180' : ''
          }`}
        />
      </button>
    </div>
  );
}
