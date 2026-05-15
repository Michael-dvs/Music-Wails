import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mail, Lock, User, Eye, EyeOff,
  AlertCircle, Loader2, CheckCircle,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { StartGoogleLogin } from '../../wailsjs/go/main/App';
import { EventsOn, EventsOff } from '../../wailsjs/runtime/runtime';
import appIcon from '../assets/appicon.png';

// ── hCaptcha Config ───────────────────────────────────────────
// Test site key — works without registration (always passes in dev)
// For production: register at https://www.hcaptcha.com and replace this
const HCAPTCHA_SITE_KEY = '10000000-ffff-ffff-ffff-000000000001';

// ── Types ─────────────────────────────────────────────────────
type Mode = 'login' | 'register';

// ── Password strength helper ──────────────────────────────────
function getPasswordStrength(p: string): { score: number; label: string; color: string } {
  if (p.length === 0) return { score: 0, label: '', color: '' };
  let score = 0;
  if (p.length >= 8)    score++;
  if (p.length >= 12)   score++;
  if (/[A-Z]/.test(p))  score++;
  if (/[0-9]/.test(p))  score++;
  if (/[^A-Za-z0-9]/.test(p)) score++;

  if (score <= 1) return { score: 1, label: 'Weak',  color: '#ef4444' };
  if (score <= 3) return { score: 3, label: 'Medium', color: '#f59e0b' };
  return            { score: 5, label: 'Kuat',   color: '#22c55e' };
}

