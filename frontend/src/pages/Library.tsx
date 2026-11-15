import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Heart, Play, Trash2, Music2, RefreshCw, Search as SearchIcon, AlertCircle, ArrowUpDown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { main } from '../../wailsjs/go/models';
import { FavoriteTrack } from '../lib/supabase';
import SongActionMenu from '../components/SongActionMenu';

interface LibraryProps {
  onPlaySong: (song: main.Song, queue: main.Song[], source: 'playlist' | 'search') => void;
  onNavigateToArtist?: (artistId: number, artistName: string, genre?: string) => void;
  onPlayNext?: (song: main.Song) => void;
  onAddToQueue?: (song: main.Song) => void;
  onOpenAddToPlaylist?: (song: main.Song) => void;
}

type SortField = 'recent' | 'title' | 'artist' | 'album';

export default function Library({
  onPlaySong,
  onNavigateToArtist,
  onPlayNext,
  onAddToQueue,
  onOpenAddToPlaylist,
}: LibraryProps) {
  const { favorites, removeFavorite, refreshFavorites } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [filterQuery, setFilterQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('recent');

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setRefreshError(null);
    try {
      await refreshFavorites();
    } catch (err: any) {
      console.error('[Library] Refresh error:', err);
      setRefreshError(err?.message || 'Gagal menyegarkan koleksi favorit.');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Convert FavoriteTrack[] to main.Song[] with index preserved
  const allSongs: { song: main.Song; fav: FavoriteTrack; origIndex: number }[] = useMemo(() => {
    return favorites.map((fav: FavoriteTrack, idx: number) => {
      const s = new main.Song();
      s.id = fav.itunes_track_id || fav.id;
      s.title = fav.title;
      s.artist = fav.artist;
      s.album = fav.album || '';
      s.genre = '';
      s.coverArt = fav.artwork_url || '';
      s.streamUrl = fav.preview_url || '';
      s.duration = 0;
      s.isRecommended = false;
      return { song: s, fav, origIndex: idx };
    });
  }, [favorites]);

  const filteredAndSorted = useMemo(() => {
    let list = [...allSongs];
    const q = filterQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(item =>
        item.song.title.toLowerCase().includes(q) ||
        item.song.artist.toLowerCase().includes(q) ||
        item.song.album.toLowerCase().includes(q)
      );
    }

    if (sortBy === 'title') {
      list.sort((a, b) => a.song.title.localeCompare(b.song.title));
    } else if (sortBy === 'artist') {
      list.sort((a, b) => a.song.artist.localeCompare(b.song.artist));
    } else if (sortBy === 'album') {
      list.sort((a, b) => a.song.album.localeCompare(b.song.album));
    }
    return list;
  }, [allSongs, filterQuery, sortBy]);

  const playableSongs = useMemo(() => filteredAndSorted.map(i => i.song), [filteredAndSorted]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="w-full h-full flex flex-col overflow-y-auto px-8 py-8 pb-32 no-scrollbar text-gray-900 dark:text-white"
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center text-brand-500 flex-shrink-0">
            <Heart className="w-6 h-6 fill-brand-500" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Favorit Saya</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {favorites.length} {favorites.length === 1 ? 'lagu' : 'lagu'} tersimpan di perpustakaan Anda
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {playableSongs.length > 0 && (
            <button
              type="button"
              onClick={() => onPlaySong(playableSongs[0], playableSongs, 'playlist')}
              aria-label="Putar semua lagu favorit"
              className="flex items-center space-x-2 bg-brand-500 hover:bg-brand-600 text-white px-5 py-2 rounded-full font-semibold shadow-lg shadow-brand-500/20 hover:shadow-brand-500/40 transition-all hover:scale-105 active:scale-95 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>Putar Semua</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50"
            title="Segarkan Favorit"
            aria-label="Segarkan daftar favorit"
          >
            <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filter and Sort Toolbar */}
      {favorites.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-6">
          <div className="relative w-full sm:max-w-xs">
            <SearchIcon className="w-4 h-4 absolute left-3 top-3 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Cari dalam favorit..."
              aria-label="Cari dalam favorit"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs sm:text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all"
            />
          </div>

          <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
            <ArrowUpDown className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-xs text-gray-400">Urutkan:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortField)}
              aria-label="Urutkan daftar favorit"
              className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="recent">Terbaru Ditambahkan</option>
              <option value="title">Judul Lagu (A-Z)</option>
              <option value="artist">Nama Artis (A-Z)</option>
              <option value="album">Album (A-Z)</option>
            </select>
          </div>
        </div>
      )}

      {/* Refresh Error Alert */}
      {refreshError && (
        <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 flex items-center justify-between text-xs sm:text-sm">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{refreshError}</span>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            className="px-3 py-1 bg-red-500 text-white rounded-lg text-xs font-semibold hover:bg-red-600 transition-colors"
          >
            Coba Lagi
          </button>
        </div>
      )}

      {/* Tracks Table */}
      {favorites.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-80 text-gray-500 space-y-3">
          <Music2 className="w-12 h-12 opacity-30" />
          <p className="text-base font-semibold">Belum Ada Lagu Favorit</p>
          <p className="text-sm text-gray-400 max-w-sm text-center">
            Klik ikon hati pada lagu apa pun untuk menyimpannya ke koleksi favorit Anda.
          </p>
        </div>
      ) : filteredAndSorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-gray-500 space-y-2">
          <SearchIcon className="w-8 h-8 opacity-40" />
          <p className="text-sm font-medium">Tidak ada lagu yang cocok dengan pencarian "{filterQuery}".</p>
          <button
            type="button"
            onClick={() => setFilterQuery('')}
            className="text-xs text-brand-500 hover:underline"
          >
            Reset filter
          </button>
        </div>
      ) : (
        <div className="w-full">
          {/* Table Header */}
          <div className="grid grid-cols-[40px_1fr_1fr_80px] gap-4 px-4 py-3 border-b border-black/10 dark:border-white/10 text-xs font-semibold uppercase tracking-wider text-gray-500 select-none">
            <span className="text-center">#</span>
            <span>Judul</span>
            <span>Album</span>
            <span className="text-center">Aksi</span>
          </div>

          {/* Track Rows */}
          <div className="flex flex-col mt-2" role="list">
            {filteredAndSorted.map(({ song, fav, origIndex }, idx) => {
              return (
                <motion.div
                  key={song.id || idx}
                  role="listitem"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(idx, 8) * 0.02, duration: 0.2 }}
                  className="group grid grid-cols-[40px_1fr_1fr_80px] gap-4 px-4 py-2.5 rounded-xl cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-all duration-200 items-center focus-within:bg-black/5 dark:focus-within:bg-white/5"
                >
                  {/* Track Number / Play icon button */}
                  <div className="text-center relative">
                    <button
                      type="button"
                      aria-label={`Putar ${song.title}`}
                      onClick={() => onPlaySong(song, playableSongs, 'playlist')}
                      className="w-full flex items-center justify-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500 rounded"
                    >
                      <span className="text-sm text-gray-500 group-hover:hidden group-focus-within:hidden">{idx + 1}</span>
                      <Play className="w-4 h-4 text-black dark:text-white fill-black dark:fill-white hidden group-hover:block group-focus-within:block mx-auto" />
                    </button>
                  </div>

                  {/* Title + Artist + Cover */}
                  <div className="flex items-center space-x-3 min-w-0">
                    <img
                      src={song.coverArt}
                      alt=""
                      className="w-10 h-10 rounded-lg object-cover shadow-sm flex-shrink-0 bg-black/5 dark:bg-white/5"
                    />
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => onPlaySong(song, playableSongs, 'playlist')}
                        className="text-sm font-semibold text-gray-900 dark:text-white truncate block text-left group-hover:text-brand-500 dark:group-hover:text-brand-400 transition-colors focus-visible:outline-none focus-visible:underline"
                      >
                        {song.title}
                      </button>
                      {onNavigateToArtist ? (
                        <button
                          type="button"
                          onClick={() => onNavigateToArtist(0, song.artist, '')}
                          aria-label={`Buka detail artis ${song.artist}`}
                          className="text-xs text-gray-500 dark:text-gray-400 truncate block text-left hover:underline hover:text-brand-500 dark:hover:text-brand-400 transition-colors focus-visible:outline-none focus-visible:underline"
                        >
                          {song.artist}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-500 dark:text-gray-400 truncate block">
                          {song.artist}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Album */}
                  <span className="text-sm text-gray-500 dark:text-gray-400 truncate">
                    {song.album || '—'}
                  </span>

                  {/* Actions (Delete Favorite & Action Menu) */}
                  <div className="flex items-center justify-center space-x-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => {
                        if (fav) removeFavorite(fav.itunes_track_id);
                      }}
                      className="p-1.5 rounded-full text-red-500 hover:bg-red-500/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                      title="Hapus dari Favorit"
                      aria-label={`Hapus ${song.title} dari favorit`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <SongActionMenu
                      song={song}
                      onPlayNext={onPlayNext}
                      onAddToQueue={onAddToQueue}
                      onOpenAddToPlaylist={onOpenAddToPlaylist}
                    />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}
    </motion.div>
  );
}
