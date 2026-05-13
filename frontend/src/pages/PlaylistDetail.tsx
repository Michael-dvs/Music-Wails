import { motion } from 'framer-motion';
import { Play, ArrowLeft, Clock, Music2 } from 'lucide-react';
import { main } from '../../wailsjs/go/models';

interface PlaylistDetailProps {
  songs: main.Song[];
  playlistName: string;
  playlistColor: string;
  onPlaySong: (song: main.Song, queue: main.Song[]) => void;
  onBack: () => void;
}

function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return '--:--';
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function PlaylistDetail({ songs, playlistName, playlistColor, onPlaySong, onBack }: PlaylistDetailProps) {
  const totalDuration = songs.reduce((acc, s) => acc + (s.duration || 0), 0);
  const totalMinutes = Math.floor(totalDuration / 60000);

  return (
    <motion.div 
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="w-full h-full flex flex-col overflow-y-auto pb-32"
    >
      {/* Header with cover art mosaic */}
      <div 
        className="relative w-full px-8 pt-8 pb-10 flex items-end space-x-8"
        style={{ background: `linear-gradient(180deg, ${playlistColor}44 0%, transparent 100%)` }}
      >
        {/* Back Button */}
        <motion.button 
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={onBack}
          className="absolute top-6 left-6 p-2 rounded-full bg-black/30 hover:bg-black/50 backdrop-blur-md text-white/70 hover:text-white transition-all z-10"
        >
          <ArrowLeft className="w-5 h-5" />
        </motion.button>

        {/* Cover Art Mosaic (2x2 grid from first 4 songs) */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="w-52 h-52 rounded-2xl overflow-hidden shadow-2xl shadow-black/50 border border-white/10 grid grid-cols-2 grid-rows-2 flex-shrink-0"
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
            <div key={`empty-${i}`} className="w-full h-full bg-white/5 flex items-center justify-center">
              <Music2 className="w-6 h-6 text-white/20" />
            </div>
          ))}
        </motion.div>

        {/* Playlist Info */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="flex flex-col space-y-3"
        >
          <span className="text-xs font-semibold uppercase tracking-wider text-white/50">Playlist</span>
          <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight text-balance">{playlistName}</h1>
          <p className="text-sm text-white/50">
            {songs.length} songs • ~{totalMinutes} min
          </p>
          <button
            onClick={() => songs.length > 0 && onPlaySong(songs[0], songs)}
            className="mt-2 flex items-center space-x-2 bg-brand-500 hover:bg-brand-600 text-white px-6 py-2.5 rounded-full font-semibold shadow-lg shadow-brand-500/20 hover:shadow-brand-500/40 transition-all w-fit hover:scale-105 active:scale-95"
          >
            <Play className="w-5 h-5 fill-white" />
            <span>Play All</span>
          </button>
        </motion.div>
      </div>

      {/* Track List Table */}
      <div className="px-8 mt-6">
        {/* Table Header */}
        <div className="grid grid-cols-[40px_1fr_1fr_80px] gap-4 px-4 py-3 border-b border-white/10 text-xs font-semibold uppercase tracking-wider text-gray-500">
          <span className="text-center">#</span>
          <span>Title</span>
          <span>Album</span>
          <span className="flex items-center justify-end">
            <Clock className="w-3.5 h-3.5" />
          </span>
        </div>

        {/* Track Rows */}
        <div className="flex flex-col">
          {songs.map((song, idx) => (
            <motion.div
              key={song.id || idx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.03, duration: 0.25 }}
              onClick={() => onPlaySong(song, songs)}
              className="group grid grid-cols-[40px_1fr_1fr_80px] gap-4 px-4 py-3 rounded-lg cursor-pointer hover:bg-white/5 transition-all duration-200 items-center"
            >
              {/* Track Number / Play icon */}
              <div className="text-center relative">
                <span className="text-sm text-gray-500 group-hover:hidden">{idx + 1}</span>
                <Play className="w-4 h-4 text-white fill-white hidden group-hover:block mx-auto" />
              </div>

              {/* Title + Artist + Cover */}
              <div className="flex items-center space-x-3 min-w-0">
                <img 
                  src={song.coverArt} 
                  alt="" 
                  className="w-10 h-10 rounded-md object-cover shadow-md flex-shrink-0" 
                />
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-white truncate group-hover:text-brand-400 transition-colors">
                    {song.title}
                  </h4>
                  <p className="text-xs text-gray-500 truncate">{song.artist}</p>
                </div>
              </div>

              {/* Album */}
              <span className="text-sm text-gray-500 truncate group-hover:text-gray-400 transition-colors">
                {song.album}
              </span>

              {/* Duration */}
              <span className="text-sm text-gray-500 text-right font-medium">
                {formatDuration(song.duration)}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
