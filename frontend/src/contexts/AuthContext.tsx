import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase, UserProfile, FavoriteTrack, DbPlaylist } from '../lib/supabase';
import { EventsOn, EventsOff } from '../../wailsjs/runtime/runtime';

// ── Error message translator ────────────────────────────────────
// Maps Supabase raw error messages to friendly Indonesian messages
export function translateAuthError(raw: string): string {
  const msg = raw.toLowerCase();

  if (msg.includes('invalid login credentials') || msg.includes('invalid credentials'))
    return '❌ Email atau password salah. Periksa kembali dan coba lagi.';
  if (msg.includes('email not confirmed'))
    return '📧 Email belum dikonfirmasi. Cek kotak masuk Anda dan klik link verifikasi.';
  if (msg.includes('user already registered') || msg.includes('already been registered'))
    return '⚠️ Email ini sudah terdaftar. Silakan masuk atau gunakan email lain.';
  if (msg.includes('password should be at least'))
    return '🔑 Password terlalu lemah. Gunakan minimal 6 karakter.';
  if (msg.includes('unable to validate email address'))
    return '📧 Format email tidak valid. Contoh: nama@gmail.com';
  if (msg.includes('email address') && msg.includes('invalid'))
    return '📧 Alamat email tidak valid.';
  if (msg.includes('signup is disabled'))
    return '🚫 Pendaftaran akun baru sedang dinonaktifkan oleh admin.';
  if (msg.includes('rate limit') || msg.includes('too many requests'))
    return '⏳ Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.';
  if (msg.includes('network') || msg.includes('fetch'))
    return '🌐 Tidak dapat terhubung ke server. Periksa koneksi internet Anda.';
  if (msg.includes('user not found') || msg.includes('no user found'))
    return '❌ Akun dengan email ini tidak ditemukan. Silakan daftar terlebih dahulu.';
  if (msg.includes('supabase_url not configured') || msg.includes('not configured'))
    return '⚙️ Konfigurasi server belum lengkap. Hubungi administrator.';

  // Fallback: show translated version or raw
  return `❌ ${raw}`;
}

// ── Types ─────────────────────────────────────────────────────
interface AuthState {
  user:       User | null;
  session:    Session | null;
  profile:    UserProfile | null;
  favorites:  FavoriteTrack[];
  playlists:  DbPlaylist[];
  isLoading:  boolean;
  isAdmin:    boolean;
}

interface AuthActions {
  signIn:           (email: string, password: string) => Promise<string | null>;
  signUp:           (email: string, password: string, username: string) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  signInWithGoogle: () => Promise<string | null>;
  signOut:          () => Promise<void>;
  addFavorite:      (track: Omit<FavoriteTrack, 'id' | 'user_id' | 'added_at'>) => Promise<void>;
  removeFavorite:   (itunesTrackId: string) => Promise<void>;
  isFavorited:      (itunesTrackId: string) => boolean;
  refreshFavorites: () => Promise<void>;
  refreshPlaylists: () => Promise<void>;
  refreshProfile:   () => Promise<void>;
}

type AuthContextType = AuthState & AuthActions;

// ── Context ───────────────────────────────────────────────────
const AuthContext = createContext<AuthContextType | null>(null);

