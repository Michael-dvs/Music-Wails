/**
 * supabaseOps.ts — Centralized Supabase CRUD operations
 *
 * ARCHITECTURE DECISION:
 * All database write operations (favorites, play history, playlists) run
 * directly via supabase-js, NOT via Go bindings.
 *
 * WHY: The supabase-js client is already authenticated via the active session
 * managed by AuthContext. This eliminates the JWT sync race condition that
 * caused the Go-based ToggleFavorite and LogSongPlay to silently fail.
 *
 * Go bindings are ONLY used for operations requiring OS-level access:
 *   - GetStreamURLAsync (yt-dlp subprocess)
 *   - GetLyrics (LrcLib HTTP with retries)
 *   - BuildSmartQueue (Last.fm + iTunes)
 *   - SearchSongs (iTunes search proxy)
 */

import { supabase } from './supabase';
import type { FavoriteTrack, PlayHistoryEntry, Playlist, PlaylistTrack } from './supabase';

// ─────────────────────────────────────────────
//  FAVORITES
// ─────────────────────────────────────────────

/**
 * Toggles a track in user_favorites.
 * Returns `true` if now favorited, `false` if removed.
 * Throws on DB error — caller should catch and surface to UI.
 *
 * ── DEBUG MODE: Full layered logging for observability ──
 */
export async function toggleFavorite(params: {
  userId: string;
  trackId: string;
  title: string;
  artist: string;
  album?: string;
  artworkUrl?: string;
  previewUrl?: string;
}): Promise<boolean> {
  // ── LOG A: Metadata being sent ──────────────────────────────────
  console.group('[toggleFavorite] 🎵 Initiated');
  console.log('  Track ID  :', params.trackId);
  console.log('  Title     :', params.title);
  console.log('  Artist    :', params.artist);
  console.log('  Album     :', params.album ?? '(none)');
  console.log('  Artwork   :', params.artworkUrl ?? '(none)');

  // ── LOG B: Current auth session ─────────────────────────────────
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session;
  const uid = session?.user?.id ?? null;
  const accessToken = session?.access_token;
  console.log('  Session   :', session ? '✅ Active' : '❌ NULL — NOT LOGGED IN');
  console.log('  auth.uid():', uid ?? 'NULL ← RLS will BLOCK this');
  console.log('  Token (16):', accessToken ? accessToken.slice(0, 16) + '…' : 'NULL');

  if (!uid) {
    console.warn('[toggleFavorite] ⛔ Aborting — no active session. User must be logged in.');
    console.groupEnd();
    throw new Error('Anda harus login untuk menyimpan lagu.');
  }

  // ── LOG C: Check existing favorite ──────────────────────────────
  console.log('[toggleFavorite] Checking existing row for track_id:', params.trackId);
  const { data: existing, error: checkErr } = await supabase
    .from('user_favorites')
    .select('id')
    .eq('itunes_track_id', params.trackId)
    .maybeSingle();

  console.log('  CHECK response.data :', existing);
  console.log('  CHECK response.error:', checkErr);

  if (checkErr) {
    console.error('[toggleFavorite] ❌ CHECK query failed:', checkErr.code, checkErr.message, checkErr.details);
    console.groupEnd();
    throw new Error(`Check gagal: ${checkErr.message}`);
  }

  // ── 2a. Already exists → DELETE ─────────────────────────────────
  if (existing) {
    console.log('[toggleFavorite] Track IS favorited → DELETE row id:', existing.id);
    const { error: delErr, status: delStatus } = await supabase
      .from('user_favorites')
      .delete()
      .eq('itunes_track_id', params.trackId);

    console.log('  DELETE status:', delStatus);
    console.log('  DELETE error :', delErr);

    if (delErr) {
      console.error('[toggleFavorite] ❌ DELETE failed:', delErr.code, delErr.message, delErr.details);
      console.groupEnd();
      throw new Error(`Hapus gagal: ${delErr.message}`);
    }
    console.log('[toggleFavorite] ✅ Removed from favorites');
    console.groupEnd();
    return false;
  }

  // ── 2b. Does not exist → INSERT ─────────────────────────────────
  const payload = {
    user_id: params.userId,
    itunes_track_id: params.trackId,
    title: params.title,
    artist: params.artist,
    album: params.album ?? '',
    artwork_url: params.artworkUrl ?? '',
    preview_url: params.previewUrl ?? '',
  };
  console.log('[toggleFavorite] Track is NOT favorited → INSERT payload:', payload);

  const { error: insErr, status: insStatus } = await supabase
    .from('user_favorites')
    .insert(payload);

  console.log('  INSERT status:', insStatus);
  console.log('  INSERT error :', insErr);

  if (insErr) {
    console.error('[toggleFavorite] ❌ INSERT failed:', insErr.code, insErr.message, insErr.details, insErr.hint);
    console.groupEnd();
    throw new Error(`Insert gagal: ${insErr.message}`);
  }

  console.log('[toggleFavorite] ✅ Added to favorites');
  console.groupEnd();
  return true;
}


