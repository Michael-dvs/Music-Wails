import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || supabaseUrl === 'YOUR_SUPABASE') {
  console.error(
    '[Supabase] ⚠️  VITE_SUPABASE_URL belum diset!\n' +
    'Edit file frontend/.env dan isi VITE_SUPABASE_URL dengan URL project Supabase Anda.\n' +
    'Contoh: https://abcdefghijklmnop.supabase.co'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnon, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false, // desktop app — no URL-based auth
  },
});

// ── Database Types ────────────────────────────────────────────
export interface UserProfile {
  id: string;
  username: string | null;
  avatar_url: string | null;
  role: 'user' | 'admin';
  youtube_api_key_1: string | null;
  youtube_api_key_2: string | null;
  created_at: string;
}

export interface FavoriteTrack {
  id: string;
  user_id: string;
  itunes_track_id: string;
  title: string;
  artist: string;
  album: string | null;
  artwork_url: string | null;
  preview_url: string | null;
  added_at: string;
}

export interface HomeSettingRow {
  id: string;
  section_title: string;
  itunes_id: string | null;
  category: string;
  display_order: number;
  is_active: boolean;
}

export interface PlayHistoryEntry {
  id: string;
  user_id: string;
  track_id: string;
  title: string;
  artist: string;
  album: string | null;
  cover_url: string | null;
  played_at: string;
}

export interface Playlist {
  id: string;
  user_id: string;
  name: string;
  cover_url: string | null;
  created_at: string;
}

export interface PlaylistTrack {
  id: string;
  playlist_id: string;
  track_id: string;
  title: string;
  artist: string;
  album: string | null;
  cover_url: string | null;
  added_at: string;
  duration?: number | null; // duration in ms
  order_index?: number | null; // drag and drop sorting order
}
