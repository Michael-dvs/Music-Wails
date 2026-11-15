import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Play, Loader2, Clock, Music2, RotateCcw } from 'lucide-react';
import { main } from '../../wailsjs/go/models';
import { fetchAPI } from '../lib/fetchAPI';
import SongActionMenu from '../components/SongActionMenu';

// ── iTunes types ──────────────────────────────────────────────────
export interface ItunesTrack {
  trackId: number;
  trackName: string;
  artistName: string;
  artistId: number;
  collectionId: number;
  collectionName: string;
  trackNumber?: number;
  discNumber?: number;
  trackTimeMillis: number;
  artworkUrl100: string;
  primaryGenreName: string;
  wrapperType: string;
  kind?: string;
}

export interface ItunesAlbum {
  collectionId: number;
  collectionName: string;
  artistName: string;
  artistId: number;
  artworkUrl100: string;
  releaseDate: string;
  primaryGenreName: string;
  trackCount: number;
  wrapperType: string;
}

// ── Shared utility exports (used by ArtistDetail and Search) ─────

export function getHighResArtwork(url: string): string {
  if (!url) return '';
  // Replace any NNNxNNNbb.jpg pattern with 500x500bb.jpg
  return url.replace(/\d+x\d+bb\.jpg/, '500x500bb.jpg');
}