/**
 * Checks if a track is currently favorited.
 * Returns false on error (non-blocking).
 */
export async function isFavoritedRemote(trackId: string): Promise<boolean> {
  const { data } = await supabase
    .from('user_favorites')
    .select('id')
    .eq('itunes_track_id', trackId)
    .maybeSingle();
  return !!data;
}

/**
 * Returns all favorited tracks, ordered by added_at DESC.
 */
export async function getFavorites(): Promise<FavoriteTrack[]> {
  const { data, error } = await supabase
    .from('user_favorites')
    .select('*')
    .order('added_at', { ascending: false });

  if (error) {
    console.error('[supabaseOps] getFavorites failed:', error.message);
    return [];
  }
  return (data as FavoriteTrack[]) ?? [];
}

// ─────────────────────────────────────────────
//  PLAY HISTORY
// ─────────────────────────────────────────────

/**
 * Logs a song play to play_history. Fire-and-forget — does NOT throw.
 * Call this right after starting playback.
 */
export async function logSongPlay(params: {
  trackId: string;
  title: string;
  artist: string;
  album?: string;
  coverUrl?: string;
}): Promise<void> {
  console.log('[supabaseOps] logSongPlay →', params.title, 'by', params.artist);

  const { error } = await supabase.from('play_history').insert({
    track_id: params.trackId,
    title: params.title,
    artist: params.artist,
    album: params.album ?? '',
    cover_url: params.coverUrl ?? '',
  });

  if (error) {
    // Non-fatal — log but don't throw so playback is never affected
    console.warn('[supabaseOps] logSongPlay failed (non-fatal):', error.message);
  } else {
    console.log('[supabaseOps] logSongPlay ✅ recorded');
  }
}

/**
 * Returns the 20 most recently played tracks.
 */
export async function getPlayHistory(): Promise<PlayHistoryEntry[]> {
  const { data, error } = await supabase
    .from('play_history')
    .select('*')
    .order('played_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('[supabaseOps] getPlayHistory failed:', error.message);
    return [];
  }
  return (data as PlayHistoryEntry[]) ?? [];
}

// ─────────────────────────────────────────────
//  PLAYLISTS
// ─────────────────────────────────────────────

/**
 * Creates a new playlist. Returns the created playlist row.
 * Throws on error.
 */
export async function createPlaylist(userId: string, name: string, coverUrl?: string): Promise<Playlist> {
  if (!name.trim()) throw new Error('Playlist name cannot be empty');
  if (!userId) throw new Error('User ID is required');

  console.log('[supabaseOps] createPlaylist →', name);

  const { data, error } = await supabase
    .from('playlists')
    .insert({ user_id: userId, name: name.trim(), cover_url: coverUrl ?? null })
    .select()
    .single();

  if (error) {
    console.error('[supabaseOps] createPlaylist failed:', error.message);
    throw new Error(error.message);
  }
  console.log('[supabaseOps] createPlaylist ✅ created:', (data as Playlist).id);
  return data as Playlist;
}

