import { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings2, Lock, Unlock, AlertTriangle, X, SearchCheck } from 'lucide-react';
import { main } from '../../wailsjs/go/models';
import { LyricLine } from '../App';
import { GetTrackPulseDuration } from '../../wailsjs/go/main/App';

interface LyricsProps {
  currentSong: main.Song | null;
  currentTime: number;
  lyrics: LyricLine[];
  loading: boolean;
  isRetrying: boolean;
  audioDuration: number;
  lrcDuration: number;
  bgColor: string; // dominant color from album art (Apple Music style)
  onClose: () => void;
}

export default function Lyrics({ currentSong, currentTime, lyrics, loading, isRetrying, audioDuration, lrcDuration, bgColor, onClose }: LyricsProps) {
  const [activeLine, setActiveLine] = useState<number>(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLParagraphElement | null)[]>([]);

  // Auto-Scroll Toggle (Freedom Mode)
  const [autoScroll, setAutoScroll] = useState<boolean>(() => {
    if (currentSong) {
      const saved = localStorage.getItem('lyric_autoscroll_' + currentSong.id);
      if (saved !== null) return saved === 'true';
    }
    return true;
  });

  // Manual Offset State
  const [offset, setOffset] = useState<number>(() => {
    if (currentSong) {
      const saved = localStorage.getItem('lyric_offset_' + currentSong.id);
      if (saved) return parseFloat(saved);
    }
    return 0;
  });

  // Duration mismatch warning
  const [showMismatchWarning, setShowMismatchWarning] = useState(false);

  // Dynamic background pulse based on Last.fm genre tags
  const [pulseDuration, setPulseDuration] = useState<number>(4.0);

  useEffect(() => {
    if (currentSong) {
      GetTrackPulseDuration(currentSong.artist, currentSong.title).then(duration => {
        setPulseDuration(duration);
      }).catch(() => {
        setPulseDuration(4.0);
      });
    }
  }, [currentSong]);

  useEffect(() => {
    if (currentSong) {
      const saved = localStorage.getItem('lyric_offset_' + currentSong.id);
      setOffset(saved ? parseFloat(saved) : 0);

      const savedAutoScroll = localStorage.getItem('lyric_autoscroll_' + currentSong.id);
      setAutoScroll(savedAutoScroll !== null ? savedAutoScroll === 'true' : true);
    }
  }, [currentSong?.id]);

  // Duration mismatch detection
  useEffect(() => {
    if (audioDuration > 0 && lrcDuration > 0) {
      const diff = Math.abs(audioDuration - lrcDuration);
      if (diff > 3) {
        setShowMismatchWarning(true);
        // Auto dismiss after 8 seconds
        const timer = setTimeout(() => setShowMismatchWarning(false), 8000);
        return () => clearTimeout(timer);
      } else {
        setShowMismatchWarning(false);
      }
    }
  }, [audioDuration, lrcDuration]);

  const toggleAutoScroll = useCallback(() => {
    setAutoScroll(prev => {
      const newVal = !prev;
      if (currentSong) {
        localStorage.setItem('lyric_autoscroll_' + currentSong.id, newVal.toString());
      }
      return newVal;
    });
  }, [currentSong]);

  const handleOffsetChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = parseFloat(e.target.value);
    setOffset(newVal);
    if (currentSong) {
      localStorage.setItem('lyric_offset_' + currentSong.id, newVal.toString());
    }
  }, [currentSong]);

  useEffect(() => {
    if (lyrics.length === 0) {
      setActiveLine(-1);
      return;
    }

    // Real-time offset binding: offset is applied instantly
    const adjustedTime = currentTime + 0.2 + offset;

    // Efficient findLastIndex logic using backward loop
    let newActiveIndex = -1;
    for (let i = lyrics.length - 1; i >= 0; i--) {
      if (adjustedTime >= lyrics[i].time) {
        newActiveIndex = i;
        break;
      }
    }

    if (newActiveIndex !== activeLine) {
      setActiveLine(newActiveIndex);
      
      // Auto scroll only if enabled (Freedom Mode OFF = autoScroll ON)
      if (autoScroll && newActiveIndex >= 0 && lineRefs.current[newActiveIndex]) {
        lineRefs.current[newActiveIndex]?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    }
  }, [currentTime, lyrics, activeLine, offset, autoScroll]);

  return (
    <div
      className="absolute inset-0 z-50 overflow-hidden flex transition-colors duration-700"
      style={{ backgroundColor: bgColor }}
    >
      {/* Blurred album art overlay — ONLY here, not global app */}
      {currentSong && (
        <img
          src={currentSong.coverArt}
          alt="bg"
          className="absolute inset-0 w-full h-full object-cover blur-[80px] pointer-events-none opacity-20"
        />
      )}
      {/* Dark vignette over art */}
      <div className="absolute inset-0 bg-white/55 dark:bg-black/55 pointer-events-none" />

      {/* Close Button */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute top-12 left-0 z-[60] flex items-center justify-center w-12 h-12 rounded-full bg-black/10 dark:bg-white/10 backdrop-blur-md border border-black/10 dark:border-white/10 hover:bg-white/50 dark:hover:bg-black/50 transition-all duration-500 ease-out group/close -translate-x-1/2 hover:translate-x-4 cursor-pointer shadow-lg"
      >
        <X className="w-5 h-5 text-black/50 dark:text-white/50 group-hover/close:text-black dark:group-hover/close:text-white transition-all duration-500 opacity-0 group-hover/close:opacity-100 scale-50 group-hover/close:scale-100" />
      </motion.button>

      {/* Duration Mismatch Warning */}
      <AnimatePresence>
        {showMismatchWarning && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-6 left-1/2 -translate-x-1/2 z-[60] flex items-center space-x-2 bg-amber-500/20 backdrop-blur-md text-amber-300 text-sm px-4 py-2 rounded-full border border-amber-500/30 mismatch-warning"
          >
            <AlertTriangle className="w-4 h-4" />
            <span>Duration mismatch detected ({Math.abs(audioDuration - lrcDuration).toFixed(0)}s diff)</span>
            <button 
              onClick={() => setShowMismatchWarning(false)}
              className="ml-2 p-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content */}
      <div className="relative z-10 w-full h-full flex flex-col md:flex-row items-center p-12 pt-20 pb-32">
        {/* Album Art Side */}
        <motion.div 
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          className="w-full md:w-1/2 flex flex-col items-center justify-center p-8 hidden md:flex"
        >
          {currentSong ? (
            <div className="relative w-80 h-80 rounded-2xl overflow-hidden shadow-2xl shadow-black/50 border border-black/10 dark:border-white/10">
              <img src={currentSong.coverArt} alt="cover" className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="w-80 h-80 rounded-2xl bg-black/5 dark:bg-white/5 animate-pulse" />
          )}
        </motion.div>

        {/* Lyrics Side */}
        <div 
          className="w-full md:w-1/2 h-full overflow-y-auto no-scrollbar mask-linear-fade flex flex-col space-y-8 px-8 py-[40vh]"
          ref={scrollRef}
        >
          {loading ? (
            <div className="flex flex-col space-y-8 w-full opacity-50 justify-center h-full">
              <div className="h-12 md:h-16 bg-black/20 dark:bg-white/20 rounded-xl w-3/4 animate-shimmer"></div>
              <div className="h-12 md:h-16 bg-black/20 dark:bg-white/20 rounded-xl w-full animate-shimmer"></div>
              <div className="h-12 md:h-16 bg-black/20 dark:bg-white/20 rounded-xl w-2/3 animate-shimmer"></div>
            </div>
          ) : lyrics.length > 0 ? (
            lyrics.map((line, idx) => (
              <motion.p
                key={idx}
                layout
                ref={(el) => (lineRefs.current[idx] = el)}
                animate={{
                  scale: activeLine === idx ? 1.05 : 1,
                  opacity: activeLine === idx ? 1 : activeLine > idx ? 0.4 : 0.3,
                  filter: activeLine === idx ? 'blur(0px)' : 'blur(0.5px)'
                }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className={`text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight transform origin-left transition-colors duration-500 cursor-pointer hover:text-black dark:hover:text-white ${
                  activeLine === idx ? 'text-black dark:text-white' : 'text-black/40 dark:text-white/40'
                }`}
              >
                {line.text || '\u266a'}
              </motion.p>
            ))
          ) : isRetrying ? (
            // Exponential backoff shimmer state
            <div className="flex flex-col items-center justify-center h-full pb-32 space-y-8">
              {/* Shimmer placeholder lines */}
              <div className="w-full space-y-7 opacity-40">
                <div className="h-10 md:h-14 bg-black/20 dark:bg-white/20 rounded-xl w-3/4 animate-shimmer" />
                <div className="h-10 md:h-14 bg-black/20 dark:bg-white/20 rounded-xl w-full animate-shimmer" />
                <div className="h-10 md:h-14 bg-black/20 dark:bg-white/20 rounded-xl w-2/3 animate-shimmer" />
                <div className="h-10 md:h-14 bg-black/20 dark:bg-white/20 rounded-xl w-4/5 animate-shimmer" />
              </div>
              {/* Searching indicator */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center space-x-2 mt-6"
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                >
                  <SearchCheck className="w-5 h-5 text-brand-400" />
                </motion.div>
                <span className="text-sm text-black/50 dark:text-white/50 font-medium tracking-wide">Mencari lirik...</span>
                <motion.span
                  animate={{ opacity: [0.2, 1, 0.2] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                  className="text-sm text-black/30 dark:text-white/30"
                >
                  
                </motion.span>
              </motion.div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full pb-32">
              <p className="text-3xl text-black/40 dark:text-white/40 font-semibold text-center">No lyrics found for this song.</p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Controls - Offset + Auto-Scroll Toggle */}
      {lyrics.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute bottom-16 right-12 z-50 flex items-center justify-end group h-14"
        >
          {/* Subtle Icon Trigger (Visible when NOT hovered) */}
          <div className="absolute right-0 flex items-center justify-center w-12 h-12 rounded-full bg-black/5 dark:bg-white/5 backdrop-blur-md border border-black/5 dark:border-white/5 opacity-40 group-hover:opacity-0 transition-opacity duration-300 pointer-events-none">
            <Settings2 className="w-5 h-5 text-black dark:text-white" />
          </div>

          {/* Expanded Controls Panel (Fades in and expands on hover) */}
          <div className="flex items-center space-x-4 bg-white/30 dark:bg-black/30 hover:bg-white/50 dark:hover:bg-black/50 backdrop-blur-md px-5 py-3 rounded-2xl border border-black/10 dark:border-white/10 shadow-xl opacity-0 scale-95 origin-right group-hover:opacity-100 group-hover:scale-100 transition-all duration-500 ease-out pointer-events-none group-hover:pointer-events-auto">
            {/* Auto-Scroll Toggle */}
            <button
              onClick={toggleAutoScroll}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300 ${
                autoScroll
                  ? 'bg-brand-500/20 text-brand-300 border border-brand-500/30'
                  : 'bg-black/5 dark:bg-white/5 text-black/50 dark:text-white/50 border border-black/10 dark:border-white/10 hover:text-brand-500 dark:hover:text-brand-400'
              }`}
              title={autoScroll ? 'Auto-Scroll ON — Click to enable Freedom Mode' : 'Freedom Mode ON — Manual scroll active'}
            >
              {autoScroll ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
              <span>{autoScroll ? 'Auto-Scroll' : 'Free Scroll'}</span>
            </button>

            {/* Divider */}
            <div className="w-px h-6 bg-black/10 dark:bg-white/10" />

            {/* Offset Slider */}
            <div className="flex items-center space-x-3">
              <Settings2 className="w-4 h-4 text-black/50 dark:text-white/50 group-hover:text-brand-500 dark:group-hover:text-brand-400 transition-colors" />
              <span className="text-xs font-mono font-medium text-black/70 dark:text-white/70 w-12 text-center">
                {offset > 0 ? '+' : ''}{offset.toFixed(1)}s
              </span>
              <input
                type="range"
                min="-5"
                max="5"
                step="0.1"
                value={offset}
                onChange={handleOffsetChange}
                className="w-28 offset-slider"
                title={`Lyrics offset: ${offset > 0 ? '+' : ''}${offset.toFixed(1)}s`}
              />
            </div>
          </div>
        </motion.div>
      )}
      </div>  );
}
