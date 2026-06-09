import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Music2, Play, Loader2 } from 'lucide-react';
import { GetRecentlyPlayed } from '../../wailsjs/go/main/App';
import type { main } from '../../wailsjs/go/models';
import { useTranslation } from 'react-i18next';

interface RecentlyPlayedPageProps {
  onPlaySong?: (song: any, queue: any[], source?: 'playlist' | 'search') => void;
}

// Type alias for the Go struct
type RecentlyPlayedEntry = main.RecentlyPlayedEntry;

function timeAgo(dateStr: string, t: any): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t('history.justNow');
  if (mins < 60) return t('history.minutesAgo', { count: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t('history.hoursAgo', { count: hrs });
  const days = Math.floor(hrs / 24);
  return t('history.daysAgo', { count: days });
}

export default function RecentlyPlayedPage({ onPlaySong }: RecentlyPlayedPageProps) {
  const { t } = useTranslation();
  const [tracks, setTracks] = useState<RecentlyPlayedEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setError(null);

    // Read from local recently_played.json via Go backend — no Supabase needed
    GetRecentlyPlayed()
      .then((data) => setTracks(data ?? []))
      .catch((err) => {
        console.error('[RecentlyPlayed] GetRecentlyPlayed failed:', err);
        setError(err?.toString() ?? 'Gagal memuat riwayat');
      })
      .finally(() => setIsLoading(false));
  }, []);

  const toSong = (t: RecentlyPlayedEntry) => ({
    id: t.track_id,
    title: t.title,
    artist: t.artist,
    album: t.album ?? '',
    genre: '',
    coverArt: t.cover_url ?? '',
    streamUrl: '',
    duration: 0,
    isRecommended: false,
  });

  const handlePlay = (track: RecentlyPlayedEntry) => {
    if (!onPlaySong) return;
    onPlaySong(toSong(track), tracks.map(toSong), 'playlist');
  };

  return (
    <motion.div
      key="recently-played"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="w-full h-full flex flex-col overflow-hidden bg-[var(--app-bg)]"
    >
      {/* ── Header ── */}
      <div className="flex-shrink-0 px-8 pt-8 pb-6">
        <div className="flex items-end gap-5">
          <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-xl shadow-indigo-500/30 flex-shrink-0">
            <Clock className="w-10 h-10 text-white" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1">{t('history.subtitle')}</p>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('history.title')}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {isLoading ? '…' : t('history.lastSongs', { count: tracks.length })}
            </p>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-16 text-red-400 text-sm">{error}</div>
        ) : tracks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Clock className="w-14 h-14 text-gray-300 dark:text-gray-700" />
            <p className="text-gray-500 dark:text-gray-400 font-medium">{t('history.noHistory')}</p>
            <p className="text-sm text-gray-400 dark:text-gray-600">{t('history.noHistoryDesc')}</p>
          </div>
        ) : (
          <div className="space-y-1">
            <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-4 px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-600 border-b border-gray-200 dark:border-white/5 mb-1">
              <span className="w-6 text-center">#</span>
              <span>{t('table.title')}</span>
              <span>{t('table.artist')}</span>
              <span>{t('table.time')}</span>
            </div>
            <AnimatePresence>
              {tracks.map((track, idx) => (
                <motion.div
                  key={track.track_id + idx}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2, delay: idx * 0.025 }}
                  onMouseEnter={() => setHoveredId(track.track_id + idx)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => handlePlay(track)}
                  className="grid grid-cols-[auto_1fr_1fr_auto] gap-4 px-4 py-2.5 rounded-xl items-center cursor-pointer hover:bg-gray-100 dark:hover:bg-white/5 transition-all duration-150 group"
                >
                  <div className="w-6 text-center flex items-center justify-center">
                    {hoveredId === track.track_id + idx ? (
                      <Play className="w-4 h-4 text-indigo-500 fill-indigo-500" />
                    ) : (
                      <span className="text-[13px] text-gray-400 dark:text-gray-600 tabular-nums">{idx + 1}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 bg-gray-200 dark:bg-white/10">
                      {track.cover_url ? (
                        <img src={track.cover_url} alt={track.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Music2 className="w-4 h-4 text-gray-400" />
                        </div>
                      )}
                    </div>
                    <p className="text-[13px] font-medium text-gray-900 dark:text-white truncate leading-tight group-hover:text-indigo-500 dark:group-hover:text-indigo-400 transition-colors">
                      {track.title}
                    </p>
                  </div>
                  <p className="text-[13px] text-gray-500 dark:text-gray-400 truncate">{track.artist}</p>
                  <p className="text-[12px] text-gray-400 dark:text-gray-600 whitespace-nowrap">{timeAgo(track.played_at, t)}</p>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </motion.div>
  );
}