/**
 * Returns all playlists for the current user, newest first.
 */
export async function getPlaylists(): Promise<Playlist[]> {
  const { data, error } = await supabase
    .from('playlists')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[supabaseOps] getPlaylists failed:', error.message);
    return [];
  }
  return (data as Playlist[]) ?? [];
}

/**
 * Fetch a single playlist by ID.
 */
export async function getPlaylist(playlistId: string): Promise<Playlist | null> {
  const { data, error } = await supabase
    .from('playlists')
    .select('*')
    .eq('id', playlistId)
    .single();

  if (error) {
    console.error('[supabaseOps] getPlaylist failed:', error.message);
    return null;
  }
  return data as Playlist;
}

/**
 * Adds a track to a playlist. Silently ignores duplicate (track already in playlist).
 * Throws on other errors.
 */
export async function addTrackToPlaylist(params: {
  playlistId: string;
  trackId: string;
  title: string;
  artist: string;
  album?: string;
  coverUrl?: string;
  duration?: number;
}): Promise<void> {
  console.log('[supabaseOps] addTrackToPlaylist →', params.title, '→ playlist', params.playlistId);

  const { error } = await supabase.from('playlist_tracks').upsert(
    {
      playlist_id: params.playlistId,
      track_id: params.trackId,
      title: params.title,
      artist: params.artist,
      album: params.album ?? '',
      cover_url: params.coverUrl ?? '',
      duration: params.duration ?? null,
    },
    { onConflict: 'playlist_id,track_id', ignoreDuplicates: true }
  );

  if (error) {
    console.error('[supabaseOps] addTrackToPlaylist failed:', error.message);
    throw new Error(error.message);
  }
  console.log('[supabaseOps] addTrackToPlaylist ✅');
}

/**
 * Returns all tracks in a playlist, ordered by order_index ASC (nulls last) and added_at ASC.
 */
export async function getPlaylistTracks(playlistId: string): Promise<PlaylistTrack[]> {
  const { data, error } = await supabase
    .from('playlist_tracks')
    .select('*')
    .eq('playlist_id', playlistId)
    .order('order_index', { ascending: true });

  if (error) {
    console.error('[supabaseOps] getPlaylistTracks failed:', error.message);
    return [];
  }
  return (data as PlaylistTrack[]) ?? [];
}

/**
 * Updates the order index for multiple playlist tracks in a batch.
 */
export async function updatePlaylistTrackOrder(
  playlistId: string,
  trackOrders: { id: string; order_index: number }[]
): Promise<void> {
  console.log('[supabaseOps] updatePlaylistTrackOrder for playlist', playlistId, trackOrders.length, 'tracks');
  
  const promises = trackOrders.map(item => {
    console.log('[supabaseOps] Attempting update:', { playlistId, relationId: item.id, order_index: item.order_index });
    return supabase
      .from('playlist_tracks')
      .update({ order_index: item.order_index })
      .eq('id', item.id)
      .select();
  });

  const results = await Promise.all(promises);
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const item = trackOrders[i];
    if (r.error) {
      console.error('[supabaseOps] updatePlaylistTrackOrder failed item:', r.error.message);
      throw new Error(r.error.message);
    }
    if (!r.data || r.data.length === 0) {
      console.error('[supabaseOps] updatePlaylistTrackOrder silent failure for relation ID:', item.id);
      throw new Error(`Silent failure: Track relation ID ${item.id} not found or not updated in playlist ${playlistId}`);
    }
  }
  console.log('[supabaseOps] updatePlaylistTrackOrder ✅');
}

/**
 * Deletes a playlist and all its tracks (CASCADE handled by DB).
 */
