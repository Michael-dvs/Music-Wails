import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ListMusic, Play, Loader2, Music2, RefreshCw, AlertCircle, RotateCcw } from 'lucide-react';
import { supabase, DbPlaylist, DbPlaylistTrack } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { main } from '../../wailsjs/go/models';
import PlaylistDetail from './PlaylistDetail';

interface PlaylistsProps {
  onPlaySong: (song: main.Song, queue: main.Song[], source: 'playlist' | 'search') => void;
  onPlayNext?: (song: main.Song) => void;
  onAddToQueue?: (song: main.Song) => void;
  onOpenAddToPlaylist?: (song: main.Song) => void;
  selectedPlaylistId?: string | null;
  onClearSelectedPlaylist?: () => void;
}

export default function Playlists({
  onPlaySong,
  onPlayNext,
  onAddToQueue,
  onOpenAddToPlaylist,
  selectedPlaylistId,
  onClearSelectedPlaylist,
}: PlaylistsProps) {
  const { user, refreshPlaylists } = useAuth();
  const [playlists, setPlaylists] = useState<DbPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState<DbPlaylist | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<main.Song[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [trackError, setTrackError] = useState<string | null>(null);

  const fetchPlaylists = useCallback(async () => {
    if (!user) {
      setPlaylists([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // 1. Fetch user playlists
      const { data: plData, error: plErr } = await supabase
        .from('playlists')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (plErr) throw plErr;

      // 2. Fetch track counts for these playlists
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
    } catch (err: any) {
      console.error('[Playlists] Error fetching playlists:', err);
      setError(err?.message || 'Gagal memuat daftar playlist.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchPlaylists();
  }, [fetchPlaylists]);

  const handleSelectPlaylist = useCallback(async (playlist: DbPlaylist) => {
    setSelectedPlaylist(playlist);
    setLoadingTracks(true);
    setTrackError(null);

    try {
      const { data, error: trError } = await supabase
        .from('playlist_tracks')
        .select('*')
        .eq('playlist_id', playlist.id)
        .order('order_index', { ascending: true });

      if (trError) throw trError;

      const songs: main.Song[] = (data || []).map((t: DbPlaylistTrack) => {
        const s = new main.Song();
        s.id = t.track_id || t.id;
        s.title = t.title || 'Untitled';
        s.artist = t.artist || 'Unknown Artist';
        s.album = t.album || '';
        s.genre = '';
        s.coverArt = t.cover_url || '';
        s.streamUrl = '';
        s.duration = t.duration ? t.duration * 1000 : 0;
        s.isRecommended = false;
        return s;
      });

      setPlaylistTracks(songs);
    } catch (err: any) {
      console.error('[Playlists] Error fetching tracks:', err);
      setTrackError(err?.message || 'Gagal memuat lagu di playlist.');
      setPlaylistTracks([]);
    } finally {
      setLoadingTracks(false);
    }
  }, []);

  useEffect(() => {
    if (selectedPlaylistId) {
      const found = playlists.find(p => p.id === selectedPlaylistId);
      if (found) {
        handleSelectPlaylist(found);
      } else {
        supabase.from('playlists').select('*').eq('id', selectedPlaylistId).single().then(({ data }) => {
          if (data) handleSelectPlaylist(data as DbPlaylist);
        });
      }
    } else if (selectedPlaylistId === null) {
      setSelectedPlaylist(null);
      setPlaylistTracks([]);
    }
  }, [selectedPlaylistId, playlists, handleSelectPlaylist]);

  if (selectedPlaylist) {
    if (loadingTracks) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center space-y-4 text-gray-500">
          <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
          <p className="text-sm font-medium">Memuat lagu di "{selectedPlaylist.name}"...</p>
          <button
            type="button"
            onClick={() => {
              setSelectedPlaylist(null);
              setLoadingTracks(false);
            }}
            className="px-4 py-1.5 rounded-full border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/10 text-xs font-semibold text-gray-700 dark:text-gray-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            Batal
          </button>
        </div>
      );
    }

    return (
      <AnimatePresence mode="wait">
        <PlaylistDetail
          key={selectedPlaylist.id}
          songs={playlistTracks}
          playlistName={selectedPlaylist.name}
          playlistColor="#FA243C"
          coverUrl={selectedPlaylist.cover_url || undefined}
          onPlaySong={onPlaySong}
          onBack={() => {
            setSelectedPlaylist(null);
            setPlaylistTracks([]);
            if (onClearSelectedPlaylist) onClearSelectedPlaylist();
          }}
          onPlayNext={onPlayNext}
          onAddToQueue={onAddToQueue}
          onOpenAddToPlaylist={onOpenAddToPlaylist}
        />
      </AnimatePresence>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="w-full h-full flex flex-col overflow-y-auto px-8 py-8 pb-32 no-scrollbar text-gray-900 dark:text-white"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center text-brand-500">
            <ListMusic className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Playlists</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {playlists.length} {playlists.length === 1 ? 'playlist' : 'playlists'} tersimpan di akun Anda
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={fetchPlaylists}
          disabled={loading}
          className="p-2.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          title="Segarkan Playlist"
          aria-label="Segarkan daftar playlist"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Error alert */}
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={fetchPlaylists}
            className="flex items-center space-x-1 px-3 py-1 rounded bg-red-500 text-white text-xs font-semibold hover:bg-red-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Coba Lagi</span>
          </button>
        </div>
      )}

      {/* Grid of Playlists */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex flex-col space-y-3">
              <div className="aspect-square rounded-2xl bg-black/5 dark:bg-white/5 animate-pulse" />
              <div className="h-4 rounded bg-black/5 dark:bg-white/5 animate-pulse w-3/4" />
              <div className="h-3 rounded bg-black/5 dark:bg-white/5 animate-pulse w-1/2" />
            </div>
          ))}
        </div>
      ) : playlists.length === 0 && !error ? (
        <div className="flex flex-col items-center justify-center h-80 text-gray-500 space-y-3">
          <Music2 className="w-12 h-12 opacity-30" />
          <p className="text-base font-semibold">Belum Ada Playlist Tersimpan</p>
          <p className="text-sm text-gray-400 max-w-sm text-center">
            Playlist yang Anda simpan di akun ini akan otomatis muncul di sini.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
          {playlists.map((pl, idx) => (
            <motion.div
              key={pl.id}
              role="button"
              tabIndex={0}
              aria-label={`Buka playlist ${pl.name}`}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(idx, 8) * 0.03, duration: 0.25 }}
              onClick={() => handleSelectPlaylist(pl)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSelectPlaylist(pl);
                }
              }}
              className="group cursor-pointer flex flex-col space-y-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-2xl p-1"
            >
              {/* Cover with hover play button */}
              <div className="relative aspect-square rounded-2xl overflow-hidden shadow-lg border border-black/5 dark:border-white/10 bg-black/5 dark:bg-white/5 group-hover:shadow-2xl transition-all duration-300 group-hover:scale-[1.03]">
                {pl.cover_url ? (
                  <img
                    src={pl.cover_url}
                    alt=""
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                    <Music2 className="w-12 h-12 opacity-40" />
                  </div>
                )}

                {/* Hover overlay with Play button */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-brand-500 text-white flex items-center justify-center shadow-xl transform scale-90 group-hover:scale-100 transition-transform duration-300">
                    <Play className="w-6 h-6 fill-white ml-0.5" />
                  </div>
                </div>
              </div>

              {/* Info */}
              <div className="px-0.5 min-w-0">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate group-hover:text-brand-500 dark:group-hover:text-brand-400 transition-colors">
                  {pl.name}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {pl.track_count ?? 0} {pl.track_count === 1 ? 'lagu' : 'lagu'}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
