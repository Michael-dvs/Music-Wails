import { motion } from 'framer-motion';
import { Play, ArrowLeft, Clock, Music2 } from 'lucide-react';
import { main } from '../../wailsjs/go/models';
import SongActionMenu from '../components/SongActionMenu';

interface PlaylistDetailProps {
  songs: main.Song[];
  playlistName: string;
  playlistColor: string;
  coverUrl?: string;
  onPlaySong: (song: main.Song, queue: main.Song[], source: 'playlist' | 'search') => void;
  onBack: () => void;
  onPlayNext?: (song: main.Song) => void;
  onAddToQueue?: (song: main.Song) => void;
  onOpenAddToPlaylist?: (song: main.Song) => void;
}

function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return '--:--';
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function PlaylistDetail({
  songs,
  playlistName,
  playlistColor,
  coverUrl,
  onPlaySong,
  onBack,
  onPlayNext,
  onAddToQueue,
  onOpenAddToPlaylist,
}: PlaylistDetailProps) {
  const totalDuration = songs.reduce((acc, s) => acc + (s.duration || 0), 0);
  const totalMinutes = Math.floor(totalDuration / 60000);

  return (
    <motion.div 
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="w-full h-full flex flex-col overflow-y-auto pb-32 no-scrollbar"
    >
      {/* Header with cover art mosaic or single cover */}
      <div 
        className="relative w-full px-8 pt-8 pb-10 flex items-end space-x-8 flex-shrink-0"
        style={{ background: `linear-gradient(180deg, ${playlistColor}44 0%, transparent 100%)` }}
      >
        {/* Back Button */}
        <button 
          type="button"
          onClick={onBack}
          aria-label="Kembali ke daftar playlist"
          title="Kembali"
          className="absolute top-6 left-6 p-2 rounded-full bg-white/40 dark:bg-black/40 hover:bg-white/60 dark:hover:bg-black/60 backdrop-blur-md text-gray-800 dark:text-white/80 hover:text-brand-500 dark:hover:text-brand-400 transition-all z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        {/* Cover Art */}
        {coverUrl ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="w-52 h-52 rounded-2xl overflow-hidden shadow-2xl shadow-black/50 border border-black/10 dark:border-white/10 flex-shrink-0 mt-8"
          >
            <img 
              src={coverUrl} 
              alt="" 
              className="w-full h-full object-cover"
            />
          </motion.div>
        ) : (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="w-52 h-52 rounded-2xl overflow-hidden shadow-2xl shadow-black/50 border border-black/10 dark:border-white/10 grid grid-cols-2 grid-rows-2 flex-shrink-0 mt-8"
          >
            {songs.slice(0, 4).map((song, i) => (
              <img 
                key={song.id || i} 
                src={song.coverArt} 
                alt="" 
                className="w-full h-full object-cover"
              />
            ))}
            {/* Fill remaining slots if less than 4 songs */}
            {Array.from({ length: Math.max(0, 4 - songs.length) }).map((_, i) => (
              <div key={`empty-${i}`} className="w-full h-full bg-black/5 dark:bg-white/5 flex items-center justify-center">
                <Music2 className="w-6 h-6 text-black/20 dark:text-white/20" />
              </div>
            ))}
          </motion.div>
        )}

        {/* Playlist Info */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="flex flex-col space-y-3 min-w-0"
        >
          <span className="text-xs font-semibold uppercase tracking-wider text-black/60 dark:text-white/60">Playlist</span>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white tracking-tight text-balance truncate">{playlistName}</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {songs.length} {songs.length === 1 ? 'lagu' : 'lagu'} • ~{totalMinutes} min
          </p>
          <button
            type="button"
            disabled={songs.length === 0}
            onClick={() => songs.length > 0 && onPlaySong(songs[0], songs, 'playlist')}
            aria-label="Putar semua lagu dalam playlist"
            className="mt-2 flex items-center space-x-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-full font-semibold shadow-lg shadow-brand-500/20 hover:shadow-brand-500/40 transition-all w-fit hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            <Play className="w-5 h-5 fill-white" />
            <span>Play All</span>
          </button>
        </motion.div>
      </div>

      {/* Track List Table */}
      <div className="px-8 mt-6">
        {songs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500 space-y-3">
            <Music2 className="w-12 h-12 opacity-30" />
            <p className="text-base font-semibold">Playlist Ini Belum Memiliki Lagu</p>
            <p className="text-sm text-gray-400 max-w-sm text-center">
              Tambahkan lagu ke playlist ini melalui menu pencarian atau album untuk mendengarkannya.
            </p>
          </div>
        ) : (
          <>
            {/* Table Header */}
            <div className="grid grid-cols-[40px_1fr_1fr_60px_36px] gap-4 px-4 py-3 border-b border-black/10 dark:border-white/10 text-xs font-semibold uppercase tracking-wider text-gray-500 select-none">
              <span className="text-center">#</span>
              <span>Judul</span>
              <span>Album</span>
              <span className="flex items-center justify-end">
                <Clock className="w-3.5 h-3.5" />
              </span>
              <span className="text-center"></span>
            </div>

            {/* Track Rows */}
            <div className="flex flex-col" role="list">
              {songs.map((song, idx) => (
                <motion.div
                  key={song.id || idx}
                  role="button"
                  tabIndex={0}
                  aria-label={`Putar ${song.title} oleh ${song.artist}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(idx, 8) * 0.03, duration: 0.2 }}
                  onClick={() => onPlaySong(song, songs, 'playlist')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onPlaySong(song, songs, 'playlist');
                    }
                  }}
                  className="group grid grid-cols-[40px_1fr_1fr_60px_36px] gap-4 px-4 py-3 rounded-xl cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-all duration-200 items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
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
                      className="w-10 h-10 rounded-md object-cover shadow-md flex-shrink-0 bg-black/5 dark:bg-white/5" 
                    />
                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-white truncate group-hover:text-brand-500 dark:group-hover:text-brand-400 transition-colors">
                        {song.title}
                      </h4>
                      <p className="text-xs text-gray-500 truncate">{song.artist}</p>
                    </div>
                  </div>

                  {/* Album */}
                  <span className="text-sm text-gray-500 truncate group-hover:text-gray-700 dark:group-hover:text-gray-300 transition-colors">
                    {song.album || '—'}
                  </span>

                  {/* Duration */}
                  <span className="text-sm text-gray-500 text-right font-medium tabular-nums">
                    {formatDuration(song.duration)}
                  </span>

                  {/* Action Menu */}
                  <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                    <SongActionMenu
                      song={song}
                      onPlayNext={onPlayNext}
                      onAddToQueue={onAddToQueue}
                      onOpenAddToPlaylist={onOpenAddToPlaylist}
                    />
                  </div>
                </motion.div>
              ))}
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}