export async function deletePlaylist(playlistId: string): Promise<void> {
  console.log('[supabaseOps] deletePlaylist →', playlistId);
  const { error } = await supabase.from('playlists').delete().eq('id', playlistId);
  if (error) {
    console.error('[supabaseOps] deletePlaylist failed:', error.message);
    throw new Error(error.message);
  }
  console.log('[supabaseOps] deletePlaylist ✅');
}

/**
 * Removes a single track from a playlist.
 */
export async function removeTrackFromPlaylist(
  playlistId: string,
  trackId: string
): Promise<void> {
  const { error } = await supabase
    .from('playlist_tracks')
    .delete()
    .eq('playlist_id', playlistId)
    .eq('track_id', trackId);

  if (error) {
    console.error('[supabaseOps] removeTrackFromPlaylist failed:', error.message);
    throw new Error(error.message);
  }
}

/**
 * Updates the cover_url of a playlist.
 */
export async function updatePlaylistCover(
  playlistId: string,
  coverUrl: string
): Promise<void> {
  console.log('[supabaseOps] updatePlaylistCover →', playlistId, '→', coverUrl);
  const { error } = await supabase
    .from('playlists')
    .update({ cover_url: coverUrl })
    .eq('id', playlistId);

  if (error) {
    console.error('[supabaseOps] updatePlaylistCover failed:', error.message);
    throw new Error(error.message);
  }
  console.log('[supabaseOps] updatePlaylistCover ✅ updated');
}

/**
 * Updates the name of a specific playlist.
 */
export async function updatePlaylistName(playlistId: string, newName: string): Promise<void> {
  console.log('[supabaseOps] updatePlaylistName →', playlistId, newName);

  const { error } = await supabase
    .from('playlists')
    .update({ name: newName })
    .eq('id', playlistId);

  if (error) {
    console.error('[supabaseOps] updatePlaylistName failed:', error.message);
    throw new Error(error.message);
  }
  console.log('[supabaseOps] updatePlaylistName ✅ updated');
}

// ─────────────────────────────────────────────
//  IMPORT FROM LINK (basic metadata extraction)

// ─────────────────────────────────────────────

/**
 * Imports tracks from a plain URL or Spotify/YouTube link.
 * Currently supports:
 *   - iTunes/Apple Music search URL
 *   - Raw search query (fallback: iTunes search by text)
 *
 * Returns the list of tracks that were added.
 */
export async function importTracksFromLink(params: {
  playlistId: string;
  url: string;
}): Promise<{ added: number; errors: string[] }> {
  console.log('[supabaseOps] importTracksFromLink →', params.url);
  const errors: string[] = [];
  let added = 0;

  // Extract search term from URL or use as-is
  let searchTerm = params.url.trim();

  // Try to extract artist/song from common URL patterns
  try {
    const urlObj = new URL(searchTerm);
    // Apple Music: music.apple.com/…/album/…
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    if (pathParts.length >= 2) {
      searchTerm = pathParts[pathParts.length - 1]
        .replace(/-/g, ' ')
        .replace(/^\d+$/, '') // strip pure numeric IDs
        .trim();
    }
  } catch {
    // Not a URL — use raw text as search term
  }

  if (!searchTerm) {
    return { added: 0, errors: ['Could not extract search term from URL'] };
  }

  // Search iTunes
  try {
    const resp = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(searchTerm)}&entity=song&limit=5&country=id`
    );
    const data = await resp.json();
    const results = data?.results ?? [];

    for (const item of results) {
      try {
        await addTrackToPlaylist({
          playlistId: params.playlistId,
          trackId: String(item.trackId),
          title: item.trackName,
          artist: item.artistName,
          album: item.collectionName,
          coverUrl: item.artworkUrl100?.replace('100x100bb', '300x300bb') ?? '',
        });
        added++;
      } catch (err: any) {
        errors.push(`${item.trackName}: ${err.message}`);
      }
    }
  } catch (err: any) {
    errors.push(`iTunes search failed: ${err.message}`);
  }

  console.log(`[supabaseOps] importTracksFromLink ✅ added=${added} errors=${errors.length}`);
  return { added, errors };
}
