import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { usePlayerSettings } from '../contexts/PlayerSettingsContext';
import { supabase } from '../lib/supabase';
import { Settings as SettingsIcon, Save, Moon, Sun, Key, Loader2, Info, Zap, Music2, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Settings() {
  const { profile, refreshProfile } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { settings, setSeamlessPreload, setCrossfade, setCrossfadeDuration } = usePlayerSettings();
  
  const [key1, setKey1] = useState(profile?.youtube_api_key_1 || '');
  const [key2, setKey2] = useState(profile?.youtube_api_key_2 || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  useEffect(() => {
    if (profile) {
      setKey1(profile.youtube_api_key_1 || '');
      setKey2(profile.youtube_api_key_2 || '');
    }
  }, [profile]);

  const saveKeys = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setIsSaving(true);
    setSaveMessage(null);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          youtube_api_key_1: key1,
          youtube_api_key_2: key2
        })
        .eq('id', profile.id);

      if (error) throw error;
      
      await refreshProfile();
      setSaveMessage({ type: 'success', text: 'Kredensial API berhasil disimpan!' });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err: any) {
      setSaveMessage({ type: 'error', text: err.message || 'Gagal menyimpan kredensial' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="w-full h-full p-8 overflow-y-auto text-gray-900 dark:text-white bg-white dark:bg-[#121212]">
      <div className="max-w-2xl mx-auto space-y-12 pb-24">
        
        {/* Header */}
        <div className="flex items-center space-x-4 border-b border-gray-200 dark:border-white/10 pb-6">
          <div className="w-12 h-12 rounded-xl bg-brand-500/10 flex items-center justify-center">
            <SettingsIcon className="w-6 h-6 text-brand-500" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Pengaturan</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">Konfigurasi preferensi aplikasi dan kredensial eksternal</p>
          </div>
        </div>

        {/* Theme Settings */}
        <section className="space-y-6">
          <h2 className="text-xl font-semibold flex items-center space-x-2">
            {theme === 'dark' ? <Moon className="w-5 h-5 text-gray-400" /> : <Sun className="w-5 h-5 text-gray-400" />}
            <span>Mode Tampilan</span>
          </h2>
          <div className="bg-gray-100 dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-2xl p-6 shadow-sm space-y-6">
            <div>
              <h3 className="font-medium text-lg">Mode Tampilan</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Pilih mode tampilan yang paling sesuai dan nyaman untuk Anda saat memutar musik.
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              {/* Light Mode Selector Card */}
              <button
                type="button"
                onClick={() => theme === 'dark' && toggleTheme()}
                className={`flex flex-col items-center justify-center p-6 rounded-2xl border-2 text-center transition-all duration-300 focus:outline-none ${
                  theme === 'light'
                    ? 'border-brand-500 bg-white shadow-md shadow-brand-500/5'
                    : 'border-transparent bg-white/5 hover:bg-white/10 text-gray-400 dark:text-gray-400'
                }`}
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 transition-colors ${
                  theme === 'light' ? 'bg-amber-100 text-amber-500' : 'bg-white/5 text-gray-400 dark:bg-white/5 dark:text-gray-400'
                }`}>
                  <Sun className="w-6 h-6 fill-amber-500/10" />
                </div>
                <span className={`font-semibold text-sm ${theme === 'light' ? 'text-gray-900' : 'text-gray-300 dark:text-gray-300'}`}>
                  Light Mode
                </span>
                <span className={`text-[11px] mt-1 ${theme === 'light' ? 'text-gray-400' : 'text-gray-500 dark:text-gray-500'}`}>
                  Bersih & Terang
                </span>
              </button>

              {/* Dark Mode Selector Card */}
              <button
                type="button"
                onClick={() => theme === 'light' && toggleTheme()}
                className={`flex flex-col items-center justify-center p-6 rounded-2xl border-2 text-center transition-all duration-300 focus:outline-none ${
                  theme === 'dark'
                    ? 'border-brand-500 bg-[#1c1c1e] shadow-md shadow-brand-500/5'
                    : 'border-transparent bg-gray-200/50 hover:bg-gray-200/80 text-gray-500'
                }`}
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 transition-colors ${
                  theme === 'dark' ? 'bg-indigo-950 text-indigo-400' : 'bg-gray-300 text-gray-600'
                }`}>
                  <Moon className="w-6 h-6 fill-indigo-400/10" />
                </div>
                <span className={`font-semibold text-sm ${theme === 'dark' ? 'text-white' : 'text-gray-700'}`}>
                  Dark Mode
                </span>
                <span className={`text-[11px] mt-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                  Tenang & Teduh
                </span>
              </button>
            </div>
          </div>
        </section>

        {/* ── Playback Settings ──────────────────────────────────────────── */}
        <section className="space-y-6">
          <h2 className="text-xl font-semibold flex items-center space-x-2">
            <Music2 className="w-5 h-5 text-brand-500" />
            <span>Pemutaran</span>
          </h2>

          <div className="bg-gray-100 dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-2xl p-6 shadow-sm space-y-6">

            {/* ── Toggle: Seamless Preload ─────────────────────────────── */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-medium text-base">Seamless Preload</h3>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                  Muat lagu berikutnya di latar belakang agar tidak ada jeda saat pergantian lagu.
                </p>
                {/* Red API quota warning */}
                <motion.div
                  initial={false}
                  animate={{ height: settings.seamlessPreload ? 'auto' : 0, opacity: settings.seamlessPreload ? 1 : 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <div className="flex items-start gap-2 mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                    <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-red-600 dark:text-red-400 leading-relaxed">
                      <strong>Peringatan:</strong> Fitur ini akan memuat lagu berikutnya di latar belakang. Ini akan
                      tetap <strong>mengonsumsi kuota API YouTube</strong> meskipun Anda melewati atau menghentikan
                      lagu sebelum pemutaran selanjutnya.
                    </p>
                  </div>
                </motion.div>
              </div>
              {/* Animated pill toggle */}
              <button
                id="settings-toggle-seamless-preload"
                type="button"
                role="switch"
                aria-checked={settings.seamlessPreload}
                onClick={() => setSeamlessPreload(!settings.seamlessPreload)}
                className={`relative flex-shrink-0 w-12 h-6 rounded-full transition-colors duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                  settings.seamlessPreload ? 'bg-brand-500' : 'bg-gray-300 dark:bg-white/20'
                }`}
              >
                <motion.span
                  layout
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md ${
                    settings.seamlessPreload ? 'left-6' : 'left-0.5'
                  }`}
                />
              </button>
            </div>

            <div className="border-t border-black/5 dark:border-white/10" />

            {/* ── Toggle: Crossfade ────────────────────────────────────── */}
            <div className={`transition-opacity duration-300 ${settings.seamlessPreload ? 'opacity-100' : 'opacity-40 pointer-events-none select-none'}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-base">Crossfade Antar Lagu</h3>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                    Lakukan transisi fade-out/fade-in yang mulus saat pergantian lagu.
                    {!settings.seamlessPreload && (
                      <span className="block mt-1 text-xs text-gray-400 dark:text-gray-500 italic">
                        Aktifkan Seamless Preload terlebih dahulu untuk menggunakan fitur ini.
                      </span>
                    )}
                  </p>
                </div>
                <button
                  id="settings-toggle-crossfade"
                  type="button"
                  role="switch"
                  aria-checked={settings.crossfade}
                  disabled={!settings.seamlessPreload}
                  onClick={() => setCrossfade(!settings.crossfade)}
                  className={`relative flex-shrink-0 w-12 h-6 rounded-full transition-colors duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed ${
                    settings.crossfade && settings.seamlessPreload ? 'bg-brand-500' : 'bg-gray-300 dark:bg-white/20'
                  }`}
                >
                  <motion.span
                    layout
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md ${
                      settings.crossfade && settings.seamlessPreload ? 'left-6' : 'left-0.5'
                    }`}
                  />
                </button>
              </div>

              {/* ── Crossfade Duration Slider ──────────────────────────── */}
              <motion.div
                initial={false}
                animate={{ height: settings.crossfade && settings.seamlessPreload ? 'auto' : 0, opacity: settings.crossfade && settings.seamlessPreload ? 1 : 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <div className="mt-5 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Durasi Crossfade
                    </label>
                    <span className="text-sm font-semibold text-brand-500 tabular-nums">
                      {settings.crossfadeDuration} detik
                    </span>
                  </div>
                  <div className="relative flex items-center gap-3">
                    <span className="text-xs text-gray-400 w-4">2s</span>
                    <div className="relative flex-1">
                      <input
                        id="settings-crossfade-duration"
                        type="range"
                        min={2}
                        max={10}
                        step={1}
                        value={settings.crossfadeDuration}
                        onChange={e => setCrossfadeDuration(Number(e.target.value))}
                        disabled={!settings.crossfade || !settings.seamlessPreload}
                        className="w-full appearance-none h-2 rounded-full bg-gray-200 dark:bg-white/10 accent-brand-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      {/* Filled track overlay */}
                      <div
                        className="absolute top-1/2 left-0 -translate-y-1/2 h-2 rounded-full bg-brand-500 pointer-events-none transition-all duration-150"
                        style={{ width: `${((settings.crossfadeDuration - 2) / 8) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-400 w-5">10s</span>
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    Crossfade dimulai {settings.crossfadeDuration} detik sebelum akhir lagu aktif.
                  </p>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* API Credentials Settings */}
        <section className="space-y-6">
          <h2 className="text-xl font-semibold flex items-center space-x-2">
            <Key className="w-5 h-5 text-brand-500" />
            <span>Kredensial API YouTube</span>
          </h2>
          
          <div className="bg-brand-500/5 border border-brand-500/20 rounded-2xl p-5 flex items-start space-x-3 mb-6">
            <Info className="w-5 h-5 text-brand-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-brand-600 dark:text-brand-400 leading-relaxed">
              Kunci API disimpan secara aman di dalam database Supabase Anda, sehingga akan selalu tersinkronisasi 
              kapanpun Anda login. Jika API Key 1 terkena batasan kuota (Error 429), aplikasi akan otomatis menggunakan API Key 2.
            </p>
          </div>

          <form onSubmit={saveKeys} className="bg-gray-100 dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-2xl p-6 shadow-sm space-y-6">
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  YouTube API Key 1 (Primary)
                </label>
                <input
                  type="password"
                  value={key1}
                  onChange={(e) => setKey1(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full bg-white dark:bg-[#1c1c1e] border border-gray-300 dark:border-white/10 rounded-xl px-4 py-3 
                           focus:outline-none focus:ring-2 focus:ring-brand-500 transition-shadow text-black dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  YouTube API Key 2 (Fallback)
                </label>
                <input
                  type="password"
                  value={key2}
                  onChange={(e) => setKey2(e.target.value)}
                  placeholder="Opsional, digunakan saat Key 1 limit"
                  className="w-full bg-white dark:bg-[#1c1c1e] border border-gray-300 dark:border-white/10 rounded-xl px-4 py-3 
                           focus:outline-none focus:ring-2 focus:ring-brand-500 transition-shadow text-black dark:text-white"
                />
              </div>
            </div>

            {saveMessage && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }} 
                animate={{ opacity: 1, y: 0 }}
                className={`p-4 rounded-xl text-sm font-medium ${
                  saveMessage.type === 'success' 
                    ? 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20' 
                    : 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'
                }`}
              >
                {saveMessage.text}
              </motion.div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center space-x-2 bg-brand-500 hover:bg-brand-600 text-white px-6 py-2.5 rounded-full font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>{isSaving ? 'Menyimpan...' : 'Simpan Kredensial'}</span>
              </button>
            </div>
          </form>
        </section>

      </div>
    </div>
  );
}
