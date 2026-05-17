import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Play, Loader2, Clock, Music2 } from 'lucide-react';
import { main } from '../../wailsjs/go/models';

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
}

// ── Component ─────────────────────────────────────────────────────
export default function AlbumDetail({ album, onBack, onPlaySong, onNavigateToArtist }: AlbumDetailProps) {
  const [tracks, setTracks] = useState<ItunesTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Guard: collectionId must be a valid positive number
    const collectionId = album?.collectionId;
    if (!collectionId || collectionId <= 0) {
      console.error('[AlbumDetail] Invalid collectionId:', collectionId);
      setError('Invalid album ID.');
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchTracks = async () => {
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
        const res = await fetch(url);

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        const data = await res.json();
        console.log('[AlbumDetail] resultCount:', data.resultCount, '| raw results:', data.results?.length);

        if (!data.results || !Array.isArray(data.results)) {
          throw new Error('iTunes API returned no results array.');
        }

        /**
         * iTunes lookup response layout:
         *   results[0]  → the album itself  (wrapperType === 'collection')
         *   results[1…] → individual tracks (wrapperType === 'track')
         *
         * We filter strictly for wrapperType === 'track'.
         * We intentionally do NOT filter on `kind === 'song'` because
         * some iTunes markets return tracks without a kind field.
         */
        const songTracks = data.results.filter(
          (r: any) => r.wrapperType === 'track'
        ) as ItunesTrack[];

        // Log sample to verify data shape from Indonesian store
        if (songTracks.length > 0) {
          console.log('[AlbumDetail] Sample track[0]:', {
            trackId: songTracks[0].trackId,
            trackName: songTracks[0].trackName,
            collectionId: songTracks[0].collectionId,
          });
        } else {
          console.warn('[AlbumDetail] No tracks after wrapperType filter. results[0]:', data.results?.[0]);
        }
        console.log('[AlbumDetail] Tracks after filter:', songTracks.length);

        // Sort by disc number, then track number
        songTracks.sort((a, b) => {
          const discDiff = (a.discNumber ?? 1) - (b.discNumber ?? 1);
          if (discDiff !== 0) return discDiff;
          return (a.trackNumber ?? 0) - (b.trackNumber ?? 0);
        });

        if (!cancelled) setTracks(songTracks);
      } catch (e: any) {
        console.error('[AlbumDetail] Error fetching tracks:', e);
        if (!cancelled) setError(e?.message ?? 'Unknown error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchTracks();
    return () => { cancelled = true; };
  }, [album?.collectionId]);

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

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      // FIX: outermost wrapper is scrollable. pb-36 clears the sticky PlayerBar.
      // flex-col with no fixed height — height is driven by h-full from parent.
      className="w-full h-full flex flex-col overflow-y-auto pb-36 no-scrollbar bg-[var(--app-bg)]"
    >
      {/* ── Header — flex-shrink-0 prevents it from collapsing ───── */}
      <div
        className="relative w-full px-8 pt-8 pb-10 flex items-end space-x-8 flex-shrink-0"
        style={{ background: 'linear-gradient(180deg, rgba(250,36,60,0.12) 0%, transparent 100%)' }}
      >
        {/* Back button — positioned absolute so it doesn't affect flex layout */}
        <motion.button
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={onBack}
          className="absolute top-6 left-6 z-10 flex items-center space-x-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-brand-500 dark:hover:text-brand-400 transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          <span>Back</span>
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
            alt={album.collectionName}
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
                className="font-semibold text-gray-900 dark:text-white hover:text-brand-500 dark:hover:text-brand-400 transition-colors hover:underline"
              >
                {album.artistName}
              </button>
            ) : (
              <span className="font-semibold text-gray-900 dark:text-white">{album.artistName}</span>
            )}
            <span className="text-gray-400">·</span>
            <span className="text-gray-500 dark:text-gray-400">
              {tracks.length > 0 ? `${tracks.length} songs` : `${album.trackCount ?? '?'} songs`}
              {totalMinutes > 0 && ` · ~${totalMinutes} min`}
            </span>
          </div>

          <button
            onClick={handlePlayAll}
            disabled={loading || tracks.length === 0}
            className="mt-1 flex items-center space-x-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-full font-semibold shadow-lg shadow-brand-500/30 transition-all hover:scale-105 active:scale-95 w-fit"
          >
            <Play className="w-5 h-5 fill-white" />
            <span>Play All</span>
          </button>
        </motion.div>
      </div>

      {/* ── Track list — part of the scrollable container above ───── */}
      <div className="px-8 mt-4">
        {/* Column header */}
        <div className="grid grid-cols-[32px_1fr_80px] gap-4 px-4 py-3 border-b border-black/10 dark:border-white/10 text-xs font-semibold uppercase tracking-wider text-gray-500">
          <span className="text-center">#</span>
          <span>Title</span>
          <span className="flex items-center justify-end">
            <Clock className="w-3.5 h-3.5" />
          </span>
        </div>

        {/* States */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-brand-400" />
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-20 text-red-500 space-y-2">
            <Music2 className="w-10 h-10 opacity-40" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {!loading && !error && tracks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500 space-y-2">
            <Music2 className="w-10 h-10 opacity-40" />
            <p className="text-sm">No tracks found for this album.</p>
            <p className="text-xs text-gray-400">Album ID: {album.collectionId}</p>
          </div>
        )}

        {!loading && !error && tracks.length > 0 && (
          <div className="flex flex-col">
            {tracks.map((track, idx) => (
              <motion.div
                key={track.trackId}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.02, duration: 0.2 }}
                onClick={() => handlePlayTrack(track)}
                className="group grid grid-cols-[32px_1fr_80px] gap-4 px-4 py-3.5 rounded-xl cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-all duration-150 items-center"
              >
                {/* Track number → play icon on hover */}
                <div className="text-center">
                  <span className="text-sm text-gray-400 group-hover:hidden tabular-nums">
                    {track.trackNumber ?? idx + 1}
                  </span>
                  <Play className="w-4 h-4 text-brand-400 fill-brand-400 hidden group-hover:block mx-auto" />
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
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
