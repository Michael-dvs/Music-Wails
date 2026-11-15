import { useState, useEffect, useCallback } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, Repeat, Shuffle, Video, Loader2, Info, Mic2, Sparkles, ListMusic } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { main } from '../../wailsjs/go/models';
import { fetchAPI } from '../lib/fetchAPI';

interface PlayerBarProps {
  currentSong: main.Song | main.SmartTrack | null;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSeek: (value: number) => void;
  audioRef: React.RefObject<HTMLAudioElement>;
  progress: number;
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
  onTogglePlay,
  onSeek,
  audioRef, 
  progress, 
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
  
  // Scrubbing/dragging state untuk progress slider agar bar merah tidak tertinggal saat di-drag
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);

  const togglePlay = onTogglePlay;

  const getAudioDuration = () => {
    if (audioRef.current && isFinite(audioRef.current.duration) && audioRef.current.duration > 0) {
      return audioRef.current.duration;
    }
    return 30;
  };

  const commitSeek = useCallback((val: number) => {
    setIsScrubbing(false);
    onSeek(val);
  }, [onSeek]);

  const handlePointerDown = (e: React.PointerEvent<HTMLInputElement>) => {
    if (streamLoading || !currentSong) return;
    const val = parseFloat((e.target as HTMLInputElement).value);
    setIsScrubbing(true);
    setScrubValue(val);
  };

  const handleProgressInput = (e: React.FormEvent<HTMLInputElement>) => {
    const val = parseFloat((e.target as HTMLInputElement).value);
    setScrubValue(val);
  };

  const handleProgressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setScrubValue(val);
    if (!isScrubbing) {
      commitSeek(val);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLInputElement>) => {
    if (!isScrubbing) return;
    const val = parseFloat((e.target as HTMLInputElement).value);
    commitSeek(val);
  };

  // Pastikan saat user drag lalu lepas cursor di luar slider, perubahan tetap di-commit
  useEffect(() => {
    if (!isScrubbing) return;
    const onWindowPointerUp = () => {
      commitSeek(scrubValue);
    };
    window.addEventListener('pointerup', onWindowPointerUp);
    return () => {
      window.removeEventListener('pointerup', onWindowPointerUp);
    };
  }, [isScrubbing, scrubValue, commitSeek]);

  const durationStr = () => {
    if (isHighQuality && audioRef.current && isFinite(audioRef.current.duration)) {
      return formatTime(audioRef.current.duration);
    }
    return currentSong ? '0:30' : '0:00';
  };

  // Kalkulasi progress aktif: jika sedang di-drag pakai scrubValue, jika normal pakai prop progress
  const activeProgress = isScrubbing ? scrubValue : (progress || 0);
  const clampedProgress = Math.min(Math.max(activeProgress, 0), 100);

  const displayTime = isScrubbing 
    ? (clampedProgress / 100) * getAudioDuration()
    : (audioRef.current ? audioRef.current.currentTime : 0);

  // Kalkulasi lebar progress merah agar ujungnya menyatu persis di tengah icon thumb bundar (11px)
  const progressWidth = clampedProgress <= 0 
    ? '0%' 
    : clampedProgress >= 100 
      ? '100%' 
      : `calc(${clampedProgress}% + ${(50 - clampedProgress) * 0.11}px)`;

  const volPercent = Math.min(Math.max(volume * 100, 0), 100);
  const volWidth = volPercent <= 0
    ? '0%'
    : volPercent >= 100
      ? '100%'
      : `calc(${volPercent}% + ${(50 - volPercent) * 0.11}px)`;

  return (
    <div className="h-24 w-full bg-white/80 dark:bg-black/80 backdrop-blur-lg border-t border-gray-200 dark:border-white/10 flex items-center px-4 sm:px-6 justify-between z-20 relative flex-shrink-0 gap-2 sm:gap-4">
      
      {/* Current Song Info */}
      <div className="flex items-center space-x-3 sm:space-x-4 min-w-0 flex-1 sm:w-1/3">
        {currentSong ? (
          <div className="relative group flex-shrink-0">
            {(isHighQuality || streamLoading) && (
              <div className={`absolute -inset-1 bg-red-500/30 rounded-xl blur-md transition-opacity duration-500 
                ${streamLoading ? 'animate-glow-pulse' : 'opacity-100'}`} 
              />
            )}

            <div className="relative w-12 h-12 sm:w-14 sm:h-14 bg-gray-200 dark:bg-[#1a1a1a] rounded-lg overflow-hidden border border-black/5 dark:border-white/5 shadow-2xl">
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
          <div className="w-12 h-12 sm:w-14 sm:h-14 bg-black/5 dark:bg-white/5 rounded-lg animate-pulse flex-shrink-0" />
        )}

        {/* Song Details */}
        <div className="flex flex-col min-w-0 overflow-hidden">
          {currentSong ? (
            <button
              type="button"
              onClick={() => setShowLyrics(!showLyrics)}
              aria-label={`Buka lirik untuk ${currentSong.title}`}
              title="Buka tampilan lirik"
              className="text-left text-gray-900 dark:text-white text-sm font-semibold truncate hover:underline hover:text-brand-500 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500 rounded"
            >
              {currentSong.title}
            </button>
          ) : (
            <span className="text-gray-900 dark:text-white text-sm font-semibold truncate select-none">
              Not Playing
            </span>
          )}

          {/* Artist name — clickable, resolves artistId via iTunes if needed */}
          {onNavigateToArtist && currentSong?.artist ? (
            <button
              type="button"
              onClick={async () => {
                const song = currentSong as any;
                let artistId: number = song?.artistId ?? 0;
                const artistName = currentSong.artist;

                // If no iTunes artistId stored, do a quick lookup by name
                if (!artistId) {
                  try {
                    const data = await fetchAPI<any>(
                      `https://itunes.apple.com/search?term=${encodeURIComponent(artistName)}&entity=musicArtist&limit=1&country=id`
                    );
                    if (data.results?.[0]?.artistId) {
                      artistId = data.results[0].artistId;
                    }
                  } catch (_) {}
                }

                onNavigateToArtist(artistId, artistName);
              }}
              aria-label={`Buka profil artis: ${currentSong.artist}`}
              className="text-gray-500 dark:text-gray-400 text-xs truncate text-left hover:text-brand-600 dark:hover:text-brand-400 hover:underline transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500 rounded"
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
      <div className="flex flex-col items-center justify-center min-w-0 flex-shrink-0 w-full sm:w-auto sm:max-w-md space-y-2">
        <div className="flex items-center space-x-4 sm:space-x-6">
          <button 
            type="button"
            onClick={() => setIsShuffle(!isShuffle)}
            aria-label={isShuffle ? 'Matikan mode acak' : 'Nyalakan mode acak'}
            title={isShuffle ? 'Matikan Mode Acak' : 'Nyalakan Mode Acak'}
            className={`transition-colors hover:scale-110 active:scale-95 p-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${isShuffle ? 'text-brand-600 dark:text-brand-400' : 'text-gray-600 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-400'}`}
          >
            <Shuffle className="w-4 h-4" />
          </button>
          <button 
            type="button"
            onClick={onPrev} 
            aria-label="Lagu sebelumnya"
            title="Lagu Sebelumnya"
            className="text-gray-600 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors hover:scale-110 active:scale-95 p-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <SkipBack className="w-5 h-5 fill-current" />
          </button>
          <button 
            type="button"
            onClick={togglePlay}
            disabled={streamLoading || !currentSong}
            aria-label={streamLoading ? 'Memuat streaming...' : isPlaying ? 'Jeda' : 'Putar'}
            title={streamLoading ? 'Memuat streaming...' : isPlaying ? 'Jeda' : 'Putar'}
            className={`w-10 h-10 bg-gray-900 dark:bg-white rounded-full flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-lg shadow-black/10 dark:shadow-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${
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
          <button 
            type="button"
            onClick={onNext} 
            aria-label="Lagu berikutnya"
            title="Lagu Berikutnya"
            className="text-gray-600 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors hover:scale-110 active:scale-95 p-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <SkipForward className="w-5 h-5 fill-current" />
          </button>
          <button 
            type="button"
            onClick={() => setIsRepeat(!isRepeat)}
            aria-label={isRepeat ? 'Matikan pengulangan' : 'Nyalakan pengulangan lagu'}
            title={isRepeat ? 'Matikan Pengulangan' : 'Ulangi Lagu'}
            className={`transition-colors hover:scale-110 active:scale-95 p-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${isRepeat ? 'text-brand-600 dark:text-brand-400' : 'text-gray-600 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-400'}`}
          >
            <Repeat className="w-4 h-4" />
          </button>
        </div>
        
        {/* Progress Bar */}
        <div className="flex items-center space-x-2 sm:space-x-3 w-full max-w-md">
          <span className="text-xs text-gray-500 dark:text-gray-400 w-8 text-right font-medium tabular-nums select-none">
            {formatTime(displayTime)}
          </span>
          
          <div className="relative w-full flex items-center h-4 group cursor-pointer">
            {/* Background track */}
            <div className="absolute w-full h-1 group-hover:h-1.5 bg-black/10 dark:bg-white/20 rounded-full pointer-events-none transition-[height] duration-150 ease-out" />
            {/* Filled progress bar (Merah) — width update instan 0ms tanpa lagging delay */}
            <div 
              className="absolute h-1 group-hover:h-1.5 bg-[#FA243C] rounded-full pointer-events-none transition-[height] duration-150 ease-out" 
              style={{ width: progressWidth }} 
            />
            {/* Interactive range slider thumb */}
            <input 
              type="range" 
              min="0" 
              max="100" 
              step="0.01"
              value={clampedProgress}
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
              onInput={handleProgressInput}
              onChange={handleProgressChange}
              disabled={streamLoading || !currentSong}
              aria-label="Posisi pemutaran musik"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(clampedProgress)}
              aria-valuetext={`${formatTime(displayTime)} dari ${durationStr()}`}
              className={`music-slider absolute inset-0 w-full h-full disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded ${isScrubbing ? 'is-scrubbing' : ''}`} 
            />
          </div>

          <span className="text-xs text-gray-500 dark:text-gray-400 w-8 font-medium tabular-nums select-none">
            {durationStr()}
          </span>
        </div>
      </div>

      {/* Volume & Extra Controls */}
      <div className="flex items-center justify-end space-x-3 sm:space-x-4 min-w-0 flex-shrink-0 sm:w-1/3">
        <button 
          type="button"
          onClick={() => setShowLyrics(!showLyrics)}
          aria-label={showLyrics ? 'Tutup panel lirik' : 'Buka panel lirik'}
          title={showLyrics ? 'Tutup Lirik' : 'Buka Lirik'}
          className={`transition-all hover:scale-110 active:scale-95 p-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${showLyrics ? 'text-brand-600 dark:text-brand-400' : 'text-gray-600 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-400'}`}
        >
          <Mic2 className="w-5 h-5" />
        </button>

        <div className="relative">
          <button 
            type="button"
            onClick={() => setShowQueue(!showQueue)}
            aria-label={showQueue ? 'Tutup antrean lagu' : 'Buka antrean lagu'}
            title={showQueue ? 'Tutup Antrean' : 'Buka Antrean'}
            className={`transition-all hover:scale-110 active:scale-95 p-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${showQueue ? 'text-brand-600 dark:text-brand-400' : 'text-gray-600 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-400'}`}
          >
            <ListMusic className="w-5 h-5" />
          </button>
          {queueLength > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-brand-500 text-white text-[9px] w-4 h-4 rounded-full flex items-center justify-center font-bold pointer-events-none">
              {queueLength > 9 ? '9+' : queueLength}
            </span>
          )}
        </div>

        <Volume2 className="w-5 h-5 text-gray-600 dark:text-gray-400 flex-shrink-0 hidden xs:block" aria-hidden="true" />
        <div className="relative flex items-center w-16 sm:w-24 h-4 group cursor-pointer">
          <div className="absolute w-full h-1 group-hover:h-1.5 bg-black/10 dark:bg-white/20 rounded-full pointer-events-none transition-[height] duration-150 ease-out" />
          <div 
            className="absolute h-1 group-hover:h-1.5 bg-gray-600 dark:bg-white/90 rounded-full pointer-events-none transition-[height] duration-150 ease-out" 
            style={{ width: volWidth }} 
          />
          <input 
            type="range" 
            min="0" 
            max="100" 
            step="1"
            value={volPercent}
            aria-label="Volume suara"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(volPercent)}
            title={`Volume: ${Math.round(volPercent)}%`}
            onChange={(e) => {
              const val = parseFloat(e.target.value) / 100;
              setVolume(val);
              if (audioRef.current) audioRef.current.volume = val;
            }}
            className="music-slider absolute inset-0 w-full h-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded" 
          />
        </div>
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