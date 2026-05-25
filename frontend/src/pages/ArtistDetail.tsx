import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Play, Music2, Disc3, User, Loader2 } from 'lucide-react';
import { main } from '../../wailsjs/go/models';
import { fetchAPI } from '../lib/fetchAPI';
import AlbumDetail from './AlbumDetail';
import {
  getHighResArtwork,
  getReleaseYear,
  getAvatarColor,
  getInitials,
  itunesTrackToSong,
  ItunesTrack,
  ItunesAlbum,
} from './AlbumDetail';

function formatDuration(ms?: number): string {
  if (!ms || ms <= 0) return '--:--';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Props ─────────────────────────────────────────────────────────
interface ArtistDetailProps {
  artistId: number;
  artistName: string;
  primaryGenre?: string;
  onBack: () => void;
  onPlaySong: (song: main.Song, queue: main.Song[], source: 'playlist' | 'search') => void;
  onNavigateToArtist?: (artistId: number, artistName: string, genre?: string) => void;
}

// ── Skeleton loader for header area ──────────────────────────────
function HeaderSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <div className="w-full h-full flex flex-col overflow-y-auto pb-36 no-scrollbar bg-[var(--app-bg)]">
      <div className="relative w-full px-8 pt-8 pb-12 flex flex-col flex-shrink-0">
        <button
          onClick={onBack}
          className="w-fit flex items-center space-x-2 mb-8 text-sm text-gray-500 dark:text-gray-400 hover:text-brand-500 transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          <span>Back</span>
        </button>
        <div className="flex items-end space-x-8">
          {/* Avatar skeleton */}
          <div className="w-44 h-44 rounded-full bg-black/10 dark:bg-white/10 animate-pulse flex-shrink-0" />
          <div className="flex flex-col space-y-3 pb-1 w-72">
            <div className="h-3 w-16 rounded bg-black/10 dark:bg-white/10 animate-pulse" />
            <div className="h-10 w-64 rounded-lg bg-black/10 dark:bg-white/10 animate-pulse" />
            <div className="h-3 w-24 rounded bg-black/10 dark:bg-white/10 animate-pulse" />
            <div className="h-10 w-36 rounded-full bg-black/10 dark:bg-white/10 animate-pulse mt-2" />
          </div>
        </div>
      </div>
      <div className="flex flex-col space-y-4 px-8">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-14 rounded-xl bg-black/5 dark:bg-white/5 animate-pulse" />
        ))}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────
