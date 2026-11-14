import { useTheme } from '../contexts/ThemeContext';
import { Settings as SettingsIcon, Moon, Sun, Zap, CheckCircle2, Music2 } from 'lucide-react';

export default function Settings() {
  const { theme, toggleTheme } = useTheme();

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
            <p className="text-gray-500 dark:text-gray-400 mt-1">Konfigurasi preferensi aplikasi dan status pemutar musik</p>
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
              <h3 className="font-medium text-lg">Tema Visual</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Pilih mode tampilan yang paling nyaman untuk Anda saat mendengarkan musik.
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

        {/* Music Player Engine Information */}
        <section className="space-y-6">
          <h2 className="text-xl font-semibold flex items-center space-x-2">
            <Music2 className="w-5 h-5 text-brand-500" />
            <span>Mesin Streaming Musik</span>
          </h2>

          <div className="bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/25 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-start space-x-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-500 text-white flex items-center justify-center flex-shrink-0 shadow-md shadow-emerald-500/30">
                <Zap className="w-6 h-6 fill-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-center space-x-2">
                  <h3 className="text-base font-bold text-gray-900 dark:text-white">
                    YouTube Innertube Engine (BitChord-Style)
                  </h3>
                  <span className="text-[11px] bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-semibold px-2.5 py-0.5 rounded-full flex items-center space-x-1">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Aktif Otomatis</span>
                  </span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1.5 leading-relaxed">
                  Aplikasi memutar musik secara otomatis menggunakan <strong>YouTube Innertube Engine</strong>. Semua lagu diputar dalam durasi penuh dengan kualitas audio tinggi secara langsung tanpa memerlukan registrasi, biaya, atau pembuatan Google Cloud API Key.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-emerald-500/15">
              <div className="flex items-center space-x-2.5 text-xs text-gray-600 dark:text-gray-300">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Bebas Google Developer API Key</span>
              </div>
              <div className="flex items-center space-x-2.5 text-xs text-gray-600 dark:text-gray-300">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Pemutaran Berdurasi Penuh (Full Stream)</span>
              </div>
              <div className="flex items-center space-x-2.5 text-xs text-gray-600 dark:text-gray-300">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Audio AAC Murni (High Quality)</span>
              </div>
              <div className="flex items-center space-x-2.5 text-xs text-gray-600 dark:text-gray-300">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Dukungan Autoplay & Smart Shuffle</span>
              </div>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
