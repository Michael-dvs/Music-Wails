import { useState, useRef, useEffect, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';

import Sidebar from './components/Sidebar';
import PlayerBar from './components/PlayerBar';
import QueuePanel from './components/QueuePanel';
import Search from './pages/Search';
import Home from './pages/Home';
import Lyrics from './pages/Lyrics';
import LoginPage from './pages/LoginPage';
import Settings from './pages/Settings';
import Profile from './pages/Profile';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';

import { main } from '../wailsjs/go/models';
import { GetFullStreamURL, GetLyrics, BuildSmartQueue } from '../wailsjs/go/main/App';

// ──────────────────────────────────────────
//  Lyrics helpers (shared)
// ──────────────────────────────────────────
export interface LyricLine {
  time: number;
  text: string;
}

export function parseLyrics(lrc: string): LyricLine[] {
  console.log('[Lyrics] Parsing raw lyrics:', lrc.substring(0, 80) + '...');
  const lines = lrc.split('\n');
  const result: LyricLine[] = [];
  const timeRegex = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/;

  for (const line of lines) {
    const match = line.match(timeRegex);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      let millis = 0;
      if (match[3]) {
        millis = parseInt(match[3], 10);
        if (match[3].length === 1) millis *= 100;
        else if (match[3].length === 2) millis *= 10;
      }
      const text = line.replace(timeRegex, '').trim();
      const totalSeconds = minutes * 60 + seconds + millis / 1000;
      result.push({ time: totalSeconds, text });
    }
  }

  console.log(`[Lyrics] Parsed ${result.length} lines.`);
  return result.sort((a, b) => a.time - b.time);
}

// ──────────────────────────────────────────
//  Unified track type (Song | SmartTrack)
// ──────────────────────────────────────────
type AnyTrack = main.Song | main.SmartTrack;

function getPreviewURL(track: AnyTrack): string {
  return (track as main.SmartTrack).previewUrl ?? (track as main.Song).streamUrl ?? '';
}

// ──────────────────────────────────────────
//  State Persistence Helper
// ──────────────────────────────────────────
const initialPersistedState = (() => {
  try {
    const saved = localStorage.getItem('music_player_state');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Failed to load persisted state:', e);
  }
  return {};
})();