// ── Main Component ────────────────────────────────────────────
export default function LoginPage() {
  const { signIn, signUp } = useAuth();

  const [mode,            setMode]           = useState<Mode>('login');
  const [email,           setEmail]          = useState('');
  const [password,        setPassword]       = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username,        setUsername]       = useState('');
  const [showPass,        setShowPass]       = useState(false);
  const [showConfirm,     setShowConfirm]    = useState(false);
  const [error,           setError]          = useState<string | null>(null);
  const [success,         setSuccess]        = useState<string | null>(null);
  const [submitting,      setSubmitting]     = useState(false);
  const [captchaToken,    setCaptchaToken]   = useState<string | null>(null);
  const [captchaReady,    setCaptchaReady]   = useState(false);
  const [googleLoading,   setGoogleLoading]  = useState(false);
  const captchaRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<number | null>(null);

  // ── Listen for Google OAuth result events from Go backend ──
  useEffect(() => {
    const unlistenError = EventsOn('auth:google:error', (msg: string) => {
      setGoogleLoading(false);
      setError(`🔑 Login Google gagal: ${msg}`);
    });
    // On success, AuthContext handles setSession → AuthGate auto-redirects
    const unlistenSuccess = EventsOn('login-success', () => {
      setGoogleLoading(false);
    });
    return () => {
      EventsOff('auth:google:error');
      EventsOff('login-success');
      if (typeof unlistenError   === 'function') unlistenError();
      if (typeof unlistenSuccess === 'function') unlistenSuccess();
    };
  }, []);

  const pwStrength = getPasswordStrength(password);

  // ── Load hCaptcha script ──
  useEffect(() => {
    if ((window as any).hcaptcha) {
      setCaptchaReady(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://js.hcaptcha.com/1/api.js?render=explicit&onload=hcaptchaOnLoad';
    script.async = true;
    script.defer = true;

    (window as any).hcaptchaOnLoad = () => setCaptchaReady(true);
    document.head.appendChild(script);

    return () => {
      document.head.removeChild(script);
      delete (window as any).hcaptchaOnLoad;
    };
  }, []);

  // ── Render hCaptcha widget ──
  useEffect(() => {
    if (!captchaReady || !captchaRef.current) return;
    const hcaptcha = (window as any).hcaptcha;
    if (!hcaptcha) return;

    // Prevent "Only one captcha is permitted" duplicate error
    if (captchaRef.current.hasChildNodes()) {
      if (widgetIdRef.current !== null) {
        try { hcaptcha.reset(widgetIdRef.current); } catch (_) {}
      }
      return;
    }

    // Render the widget
    try {
      widgetIdRef.current = hcaptcha.render(captchaRef.current, {
        sitekey:  HCAPTCHA_SITE_KEY,
        theme:    'dark',
        size:     'normal',
        callback: (token: string) => {
          setCaptchaToken(token);
          setError(null);
        },
        'expired-callback': () => setCaptchaToken(null),
        'error-callback':   () => setCaptchaToken(null),
      });
    } catch (e) {
      console.warn('[hCaptcha] render failed:', e);
    }
  }, [captchaReady, mode]);

  // ── Mode switch ──
  const switchMode = useCallback((m: Mode) => {
    setMode(m);
    setError(null);
    setSuccess(null);
    setPassword('');
    setConfirmPassword('');
    setCaptchaToken(null);
    // Reset captcha widget
    const hcaptcha = (window as any).hcaptcha;
    if (hcaptcha && widgetIdRef.current !== null) {
      try { hcaptcha.reset(widgetIdRef.current); } catch (_) {}
    }
  }, []);

  // ── Form submit ──
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // ── Validation ──
    if (!email.trim())
      return setError('Email tidak boleh kosong.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return setError('📧 Format email tidak valid. Contoh: nama@gmail.com');
    if (password.length < 6)
      return setError('🔑 Password minimal 6 karakter.');

    if (mode === 'register') {
      if (!username.trim())
        return setError('👤 Username tidak boleh kosong.');
      if (username.trim().length < 3)
        return setError('👤 Username minimal 3 karakter.');
      if (password !== confirmPassword)
        return setError('🔑 Password tidak cocok. Ketik ulang dengan benar.');
      if (!captchaToken)
        return setError('🤖 Selesaikan verifikasi CAPTCHA terlebih dahulu.');
    }

    setSubmitting(true);

    if (mode === 'login') {
      const errorMsg = await signIn(email, password);
      if (errorMsg) {
        setError(errorMsg);
        // Reset captcha on error if it was filled
        const hcaptcha = (window as any).hcaptcha;
        if (hcaptcha && widgetIdRef.current !== null) {
          try { hcaptcha.reset(widgetIdRef.current); } catch (_) {}
        }
        setCaptchaToken(null);
      }
      // On success: AuthGate will detect the new session and show MusicApp
    } else {
      const { error: errMsg, needsConfirmation } = await signUp(email, password, username);
      if (errMsg) {
        setError(errMsg);
        // Reset captcha on error
        const hcaptcha = (window as any).hcaptcha;
        if (hcaptcha && widgetIdRef.current !== null) {
          try { hcaptcha.reset(widgetIdRef.current); } catch (_) {}
        }
        setCaptchaToken(null);
      } else if (needsConfirmation) {
        setSuccess(
          `✅ Akun berhasil dibuat!\n📧 Kami telah mengirim email konfirmasi ke ${email}.\nSilakan klik link di email tersebut, lalu kembali untuk masuk.`
        );
        switchMode('login');
      } else {
        // Auto-logged in (email confirmation disabled)
        setSuccess('✅ Akun berhasil dibuat dan Anda sudah masuk!');
      }
    }

    setSubmitting(false);
  }, [email, password, confirmPassword, username, mode, captchaToken, signIn, signUp, switchMode]);

  // ── Google OAuth via external browser ──
  const handleGoogleSignIn = useCallback(async () => {
    setError(null);
    setSuccess(null);
    setGoogleLoading(true);
    try {
      await StartGoogleLogin();
      // Wails opens system browser — result arrives via EventsOn('login-success')
      setSuccess('🌐 Browser sedang dibuka untuk login Google...\nSetelah selesai, aplikasi akan otomatis masuk.');
    } catch (e: any) {
      setGoogleLoading(false);
      setError(`🔑 Gagal membuka browser: ${e?.message ?? String(e)}`);
    }
  }, []);

  const isWorking = submitting;

  return (
    <div className="h-screen w-full bg-[#0c0c0c] overflow-y-auto px-4 py-8">
      {/* Radial glow at top */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 70% 45% at 50% 0%, rgba(250,36,60,0.09) 0%, transparent 70%)',
        }}
      />

      <div className="flex flex-col min-h-full">
        <div className="flex-1" />
        
        <motion.div
          initial={{ opacity: 0, y: 28, scale: 0.96 }}
          animate={{ opacity: 1, y: 0,  scale: 1 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-[360px] mx-auto flex-shrink-0"
        >
        {/* ── App Icon ── */}
        <div className="flex flex-col items-center mb-6 space-y-3">
          <motion.img
            src={appIcon}
            alt="Music-Wails"
            className="w-[72px] h-[72px] rounded-[18px] shadow-2xl shadow-brand-500/20 object-cover"
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1,    opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          />
          <div className="text-center">
            <h1 className="text-[22px] font-bold text-white tracking-tight leading-tight">
              Music-Wails
            </h1>
            <p className="text-[13px] text-[var(--app-text-secondary)] mt-0.5">
              {mode === 'login' ? 'Masuk ke akun Anda' : 'Buat akun baru'}
            </p>
          </div>
        </div>

        {/* ── Card ── */}
        <div className="bg-[#1c1c1e] border border-[#2c2c2e] rounded-2xl p-5 shadow-2xl">

          {/* Mode tabs */}
          <div className="flex bg-[#0c0c0c] rounded-xl p-1 mb-5 gap-1">
            {(['login', 'register'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className={`flex-1 py-2 text-[13px] font-semibold rounded-lg transition-all duration-200 ${
                  mode === m
                    ? 'bg-brand-500 text-white shadow-md shadow-brand-500/25'
                    : 'text-[var(--app-text-secondary)] hover:text-white'
                }`}
              >
                {m === 'login' ? 'Masuk' : 'Daftar'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">

            {/* Google Sign-In button */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isWorking || googleLoading}
              className="w-full flex items-center justify-center space-x-2.5 py-2.5 rounded-xl bg-[#0c0c0c] border border-[#3a3a3c] hover:border-white/20 hover:bg-white/5 transition-all duration-200 text-[13px] font-medium text-white disabled:opacity-50"
            >
              {googleLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#4285F4]" />
                  <span>Menunggu browser...</span>
                </>
              ) : (
                <>
                  {/* Google icon inline SVG */}
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  <span>Lanjutkan dengan Google</span>
                </>
              )}
            </button>

            {/* Divider */}
            <div className="flex items-center space-x-3 py-1">
              <div className="flex-1 h-px bg-[#2c2c2e]" />
              <span className="text-[11px] text-[var(--app-text-secondary)]">atau</span>
              <div className="flex-1 h-px bg-[#2c2c2e]" />
            </div>

            {/* Username (register only) */}
            <AnimatePresence>
              {mode === 'register' && (
                <motion.div
                  key="username-field"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.22 }}
                  className="overflow-hidden"
                >
                  <InputField
                    icon={<User className="w-4 h-4" />}
                    type="text"
                    placeholder="Username (min. 3 karakter)"
                    value={username}
                    onChange={setUsername}
                    disabled={isWorking}
                    autoComplete="username"
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Email */}
            <InputField
              icon={<Mail className="w-4 h-4" />}
              type="email"
              placeholder="Email"
              value={email}
              onChange={setEmail}
              disabled={isWorking}
              autoComplete="email"
            />

            {/* Password */}
            <div className="space-y-1.5">
              <PasswordField
                placeholder="Password"
                value={password}
                onChange={setPassword}
                show={showPass}
                onToggle={() => setShowPass(v => !v)}
                disabled={isWorking}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
              {/* Password strength meter (register only) */}
              <AnimatePresence>
                {mode === 'register' && password.length > 0 && (
                  <motion.div
                    key="pw-strength"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="flex items-center space-x-2 px-1">
                      <div className="flex-1 flex space-x-1">
                        {[1, 2, 3, 4, 5].map(i => (
                          <div
                            key={i}
                            className="h-1 flex-1 rounded-full transition-all duration-300"
                            style={{
                              backgroundColor: i <= pwStrength.score
                                ? pwStrength.color
                                : 'rgba(255,255,255,0.1)',
                            }}
                          />
                        ))}
                      </div>
                      <span className="text-[10px] font-medium" style={{ color: pwStrength.color }}>
                        {pwStrength.label}
                      </span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Confirm Password (register only) */}
            <AnimatePresence>
              {mode === 'register' && (
                <motion.div
                  key="confirm-field"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.22, delay: 0.05 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-1">
                    <PasswordField
                      placeholder="Konfirmasi password"
                      value={confirmPassword}
                      onChange={setConfirmPassword}
                      show={showConfirm}
                      onToggle={() => setShowConfirm(v => !v)}
                      disabled={isWorking}
                      autoComplete="new-password"
                    />
                    {/* Match indicator */}
                    {confirmPassword.length > 0 && (
                      <div className="flex items-center space-x-1.5 px-1">
                        {password === confirmPassword ? (
                          <>
                            <CheckCircle className="w-3 h-3 text-green-400" />
                            <span className="text-[10px] text-green-400">Password match</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-3 h-3 text-red-400" />
                            <span className="text-[10px] text-red-400">Password doesn't match</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* hCaptcha (register only) */}
            <AnimatePresence>
              {mode === 'register' && (
                <motion.div
                  key="captcha"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25, delay: 0.08 }}
                  className="w-full overflow-hidden"
                >
                  <div className="flex flex-col items-center space-y-2 pt-2 pb-1 w-full">
                    <div className="flex items-center space-x-1.5 text-[10px] text-[var(--app-text-secondary)] self-start">
                      <ShieldCheck className="w-3.5 h-3.5 text-brand-400" />
                      <span>Verifikasi anti-bot</span>
                    </div>
                    
                    {/* hCaptcha widget container */}
                    <div className="w-full flex justify-center items-center bg-[#0c0c0c] border border-[#2c2c2e] rounded-xl py-1.5 min-h-[82px] relative overflow-hidden">
                      {!captchaReady && (
                        <div className="absolute inset-0 flex items-center justify-center space-x-2 text-[11px] text-[var(--app-text-secondary)] z-0">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Memuat CAPTCHA...</span>
                        </div>
                      )}
                      <div className="z-10 w-full flex justify-center scale-[0.95] origin-center">
                        <div ref={captchaRef} />
                      </div>
                    </div>
                    
                    {captchaToken && (
                      <div className="flex items-center space-x-1.5 text-[11px] text-green-400 self-start">
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Verifikasi berhasil</span>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Error / Success alerts */}
            <AnimatePresence mode="wait">
              {error && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-start space-x-2 bg-red-500/10 border border-red-500/25 rounded-xl px-3 py-2.5"
                >
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-[12px] text-red-300 leading-relaxed whitespace-pre-line">{error}</p>
                </motion.div>
              )}
              {success && (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-start space-x-2 bg-green-500/10 border border-green-500/25 rounded-xl px-3 py-2.5"
                >
                  <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                  <p className="text-[12px] text-green-300 leading-relaxed whitespace-pre-line">{success}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit button */}
            <button
              type="submit"
              disabled={isWorking}
              className="w-full py-3 rounded-xl bg-brand-500 hover:bg-brand-600 active:scale-[0.98] text-white font-semibold text-[14px] transition-all duration-200 flex items-center justify-center space-x-2 shadow-lg shadow-brand-500/20 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isWorking ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{mode === 'login' ? 'Masuk...' : 'Mendaftar...'}</span>
                </>
              ) : (
                <span>{mode === 'login' ? 'Masuk' : 'Buat Akun'}</span>
              )}
            </button>

            {/* Forgot password (login only) */}
            {mode === 'login' && (
              <p className="text-center text-[11px] text-[var(--app-text-secondary)] pt-0.5">
                Lupa password?{' '}
                <button
                  type="button"
                  className="text-brand-400 hover:text-brand-300 underline transition-colors"
                  onClick={() => setSuccess(
                    '📧 Hubungi admin atau gunakan fitur "Reset Password" di website Supabase.'
                  )}
                >
                  Reset di sini
                </button>
              </p>
            )}
          </form>
        </div>

        <p className="text-center text-[10px] text-[var(--app-text-secondary)] mt-5 opacity-40">
          Music-Wails v1.0 · Powered by Supabase · hCaptcha Protected
        </p>
      </motion.div>

      <div className="flex-1" />
      </div>
    </div>
  );
}

// ── Reusable text/email input ─────────────────────────────────
function InputField({
  icon, type, placeholder, value, onChange, disabled, autoComplete,
}: {
  icon: React.ReactNode;
  type: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  autoComplete?: string;
}) {
  return (
    <div className="flex items-center bg-[#0c0c0c] border border-[#2c2c2e] focus-within:border-brand-500/50 rounded-xl px-3 py-2.5 space-x-2.5 transition-colors duration-200">
      <span className="text-[var(--app-text-secondary)] flex-shrink-0">{icon}</span>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        autoComplete={autoComplete}
        className="flex-1 bg-transparent text-[13px] text-white placeholder-[var(--app-text-secondary)] outline-none disabled:opacity-50 min-w-0"
      />
    </div>
  );
}

// ── Password field with show/hide toggle ──────────────────────
function PasswordField({
  placeholder, value, onChange, show, onToggle, disabled, autoComplete,
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  disabled?: boolean;
  autoComplete?: string;
}) {
  return (
    <div className="flex items-center bg-[#0c0c0c] border border-[#2c2c2e] focus-within:border-brand-500/50 rounded-xl px-3 py-2.5 space-x-2.5 transition-colors duration-200">
      <span className="text-[var(--app-text-secondary)] flex-shrink-0">
        <Lock className="w-4 h-4" />
      </span>
      <input
        type={show ? 'text' : 'password'}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        autoComplete={autoComplete}
        className="flex-1 bg-transparent text-[13px] text-white placeholder-[var(--app-text-secondary)] outline-none disabled:opacity-50 min-w-0"
      />
      <button
        type="button"
        onClick={onToggle}
        tabIndex={-1}
        className="text-[var(--app-text-secondary)] hover:text-white transition-colors flex-shrink-0"
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}