function formatDuration(ms?: number): string {
  if (!ms || ms <= 0) return '--:--';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function getReleaseYear(date?: string): string {
  if (!date) return '';
  try {
    return new Date(date).getFullYear().toString();
  } catch {
    return '';
  }
}

// Deterministic color from a string (for artist avatars)
export function getAvatarColor(name: string): string {
  const palettes = [
    'from-rose-500 to-pink-700',
    'from-orange-500 to-red-600',
    'from-amber-500 to-orange-600',
    'from-emerald-500 to-teal-700',
    'from-cyan-500 to-blue-700',
    'from-violet-500 to-purple-700',
    'from-fuchsia-500 to-pink-700',
    'from-indigo-500 to-violet-700',
    'from-sky-500 to-indigo-700',
    'from-red-500 to-rose-700',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return palettes[Math.abs(hash) % palettes.length];
}

export function getInitials(name: string): string {
  return (name ?? '')
    .trim()
    .split(/\s+/)
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/**
 * Convert an iTunes track object into main.Song for the playback engine.
 * We attach `artistId` as an extended property so PlayerBar can navigate
 * back to the ArtistDetail page without a secondary iTunes lookup.
 */
export function itunesTrackToSong(track: ItunesTrack): main.Song {
  const song = {
    id: String(track.trackId),
    title: track.trackName ?? '',
    artist: track.artistName ?? '',
    album: track.collectionName ?? '',
    coverArt: getHighResArtwork(track.artworkUrl100),
    duration: track.trackTimeMillis ?? 0,
    streamUrl: '',
    genre: track.primaryGenreName ?? '',
  } as main.Song;
  // Extended property: numeric iTunes artistId for seamless PlayerBar → ArtistDetail nav
  (song as any).artistId = track.artistId ?? 0;
  return song;
}

// ── Props ─────────────────────────────────────────────────────────
interface AlbumDetailProps {
  album: ItunesAlbum;
  onBack: () => void;
  onPlaySong: (song: main.Song, queue: main.Song[], source: 'playlist' | 'search') => void;
  onNavigateToArtist?: (artistId: number, artistName: string, genre?: string) => void;
  onPlayNext?: (song: main.Song) => void;
  onAddToQueue?: (song: main.Song) => void;
  onOpenAddToPlaylist?: (song: main.Song) => void;
}

// ── Component ─────────────────────────────────────────────────────
export default function AlbumDetail({
  album,
  onBack,
  onPlaySong,
  onNavigateToArtist,
  onPlayNext,
  onAddToQueue,
  onOpenAddToPlaylist,
}: AlbumDetailProps) {
  const [tracks, setTracks] = useState<ItunesTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTracks = useCallback(async () => {
    const collectionId = album?.collectionId;
    if (!collectionId || collectionId <= 0) {
      console.error('[AlbumDetail] Invalid collectionId:', collectionId);
      setError('Invalid album ID.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      /**
       * CRITICAL PARAMS:
       * - country=id  → unlocks Indonesian regional catalog (Bernadya, Juicy Luicy, etc.)
       * - limit=200   → prevents pagination cutoff hiding studio tracks
       * - entity=song → returns song items alongside the album record
       */
      const url = `https://itunes.apple.com/lookup?id=${collectionId}&entity=song&limit=200&country=id`;
      console.log('[AlbumDetail] Fetching tracklist. collectionId:', collectionId, '| url:', url);
      const data = await fetchAPI<any>(url);

      if (!data.results || !Array.isArray(data.results)) {
        throw new Error('iTunes API returned no results array.');
      }

      const songTracks = data.results.filter(
        (r: any) => r.wrapperType === 'track'
      ) as ItunesTrack[];

      // Sort by disc number, then track number (preserving multi-disc layout)
      songTracks.sort((a, b) => {
        const discDiff = (a.discNumber ?? 1) - (b.discNumber ?? 1);
        if (discDiff !== 0) return discDiff;
        return (a.trackNumber ?? 0) - (b.trackNumber ?? 0);
      });

      setTracks(songTracks);
    } catch (e: any) {
      console.error('[AlbumDetail] Error fetching tracks:', e);
      setError(e?.message ?? 'Gagal memuat lagu album. Periksa koneksi internet Anda.');
    } finally {
      setLoading(false);
    }
  }, [album?.collectionId]);

  useEffect(() => {
    fetchTracks();
  }, [fetchTracks]);

  const handlePlayTrack = useCallback((track: ItunesTrack) => {
    const song = itunesTrackToSong(track);
    const queue = tracks.map(itunesTrackToSong);
    onPlaySong(song, queue, 'playlist');
  }, [tracks, onPlaySong]);

  const handlePlayAll = useCallback(() => {
    if (tracks.length > 0) handlePlayTrack(tracks[0]);
  }, [tracks, handlePlayTrack]);

  const totalMinutes = Math.floor(
    tracks.reduce((acc, t) => acc + (t.trackTimeMillis || 0), 0) / 60000
  );

  const artistId = tracks[0]?.artistId ?? album.artistId ?? 0;
  const hasMultipleDiscs = tracks.some(t => (t.discNumber ?? 1) > 1);

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="w-full h-full flex flex-col overflow-y-auto pb-36 no-scrollbar bg-[var(--app-bg)]"
    >
      {/* ── Header — flex-shrink-0 prevents it from collapsing ───── */}
      <div
        className="relative w-full px-8 pt-8 pb-10 flex items-end space-x-8 flex-shrink-0"
        style={{ background: 'linear-gradient(180deg, rgba(250,36,60,0.12) 0%, transparent 100%)' }}
      >
        {/* Back button */}
        <motion.button
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={onBack}
          aria-label="Kembali ke tampilan sebelumnya"
          title="Kembali"
          className="absolute top-6 left-6 z-10 flex items-center space-x-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-brand-500 dark:hover:text-brand-400 transition-colors group p-1.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          <span>Kembali</span>
        </motion.button>

        {/* Album cover art */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.05 }}
          className="w-52 h-52 rounded-2xl overflow-hidden shadow-2xl shadow-black/50 border border-black/10 dark:border-white/10 flex-shrink-0 mt-10"
        >
          <img
            src={getHighResArtwork(album.artworkUrl100)}
            alt={`Sampul album ${album.collectionName}`}
            className="w-full h-full object-cover"
          />
        </motion.div>

        {/* Album metadata */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex flex-col space-y-3 pb-1 min-w-0"
        >
          <span className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
            Album · {getReleaseYear(album.releaseDate)}
          </span>
          <h1 className="text-4xl md:text-5xl font-black text-gray-900 dark:text-white tracking-tight leading-tight">
            {album.collectionName}
          </h1>

          <div className="flex items-center flex-wrap gap-x-2 text-sm">
            {onNavigateToArtist ? (
              <button
                onClick={() => onNavigateToArtist(artistId, album.artistName, album.primaryGenreName)}
                className="font-semibold text-gray-900 dark:text-white hover:text-brand-500 dark:hover:text-brand-400 transition-colors hover:underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 px-1 -mx-1"
                aria-label={`Buka halaman artis ${album.artistName}`}
              >
                {album.artistName}
              </button>
            ) : (
              <span className="font-semibold text-gray-900 dark:text-white">{album.artistName}</span>
            )}
            <span className="text-gray-400">·</span>
            <span className="text-gray-500 dark:text-gray-400">
              {tracks.length > 0 ? `${tracks.length} lagu` : `${album.trackCount ?? '?'} lagu`}
              {totalMinutes > 0 && ` · ~${totalMinutes} menit`}
            </span>
          </div>

          <button
            onClick={handlePlayAll}
            disabled={loading || tracks.length === 0}
            aria-label="Putar semua lagu dalam album ini"
            className="mt-1 flex items-center space-x-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-full font-semibold shadow-lg shadow-brand-500/30 transition-all hover:scale-105 active:scale-95 w-fit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#121212]"
          >
            <Play className="w-5 h-5 fill-white" />
            <span>Putar Semua</span>
          </button>
        </motion.div>
      </div>

      {/* ── Track list ───── */}
      <div className="px-8 mt-4">
        {/* Column header */}
        <div className="grid grid-cols-[32px_1fr_60px_36px] gap-4 px-4 py-3 border-b border-black/10 dark:border-white/10 text-xs font-semibold uppercase tracking-wider text-gray-500">
          <span className="text-center">#</span>
          <span>Judul</span>
          <span className="flex items-center justify-end" title="Durasi">
            <Clock className="w-3.5 h-3.5" />
          </span>
          <span className="text-center"></span>
        </div>

        {/* States */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 space-y-3" role="status" aria-live="polite">
            <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
            <span className="text-sm text-gray-500 dark:text-gray-400">Memuat daftar lagu album...</span>
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-20 text-red-500 space-y-3" role="alert" aria-live="assertive">
            <Music2 className="w-10 h-10 opacity-40" />
            <p className="text-sm font-medium">{error}</p>
            <button
              onClick={fetchTracks}
              className="mt-2 flex items-center space-x-2 px-4 py-2 bg-brand-500/10 hover:bg-brand-500/20 text-brand-500 rounded-full text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Coba Lagi</span>
            </button>
          </div>
        )}

        {!loading && !error && tracks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500 space-y-2" role="status">
            <Music2 className="w-10 h-10 opacity-40" />
            <p className="text-sm font-medium">Tidak ada lagu yang ditemukan untuk album ini.</p>
            <p className="text-xs text-gray-400">ID Album: {album.collectionId}</p>
          </div>
        )}

        {!loading && !error && tracks.length > 0 && (
          <div className="flex flex-col py-1">
            {tracks.map((track, idx) => {
              const currentDisc = track.discNumber ?? 1;
              const prevDisc = idx > 0 ? (tracks[idx - 1].discNumber ?? 1) : null;
              const showDiscHeader = hasMultipleDiscs && (idx === 0 || currentDisc !== prevDisc);

              return (
                <div key={track.trackId}>
                  {showDiscHeader && (
                    <div className="px-4 pt-5 pb-2 text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 border-b border-black/5 dark:border-white/5">
                      Disc {currentDisc}
                    </div>
                  )}
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(idx, 20) * 0.02, duration: 0.2 }}
                    role="button"
                    tabIndex={0}
                    aria-label={`Putar ${track.trackName} oleh ${track.artistName}`}
                    onClick={() => handlePlayTrack(track)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handlePlayTrack(track);
                      }
                    }}
                    className="group grid grid-cols-[32px_1fr_60px_36px] gap-4 px-4 py-3.5 rounded-xl cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 transition-all duration-150 items-center"
                  >
                    {/* Track number → play icon on hover/focus */}
                    <div className="text-center">
                      <span className="text-sm text-gray-400 group-hover:hidden group-focus-visible:hidden tabular-nums">
                        {track.trackNumber ?? idx + 1}
                      </span>
                      <Play className="w-4 h-4 text-brand-500 fill-brand-500 hidden group-hover:block group-focus-visible:block mx-auto" />
                    </div>

                    {/* Title + Artist */}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate group-hover:text-brand-500 dark:group-hover:text-brand-400 transition-colors">
                        {track.trackName}
                      </p>
                      <p className="text-xs text-gray-500 truncate mt-0.5">{track.artistName}</p>
                    </div>

                    {/* Duration */}
                    <span className="text-sm text-gray-400 text-right tabular-nums">
                      {formatDuration(track.trackTimeMillis)}
                    </span>

                    {/* Action Menu */}
                    <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                      <SongActionMenu
                        song={itunesTrackToSong(track)}
                        onPlayNext={onPlayNext}
                        onAddToQueue={onAddToQueue}
                        onOpenAddToPlaylist={onOpenAddToPlaylist}
                      />
                    </div>
                  </motion.div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}