// ── Provider ──────────────────────────────────────────────────
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,      setUser]      = useState<User | null>(null);
  const [session,   setSession]   = useState<Session | null>(null);
  const [profile,   setProfile]   = useState<UserProfile | null>(null);
  const [favorites, setFavorites] = useState<FavoriteTrack[]>([]);
  const [playlists, setPlaylists] = useState<DbPlaylist[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // ── Fetch profile from 'profiles' table ──
  const fetchProfile = useCallback(async (userId: string) => {
    try {
      console.log('[Auth] Fetching profile for user:', userId);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (error) {
        console.warn('[Auth] Could not fetch profile from Supabase:', error.message);
      } else if (data) {
        console.log('[Auth] Profile loaded successfully:', data.username);
        setProfile(data as UserProfile);
      }
    } catch (err) {
      console.error('[Auth] Exception fetching profile:', err);
    }
  }, []);

  // ── Fetch favorites ──
  const refreshFavorites = useCallback(async () => {
    try {
      console.log('[Auth] Fetching favorites from Supabase...');
      const { data, error } = await supabase
        .from('user_favorites')
        .select('*')
        .order('added_at', { ascending: false });
      if (error) {
        console.warn('[Auth] Could not fetch favorites:', error.message);
      } else {
        console.log('[Auth] Favorites loaded:', data?.length ?? 0);
        setFavorites((data as FavoriteTrack[]) ?? []);
      }
    } catch (err) {
      console.error('[Auth] Exception fetching favorites:', err);
    }
  }, []);

  // ── Fetch user playlists ──
  const refreshPlaylists = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const currentUserId = session?.user?.id;
      if (!currentUserId) {
        setPlaylists([]);
        return;
      }
      const { data: plData, error: plErr } = await supabase
        .from('playlists')
        .select('*')
        .eq('user_id', currentUserId)
        .order('created_at', { ascending: false });

      if (plErr) {
        console.warn('[Auth] Could not fetch playlists:', plErr.message);
        return;
      }

      const { data: trackData, error: trErr } = await supabase
        .from('playlist_tracks')
        .select('playlist_id');

      const countMap: Record<string, number> = {};
      if (!trErr && trackData) {
        for (const row of trackData) {
          countMap[row.playlist_id] = (countMap[row.playlist_id] || 0) + 1;
        }
      }

      const enriched: DbPlaylist[] = (plData || []).map(p => ({
        ...p,
        track_count: countMap[p.id] || 0,
      }));

      setPlaylists(enriched);
    } catch (err) {
      console.error('[Auth] Exception fetching playlists:', err);
    }
  }, []);

  // ── Initialize session on mount ──
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
        refreshFavorites();
        refreshPlaylists();
      }
      setIsLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
        refreshFavorites();
        refreshPlaylists();
      } else {
        setProfile(null);
        setFavorites([]);
        setPlaylists([]);
      }
    });

    // ── Wails events from Go OAuth callback server ──────────────
    // Fires when StartGoogleLogin() captures the tokens from localhost:54321
    const unlistenSuccess = EventsOn('login-success', async (raw: any) => {
      console.log('[Auth] login-success event received:', raw);
      try {
        let data = raw;
        if (typeof raw === 'string') {
          try {
            data = JSON.parse(raw);
          } catch (_) {}
        }

        const accessToken = data?.access_token;
        const refreshToken = data?.refresh_token;

        if (!accessToken) {
          console.error('[Auth] access_token missing in login-success payload:', raw);
          return;
        }

        const { data: sessionData, error } = await supabase.auth.setSession({
          access_token:  accessToken,
          refresh_token: refreshToken || '',
        });

        if (error) {
          console.error('[Auth] setSession failed:', error.message);
        } else if (sessionData?.session) {
          console.log('[Auth] Session established successfully for user:', sessionData.session.user.id);
          // Instant state update for UX
          setSession(sessionData.session);
          setUser(sessionData.session.user);
          setIsLoading(false);
          fetchProfile(sessionData.session.user.id);
          refreshFavorites();
        }
      } catch (e) {
        console.error('[Auth] setSession exception:', e);
      }
    });

    const unlistenError = EventsOn('auth:google:error', (errorMsg: string) => {
      console.error('[Auth] Google login error from Go:', errorMsg);
      // AuthContext doesn't hold an error state, but LoginPage listens too
    });

    return () => {
      listener.subscription.unsubscribe();
      if (typeof unlistenSuccess === 'function') unlistenSuccess();
      if (typeof unlistenError   === 'function') unlistenError();
    };
  }, [fetchProfile, refreshFavorites]);

  // ── Sign In (email + password) ──
  const signIn = useCallback(async (email: string, password: string): Promise<string | null> => {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) return translateAuthError(error.message);
    if (data?.session) {
      setSession(data.session);
      setUser(data.session.user);
      await fetchProfile(data.session.user.id);
      await refreshFavorites();
    }
    return null;
  }, [fetchProfile, refreshFavorites]);

  // ── Sign Up ──
  // Returns { error, needsConfirmation }
  // needsConfirmation = true when Supabase sends a confirmation email
  const signUp = useCallback(async (
    email: string,
    password: string,
    username: string
  ): Promise<{ error: string | null; needsConfirmation: boolean }> => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { username },
        // emailRedirectTo not needed for desktop apps
      },
    });

    if (error) {
      return { error: translateAuthError(error.message), needsConfirmation: false };
    }

    // If identities is empty, the email was already registered
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      return {
        error: translateAuthError('user already registered'),
        needsConfirmation: false,
      };
    }

    // Check if email confirmation is required
    // (session will be null if confirmation is needed)
    const needsConfirmation = !data.session;

    return { error: null, needsConfirmation };
  }, []);

  // ── Sign In with Google OAuth ──
  const signInWithGoogle = useCallback(async (): Promise<string | null> => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // For desktop Wails apps, we open browser and handle redirect
        skipBrowserRedirect: false,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });
    if (error) return translateAuthError(error.message);
    return null;
  }, []);

  // ── Sign Out ──
  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setFavorites([]);
    setPlaylists([]);
  }, []);

  // ── Add Favorite ──
  const addFavorite = useCallback(async (track: Omit<FavoriteTrack, 'id' | 'user_id' | 'added_at'>) => {
    if (!user) return;
    const { error } = await supabase.from('user_favorites').upsert({
      user_id: user.id,
      ...track,
    });
    if (!error) await refreshFavorites();
  }, [user, refreshFavorites]);

  // ── Remove Favorite ──
  const removeFavorite = useCallback(async (itunesTrackId: string) => {
    if (!user) return;
    await supabase
      .from('user_favorites')
      .delete()
      .eq('user_id', user.id)
      .eq('itunes_track_id', itunesTrackId);
    await refreshFavorites();
  }, [user, refreshFavorites]);

  // ── Check Favorited ──
  const isFavorited = useCallback((itunesTrackId: string): boolean => {
    return favorites.some(f => f.itunes_track_id === itunesTrackId);
  }, [favorites]);

  const value: AuthContextType = {
    user, session, profile, favorites, playlists, isLoading,
    isAdmin: profile?.role === 'admin',
    signIn, signUp, signInWithGoogle, signOut,
    addFavorite, removeFavorite, isFavorited, refreshFavorites, refreshPlaylists,
    refreshProfile: useCallback(async () => {
      if (session?.user?.id) await fetchProfile(session.user.id);
    }, [session, fetchProfile]),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ── Hook ──────────────────────────────────────────────────────
export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
