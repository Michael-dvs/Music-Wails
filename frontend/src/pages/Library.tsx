import { useState } from 'react';
import { motion } from 'framer-motion';
import { Heart, Play, Trash2, Library as LibraryIcon, Music2, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { main } from '../../wailsjs/go/models';
import { FavoriteTrack } from '../lib/supabase';

interface LibraryProps {
  onPlaySong: (song: main.Song, queue: main.Song[], source: 'playlist' | 'search') => void;
  onNavigateToArtist?: (artistId: number, artistName: string, genre?: string) => void;
}

export default function Library({ onPlaySong, onNavigateToArtist }: LibraryProps) {
  const { favorites, removeFavorite, refreshFavorites } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshFavorites();
    setIsRefreshing(false);
  };

  // Convert FavoriteTrack[] to main.Song[]
  const songs: main.Song[] = favorites.map((fav: FavoriteTrack) => {
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
    return s;
  });

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
          {songs.length > 0 && (
            <button
              onClick={() => onPlaySong(songs[0], songs, 'playlist')}
              className="flex items-center space-x-2 bg-brand-500 hover:bg-brand-600 text-white px-5 py-2 rounded-full font-semibold shadow-lg shadow-brand-500/20 hover:shadow-brand-500/40 transition-all hover:scale-105 active:scale-95 text-sm"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>Putar Semua</span>
            </button>
          )}

          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white"
            title="Segarkan Favorit"
          >
            <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Tracks Table */}
      {favorites.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-80 text-gray-500 space-y-3">
          <Music2 className="w-12 h-12 opacity-30" />
          <p className="text-base font-semibold">Belum Ada Lagu Favorit</p>
          <p className="text-sm text-gray-400 max-w-sm text-center">
            Klik ikon hati pada lagu apa pun untuk menyimpannya ke koleksi favorit Anda.
          </p>
        </div>
      ) : (
        <div className="w-full">
          {/* Table Header */}
          <div className="grid grid-cols-[40px_1fr_1fr_60px] gap-4 px-4 py-3 border-b border-black/10 dark:border-white/10 text-xs font-semibold uppercase tracking-wider text-gray-500">
            <span className="text-center">#</span>
            <span>Judul</span>
            <span>Album</span>
            <span className="text-center">Aksi</span>
          </div>

          {/* Track Rows */}
          <div className="flex flex-col mt-2">
            {songs.map((song, idx) => {
              const fav = favorites[idx];
              return (
                <motion.div
                  key={song.id || idx}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.02, duration: 0.2 }}
                  className="group grid grid-cols-[40px_1fr_1fr_60px] gap-4 px-4 py-2.5 rounded-xl cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-all duration-200 items-center"
                  onClick={() => onPlaySong(song, songs, 'playlist')}
                >
                  {/* Track Number / Play icon */}
                  <div className="text-center relative">
                    <span className="text-sm text-gray-500 group-hover:hidden">{idx + 1}</span>
                    <Play className="w-4 h-4 text-black dark:text-white fill-black dark:fill-white hidden group-hover:block mx-auto" />
                  </div>

                  {/* Title + Artist + Cover */}
                  <div className="flex items-center space-x-3 min-w-0">
                    <img
                      src={song.coverArt}
                      alt=""
                      className="w-10 h-10 rounded-lg object-cover shadow-sm flex-shrink-0 bg-black/5 dark:bg-white/5"
                    />
                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-white truncate group-hover:text-brand-500 dark:group-hover:text-brand-400 transition-colors">
                        {song.title}
                      </h4>
                      <p
                        className="text-xs text-gray-500 dark:text-gray-400 truncate hover:underline"
                        onClick={(e) => {
                          if (onNavigateToArtist) {
                            e.stopPropagation();
                            onNavigateToArtist(0, song.artist, '');
                          }
                        }}
                      >
                        {song.artist}
                      </p>
                    </div>
                  </div>

                  {/* Album */}
                  <span className="text-sm text-gray-500 dark:text-gray-400 truncate">
                    {song.album || '—'}
                  </span>

                  {/* Remove Favorite Action */}
                  <div className="flex items-center justify-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (fav) removeFavorite(fav.itunes_track_id);
                      }}
                      className="p-1.5 rounded-full text-red-500 hover:bg-red-500/10 transition-colors"
                      title="Hapus dari Favorit"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
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