// ──────────────────────────────────────────
//  App (authenticated music player)
// ──────────────────────────────────────────
function MusicApp() {
  const { user, profile } = useAuth();
  const [activeTab, setActiveTab] = useState('home');
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [isDragging, setIsDragging] = useState(false);

  // Current playback
  const [currentSong, setCurrentSong] = useState<AnyTrack | null>(initialPersistedState.currentSong || null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  // bgColor is ONLY applied on the Lyrics page — rest of app stays flat black
  const [lyricsBgColor, setLyricsBgColor] = useState('rgb(12, 12, 12)');
  const [isHighQuality, setIsHighQuality] = useState(false);
  const [streamLoading, setStreamLoading] = useState(false);
  const [audioDuration, setAudioDuration] = useState(0);

  // Queue
  const [queue, setQueue] = useState<AnyTrack[]>(initialPersistedState.queue || []);
  const [originalQueue, setOriginalQueue] = useState<AnyTrack[]>(initialPersistedState.originalQueue || []);
  const [isShuffle, setIsShuffle] = useState(initialPersistedState.isShuffle || false);
  const [isSmartShuffleActive, setIsSmartShuffleActive] = useState(false);
  const [isGeneratingQueue, setIsGeneratingQueue] = useState(false);
  const [volume, setVolume] = useState<number>(initialPersistedState.volume ?? 1.0);
  const [isRepeat, setIsRepeat] = useState<boolean>(initialPersistedState.isRepeat || false);
  // History of played song IDs — persisted so duplicates are avoided across restarts
  const [playedHistory, setPlayedHistory] = useState<string[]>(initialPersistedState.playedHistory || []);
  const playedHistoryRef = useRef<string[]>(initialPersistedState.playedHistory || []);
  useEffect(() => { playedHistoryRef.current = playedHistory; }, [playedHistory]);

  // Stable ref so callbacks always see the latest queue
  const queueRef = useRef<AnyTrack[]>([]);
  useEffect(() => { queueRef.current = queue; }, [queue]);

  // Persist state to localStorage
  useEffect(() => {
    const stateToSave = {
      currentSong,
      queue,
      originalQueue,
      isShuffle,
      volume,
      isRepeat,
      playedHistory,
    };
    localStorage.setItem('music_player_state', JSON.stringify(stateToSave));
  }, [currentSong, queue, originalQueue, isShuffle, volume, isRepeat, playedHistory]);

  // UI panels
  const [showLyrics, setShowLyrics] = useState(false);
  const [showQueue, setShowQueue] = useState(false);

  // Lyrics
  const [currentTimeSeconds, setCurrentTimeSeconds] = useState(0);
  const [globalLyrics, setGlobalLyrics] = useState<LyricLine[]>([]);
  const [isLyricsLoading, setIsLyricsLoading] = useState(false);
  const [isLyricsRetrying, setIsLyricsRetrying] = useState(false); // exponential backoff active
  const [lrcDuration, setLrcDuration] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Sync volume with audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);
  const rafRef = useRef<number | null>(null);
  const currentSongRef = useRef<AnyTrack | null>(null);
  const isGeneratingRef = useRef(false);
  const queuePanelRef = useRef<HTMLDivElement | null>(null); // for click-outside detection
  // Stable ref so callbacks always read the LATEST profile (API keys) — fixes stale closure
  const profileRef = useRef(profile);

  useEffect(() => { currentSongRef.current = currentSong; }, [currentSong]);
  useEffect(() => { isGeneratingRef.current = isGeneratingQueue; }, [isGeneratingQueue]);
  useEffect(() => { profileRef.current = profile; }, [profile]);

  // ── Dragging logic for Sidebar ──
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      const newWidth = Math.min(Math.max(e.clientX, 160), 400);
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // ── ColorThief — ONLY extract color for Lyrics page background ──
  useEffect(() => {
    const art = currentSong?.coverArt;
    if (!art) return;
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = art;
    img.onload = () => {
      try {
        const CT = (window as any).ColorThief;
        if (CT) {
          const [r, g, b] = new CT().getColor(img);
          setLyricsBgColor(`rgb(${r},${g},${b})`);
        }
      } catch (_) {}
    };
  }, [currentSong]);

  // ── Disable Inspect Element and Context Menu ──
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const handleKeyDownInspect = (e: KeyboardEvent) => {
      // F12
      if (e.key === 'F12') {
        e.preventDefault();
      }
      // Ctrl+Shift+I, J, C and Ctrl+U
      if (e.ctrlKey && e.shiftKey && ['I', 'i', 'J', 'j', 'C', 'c'].includes(e.key)) {
        e.preventDefault();
      }
      if (e.ctrlKey && ['U', 'u'].includes(e.key)) {
        e.preventDefault();
      }
    };

    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('keydown', handleKeyDownInspect);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('keydown', handleKeyDownInspect);
    };
  }, []);

  // ── Keyboard shortcuts (Esc closes Lyrics; cleanup prevents leaks) ──
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }

      if (e.key === 'Escape' && showLyrics) {
        setShowLyrics(false);
      } else if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();

        // Blur the active element to prevent UI buttons from getting visual focus/double-clicking
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }

        if (!audioRef.current || !currentSongRef.current || streamLoading) return;
        
        if (isPlaying) {
          audioRef.current.pause();
        } else {
          audioRef.current.play();
        }
        setIsPlaying(!isPlaying);
      }
    };
    // Use capture phase to intercept the spacebar before it triggers button clicks
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [showLyrics, isPlaying, streamLoading]);

  // ── Click-outside closes QueuePanel ──
  useEffect(() => {
    if (!showQueue) return;
    const onPointerDown = (e: PointerEvent) => {
      if (queuePanelRef.current && !queuePanelRef.current.contains(e.target as Node)) {
        setShowQueue(false);
      }
    };
    // Use 'capture' so it fires before panel's own events
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [showQueue]);

  // ── requestAnimationFrame timing (60 FPS) ──
  useEffect(() => {
    const tick = () => {
      if (audioRef.current) {
        const cur = audioRef.current.currentTime;
        setCurrentTimeSeconds(cur);
        const total =
          audioRef.current.duration && isFinite(audioRef.current.duration) && audioRef.current.duration > 0
            ? audioRef.current.duration
            : 30;
        setProgress((cur / total) * 100);
      }
      if (isPlaying) rafRef.current = requestAnimationFrame(tick);
    };
    if (isPlaying) rafRef.current = requestAnimationFrame(tick);
    else if (rafRef.current) cancelAnimationFrame(rafRef.current);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isPlaying]);

  const handleLoadedMetadata = useCallback(() => {
    if (audioRef.current && isFinite(audioRef.current.duration)) {
      setAudioDuration(audioRef.current.duration);
    }
  }, []);

  // ──────────────────────────────────────────
  //  Smart Queue builder — with Fisher-Yates variety + deduplication filter
  // ──────────────────────────────────────────
  const buildAndSetSmartQueue = useCallback(async (seed: AnyTrack, appendToQueue: AnyTrack[] = []) => {
    if (isGeneratingRef.current) return;
    isGeneratingRef.current = true;
    setIsGeneratingQueue(true);
    console.log(`[SmartShuffle] Building queue for "${seed.artist} - ${seed.title}"`);

    try {
      const genre = (seed as any).genre ?? '';
      const rawResults = await BuildSmartQueue(seed.artist, seed.title, genre, seed.id);

      if (rawResults && rawResults.length > 0) {
        console.log(`[SmartShuffle] ${rawResults.length} raw tracks received`);

        // Step 1: Fisher-Yates shuffle on the full raw result for variety
        const shuffled = [...rawResults];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        // Step 2: Deduplication — remove IDs already in history or current queue
        const currentQueueIds = new Set(queueRef.current.map(s => s.id));
        const historyIds = new Set(playedHistoryRef.current);
        const deduplicated = shuffled.filter(
          s => !historyIds.has(s.id) && !currentQueueIds.has(s.id)
        );

        // Step 3: Take only 5-7 clean tracks
        const fresh = deduplicated.slice(0, 7);
        console.log(`[SmartShuffle] ${fresh.length} fresh tracks after dedup (history: ${historyIds.size}, queue: ${currentQueueIds.size})`);

        if (fresh.length > 0) {
          setIsSmartShuffleActive(true);
          const newQueue: AnyTrack[] = appendToQueue.length > 0
            ? [...appendToQueue, ...fresh]
            : [seed, ...fresh];
          setQueue(newQueue);
          queueRef.current = newQueue;
        } else {
          console.warn('[SmartShuffle] All recommendations were duplicates — clearing history and retrying batch');
          // Safety net: if everything was filtered out, clear history and use the shuffled pool
          setPlayedHistory([]);
          playedHistoryRef.current = [];
          const fallback = shuffled.slice(0, 7);
          setIsSmartShuffleActive(true);
          const newQueue: AnyTrack[] = appendToQueue.length > 0
            ? [...appendToQueue, ...fallback]
            : [seed, ...fallback];
          setQueue(newQueue);
          queueRef.current = newQueue;
        }
      } else {
        console.warn('[SmartShuffle] No recommendations returned');
      }
    } catch (e) {
      console.error('[SmartShuffle] Error:', e);
    } finally {
      isGeneratingRef.current = false;
      setIsGeneratingQueue(false);
    }
  }, []);

  // ──────────────────────────────────────────
  //  Lyrics pre-fetcher
  // ──────────────────────────────────────────
  const fetchLyricsBackground = useCallback(async (song: AnyTrack) => {
    console.log(`[Lyrics] Fetching: ${song.artist} - ${song.title}`);
    setGlobalLyrics([]);
    setIsLyricsLoading(true);
    setLrcDuration(0);
    try {
      const durationSec = Math.floor((song.duration ?? 0) / 1000);
      const result = await GetLyrics(song.artist, song.title, durationSec);
      console.log(`[Lyrics] Response length: ${result?.syncedLyrics?.length ?? 0}`);
      if (result?.lrcDuration > 0) setLrcDuration(result.lrcDuration);
      const raw = result?.syncedLyrics || result?.plainLyrics || '';
      if (raw.trim()) {
        setGlobalLyrics(parseLyrics(raw));
        console.log('[Lyrics] Stored in global state.');
      } else {
        console.log('[Lyrics] No lyrics found.');
      }
    } catch (e) {
      console.error('[Lyrics] Error:', e);
    } finally {
      setIsLyricsLoading(false);
    }
  }, []);

  // ──────────────────────────────────────────
  //  Exponential Backoff Polling for Lyrics
  //  Only active when: lyrics page open + lyrics empty + same song
  // ──────────────────────────────────────────
  useEffect(() => {
    // Visibility guard — only run when lyrics page is open
    if (!showLyrics) return;
    // Stop if lyrics already loaded OR initial fetch still running
    if (globalLyrics.length > 0 || isLyricsLoading) return;
    if (!currentSong) return;

    // Exponential backoff schedule (ms): 2s → 5s → 10s → 10s → ...
    const DELAYS = [2000, 5000, 10000];
    let retryCount = 0;
    let timerId: ReturnType<typeof setTimeout>;
    let isCancelled = false;
    const stableSongId = currentSong.id;

    const attemptRetry = () => {
      if (isCancelled || currentSongRef.current?.id !== stableSongId) return;
      const delay = DELAYS[Math.min(retryCount, DELAYS.length - 1)];
      console.log(`[Lyrics] Backoff #${retryCount + 1} — retrying in ${delay}ms`);

      timerId = setTimeout(async () => {
        if (isCancelled || currentSongRef.current?.id !== stableSongId) return;

        setIsLyricsRetrying(true);
        try {
          const durationSec = Math.floor((currentSong.duration ?? 0) / 1000);
          const result = await GetLyrics(currentSong.artist, currentSong.title, durationSec);
          const raw = result?.syncedLyrics || result?.plainLyrics || '';

          if (raw.trim() && !isCancelled && currentSongRef.current?.id === stableSongId) {
            console.log('[Lyrics] Backoff retry SUCCESS');
            setGlobalLyrics(parseLyrics(raw));
            if (result.lrcDuration > 0) setLrcDuration(result.lrcDuration);
            setIsLyricsRetrying(false);
            return; // done — stop polling
          }
        } catch (e) {
          console.warn('[Lyrics] Backoff attempt failed:', e);
        }

        retryCount++;
        attemptRetry(); // schedule next retry
      }, delay);
    };

    attemptRetry();

    // Cleanup — cancels timer when: page closed, song changed, or lyrics arrived
    return () => {
      isCancelled = true;
      clearTimeout(timerId);
      setIsLyricsRetrying(false);
    };
  }, [showLyrics, currentSong?.id, globalLyrics.length, isLyricsLoading]);

  // ──────────────────────────────────────────
  //  playSongCore — raw audio engine (no queue mutation)
  //  Called internally by navigation, queue panel clicks, handleSongEnd
  // ──────────────────────────────────────────
  const playSongCore = useCallback(async (song: AnyTrack, newQueue: AnyTrack[]) => {
    if (audioRef.current) audioRef.current.pause();

    setCurrentSong(song);
    setQueue(newQueue);
    queueRef.current = newQueue;
    setIsPlaying(false);
    setStreamLoading(true);
    setIsHighQuality(false);
    setProgress(0);
    setCurrentTimeSeconds(0);
    setAudioDuration(0);

    fetchLyricsBackground(song);

    const previewURL = getPreviewURL(song);

    const playFallback = () => {
      setIsHighQuality(false);
      if (previewURL && audioRef.current) {
        audioRef.current.src = previewURL;
        audioRef.current.play()
          .then(() => { setIsPlaying(true); setStreamLoading(false); })
          .catch(err => { console.error('Preview error:', err); setStreamLoading(false); });
      } else {
        setStreamLoading(false);
      }
    };

    // Try YouTube high-quality stream first
    try {
      // Read API keys from ref to always get the latest value (avoids stale closure)
      const key1 = profileRef.current?.youtube_api_key_1 || '';
      const key2 = profileRef.current?.youtube_api_key_2 || '';
      console.log(`[YouTube] Attempting stream with key1=${key1 ? '✓ set' : '✗ empty'}, key2=${key2 ? '✓ set' : '✗ empty'}`);
      const ytURL = await GetFullStreamURL(song.artist, song.title, key1, key2);
      if (ytURL && ytURL.trim() !== '' && audioRef.current) {
        audioRef.current.src = ytURL;
        audioRef.current.play()
          .then(() => { 
            setIsHighQuality(true); 
            setIsPlaying(true); 
            setStreamLoading(false); 
          })
          .catch(() => {
            playFallback();
          });
      } else {
        playFallback();
      }
    } catch (e: any) {
      const is429 = String(e).includes('429') || String(e).includes('quota');
      console.warn(`[YouTube] ${is429 ? 'Rate-limited (429)' : 'Error'} — falling back to iTunes preview`);
      playFallback();
    }
  }, [fetchLyricsBackground]);

  const toggleShuffle = useCallback((v?: boolean) => {
    const nextShuffle = v !== undefined ? v : !isShuffle;
    setIsShuffle(nextShuffle);
    
    if (nextShuffle) {
      setIsSmartShuffleActive(false);
      const q = [...queue];
      const song = currentSongRef.current;
      if (!song) return;
      
      const curIdx = q.findIndex(s => s.id === song.id);
      if (curIdx !== -1) {
        // Fisher-Yates Shuffle pada sisa antrean
        const unplayed = q.slice(curIdx + 1);
        for (let i = unplayed.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [unplayed[i], unplayed[j]] = [unplayed[j], unplayed[i]];
        }
        const newQueue = [...q.slice(0, curIdx + 1), ...unplayed];
        setQueue(newQueue);
        queueRef.current = newQueue;
      }
    } else {
      const song = currentSongRef.current;
      if (!song) return;
      
      // Kembalikan ke originalQueue
      setQueue(originalQueue);
      queueRef.current = originalQueue;
    }
  }, [isShuffle, queue, originalQueue]);

  // ── Navigation (reads from queueRef for stability) ──
  const playNext = useCallback(async () => {
    const song = currentSongRef.current;
    const q = queueRef.current;
    if (!q.length || !song) return;

    // Record the song that's ending into history
    if (song.id) {
      setPlayedHistory(prev => {
        const updated = prev.includes(song.id) ? prev : [...prev, song.id];
        playedHistoryRef.current = updated;
        return updated;
      });
    }
    
    const curIdx = q.findIndex(s => s.id === song.id);
    const nextIdx = curIdx + 1;

    if (nextIdx < q.length) {
      playSongCore(q[nextIdx], q);
    } else if (curIdx === q.length - 1) {
      console.log("[SmartShuffle] Manual Next at end of queue. Fetching recommendations.");
      setIsGeneratingQueue(true);
      try {
        const genre = (song as any).genre ?? '';
        const rawResults = await BuildSmartQueue(song.artist, song.title, genre, song.id);

        if (rawResults && rawResults.length > 0) {
          // Fisher-Yates shuffle for variety
          const shuffled = [...rawResults];
          for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
          }
          // Deduplication filter
          const currentQueueIds = new Set(q.map(s => s.id));
          const historyIds = new Set(playedHistoryRef.current);
          const fresh = shuffled.filter(s => !historyIds.has(s.id) && !currentQueueIds.has(s.id)).slice(0, 7);
          const batch = fresh.length > 0 ? fresh : shuffled.slice(0, 7);

          setIsSmartShuffleActive(true);
          const newQueue = [...q, ...batch];
          setQueue(newQueue);
          queueRef.current = newQueue;
          playSongCore(batch[0], newQueue);
        } else {
          // Fallback loop back jika tidak ada rekomendasi
          playSongCore(q[0], q);
        }
      } catch (e) {
        console.error('[SmartShuffle] Error at end of queue:', e);
        playSongCore(q[0], q);
      } finally {
        setIsGeneratingQueue(false);
      }
    }
  }, [playSongCore, BuildSmartQueue]);

  const playPrev = useCallback(() => {
    const song = currentSongRef.current;
    const q = queueRef.current;
    if (!q.length || !song) return;
    const cur = q.findIndex(s => s.id === song.id);
    const prev = cur <= 0 ? q.length - 1 : cur - 1;
    playSongCore(q[prev], q);
  }, [playSongCore]);

  // ── Song end handler: advance queue + Smart Shuffle trigger ──
  const handleSongEnd = useCallback(async () => {
    if (isRepeat) {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(err => console.error("Playback failed:", err));
      }
      return;
    }

    const song = currentSongRef.current;
    const q = queueRef.current;
    if (!song) return;

    // Record the song that just finished
    if (song.id) {
      setPlayedHistory(prev => {
        const updated = prev.includes(song.id) ? prev : [...prev, song.id];
        playedHistoryRef.current = updated;
        return updated;
      });
    }

    const curIdx = q.findIndex(s => s.id === song.id);
    const nextIdx = curIdx + 1;

    if (nextIdx < q.length) {
      playSongCore(q[nextIdx], q);
    } else if (curIdx === q.length - 1) {
      // Selalu panggil Smart Shuffle di akhir antrean
      console.log("[SmartShuffle] Reached end of queue. Fetching recommendations.");
      setIsGeneratingQueue(true);
      try {
        const genre = (song as any).genre ?? '';
        const rawResults = await BuildSmartQueue(song.artist, song.title, genre, song.id);

        if (rawResults && rawResults.length > 0) {
          // Fisher-Yates shuffle for variety
          const shuffled = [...rawResults];
          for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
          }
          // Deduplication filter
          const currentQueueIds = new Set(q.map(s => s.id));
          const historyIds = new Set(playedHistoryRef.current);
          const fresh = shuffled.filter(s => !historyIds.has(s.id) && !currentQueueIds.has(s.id)).slice(0, 7);
          const batch = fresh.length > 0 ? fresh : shuffled.slice(0, 7);

          setIsSmartShuffleActive(true);
          const newQueue = [...q, ...batch];
          setQueue(newQueue);
          queueRef.current = newQueue;
          playSongCore(batch[0], newQueue);
        } else {
          // Fallback loop back jika tidak ada rekomendasi
          playSongCore(q[0], q);
        }
      } catch (e) {
        console.error('[SmartShuffle] Error at end of queue:', e);
        playSongCore(q[0], q);
      } finally {
        setIsGeneratingQueue(false);
      }
    }
  }, [playSongCore, BuildSmartQueue, isRepeat]);

  // ──────────────────────────────────────────
  //  playSong — USER-initiated play from Search/Home/Playlist
  //  Clears old queue, plays song, IMMEDIATELY triggers Smart Shuffle
  // ──────────────────────────────────────────
  const playSong = useCallback(async (song: AnyTrack, _sourceList: AnyTrack[]) => {
    // Clear old queue, set only this song so panel shows correctly while loading
    setIsSmartShuffleActive(false);
    const soloQueue: AnyTrack[] = [song];
    await playSongCore(song, soloQueue);

    // Immediately trigger Smart Shuffle — don't wait for song to end
    buildAndSetSmartQueue(song, soloQueue);
  }, [playSongCore, buildAndSetSmartQueue]);

  // ──────────────────────────────────────────
  //  Context-Aware Playback Initializer
  //  source='playlist' → preserve queue, no immediate Smart Shuffle
  //  source='search'   → seed song only, immediately fetch recommendations
  // ──────────────────────────────────────────
  const handlePlaySong = useCallback((song: main.Song, sourceQueue: main.Song[], source: 'playlist' | 'search' = 'playlist') => {
    setIsSmartShuffleActive(false);

    if (source === 'search') {
      // ── SEARCH CONTEXT ──
      // Start with only this song, then immediately fetch recommendations
      const soloQueue: AnyTrack[] = [song as AnyTrack];
      setOriginalQueue(soloQueue);
      playSongCore(song as AnyTrack, soloQueue);
      // Trigger Smart Shuffle immediately so queue fills up right away
      buildAndSetSmartQueue(song as AnyTrack, soloQueue);
    } else {
      // ── PLAYLIST CONTEXT ──
      // Preserve full playlist. Smart Shuffle only fires at end of queue.
      const baseQueue = sourceQueue && sourceQueue.length > 0 ? sourceQueue as AnyTrack[] : [song as AnyTrack];
      setOriginalQueue(baseQueue);

      if (isShuffle) {
        // Filter sisa lagu (keluarkan lagu yang dipilih) agar tidak duplikat
        const remaining = baseQueue.filter(s => s.id !== song.id);
        // Fisher-Yates Shuffle pada sisa lagu
        const shuffledRemaining = [...remaining];
        for (let i = shuffledRemaining.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffledRemaining[i], shuffledRemaining[j]] = [shuffledRemaining[j], shuffledRemaining[i]];
        }
        // Gabungkan: Lagu yang diklik di depan (indeks 0), diikuti sisa yang sudah dikocok
        const newQueue = [song as AnyTrack, ...shuffledRemaining];
        playSongCore(song as AnyTrack, newQueue);
      } else {
        // Jika shuffle mati, gunakan urutan asli
        playSongCore(song as AnyTrack, baseQueue);
      }
    }
  }, [isShuffle, playSongCore, buildAndSetSmartQueue]);

  // ── setActiveTab wrapper — always closes lyrics panel ──
  const handleSetActiveTab = useCallback((tab: string) => {
    setActiveTab(tab);
    setShowLyrics(false); // Sidebar nav always exits lyrics
  }, []);

  return (
    <div
      className="h-screen w-screen overflow-hidden flex flex-col relative bg-[var(--app-bg)] text-[var(--app-text)] transition-colors duration-300"
    >
      <div className="flex-1 flex overflow-hidden w-full relative">
        <div 
          className={`h-full flex-shrink-0 z-20 relative flex ${
            showLyrics 
              ? 'w-0 -translate-x-full opacity-0 overflow-hidden transition-all duration-500 ease-in-out' 
              : 'translate-x-0 opacity-100'
          } ${!isDragging && !showLyrics ? 'transition-all duration-500 ease-in-out' : ''}`}
          style={!showLyrics ? { width: sidebarWidth } : {}}
        >
          <div className="flex-1 w-full h-full overflow-hidden">
            <Sidebar activeTab={activeTab} setActiveTab={handleSetActiveTab} />
          </div>
          {!showLyrics && (
            <div 
              className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-brand-500/50 active:bg-brand-500 z-50 transition-colors"
              onMouseDown={(e) => { e.preventDefault(); setIsDragging(true); }}
            />
          )}
        </div>

        {/* Main content area — relative so QueuePanel can overlay */}
        <div className="flex-1 relative h-full overflow-hidden">
          <main className="w-full h-full relative z-10">
            {/* Main Content Tabs - Kept mounted underneath Lyrics to preserve state (e.g. Search results) */}
            <div className="w-full h-full" style={{ display: showLyrics ? 'none' : 'block' }}>
              <AnimatePresence mode="wait">
                {activeTab === 'home' && <Home key="home" onPlaySong={handlePlaySong} />}
                {activeTab === 'search' && <Search key="search" onPlaySong={handlePlaySong} />}
                {activeTab === 'profile' && <Profile key="profile" />}
                {activeTab === 'settings' && <Settings key="settings" />}
                {(activeTab === 'library' || activeTab === 'playlists') && (
                  <div key="placeholder" className="w-full h-full flex items-center justify-center text-gray-600 dark:text-gray-400">
                    <h2 className="text-2xl font-semibold capitalize">{activeTab} — Coming Soon</h2>
                  </div>
                )}
              </AnimatePresence>
            </div>

            {/* Lyrics Overlay */}
            <AnimatePresence>
              {showLyrics && (
                <Lyrics
                  key="lyrics"
                  currentSong={currentSong as main.Song}
                  currentTime={currentTimeSeconds}
                  lyrics={globalLyrics}
                  loading={isLyricsLoading}
                  isRetrying={isLyricsRetrying}
                  audioDuration={audioDuration}
                  lrcDuration={lrcDuration}
                  bgColor={lyricsBgColor}
                  onClose={() => setShowLyrics(false)}
                />
              )}
            </AnimatePresence>
          </main>

          {/* Queue Panel — ref for click-outside detection */}
          <div ref={queuePanelRef}>
            <QueuePanel
              isOpen={showQueue}
              onClose={() => setShowQueue(false)}
              queue={queue as main.SmartTrack[]}
              currentSong={currentSong as main.SmartTrack}
              onPlayTrack={(track) => playSongCore(track, queueRef.current)}
              isSmartShuffleActive={isSmartShuffleActive}
            />
          </div>
        </div>
      </div>

      <PlayerBar
        currentSong={currentSong as main.Song}
        isPlaying={isPlaying}
        setIsPlaying={setIsPlaying}
        audioRef={audioRef}
        progress={progress}
        setProgress={setProgress}
        isShuffle={isShuffle}
        setIsShuffle={toggleShuffle}
        onNext={playNext}
        onPrev={playPrev}
        isHighQuality={isHighQuality}
        streamLoading={streamLoading}
        showLyrics={showLyrics}
        setShowLyrics={setShowLyrics}
        showQueue={showQueue}
        setShowQueue={setShowQueue}
        isSmartShuffleActive={isSmartShuffleActive}
        queueLength={queue.length}
        volume={volume}
        setVolume={setVolume}
        isRepeat={isRepeat}
        setIsRepeat={setIsRepeat}
      />

      <audio
        ref={audioRef}
        onEnded={handleSongEnd}
        onLoadedMetadata={handleLoadedMetadata}
        preload="auto"
      />
    </div>
  );
}
// \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
//  Auth Gate — shows LoginPage or MusicApp based on session
// \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function AuthGate() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    // Splash screen while restoring session
    return (
      <div className="h-screen w-screen bg-[#0c0c0c] flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-brand-500 flex items-center justify-center animate-pulse shadow-xl shadow-brand-500/30">
            <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
            </svg>
          </div>
          <p className="text-[var(--app-text-secondary)] text-sm">Memuat sesi...</p>
        </div>
      </div>
    );
  }

  return user ? <MusicApp /> : <LoginPage />;
}

// ──────────────────────────────────────────
//  Root App — wraps everything with AuthProvider
// ──────────────────────────────────────────
export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </ThemeProvider>
  );
}
