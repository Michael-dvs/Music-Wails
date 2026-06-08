import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Music2, Play, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useContextMenu } from '../contexts/ContextMenuContext';
import { supabase } from '../lib/supabase';
import type { FavoriteTrack } from '../lib/supabase';

interface LikedSongsPageProps {
  onPlaySong?: (song: any, queue: any[], source?: 'playlist' | 'search') => void;
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function LikedSongsPage({ onPlaySong }: LikedSongsPageProps) {
  const { user } = useAuth();
  const { openContextMenu } = useContextMenu();
  const [tracks, setTracks] = useState<FavoriteTrack[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setIsLoading(true);
    setError(null);

    supabase
      .from('user_favorites')
      .select('*')
      .order('added_at', { ascending: false })
      .then(({ data, error: err }) => {
        if (err) setError(err.message);
        else setTracks((data as FavoriteTrack[]) ?? []);
        setIsLoading(false);
      });
  }, [user]);

  // Convert FavoriteTrack → Song shape for onPlaySong
  const toSong = (t: FavoriteTrack) => ({
    id: t.itunes_track_id,
    title: t.title,
    artist: t.artist,
    album: t.album ?? '',
    genre: '',
    coverArt: t.artwork_url ?? '',
    streamUrl: t.preview_url ?? '',
    duration: 0,
    isRecommended: false,
  });

  const handlePlay = (track: FavoriteTrack) => {
    if (!onPlaySong) return;
    const allSongs = tracks.map(toSong);
    const clicked = toSong(track);
    onPlaySong(clicked, allSongs, 'playlist');
  };

  return (
    <motion.div
      key="liked-songs"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="w-full h-full flex flex-col overflow-hidden bg-[var(--app-bg)]"
    >
      {/* ── Header ── */}
      <div className="flex-shrink-0 px-8 pt-8 pb-6">
        <div className="flex items-end gap-5">
          <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-brand-500 to-pink-600 flex items-center justify-center shadow-xl shadow-brand-500/30 flex-shrink-0">
            <Heart className="w-10 h-10 text-white fill-white" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1">Playlist</p>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Liked Songs</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {isLoading ? '...' : `${tracks.length} lagu`}
            </p>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-16 text-red-400 text-sm">{error}</div>
        ) : tracks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Heart className="w-14 h-14 text-gray-300 dark:text-gray-700" />
            <p className="text-gray-500 dark:text-gray-400 font-medium">Belum ada lagu yang disukai.</p>
            <p className="text-sm text-gray-400 dark:text-gray-600">Tekan ikon ♥ di player bar untuk menyimpan lagu.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {/* Column headers */}
            <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-4 px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-600 border-b border-gray-200 dark:border-white/5 mb-1">
              <span className="w-6 text-center">#</span>
              <span>Judul</span>
              <span>Artis</span>
              <span>Tanggal</span>
            </div>

            <AnimatePresence>
              {tracks.map((track, idx) => (
                <motion.div
                  key={track.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2, delay: idx * 0.03 }}
                  onMouseEnter={() => setHoveredId(track.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => handlePlay(track)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    openContextMenu(e.clientX, e.clientY, {
                      id: track.itunes_track_id,
                      title: track.title,
                      artist: track.artist,
                      album: track.album ?? '',
                      coverArt: track.artwork_url ?? '',
                      previewUrl: track.preview_url ?? '',
                    });
                  }}
                  className="grid grid-cols-[auto_1fr_1fr_auto] gap-4 px-4 py-2.5 rounded-xl items-center cursor-pointer
                    hover:bg-gray-100 dark:hover:bg-white/5 transition-all duration-150 group"
                >
                  {/* Index / Play */}
                  <div className="w-6 text-center flex items-center justify-center">
                    {hoveredId === track.id ? (
                      <Play className="w-4 h-4 text-brand-500 fill-brand-500" />
                    ) : (
                      <span className="text-[13px] text-gray-400 dark:text-gray-600 tabular-nums">{idx + 1}</span>
                    )}
                  </div>

                  {/* Cover + Title */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 bg-gray-200 dark:bg-white/10">
                      {track.artwork_url ? (
                        <img src={track.artwork_url} alt={track.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Music2 className="w-4 h-4 text-gray-400" />
                        </div>
                      )}
                    </div>
                    <p className="text-[13px] font-medium text-gray-900 dark:text-white truncate leading-tight group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                      {track.title}
                    </p>
                  </div>

                  {/* Artist */}
                  <p className="text-[13px] text-gray-500 dark:text-gray-400 truncate">{track.artist}</p>

                  {/* Date */}
                  <p className="text-[12px] text-gray-400 dark:text-gray-600 whitespace-nowrap tabular-nums">
                    {new Date(track.added_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </p>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </motion.div>
  );
}
