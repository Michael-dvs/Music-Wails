import { Play, Pause, SkipBack, SkipForward, Volume2, Repeat, Shuffle, Video, Loader2, Info, Mic2, Sparkles, ListMusic } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { main } from '../../wailsjs/go/models';

interface PlayerBarProps {
  currentSong: main.Song | main.SmartTrack | null;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  audioRef: React.RefObject<HTMLAudioElement>;
  progress: number;
  setProgress: (p: number) => void;
  isShuffle: boolean;
  setIsShuffle: (s: boolean) => void;
  onNext: () => void;
  onPrev: () => void;
  isHighQuality: boolean;
  streamLoading: boolean;
  showLyrics: boolean;
  setShowLyrics: (s: boolean) => void;
  showQueue: boolean;
  setShowQueue: (s: boolean) => void;
  isSmartShuffleActive: boolean;
  queueLength: number;
  volume: number;
  setVolume: (v: number) => void;
  isRepeat: boolean;
  setIsRepeat: (r: boolean) => void;
  onNavigateToArtist?: (artistId: number, artistName: string, genre?: string) => void;
}

export default function PlayerBar({ 
  currentSong, 
  isPlaying, 
  setIsPlaying, 
  audioRef, 
  progress, 
  setProgress,
  isShuffle,
  setIsShuffle,
  onNext,
  onPrev,
  isHighQuality,
  streamLoading,
  showLyrics,
  setShowLyrics,
  showQueue,
  setShowQueue,
  isSmartShuffleActive,
  queueLength,
  volume,
  setVolume,
  isRepeat,
  setIsRepeat,
  onNavigateToArtist,
}: PlayerBarProps) {
  
  const togglePlay = () => {
    if (!audioRef.current || !currentSong || streamLoading) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleProgressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setProgress(val);
    if (audioRef.current) {
      const duration = audioRef.current.duration && isFinite(audioRef.current.duration) && audioRef.current.duration > 0 
        ? audioRef.current.duration 
        : 30;
      audioRef.current.currentTime = (val / 100) * duration;
    }
  };

  const durationStr = () => {
    if (isHighQuality && audioRef.current && isFinite(audioRef.current.duration)) {
      return formatTime(audioRef.current.duration);
    }
    return currentSong ? '0:30' : '0:00';
  };

  return (
    <div className="h-24 w-full bg-white/80 dark:bg-black/80 backdrop-blur-lg border-t border-gray-200 dark:border-white/10 flex items-center px-6 justify-between z-20 relative flex-shrink-0">
      
      {/* Current Song Info */}
      <div className="flex items-center space-x-4 w-1/3">
        {currentSong ? (
          <div className="relative group">
            {(isHighQuality || streamLoading) && (
              <div className={`absolute -inset-1 bg-red-500/30 rounded-xl blur-md transition-opacity duration-500 
                ${streamLoading ? 'animate-glow-pulse' : 'opacity-100'}`} 
              />
            )}

            <div className="relative w-14 h-14 bg-gray-200 dark:bg-[#1a1a1a] rounded-lg overflow-hidden border border-black/5 dark:border-white/5 shadow-2xl">
              {streamLoading && (
                <div className="absolute inset-0 z-20 pointer-events-none">
                  <div className="w-full h-full bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full animate-shimmer" />
                </div>
              )}

              <img 
                src={currentSong.coverArt} 
                alt="cover" 
                className={`w-full h-full object-cover transition-all duration-700 
                  ${streamLoading ? 'scale-110 blur-[2px] opacity-50' : 'scale-100 blur-0 opacity-100'}`} 
              />

              {streamLoading && (
                <div className="absolute inset-0 z-30 flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-red-500/20 border-t-red-500 rounded-full animate-spin" />
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="w-14 h-14 bg-black/5 dark:bg-white/5 rounded-lg animate-pulse" />
        )}

        {/* Song Details */}
        <div className="flex flex-col overflow-hidden">
          <span className="text-gray-900 dark:text-white text-sm font-semibold truncate hover:underline cursor-pointer transition-all">
            {currentSong?.title || "Not Playing"}
          </span>
          {/* Artist name — clickable, resolves artistId via iTunes if needed */}
          {onNavigateToArtist && currentSong?.artist ? (
            <button
              onClick={async () => {
                const song = currentSong as any;
                let artistId: number = song?.artistId ?? 0;
                const artistName = currentSong.artist;

                // If no iTunes artistId stored, do a quick lookup by name
                if (!artistId) {
                  try {
                    const res = await fetch(
                      `https://itunes.apple.com/search?term=${encodeURIComponent(artistName)}&entity=musicArtist&limit=1&country=id`
                    );
                    const data = await res.json();
                    if (data.results?.[0]?.artistId) {
                      artistId = data.results[0].artistId;
                    }
                  } catch (_) {}
                }

                onNavigateToArtist(artistId, artistName);
              }}
              className="text-gray-500 dark:text-gray-400 text-xs truncate text-left hover:text-brand-600 dark:hover:text-brand-400 hover:underline cursor-pointer transition-colors"
            >
              {currentSong.artist}
            </button>
          ) : (
            <span className="text-gray-500 dark:text-gray-400 text-xs truncate">
              {currentSong?.artist || "Unknown Artist"}
            </span>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col items-center justify-center w-1/3 space-y-2">
        <div className="flex items-center space-x-6">
          <button 
            onClick={() => setIsShuffle(!isShuffle)}
            className={`transition-colors hover:scale-110 active:scale-95 ${isShuffle ? 'text-brand-600 dark:text-brand-400' : 'text-gray-600 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-400'}`}
          >
            <Shuffle className="w-4 h-4" />
          </button>
          <button onClick={onPrev} className="text-gray-600 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors hover:scale-110 active:scale-95">
            <SkipBack className="w-5 h-5 fill-current" />
          </button>
          <button 
            onClick={togglePlay}
            disabled={streamLoading || !currentSong}
            className={`w-10 h-10 bg-gray-900 dark:bg-white rounded-full flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-lg shadow-black/10 dark:shadow-white/10 ${
              (streamLoading || !currentSong) ? 'opacity-50 cursor-not-allowed scale-100' : ''
            }`}
          >
            {streamLoading ? (
               <Loader2 className="w-5 h-5 text-white dark:text-black animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-5 h-5 text-white dark:text-black fill-white dark:fill-black" />
            ) : (
              <Play className="w-5 h-5 text-white dark:text-black fill-white dark:fill-black ml-1" />
            )}
          </button>
          <button onClick={onNext} className="text-gray-600 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors hover:scale-110 active:scale-95">
            <SkipForward className="w-5 h-5 fill-current" />
          </button>
          <button 
            onClick={() => setIsRepeat(!isRepeat)}
            className={`transition-colors hover:scale-110 active:scale-95 ${isRepeat ? 'text-brand-600 dark:text-brand-400' : 'text-gray-600 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-400'}`}
          >
            <Repeat className="w-4 h-4" />
          </button>
        </div>
        
        {/* Progress Bar */}
        <div className="flex items-center space-x-3 w-full max-w-md">
          <span className="text-xs text-gray-500 dark:text-gray-400 w-8 text-right font-medium tabular-nums">
            {audioRef.current ? formatTime(audioRef.current.currentTime) : '0:00'}
          </span>
          
          <div className="relative w-full flex items-center h-3 group cursor-pointer">
            <div className="absolute w-full h-1 bg-black/10 dark:bg-white/20 rounded-full pointer-events-none" />
            <div 
              className="absolute h-1 bg-[#FA243C] rounded-full pointer-events-none" 
              style={{ width: `${progress || 0}%` }} 
            />
            <input 
              type="range" 
              min="0" 
              max="100" 
              value={progress || 0}
              onChange={handleProgressChange}
              disabled={streamLoading || !currentSong}
              className="absolute inset-0 w-full h-full appearance-none bg-transparent cursor-pointer accent-[#FA243C] disabled:opacity-50 m-0 z-10 outline-none border-none shadow-none" 
            />
          </div>

          <span className="text-xs text-gray-500 dark:text-gray-400 w-8 font-medium tabular-nums">
            {durationStr()}
          </span>
        </div>
      </div>

      {/* Volume & Extra Controls */}
      <div className="flex items-center justify-end space-x-4 w-1/3">
        <button 
          onClick={() => setShowLyrics(!showLyrics)}
          className={`transition-all hover:scale-110 active:scale-95 ${showLyrics ? 'text-brand-600 dark:text-brand-400' : 'text-gray-600 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-400'}`}
        >
          <Mic2 className="w-5 h-5" />
        </button>

        <div className="relative">
          <button 
            onClick={() => setShowQueue(!showQueue)}
            className={`transition-all hover:scale-110 active:scale-95 ${showQueue ? 'text-brand-600 dark:text-brand-400' : 'text-gray-600 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-400'}`}
          >
            <ListMusic className="w-5 h-5" />
          </button>
          {queueLength > 0 && (
            // FIX: text-white agar angka notifikasi tetap terbaca jelas di atas warna brand merah
            <span className="absolute -top-1.5 -right-1.5 bg-brand-500 text-white text-[9px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
              {queueLength > 9 ? '9+' : queueLength}
            </span>
          )}
        </div>

        <Volume2 className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        <input 
          type="range" 
          min="0" 
          max="100" 
          value={volume * 100}
          onChange={(e) => {
            const val = parseFloat(e.target.value) / 100;
            setVolume(val);
            if (audioRef.current) audioRef.current.volume = val;
          }}
          // FIX: accent-gray-600 di light mode (karena putih tidak akan terlihat), dan accent-white di dark mode
          className="w-24 h-1 bg-black/10 dark:bg-white/20 rounded-lg appearance-none cursor-pointer accent-gray-600 dark:accent-white" 
        />
      </div>
    </div>
  );
}

function formatTime(seconds: number) {
  if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}