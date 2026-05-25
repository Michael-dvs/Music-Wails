import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { Settings as SettingsIcon, Save, Moon, Sun, Key, Loader2, Info } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Settings() {
  const { profile, refreshProfile } = useAuth();
  const { theme, toggleTheme } = useTheme();
  
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
