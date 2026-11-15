import { useState, useRef, useEffect, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';

import Sidebar from './components/Sidebar';
import PlayerBar from './components/PlayerBar';
import QueuePanel from './components/QueuePanel';
import AddToPlaylistModal from './components/AddToPlaylistModal';
import Search from './pages/Search';
import Home from './pages/Home';
import Lyrics from './pages/Lyrics';
import LoginPage from './pages/LoginPage';
import Settings from './pages/Settings';
import Profile from './pages/Profile';
import ArtistDetail from './pages/ArtistDetail';
import Playlists from './pages/Playlists';
import Library from './pages/Library';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { useAudioSettings } from './contexts/AudioSettingsContext';

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

function ensureQueueId<T extends { id?: string }>(track: T): T {
  if (!track) return track;
  if ((track as any).queueId) return track;
  return {
    ...track,
    queueId: `${track.id || 'trk'}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  };
}

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
  const { seamlessPreload, transitionMode, crossfadeDuration } = useAudioSettings();
  const [activeTab, setActiveTab] = useState('home');
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [isDragging, setIsDragging] = useState(false);

  // Global artist page navigation — state lifted here for PlayerBar access
  const [artistView, setArtistView] = useState<{ id: number; name: string; genre?: string } | null>(null);

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
  const deckARef = useRef<HTMLAudioElement | null>(null);
  const deckBRef = useRef<HTMLAudioElement | null>(null);
  const preloadRef = useRef<{ song: AnyTrack; deck: HTMLAudioElement; highQuality: boolean; token: number } | null>(null);
  const generationRef = useRef(0);
  const transitionRef = useRef<{ outgoing: HTMLAudioElement; incoming: HTMLAudioElement | null; start: number; duration: number; mode: 'crossfade' | 'fadeOut' | 'fadeIn' } | null>(null);
  const playbackGenerationRef = useRef(0);
  const transitionAttemptRef = useRef(false);
  const engineTickRef = useRef<() => void>(() => {});
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const settingsRef = useRef({ seamlessPreload, transitionMode, crossfadeDuration, isRepeat });
  settingsRef.current = { seamlessPreload, transitionMode, crossfadeDuration, isRepeat };

  const resetTransition = useCallback(() => {
    transitionAttemptRef.current = false;
    const transition = transitionRef.current;
    if (transition) {
      if (transition.outgoing !== audioRef.current) transition.outgoing.pause();
      if (transition.incoming && transition.incoming !== audioRef.current) transition.incoming.pause();
      transitionRef.current = null;
    }
    if (audioRef.current) audioRef.current.volume = volumeRef.current;
  }, []);

  const invalidatePreload = useCallback(() => {
    generationRef.current++;
    const prepared = preloadRef.current;
    preloadRef.current = null;
    if (prepared && prepared.deck !== audioRef.current) {
      prepared.deck.pause();
      prepared.deck.removeAttribute('src');
      prepared.deck.load();
    }
  }, []);

  useEffect(() => {
    const transition = transitionRef.current;
    if (!transition && audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    invalidatePreload();
    resetTransition();
  }, [queue, seamlessPreload, transitionMode, crossfadeDuration, isRepeat, invalidatePreload, resetTransition]);

  useEffect(() => () => {
    playbackGenerationRef.current++;
    invalidatePreload();
    resetTransition();
    deckARef.current?.pause();
    deckBRef.current?.pause();
  }, [invalidatePreload, resetTransition]);

  const togglePlayback = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentSongRef.current || streamLoading) return;
    invalidatePreload();
    resetTransition();
    if (!audio.paused) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  }, [invalidatePreload, resetTransition, streamLoading]);

  const seekPlayback = useCallback((value: number) => {
    invalidatePreload();
    resetTransition();
    const audio = audioRef.current;
    if (!audio) return;
    const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 30;
    audio.currentTime = value / 100 * duration;
    setProgress(value);
    setCurrentTimeSeconds(audio.currentTime);
  }, [invalidatePreload, resetTransition]);
  const rafRef = useRef<number | null>(null);
  const currentSongRef = useRef<AnyTrack | null>(null);
  const playedTracksStackRef = useRef<AnyTrack[]>([]);
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

  // ── Keyboard shortcuts & accessibility (Esc closes Lyrics/Queue, Space toggles playback safely) ──
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInteractive = target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'BUTTON' ||
        target.tagName === 'SELECT' ||
        target.getAttribute('role') === 'button' ||
        target.isContentEditable
      );

      if (e.key === 'Escape') {
        if (showLyrics) {
          setShowLyrics(false);
          return;
        }
        if (showQueue) {
          setShowQueue(false);
          return;
        }
      } else if ((e.code === 'Space' || e.key === ' ') && !isInteractive) {
        e.preventDefault();
        togglePlayback();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showLyrics, showQueue, togglePlayback]);

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
      engineTickRef.current();
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
  //  knownQueue: the queue snapshot at call time (avoids stale queueRef reads during async state flush)
  // ──────────────────────────────────────────
  const buildAndSetSmartQueue = useCallback(async (seed: AnyTrack, knownQueue: AnyTrack[]) => {
    if (isGeneratingRef.current) return;
    isGeneratingRef.current = true;
    setIsGeneratingQueue(true);
    console.log(`[SmartShuffle] Building queue for "${seed.artist} - ${seed.title}"`);

    try {
      const genre = (seed as any).genre ?? '';
      // Pass full history to backend so it excludes both current song AND recent history at the Go level
      const historyJSON = JSON.stringify(playedHistoryRef.current);
      const rawResults = await BuildSmartQueue(seed.artist, seed.title, genre, seed.id, historyJSON);
      if (currentSongRef.current?.id !== seed.id || queueRef.current !== knownQueue) return;

      if (rawResults && rawResults.length > 0) {
        console.log(`[SmartShuffle] ${rawResults.length} raw tracks received`);

        // Step 1: Fisher-Yates shuffle on the full raw result for variety
        const shuffled = [...rawResults];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        // Step 2: Deduplication — use explicit knownQueue (not stale queueRef) + history + current seed
        const knownQueueIds = new Set(knownQueue.map(s => s.id));
        const historyIds = new Set(playedHistoryRef.current);
        const deduplicated = shuffled.filter(
          s => s.id !== seed.id               // never include the seed itself
            && !historyIds.has(s.id)          // never include recently played
            && !knownQueueIds.has(s.id)       // never include what's already queued
        );

        // Step 3: Take only 5-7 clean tracks
        const fresh = deduplicated.slice(0, 7);
        console.log(`[SmartShuffle] ${fresh.length} fresh tracks after dedup (history: ${historyIds.size}, knownQueue: ${knownQueueIds.size})`);

        if (fresh.length > 0) {
          setIsSmartShuffleActive(true);
          // Build queue: seed first (if not already in knownQueue at index 0), then recommendations
          const newQueue: AnyTrack[] = knownQueue.length > 0
            ? [...knownQueue, ...fresh]
            : [seed, ...fresh];
          setQueue(newQueue);
          queueRef.current = newQueue;
        } else {
          console.warn('[SmartShuffle] All recommendations were duplicates — clearing history and retrying batch');
          // Safety net: if everything was filtered out, clear history and use the shuffled pool
          // (but still exclude the seed/current song)
          setPlayedHistory([]);
          playedHistoryRef.current = [];
          const fallback = shuffled.filter(s => s.id !== seed.id).slice(0, 7);
          setIsSmartShuffleActive(true);
          const newQueue: AnyTrack[] = knownQueue.length > 0
            ? [...knownQueue, ...fallback]
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
      if (currentSongRef.current !== song) return;
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
      if (currentSongRef.current === song) setIsLyricsLoading(false);
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
    resetTransition();
    const candidate = preloadRef.current;
    const prepared = candidate?.song.id === song.id && candidate.deck.getAttribute('src') ? candidate : null;
    const token = ++playbackGenerationRef.current;
    generationRef.current++;
    preloadRef.current = null;
    const old = audioRef.current;
    old?.pause();
    if (!prepared) {
      const other = old === deckARef.current ? deckBRef.current : deckARef.current;
      if (other) { other.pause(); other.removeAttribute('src'); other.load(); }
    }
    const deck = prepared?.deck ?? old;
    if (!deck) return;
    if (currentSongRef.current && currentSongRef.current.id !== song.id) {
      playedTracksStackRef.current.push(currentSongRef.current);
      if (playedTracksStackRef.current.length > 50) playedTracksStackRef.current.shift();
    }
    audioRef.current = deck;
    deck.volume = volumeRef.current;
    currentSongRef.current = song;
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

    const playSource = async (url: string, highQuality: boolean) => {
      if (token !== playbackGenerationRef.current || !url) return false;
      if (!prepared || deck.src !== url) { deck.src = url; deck.load(); }
      try {
        await deck.play();
        if (token !== playbackGenerationRef.current) { if (audioRef.current !== deck) deck.pause(); return false; }
        setIsHighQuality(highQuality);
        if (Number.isFinite(deck.duration)) setAudioDuration(deck.duration);
        setIsPlaying(true);
        setStreamLoading(false);
        return true;
      } catch {
        return false;
      }
    };
    let url = '';
    if (prepared) {
      url = deck.src;
    } else {
      try { url = await GetFullStreamURL(song.artist, song.title, '', ''); } catch { /* use preview */ }
    }
    if (token !== playbackGenerationRef.current) return;
    if (url && await playSource(url, prepared?.highQuality ?? true)) return;
    if (token !== playbackGenerationRef.current) return;
    if (await playSource(getPreviewURL(song), false)) return;
    if (token === playbackGenerationRef.current) setStreamLoading(false);
  }, [fetchLyricsBackground, resetTransition]);

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
    const navigationToken = ++playbackGenerationRef.current;

    // Record the song that's ending into history
    if (song.id) {
      setPlayedHistory(prev => {
        const updated = prev.includes(song.id) ? prev : [...prev, song.id];
        playedHistoryRef.current = updated;
        return updated;
      });
    }
    
    const curIdx = q.findIndex(s => s.id === song.id);
    const nextIdx = curIdx >= 0 ? curIdx + 1 : 1;

    if (nextIdx < q.length) {
      // Remove played songs so the next song is always at the top of the queue
      const remainingQueue = q.slice(nextIdx);
      playSongCore(remainingQueue[0], remainingQueue);
    } else {
      // End of queue — fetch Smart Shuffle recommendations
      console.log("[SmartShuffle] Manual Next at end of queue. Fetching recommendations.");
      setIsGeneratingQueue(true);
      try {
        const genre = (song as any).genre ?? '';
        const historyJSON = JSON.stringify(playedHistoryRef.current);
        const rawResults = await BuildSmartQueue(song.artist, song.title, genre, song.id, historyJSON);
        if (navigationToken !== playbackGenerationRef.current || currentSongRef.current !== song || queueRef.current !== q) return;

        if (rawResults && rawResults.length > 0) {
          // Fisher-Yates shuffle for variety
          const shuffled = [...rawResults];
          for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
          }
          // Deduplication filter
          const historyIds = new Set(playedHistoryRef.current);
          const fresh = shuffled.filter(
            s => s.id !== song.id && !historyIds.has(s.id)
          ).slice(0, 10);
          const batch = fresh.length > 0
            ? fresh
            : shuffled.filter(s => s.id !== song.id).slice(0, 10);

          setIsSmartShuffleActive(true);
          const freshBatch = batch.map(ensureQueueId);
          setQueue(freshBatch);
          queueRef.current = freshBatch;
          playSongCore(freshBatch[0], freshBatch);
        } else {
          // Replay if no recommendations
          playSongCore(song, [ensureQueueId(song)]);
        }
      } catch (e) {
        console.error('[SmartShuffle] Error at end of queue:', e);
      } finally {
        setIsGeneratingQueue(false);
      }
    }
  }, [playSongCore, BuildSmartQueue]);

  const playPrev = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }

    if (playedTracksStackRef.current.length > 0) {
      playbackGenerationRef.current++;
      const prevSong = playedTracksStackRef.current.pop()!;
      const q = queueRef.current;
      const newQueue = [prevSong, ...q];
      playSongCore(prevSong, newQueue);
      return;
    }

    if (audio) {
      audio.currentTime = 0;
    }
  }, [playSongCore]);

  // ── Song end handler: advance queue + Smart Shuffle trigger ──
  const handleSongEnd = useCallback(async () => {
    if (isRepeat) {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => setIsPlaying(false));
      }
      return;
    }

    const song = currentSongRef.current;
    const navigationToken = ++playbackGenerationRef.current;
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
    const nextIdx = curIdx >= 0 ? curIdx + 1 : 1;

    if (nextIdx < q.length) {
      // Remove played songs so next song is at the top
      const remainingQueue = q.slice(nextIdx);
      playSongCore(remainingQueue[0], remainingQueue);
    } else {
      // Selalu panggil Smart Shuffle di akhir antrean
      console.log("[SmartShuffle] Reached end of queue. Fetching recommendations.");
      setIsGeneratingQueue(true);
      try {
        const genre = (song as any).genre ?? '';
        const historyJSON = JSON.stringify(playedHistoryRef.current);
        const rawResults = await BuildSmartQueue(song.artist, song.title, genre, song.id, historyJSON);
        if (navigationToken !== playbackGenerationRef.current || currentSongRef.current !== song || queueRef.current !== q) return;

        if (rawResults && rawResults.length > 0) {
          // Fisher-Yates shuffle for variety
          const shuffled = [...rawResults];
          for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
          }
          const historyIds = new Set(playedHistoryRef.current);
          const fresh = shuffled.filter(
            s => s.id !== song.id && !historyIds.has(s.id)
          ).slice(0, 10);
          const batch = fresh.length > 0
            ? fresh
            : shuffled.filter(s => s.id !== song.id).slice(0, 10);

          setIsSmartShuffleActive(true);
          const freshBatch = batch.map(ensureQueueId);
          setQueue(freshBatch);
          queueRef.current = freshBatch;
          playSongCore(freshBatch[0], freshBatch);
        } else {
          playSongCore(song, [ensureQueueId(song)]);
        }
      } catch (e) {
        console.error('[SmartShuffle] Error at end of queue:', e);
      } finally {
        setIsGeneratingQueue(false);
      }
    }
  }, [playSongCore, BuildSmartQueue, isRepeat]);

  engineTickRef.current = () => {
    const active = audioRef.current;
    const song = currentSongRef.current;
    if (!active || !song || active.paused) return;
    const transition = transitionRef.current;
    if (transition) {
      const clock = transition.mode === 'fadeIn' ? active.currentTime : transition.outgoing.currentTime;
      const ratio = transition.outgoing.ended && transition.mode === 'crossfade' ? 1 :
        Math.max(0, Math.min(1, (clock - transition.start) / transition.duration));
      if (transition.mode === 'crossfade') {
        transition.outgoing.volume = volumeRef.current * (1 - ratio);
        if (transition.incoming) transition.incoming.volume = volumeRef.current * ratio;
      } else {
        active.volume = volumeRef.current * (transition.mode === 'fadeOut' ? 1 - ratio : ratio);
      }
      if (ratio >= 1 && transition.mode !== 'fadeOut') {
        if (transition.mode === 'crossfade') transition.outgoing.pause();
        transitionRef.current = null;
        active.volume = volumeRef.current;
      }
      return;
    }
    const settings = settingsRef.current;
    const duration = active.duration;
    if (!Number.isFinite(duration) || duration <= 0 || settings.isRepeat) return;
    const q = queueRef.current;
    const index = q.findIndex(track => track.id === song.id);
    const next = index >= 0 ? q[index + 1] : undefined;
    if (!next) return;
    const shouldPrepare = settings.seamlessPreload
      ? active.currentTime >= duration * 0.75
      : settings.transitionMode !== 'off' && settings.crossfadeDuration > 0 &&
        duration - active.currentTime <= settings.crossfadeDuration;

    if (shouldPrepare && preloadRef.current && preloadRef.current.song.id !== next.id) {
      invalidatePreload();
    }

    if (shouldPrepare && !preloadRef.current) {
      const deck = active === deckARef.current ? deckBRef.current : deckARef.current;
      if (deck) {
        const token = generationRef.current;
        const prepared = { song: next, deck, highQuality: true, token };
        preloadRef.current = prepared;
        deck.pause();
        deck.removeAttribute('src');
        deck.load();
        void (async () => {
          let url = '';
          try { url = await GetFullStreamURL(next.artist, next.title, '', ''); } catch { /* use preview */ }
          if (preloadRef.current !== prepared || token !== generationRef.current) return;
          if (!url) { url = getPreviewURL(next); prepared.highQuality = false; }
          if (!url) return;
          deck.onerror = () => {
            if (preloadRef.current !== prepared) return;
            const fallback = getPreviewURL(next);
            if (prepared.highQuality && fallback) {
              prepared.highQuality = false;
              deck.src = fallback;
              deck.load();
            } else {
              deck.onerror = null;
            }
          };
          deck.src = url;
          deck.load();
        })();
      }
    }
    const prepared = preloadRef.current;
    const seconds = Math.max(0, settings.crossfadeDuration);
    if (!prepared || prepared.song.id !== next.id || prepared.deck.readyState < 2 || seconds <= 0 ||
        settings.transitionMode === 'off' || duration - active.currentTime > seconds || transitionAttemptRef.current) return;
    const length = Math.min(seconds, Math.max(0.05, duration - active.currentTime));
    if (settings.transitionMode === 'fade') {
      transitionRef.current = { outgoing: active, incoming: null, start: active.currentTime, duration: length, mode: 'fadeOut' };
      return;
    }
    transitionAttemptRef.current = true;
    const incoming = prepared.deck;
    incoming.volume = 0;
    void incoming.play().then(() => {
      if (!transitionAttemptRef.current || preloadRef.current !== prepared || audioRef.current !== active ||
          active.paused || generationRef.current !== prepared.token) {
        if (audioRef.current !== incoming) incoming.pause();
        return;
      }
      transitionAttemptRef.current = false;
      preloadRef.current = null;
      audioRef.current = incoming;
      currentSongRef.current = next;
      setCurrentSong(next);
      setIsHighQuality(prepared.highQuality);
      setAudioDuration(Number.isFinite(incoming.duration) ? incoming.duration : 0);
      setProgress(0);
      setCurrentTimeSeconds(0);
      const currentQ = queueRef.current;
      const nextIdx = currentQ.findIndex(t => t.id === next.id);
      if (nextIdx > 0) {
        const remaining = currentQ.slice(nextIdx);
        setQueue(remaining);
        queueRef.current = remaining;
      }
      setPlayedHistory(prev => {
        const updated = prev.includes(song.id) ? prev : [...prev, song.id];
        playedHistoryRef.current = updated;
        return updated;
      });
      fetchLyricsBackground(next);
      transitionRef.current = { outgoing: active, incoming, start: active.currentTime, duration: length, mode: 'crossfade' };
    }).catch(() => {
      transitionAttemptRef.current = false;
      incoming.volume = volumeRef.current;
    });
  };

  const handleDeckEnd = (deck: HTMLAudioElement) => {
    if (deck !== audioRef.current) return;
    const transition = transitionRef.current;
    const prepared = preloadRef.current;
    if (transition?.mode === 'fadeOut' && prepared && prepared.deck.readyState >= 2) {
      const song = currentSongRef.current;
      if (song?.id) {
        setPlayedHistory(prev => {
          const updated = prev.includes(song.id) ? prev : [...prev, song.id];
          playedHistoryRef.current = updated;
          return updated;
        });
      }
      const incoming = prepared.deck;
      void playSongCore(prepared.song, queueRef.current).then(() => {
        if (audioRef.current !== incoming || incoming.paused) return;
        incoming.volume = 0;
        transitionRef.current = { outgoing: incoming, incoming: null, start: incoming.currentTime,
          duration: Math.max(0.05, settingsRef.current.crossfadeDuration), mode: 'fadeIn' };
      });
      return;
    }
    resetTransition();
    void handleSongEnd();
  };

  // ──────────────────────────────────────────
  //  playSong — USER-initiated play from Search/Home/Playlist
  //  Clears old queue, plays song, IMMEDIATELY triggers Smart Shuffle
  // ──────────────────────────────────────────
  const playSong = useCallback(async (song: AnyTrack, _sourceList: AnyTrack[]) => {
    // Clear old queue, set only this song so panel shows correctly while loading
    setIsSmartShuffleActive(false);
    const soloQueue: AnyTrack[] = [ensureQueueId(song)];
    // Sync queueRef immediately so buildAndSetSmartQueue sees the correct knownQueue
    queueRef.current = soloQueue;
    await playSongCore(song, soloQueue);

    // Immediately trigger Smart Shuffle — pass soloQueue explicitly (not queueRef which may lag)
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
      // Reset: clear any leftover state from previous session so Smart Queue starts fresh
      const soloQueue: AnyTrack[] = [ensureQueueId(song as AnyTrack)];
      setOriginalQueue(soloQueue);
      // Sync queueRef immediately BEFORE calling buildAndSetSmartQueue
      // This is critical: buildAndSetSmartQueue reads knownQueue from its parameter,
      // but playSongCore also sets queueRef — doing this here ensures consistency.
      queueRef.current = soloQueue;
      playSongCore(song as AnyTrack, soloQueue);
      // Pass soloQueue explicitly as knownQueue — not queueRef (which is async)
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
        const newQueue = [ensureQueueId(song as AnyTrack), ...shuffledRemaining.map(ensureQueueId)];
        playSongCore(song as AnyTrack, newQueue);
      } else {
        // Slice starting from selected song so it is at index 0 (top of queue)
        const curIdx = baseQueue.findIndex(s => s.id === song.id);
        const upcomingQueue = curIdx >= 0 ? baseQueue.slice(curIdx) : baseQueue;
        const newQueue = upcomingQueue.map(ensureQueueId);
        playSongCore(song as AnyTrack, newQueue);
      }
    }
  }, [isShuffle, playSongCore, buildAndSetSmartQueue]);

  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);

  // ── setActiveTab wrapper — always closes lyrics panel and artist view ──
  const handleSetActiveTab = useCallback((tab: string) => {
    setActiveTab(tab);
    setSelectedPlaylistId(null);
    setShowLyrics(false);
    setArtistView(null); // close artist page when switching tabs
  }, []);

  const handleSelectPlaylistFromSidebar = useCallback((playlistId: string) => {
    setActiveTab('playlists');
    setSelectedPlaylistId(playlistId);
    setShowLyrics(false);
    setArtistView(null);
  }, []);

  const navigateToArtist = useCallback((id: number, name: string, genre?: string) => {
    setArtistView({ id, name, genre });
    setShowLyrics(false);
  }, []);

  // ── Explicit queue actions (remove, reorder, clear, add, play next) ──
  const handleRemoveQueueItem = useCallback((index: number) => {
    setQueue(prev => {
      const updated = prev.filter((_, i) => i !== index);
      queueRef.current = updated;
      return updated;
    });
    invalidatePreload();
  }, [invalidatePreload]);

  const handleMoveQueueItem = useCallback((fromIndex: number, toIndex: number) => {
    setQueue(prev => {
      if (fromIndex < 0 || fromIndex >= prev.length || toIndex < 0 || toIndex >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, item);
      queueRef.current = next;
      return next;
    });
    invalidatePreload();
  }, [invalidatePreload]);

  const handleReorderQueue = useCallback((newQueue: AnyTrack[]) => {
    setQueue(newQueue);
    queueRef.current = newQueue;
    invalidatePreload();
  }, [invalidatePreload]);

  const handleAddToQueue = useCallback((song: AnyTrack) => {
    setQueue(prev => {
      const songWithKey = ensureQueueId(song);
      const nextQueue = [...prev, songWithKey];
      queueRef.current = nextQueue;
      return nextQueue;
    });
  }, []);

  const handlePlayNext = useCallback((song: AnyTrack) => {
    setQueue(prev => {
      const songWithKey = ensureQueueId(song);
      if (!currentSongRef.current) {
        queueRef.current = [songWithKey];
        return [songWithKey];
      }
      const currentIdx = prev.findIndex(t => t.id === currentSongRef.current?.id);
      const insertIdx = currentIdx >= 0 ? currentIdx + 1 : 1;
      const nextQueue = [...prev];
      nextQueue.splice(insertIdx, 0, songWithKey);
      queueRef.current = nextQueue;
      return nextQueue;
    });
    invalidatePreload();
  }, [invalidatePreload]);

  const handleClearQueue = useCallback(() => {
    setQueue(prev => {
      if (!currentSongRef.current) return [];
      const updated = prev.filter(t => t.id === currentSongRef.current?.id);
      queueRef.current = updated;
      return updated;
    });
    invalidatePreload();
  }, [invalidatePreload]);

  const handleRefreshAutoQueue = useCallback(async () => {
    const current = currentSongRef.current;
    if (!current || isGeneratingRef.current) return;
    setIsGeneratingQueue(true);
    isGeneratingRef.current = true;
    try {
      const genre = (current as any).genre ?? '';
      const historyJSON = JSON.stringify(playedHistoryRef.current);
      const rawResults = await BuildSmartQueue(current.artist, current.title, genre, current.id, historyJSON);
      if (currentSongRef.current?.id !== current.id) return;

      if (rawResults && rawResults.length > 0) {
        // Fisher-Yates shuffle
        const shuffled = [...rawResults];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        const historyIds = new Set(playedHistoryRef.current);
        let fresh = shuffled.filter(s => s.id !== current.id && !historyIds.has(s.id)).slice(0, 10);
        if (fresh.length === 0) {
          fresh = shuffled.filter(s => s.id !== current.id).slice(0, 10);
        }

        const freshWithKeys = fresh.map(ensureQueueId);
        const currentWithKey = ensureQueueId(current);
        const newQueue = [currentWithKey, ...freshWithKeys];
        setQueue(newQueue);
        queueRef.current = newQueue;
        setIsSmartShuffleActive(true);
        invalidatePreload();
      }
    } catch (e) {
      console.error('[Queue] Refresh error:', e);
    } finally {
      isGeneratingRef.current = false;
      setIsGeneratingQueue(false);
    }
  }, [BuildSmartQueue, invalidatePreload]);

  // Periodic 2-second check when playback reaches >= 75% to ensure preloaded track matches latest queue
  useEffect(() => {
    const timer = setInterval(() => {
      const audio = audioRef.current;
      const current = currentSongRef.current;
      if (!audio || !current || !settingsRef.current.seamlessPreload) return;
      const duration = audio.duration;
      if (!Number.isFinite(duration) || duration <= 0 || settingsRef.current.isRepeat) return;

      if (audio.currentTime >= duration * 0.75) {
        const q = queueRef.current;
        const index = q.findIndex(t => t.id === current.id);
        const next = index >= 0 ? q[index + 1] : undefined;

        if (preloadRef.current && next && preloadRef.current.song.id !== next.id) {
          console.log('[AudioEngine] Next song changed in queue, refreshing preloaded track');
          invalidatePreload();
        }
      }
    }, 2000);

    return () => clearInterval(timer);
  }, [invalidatePreload]);

  // Modal state for adding track to playlist
  const [playlistModalSong, setPlaylistModalSong] = useState<main.Song | null>(null);
  const handleOpenAddToPlaylist = useCallback((song: main.Song) => {
    setPlaylistModalSong(song);
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
            <Sidebar
              activeTab={activeTab}
              setActiveTab={handleSetActiveTab}
              selectedPlaylistId={selectedPlaylistId}
              onSelectPlaylist={handleSelectPlaylistFromSidebar}
            />
          </div>
          {!showLyrics && (
            <div 
              role="separator"
              aria-orientation="vertical"
              aria-label="Pengatur lebar bilah sisi"
              aria-valuenow={sidebarWidth}
              aria-valuemin={160}
              aria-valuemax={400}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft') {
                  e.preventDefault();
                  setSidebarWidth(w => Math.max(160, w - 16));
                } else if (e.key === 'ArrowRight') {
                  e.preventDefault();
                  setSidebarWidth(w => Math.min(400, w + 16));
                }
              }}
              className="absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-brand-500/50 active:bg-brand-500 focus-visible:bg-brand-500 focus-visible:outline-none z-50 transition-colors"
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
                {/* Global Artist Detail overlay — appears on top of any tab */}
                {artistView ? (
                  <ArtistDetail
                    key={`artist-${artistView.id}`}
                    artistId={artistView.id}
                    artistName={artistView.name}
                    primaryGenre={artistView.genre}
                    onBack={() => setArtistView(null)}
                    onPlaySong={handlePlaySong}
                    onNavigateToArtist={navigateToArtist}
                    onPlayNext={handlePlayNext}
                    onAddToQueue={handleAddToQueue}
                    onOpenAddToPlaylist={handleOpenAddToPlaylist}
                  />
                ) : (
                  <>
                    {activeTab === 'home' && (
                      <Home
                        key="home"
                        onPlaySong={handlePlaySong}
                        onPlayNext={handlePlayNext}
                        onAddToQueue={handleAddToQueue}
                        onOpenAddToPlaylist={handleOpenAddToPlaylist}
                      />
                    )}
                    {activeTab === 'search' && (
                      <Search
                        key="search"
                        onPlaySong={handlePlaySong}
                        onNavigateToArtist={navigateToArtist}
                        onPlayNext={handlePlayNext}
                        onAddToQueue={handleAddToQueue}
                        onOpenAddToPlaylist={handleOpenAddToPlaylist}
                      />
                    )}
                    {activeTab === 'profile' && <Profile key="profile" />}
                    {activeTab === 'settings' && <Settings key="settings" />}
                    {activeTab === 'playlists' && (
                      <Playlists
                        key="playlists"
                        onPlaySong={handlePlaySong}
                        onPlayNext={handlePlayNext}
                        onAddToQueue={handleAddToQueue}
                        onOpenAddToPlaylist={handleOpenAddToPlaylist}
                        selectedPlaylistId={selectedPlaylistId}
                        onClearSelectedPlaylist={() => setSelectedPlaylistId(null)}
                      />
                    )}
                    {activeTab === 'library' && (
                      <Library
                        key="library"
                        onPlaySong={handlePlaySong}
                        onNavigateToArtist={navigateToArtist}
                        onPlayNext={handlePlayNext}
                        onAddToQueue={handleAddToQueue}
                        onOpenAddToPlaylist={handleOpenAddToPlaylist}
                      />
                    )}
                  </>
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
              onPlayTrack={(track) => {
                const q = queueRef.current;
                const idx = q.findIndex(t => t.id === track.id);
                const remainingQueue = idx >= 0 ? q.slice(idx) : [ensureQueueId(track)];
                playSongCore(track, remainingQueue);
              }}
              isSmartShuffleActive={isSmartShuffleActive}
              onRemoveTrack={handleRemoveQueueItem}
              onMoveUp={(idx) => handleMoveQueueItem(idx, idx - 1)}
              onMoveDown={(idx) => handleMoveQueueItem(idx, idx + 1)}
              onClearQueue={handleClearQueue}
              onReorderQueue={handleReorderQueue}
              onRefreshAutoQueue={handleRefreshAutoQueue}
              isGeneratingQueue={isGeneratingQueue}
            />
          </div>
        </div>
      </div>

      <AddToPlaylistModal
        isOpen={!!playlistModalSong}
        onClose={() => setPlaylistModalSong(null)}
        song={playlistModalSong}
      />

      <PlayerBar
        currentSong={currentSong as main.Song}
        isPlaying={isPlaying}
        onTogglePlay={togglePlayback}
        onSeek={seekPlayback}
        audioRef={audioRef}
        progress={progress}
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
        onNavigateToArtist={navigateToArtist}
      />

      <audio
        ref={(node) => { deckARef.current = node; if (node && !audioRef.current) audioRef.current = node; }}
        onEnded={(event) => handleDeckEnd(event.currentTarget)}
        onLoadedMetadata={(event) => { if (event.currentTarget === audioRef.current) handleLoadedMetadata(); }}
        preload="auto"
      />
      <audio
        ref={deckBRef}
        onEnded={(event) => handleDeckEnd(event.currentTarget)}
        onLoadedMetadata={(event) => { if (event.currentTarget === audioRef.current) handleLoadedMetadata(); }}
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
