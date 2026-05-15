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
      // Use duration if available, else 30s
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
    <div className="h-24 w-full glass-panel flex items-center px-6 justify-between z-20 relative flex-shrink-0">
      
      {/* Current Song Info */}
      <div className="flex items-center space-x-4 w-1/3">
        {currentSong ? (
          <div className="relative group">

            {(isHighQuality || streamLoading) && (
              <div className={`absolute -inset-1 bg-red-500/30 rounded-xl blur-md transition-opacity duration-500 
                ${streamLoading ? 'animate-glow-pulse' : 'opacity-100'}`} 
              />
            )}


            <div className="relative w-14 h-14 bg-[#1a1a1a] rounded-lg overflow-hidden border border-white/5 shadow-2xl">
              
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
          /* Empty State / Skeleton */
          <div className="w-14 h-14 bg-white/5 rounded-lg animate-pulse" />
        )}

        {/* Song Details */}
        <div className="flex flex-col overflow-hidden">
          <span className="text-white text-sm font-semibold truncate hover:underline cursor-pointer transition-all">
            {currentSong?.title || "Not Playing"}
          </span>
          <span className="text-gray-400 text-xs truncate">
            {currentSong?.artist || "Unknown Artist"}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col items-center justify-center w-1/3 space-y-2">
        <div className="flex items-center space-x-6">
          <button 
            onClick={() => setIsShuffle(!isShuffle)}
            className={`transition-colors hover:scale-110 active:scale-95 ${isShuffle ? 'text-brand-400' : 'text-gray-600 dark:text-gray-400 hover:text-brand-500 dark:hover:text-brand-400'}`}
          >
            <Shuffle className="w-4 h-4" />
          </button>
          <button onClick={onPrev} className="text-gray-600 dark:text-gray-400 hover:text-brand-500 dark:hover:text-brand-400 transition-colors hover:scale-110 active:scale-95">
            <SkipBack className="w-5 h-5 fill-current" />
          </button>
          <button 
            onClick={togglePlay}
            disabled={streamLoading || !currentSong}
            className={`w-10 h-10 bg-white rounded-full flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-lg shadow-black/10 dark:shadow-white/10 ${
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
          <button onClick={onNext} className="text-gray-600 dark:text-gray-400 hover:text-brand-500 dark:hover:text-brand-400 transition-colors hover:scale-110 active:scale-95">
            <SkipForward className="w-5 h-5 fill-current" />
          </button>
          <button className="text-gray-600 dark:text-gray-400 hover:text-brand-500 dark:hover:text-brand-400 transition-colors hover:scale-110 active:scale-95">
            <Repeat className="w-4 h-4" />
          </button>
        </div>
        
        {/* Progress Bar */}
        <div className="flex items-center space-x-3 w-full max-w-md">
          <span className="text-xs text-gray-600 dark:text-gray-400 w-8 text-right font-medium tabular-nums">
            {audioRef.current ? formatTime(audioRef.current.currentTime) : '0:00'}
          </span>
          <input 
            type="range" 
            min="0" 
            max="100" 
            value={progress}
            onChange={handleProgressChange}
            disabled={streamLoading || !currentSong}
            className="w-full h-1 bg-black/20 dark:bg-white/20 rounded-lg appearance-none cursor-pointer accent-brand-500 disabled:opacity-50" 
          />
          <span className="text-xs text-gray-600 dark:text-gray-400 w-8 font-medium tabular-nums">
            {durationStr()}
          </span>
        </div>
      </div>

      {/* Volume & Extra Controls */}
      <div className="flex items-center justify-end space-x-4 w-1/3">
        {/* Smart Shuffle active indicator */}
        {/*<AnimatePresence>
          {isSmartShuffleActive && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="flex items-center space-x-1 bg-purple-500/20 text-purple-300 text-[10px] px-2 py-1 rounded-full border border-purple-500/30"
            >
              <Sparkles className="w-3 h-3 animate-pulse" />
              <span className="font-medium">Smart Shuffle</span>
            </motion.div>
          )}
        </AnimatePresence>
        */}

        {/* Lyrics Button */}
        <button 
          onClick={() => setShowLyrics(!showLyrics)}
          className={`transition-all hover:scale-110 active:scale-95 ${showLyrics ? 'text-brand-400' : 'text-gray-600 dark:text-gray-400 hover:text-brand-500 dark:hover:text-brand-400'}`}
        >
          <Mic2 className="w-5 h-5" />
        </button>

        {/* Queue Button */}
        <div className="relative">
          <button 
            onClick={() => setShowQueue(!showQueue)}
            className={`transition-all hover:scale-110 active:scale-95 ${showQueue ? 'text-brand-400' : 'text-gray-600 dark:text-gray-400 hover:text-brand-500 dark:hover:text-brand-400'}`}
          >
            <ListMusic className="w-5 h-5" />
          </button>
          {queueLength > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-brand-500 text-black dark:text-white text-[9px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
              {queueLength > 9 ? '9+' : queueLength}
            </span>
          )}
        </div>

        <Volume2 className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        <input 
          type="range" 
          min="0" 
          max="100" 
          defaultValue="100"
          onChange={(e) => {
            if (audioRef.current) audioRef.current.volume = parseFloat(e.target.value) / 100;
          }}
          className="w-24 h-1 bg-black/20 dark:bg-white/20 rounded-lg appearance-none cursor-pointer accent-white" 
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