export default function ArtistDetail({
  artistId: artistIdProp,
  artistName,
  primaryGenre,
  onBack,
  onPlaySong,
  onNavigateToArtist,
}: ArtistDetailProps) {
  // ── Core data states ──
  const [resolvedArtistId, setResolvedArtistId] = useState<number>(artistIdProp ?? 0);
  const [resolving, setResolving] = useState<boolean>(!artistIdProp || artistIdProp === 0);

  const [topTracks, setTopTracks] = useState<ItunesTrack[]>([]);
  const [albums, setAlbums] = useState<ItunesAlbum[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [loadingAlbums, setLoadingAlbums] = useState(false);

  // Album page sub-navigation
  const [selectedAlbum, setSelectedAlbum] = useState<ItunesAlbum | null>(null);

  // ── Step 0: Resolve artistId by name if prop is missing/zero ──
  useEffect(() => {
    // If we already have a valid ID, just use it
    if (artistIdProp && artistIdProp !== 0) {
      setResolvedArtistId(artistIdProp);
      setResolving(false);
      return;
    }

    // Need to look up ID via name first — BLOCK render until resolved
    setResolving(true);
    let cancelled = false;

    const resolve = async () => {
      try {
        const encoded = encodeURIComponent(artistName.trim());
        // country=id ensures Indonesian artists are found in local store
        const url = `https://itunes.apple.com/search?term=${encoded}&entity=musicArtist&limit=1&country=id`;
        console.log(`[ArtistDetail] Resolving artistId for "${artistName}" via:`, url);
        const data = await fetchAPI<any>(url);
        const found = data.results?.[0];
        if (!cancelled) {
          if (found?.artistId) {
            console.log(`[ArtistDetail] ✓ Resolved artistId=${found.artistId} for "${artistName}"`);
            setResolvedArtistId(found.artistId);
          } else {
            console.warn(`[ArtistDetail] ✗ Could not resolve artistId for "${artistName}"`);
          }
          setResolving(false);
        }
      } catch (e) {
        console.error('[ArtistDetail] Failed to resolve artistId:', e);
        if (!cancelled) setResolving(false);
      }
    };

    resolve();
    return () => { cancelled = true; };
  }, [artistIdProp, artistName]);

  // ── Step 1: Fetch top tracks once we have a valid ID ──
  useEffect(() => {
    if (!resolvedArtistId || resolving) return;
    let cancelled = false;

    const fetchTopTracks = async () => {
      setLoadingTracks(true);
      try {
        // country=id: ensures Indonesian tracks are not region-blocked
        const url = `https://itunes.apple.com/lookup?id=${resolvedArtistId}&entity=song&limit=10&sort=popular&country=id`;
        console.log('[ArtistDetail] Fetching top tracks:', url);
        const data = await fetchAPI<any>(url);
        if (!cancelled) {
          const tracks = (data.results ?? []).filter(
            (r: any) => r.wrapperType === 'track'
          ) as ItunesTrack[];
          console.log(`[ArtistDetail] Got ${tracks.length} top tracks`);
          setTopTracks(tracks.slice(0, 10));
        }
      } catch (e) {
        console.error('[ArtistDetail] Failed to fetch top tracks:', e);
      } finally {
        if (!cancelled) setLoadingTracks(false);
      }
    };

    fetchTopTracks();
    return () => { cancelled = true; };
  }, [resolvedArtistId, resolving]);

  // ── Step 2: Fetch albums once we have a valid ID ──
  useEffect(() => {
    if (!resolvedArtistId || resolving) return;
    let cancelled = false;

    const fetchAlbums = async () => {
      setLoadingAlbums(true);
      try {
        // limit=150 + country=id: cast wider net and hit local storefront
        const url = `https://itunes.apple.com/lookup?id=${resolvedArtistId}&entity=album&limit=150&country=id`;
        console.log('[ArtistDetail] Fetching albums:', url);
        const data = await fetchAPI<any>(url);
        if (!cancelled) {
          // Filter: only real album collections, no karaoke/tribute/video entries
          const raw = (data.results ?? []).filter(
            (r: any) => r.wrapperType === 'collection'
          ) as ItunesAlbum[];

          // Deduplicate by collectionId (API sometimes returns the same album twice)
          const seen = new Set<number>();
          const unique = raw.filter(a => {
            if (seen.has(a.collectionId)) return false;
            seen.add(a.collectionId);
            return true;
          });

          // Sort newest-first so studio albums surface before legacy compilations
          unique.sort((a, b) =>
            new Date(b.releaseDate ?? 0).getTime() - new Date(a.releaseDate ?? 0).getTime()
          );

          console.log(`[ArtistDetail] Got ${unique.length} unique albums (raw: ${raw.length})`);
          setAlbums(unique);
        }
      } catch (e) {
        console.error('[ArtistDetail] Failed to fetch albums:', e);
      } finally {
        if (!cancelled) setLoadingAlbums(false);
      }
    };

    fetchAlbums();
    return () => { cancelled = true; };
  }, [resolvedArtistId, resolving]);

  const handlePlayItunesTrack = useCallback((track: ItunesTrack, context: ItunesTrack[]) => {
    const song = itunesTrackToSong(track);
    const queue = context.map(itunesTrackToSong);
    onPlaySong(song, queue, 'playlist');
  }, [onPlaySong]);

  const handlePlayTopSongs = useCallback(() => {
    if (topTracks.length > 0) handlePlayItunesTrack(topTracks[0], topTracks);
  }, [topTracks, handlePlayItunesTrack]);

  const avatarGradient = getAvatarColor(artistName);
  const initials = getInitials(artistName);

  // ── Guard: show skeleton while resolving artistId ──
  // This prevents blank/polos header from rendering during async lookup
  if (resolving) {
    return <HeaderSkeleton onBack={onBack} />;
  }

  // ── Album sub-page ──
  if (selectedAlbum) {
    return (
      <AnimatePresence mode="wait">
        <AlbumDetail
          key={`album-${selectedAlbum.collectionId}`}
          album={selectedAlbum}
          onBack={() => setSelectedAlbum(null)}
          onPlaySong={onPlaySong}
          onNavigateToArtist={onNavigateToArtist}
        />
      </AnimatePresence>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      // FIX: h-full + overflow-y-auto on the outermost div. pb-36 clears the PlayerBar.
      className="w-full h-full flex flex-col overflow-y-auto pb-36 no-scrollbar bg-[var(--app-bg)]"
    >
      {/* ── Hero Banner — flex-shrink-0 so it never collapses ──── */}
      <div className="relative w-full px-8 pt-8 pb-12 flex flex-col flex-shrink-0 overflow-hidden">
        {/* Decorative glow blob */}
        <div
          className="absolute inset-0 opacity-15 blur-3xl pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at 20% 50%, #FA243C 0%, transparent 65%)' }}
        />

        {/* Back button */}
        <motion.button
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={onBack}
          className="relative z-10 w-fit flex items-center space-x-2 mb-8 text-sm text-gray-500 dark:text-gray-400 hover:text-brand-500 dark:hover:text-brand-400 transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          <span>Back</span>
        </motion.button>

        {/* Artist identity row */}
        <div className="relative z-10 flex items-end space-x-8">
          {/* Premium color-matched monogram avatar */}
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.08 }}
            className={`w-44 h-44 rounded-full bg-gradient-to-br ${avatarGradient} flex items-center justify-center shadow-2xl shadow-black/40 flex-shrink-0 select-none`}
          >
            <span className="text-5xl font-black text-white/90 leading-none tracking-tighter">
              {initials}
            </span>
          </motion.div>

          {/* Text info */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
            className="flex flex-col space-y-3 pb-1 min-w-0"
          >
            <span className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 flex items-center space-x-1.5">
              <User className="w-3.5 h-3.5" />
              <span>Artist</span>
            </span>
            <h1 className="text-5xl md:text-6xl font-black text-gray-900 dark:text-white tracking-tight leading-none text-balance">
              {artistName}
            </h1>
            {primaryGenre && (
              <p className="text-sm text-gray-500 dark:text-gray-400">{primaryGenre}</p>
            )}
            <button
              onClick={handlePlayTopSongs}
              disabled={topTracks.length === 0 || loadingTracks}
              className="mt-2 flex items-center space-x-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-full font-semibold shadow-lg shadow-brand-500/30 hover:shadow-brand-500/50 transition-all w-fit hover:scale-105 active:scale-95"
            >
              <Play className="w-5 h-5 fill-white" />
              <span>Play Top Songs</span>
            </button>
          </motion.div>
        </div>
      </div>

      {/* ── Scrollable content body ───────────────────────────────── */}
      <div className="flex flex-col space-y-12 px-8">

        {/* Popular Tracks */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-5 flex items-center space-x-2">
            <Music2 className="w-5 h-5 text-brand-400" />
            <span>Popular</span>
          </h2>

          {loadingTracks ? (
            <div className="flex flex-col space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 rounded-xl bg-black/5 dark:bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : topTracks.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm">No tracks found.</p>
          ) : (
            <div className="flex flex-col">
              {topTracks.map((track, idx) => (
                <motion.div
                  key={track.trackId}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04 }}
                  onClick={() => handlePlayItunesTrack(track, topTracks)}
                  className="group flex items-center space-x-4 px-3 py-2.5 rounded-xl cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-all"
                >
                  <span className="text-sm text-gray-400 w-6 text-center font-medium group-hover:hidden tabular-nums">
                    {idx + 1}
                  </span>
                  <Play className="w-4 h-4 text-brand-400 fill-brand-400 hidden group-hover:block flex-shrink-0" />
                  <img
                    src={track.artworkUrl100}
                    alt={track.trackName}
                    className="w-11 h-11 rounded-md object-cover shadow-md flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate group-hover:text-brand-500 dark:group-hover:text-brand-400 transition-colors">
                      {track.trackName}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{track.collectionName}</p>
                  </div>
                  <span className="text-xs text-gray-400 tabular-nums">
                    {formatDuration(track.trackTimeMillis)}
                  </span>
                </motion.div>
              ))}
            </div>
          )}
        </section>

        {/* Albums & Singles Grid */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-5 flex items-center space-x-2">
            <Disc3 className="w-5 h-5 text-brand-400" />
            <span>Albums & Singles</span>
            {!loadingAlbums && albums.length > 0 && (
              <span className="text-sm font-normal text-gray-500 ml-1">({albums.length})</span>
            )}
          </h2>

          {loadingAlbums ? (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="flex flex-col space-y-2">
                  <div className="aspect-square rounded-xl bg-black/5 dark:bg-white/5 animate-pulse" />
                  <div className="h-3 rounded bg-black/5 dark:bg-white/5 animate-pulse" />
                  <div className="h-3 w-1/2 rounded bg-black/5 dark:bg-white/5 animate-pulse" />
                </div>
              ))}
            </div>
          ) : albums.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm">No albums found.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 pb-8">
              {albums.map((album, idx) => (
                <motion.button
                  key={album.collectionId}
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.03, duration: 0.3 }}
                  onClick={() => setSelectedAlbum(album)}
                  className="flex flex-col text-left cursor-pointer group focus:outline-none"
                >
                  <div className="relative aspect-square rounded-xl overflow-hidden shadow-md border border-black/5 dark:border-white/5 transition-all duration-300 group-hover:shadow-xl group-hover:scale-[1.04] group-focus-visible:ring-2 group-focus-visible:ring-brand-500 group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-[var(--app-bg)]">
                    <img
                      src={getHighResArtwork(album.artworkUrl100)}
                      alt={album.collectionName}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <div className="w-10 h-10 bg-brand-500 rounded-full flex items-center justify-center shadow-xl">
                        <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                      </div>
                    </div>
                  </div>
                  <div className="mt-2.5 px-0.5">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate group-hover:text-brand-500 dark:group-hover:text-brand-400 transition-colors">
                      {album.collectionName}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {getReleaseYear(album.releaseDate)}
                      {album.trackCount ? ` · ${album.trackCount} songs` : ''}
                    </p>
                  </div>
                </motion.button>
              ))}
            </div>
          )}
        </section>
      </div>
    </motion.div>
  );
}
