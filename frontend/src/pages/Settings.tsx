import { useState, useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useAudioSettings } from '../contexts/AudioSettingsContext';
import { Settings as SettingsIcon, Moon, Sun, Laptop, Zap, CheckCircle2, Music2, Scale, X, FileText, Shield } from 'lucide-react';
export default function Settings() {
  const { theme, themeMode, setThemeMode } = useTheme();
  const { seamlessPreload, setSeamlessPreload, transitionMode, setTransitionMode, crossfadeDuration, setCrossfadeDuration } = useAudioSettings();
  const [legalModal, setLegalModal] = useState<'licenses' | 'eula' | 'privacy' | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLegalModal(null);
      }
    };
    if (legalModal) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [legalModal]);
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
                Pilih mode tampilan atau ikuti preferensi sistem operasi Anda.
              </p>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" role="radiogroup" aria-label="Pilihan Tema">
              {/* System Mode Selector Card */}
              <button
                type="button"
                role="radio"
                aria-checked={themeMode === 'system'}
                onClick={() => setThemeMode('system')}
                className={`flex flex-col items-center justify-center p-5 rounded-2xl border-2 text-center transition-all duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
                  themeMode === 'system'
                    ? 'border-brand-500 bg-white dark:bg-[#1c1c1e] shadow-md shadow-brand-500/5'
                    : 'border-transparent bg-white/50 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 text-gray-500 dark:text-gray-400'
                }`}
              >
                <div className={`w-11 h-11 rounded-full flex items-center justify-center mb-2.5 transition-colors ${
                  themeMode === 'system' ? 'bg-brand-500/10 text-brand-500' : 'bg-gray-200 dark:bg-white/5 text-gray-500 dark:text-gray-400'
                }`}>
                  <Laptop className="w-5 h-5" />
                </div>
                <span className={`font-semibold text-sm ${themeMode === 'system' ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                  Sistem
                </span>
                <span className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                  Ikuti Tema OS
                </span>
              </button>

              {/* Light Mode Selector Card */}
              <button
                type="button"
                role="radio"
                aria-checked={themeMode === 'light'}
                onClick={() => setThemeMode('light')}
                className={`flex flex-col items-center justify-center p-5 rounded-2xl border-2 text-center transition-all duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
                  themeMode === 'light'
                    ? 'border-brand-500 bg-white dark:bg-[#1c1c1e] shadow-md shadow-brand-500/5'
                    : 'border-transparent bg-white/50 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 text-gray-500 dark:text-gray-400'
                }`}
              >
                <div className={`w-11 h-11 rounded-full flex items-center justify-center mb-2.5 transition-colors ${
                  themeMode === 'light' ? 'bg-amber-100 text-amber-500' : 'bg-gray-200 dark:bg-white/5 text-gray-500 dark:text-gray-400'
                }`}>
                  <Sun className="w-5 h-5 fill-amber-500/10" />
                </div>
                <span className={`font-semibold text-sm ${themeMode === 'light' ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                  Light Mode
                </span>
                <span className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                  Bersih & Terang
                </span>
              </button>

              {/* Dark Mode Selector Card */}
              <button
                type="button"
                role="radio"
                aria-checked={themeMode === 'dark'}
                onClick={() => setThemeMode('dark')}
                className={`flex flex-col items-center justify-center p-5 rounded-2xl border-2 text-center transition-all duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
                  themeMode === 'dark'
                    ? 'border-brand-500 bg-white dark:bg-[#1c1c1e] shadow-md shadow-brand-500/5'
                    : 'border-transparent bg-white/50 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 text-gray-500 dark:text-gray-400'
                }`}
              >
                <div className={`w-11 h-11 rounded-full flex items-center justify-center mb-2.5 transition-colors ${
                  themeMode === 'dark' ? 'bg-indigo-950 text-indigo-400' : 'bg-gray-200 dark:bg-white/5 text-gray-500 dark:text-gray-400'
                }`}>
                  <Moon className="w-5 h-5 fill-indigo-400/10" />
                </div>
                <span className={`font-semibold text-sm ${themeMode === 'dark' ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                  Dark Mode
                </span>
                <span className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                  Tenang & Teduh
                </span>
              </button>
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <h2 className="text-xl font-semibold flex items-center space-x-2">
            <Music2 className="w-5 h-5 text-brand-500" />
            <span>Pemutaran Seamless</span>
          </h2>
          <div className="bg-gray-100 dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-2xl p-6 shadow-sm space-y-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="font-medium text-lg">Preload Lagu Berikutnya</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Siapkan lagu berikutnya lebih awal untuk mengurangi jeda pemutaran.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-label="Preload lagu berikutnya"
                aria-checked={seamlessPreload}
                onClick={() => setSeamlessPreload(!seamlessPreload)}
                className={`relative w-12 h-7 rounded-full flex-shrink-0 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${seamlessPreload ? 'bg-brand-500' : 'bg-gray-300 dark:bg-gray-600'}`}
              >
                <span className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${seamlessPreload ? 'translate-x-5' : ''}`} />
              </button>
            </div>

            <fieldset className="space-y-3">
              <legend className="font-medium text-lg">Transisi Lagu</legend>
              <p className="text-sm text-gray-500 dark:text-gray-400">Pilih cara berpindah ke lagu berikutnya.</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {([
                  ['crossfade', 'Crossfade', 'Lagu saling berbaur'],
                  ['fade', 'Fade', 'Volume memudar'],
                  ['off', 'Nonaktif', 'Tanpa transisi'],
                ] as const).map(([mode, label, description]) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={transitionMode === mode}
                    onClick={() => setTransitionMode(mode)}
                    className={`rounded-xl border-2 p-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
                      transitionMode === mode
                        ? 'border-brand-500 bg-white dark:bg-[#1c1c1e]'
                        : 'border-transparent bg-white/50 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10'
                    }`}
                  >
                    <span className="block font-semibold text-sm">{label}</span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400 mt-1">{description}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            {transitionMode !== 'off' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <label htmlFor="transition-duration" className="font-medium">Durasi Transisi</label>
                  <span className="text-sm text-gray-500 dark:text-gray-400">{crossfadeDuration} detik</span>
                </div>
                <input
                  id="transition-duration"
                  type="range"
                  min="1"
                  max="6"
                  step="1"
                  value={crossfadeDuration}
                  onChange={event => setCrossfadeDuration(Number(event.target.value))}
                  className="w-full accent-brand-500"
                />
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span>1 detik</span>
                  <span>6 detik</span>
                </div>
              </div>
            )}
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
                  Aplikasi memutar musik secara terintegrasi menggunakan <strong>YouTube Innertube Engine</strong>. Aliran audio progressive beresolusi tinggi dimuat secara langsung saat track teresolusi, dengan fallback pratinjau adaptif tanpa mewajibkan Google Cloud Developer Key atau kuota berbayar.
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
                <span>Streaming Progressive Otomatis</span>
              </div>
              <div className="flex items-center space-x-2.5 text-xs text-gray-600 dark:text-gray-300">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Audio Kualitas Tinggi (AAC / Opus)</span>
              </div>
              <div className="flex items-center space-x-2.5 text-xs text-gray-600 dark:text-gray-300">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Dukungan Autoplay & Smart Shuffle</span>
              </div>
            </div>
          </div>
        </section>

        {/* Legal & License Information */}
        <section className="space-y-6">
          <h2 className="text-xl font-semibold flex items-center space-x-2">
            <Scale className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            <span>Informasi Legal & Lisensi</span>
          </h2>

          <div className="bg-gray-100 dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-2xl p-6 shadow-sm space-y-4">
            <div>
              <h3 className="font-medium text-lg">Pemberitahuan Lisensi & Hak Penggunaan</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                Music-Wails adalah aplikasi evaluasi pengembangan internal. Seluruh dependensi pihak ketiga, atribusi hak cipta, dan status kepatuhan hukum terdokumentasi secara transparan.
              </p>
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                onClick={() => setLegalModal('licenses')}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-white dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15 text-gray-900 dark:text-white border border-black/5 dark:border-white/10 transition-colors shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
              >
                Pemberitahuan Lisensi Pihak Ketiga
              </button>
              <button
                type="button"
                onClick={() => setLegalModal('eula')}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-white dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15 text-gray-900 dark:text-white border border-black/5 dark:border-white/10 transition-colors shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
              >
                Ketentuan Penggunaan & EULA
              </button>
              <button
                type="button"
                onClick={() => setLegalModal('privacy')}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-white dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15 text-gray-900 dark:text-white border border-black/5 dark:border-white/10 transition-colors shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
              >
                Status Kebijakan Privasi & Hak Data
              </button>
            </div>
          </div>
        </section>

        {/* Legal Modal Dialog */}
        {legalModal && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="legal-modal-title"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setLegalModal(null)}
          >
            <div
              className="relative w-full max-w-2xl max-h-[80vh] flex flex-col bg-white dark:bg-[#18181b] border border-black/10 dark:border-white/15 rounded-2xl shadow-2xl overflow-hidden text-gray-900 dark:text-white"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-white/10">
                <div className="flex items-center space-x-3">
                  {legalModal === 'licenses' && <FileText className="w-5 h-5 text-brand-500" />}
                  {legalModal === 'eula' && <Scale className="w-5 h-5 text-brand-500" />}
                  {legalModal === 'privacy' && <Shield className="w-5 h-5 text-brand-500" />}
                  <h3 id="legal-modal-title" className="text-lg font-bold">
                    {legalModal === 'licenses' && 'Pemberitahuan Lisensi Pihak Ketiga (Third-Party Notices)'}
                    {legalModal === 'eula' && 'Perjanjian Lisensi Pengguna Akhir (EULA) & Status Rilis'}
                    {legalModal === 'privacy' && 'Status Kebijakan Privasi & Pemrosesan Data'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setLegalModal(null)}
                  aria-label="Tutup dialog"
                  className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-4 text-xs text-gray-700 dark:text-gray-300 leading-relaxed font-sans">
                {legalModal === 'licenses' && (
                  <div className="space-y-4">
                    <p className="font-medium text-sm text-gray-900 dark:text-white">
                      Aplikasi ini mendistribusikan komponen sumber terbuka di bawah lisensi resmi berikut:
                    </p>
                    <div className="space-y-3">
                      <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-white/5 border border-black/5 dark:border-white/10">
                        <h4 className="font-semibold text-gray-900 dark:text-white text-xs mb-1">1. Komponen Go Runtime (Binary)</h4>
                        <p className="text-[11px] text-gray-600 dark:text-gray-400">
                          Wails v2 (MIT, Apache-2.0), Goja (BSD-2-Clause, Lucent, V8), Youtube/v2 (MIT), Regexp2 (MIT, Unicode), Simplejson (MIT), Uniseg (MIT), Slicer (MIT), Ansi-Parser (MIT), Pprof (Apache-2.0, BSD-3-Clause), Golang X/Sys (BSD-3-Clause), Golang X/Text (BSD-3-Clause), Webview2 (MIT, ISC), Errors (BSD-2-Clause).
                        </p>
                      </div>
                      <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-white/5 border border-black/5 dark:border-white/10">
                        <h4 className="font-semibold text-gray-900 dark:text-white text-xs mb-1">2. Komponen Client Frontend (Bundle)</h4>
                        <p className="text-[11px] text-gray-600 dark:text-gray-400">
                          React & React-DOM 18 (MIT), Scheduler (MIT), Lucide-React (ISC & Feather MIT), Framer-Motion (MIT), Motion-DOM & Motion-Utils (MIT), Supabase-JS SDK (MIT, Phoenix MIT).
                        </p>
                      </div>
                      <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-white/5 border border-black/5 dark:border-white/10">
                        <h4 className="font-semibold text-gray-900 dark:text-white text-xs mb-1">3. Aset Statis & Tipografi</h4>
                        <p className="text-[11px] text-gray-600 dark:text-gray-400">
                          Color Thief UMD oleh Lokesh Dhakar (MIT), Font Nunito (SIL Open Font License 1.1 oleh The Nunito Project Authors).
                        </p>
                      </div>
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 italic">
                      Teks lengkap seluruh lisensi di atas dapat dilihat pada berkas THIRD_PARTY_LICENSES.md di direktori aplikasi.
                    </p>
                  </div>
                )}

                {legalModal === 'eula' && (
                  <div className="space-y-3">
                    <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300">
                      <strong>Status Rilis: Evaluasi Internal / Non-Komersial (Rilis Publik Diblokir)</strong>
                      <p className="mt-1 text-[11px]">
                        Aplikasi ini tidak memiliki izin hak siar musik komersial dari pemilik rekaman suara atau penerbit lagu. Segala bentuk distribusi berbayar, publikasi toko aplikasi, atau penyediaan layanan komersial diblokir hingga kontrak resmi dipenuhi.
                      </p>
                    </div>
                    <h4 className="font-semibold text-gray-900 dark:text-white">Hak Cipta Aplikasi Proprietary</h4>
                    <p>
                      Hak cipta atas kode sumber, arsitektur, dan aset aplikasi Music-Wails dipegang sepenuhnya oleh pemilik aplikasi (Michael). Penggunaan di luar evaluasi pengujian internal dilarang tanpa izin tertulis pemilik hak cipta.
                    </p>
                    <h4 className="font-semibold text-gray-900 dark:text-white">Penafian Jaminan (Disclaimer)</h4>
                    <p>
                      Perangkat lunak ini disediakan apa adanya (as-is) tanpa jaminan ketersediaan layanan streaming, akurasi metadata pihak ketiga, atau kesesuaian untuk tujuan komersial tertentu.
                    </p>
                  </div>
                )}

                {legalModal === 'privacy' && (
                  <div className="space-y-3">
                    <h4 className="font-semibold text-gray-900 dark:text-white">Pemrosesan Data Pengguna</h4>
                    <p>
                      Aplikasi memproses data pendaftaran (email, username, password terenkripsi) dan sesi login Google OAuth melalui basis data cloud Supabase. Pengaturan audio dan riwayat lagu lokal disimpan langsung di peramban komputer pengguna (localStorage).
                    </p>
                    <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-white/5 border border-black/5 dark:border-white/10 space-y-2">
                      <h5 className="font-semibold text-gray-900 dark:text-white text-xs">Status Hak Subjek Data:</h5>
                      <ul className="list-disc pl-4 space-y-1 text-[11px] text-gray-600 dark:text-gray-400">
                        <li><strong>Hak Akses:</strong> Pengguna dapat melihat identitas akun pada menu Profil.</li>
                        <li><strong>Hak Portabilitas (Ekspor Data):</strong> Belum tersedia mekanisme pengunduhan riwayat terstruktur otomatis.</li>
                        <li><strong>Hak Penghapusan Akun:</strong> Fitur penghapusan akun permanen mandiri saat ini belum diimplementasikan di antarmuka (hanya logout lokal).</li>
                      </ul>
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      Untuk memenuhi UU Perlindungan Data Pribadi (UU PDP No. 27/2022) dan standar privasi internasional, formulir persetujuan eksplisit dan fitur hapus akun mandiri wajib diselesaikan sebelum rilis publik.
                    </p>
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-gray-200 dark:border-white/10 flex justify-end bg-gray-50 dark:bg-white/[0.02]">
                <button
                  type="button"
                  onClick={() => setLegalModal(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-gray-200 dark:bg-white/10 hover:bg-gray-300 dark:hover:bg-white/15 text-gray-900 dark:text-white transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
