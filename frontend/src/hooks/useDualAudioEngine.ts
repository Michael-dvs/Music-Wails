/**
 * useDualAudioEngine
 * ─────────────────────────────────────────────────────────────────────────────
 * Dual-audio engine using two `new Audio()` instances (Option B — no JSX tag).
 *
 * Responsibilities:
 *  - Manages audioA & audioB (two HTMLAudioElement instances)
 *  - Tracks which audio is "active" (currently playing) and which is "standby"
 *  - Drives progress / currentTime updates via requestAnimationFrame
 *  - Triggers seamless preload at 75% of the active song's duration
 *  - Executes fade-out/fade-in crossfade at the configured threshold
 *  - Exposes a clean API consumed by App.tsx and PlayerBar
 *
 * Wails Event Contract:
 *  - Listens  "stream:ready"     — result for the ACTIVE song (normal play)
 *  - Listens  "stream:preloaded" — result for the STANDBY song (preload)
 *  - Calls    GetStreamURLAsync()        — for active song
 *  - Calls    GetStreamURLForPreload()   — for next song preload
 */

import {
  useRef,
  useState,
  useEffect,
  useCallback,
  useReducer,
} from 'react';
import { EventsOn } from '../../wailsjs/runtime/runtime';
import { GetStreamURLAsync, GetStreamURLForPreload } from '../../wailsjs/go/main/App';
import type { main } from '../../wailsjs/go/models';
import { usePlayerSettings } from '../contexts/PlayerSettingsContext';

// ──────────────────────────────────────────
//  Types
// ──────────────────────────────────────────
type AnyTrack = main.Song | main.SmartTrack;

function getPreviewURL(track: AnyTrack): string {
  return (track as main.SmartTrack).previewUrl ?? (track as main.Song).streamUrl ?? '';
}

export interface DualAudioEngineState {
  currentSong: AnyTrack | null;
  isPlaying: boolean;
  currentTime: number;     // seconds
  duration: number;        // seconds
  progress: number;        // 0–100
  isHighQuality: boolean;
  streamLoading: boolean;
  volume: number;          // 0–1
  isPreloading: boolean;   // true while next-song stream is being fetched
}

export interface DualAudioEngineControls {
  /** Load & play a new song. Resets the engine state. */
  playSong: (song: AnyTrack, userVolume: number, profileKeys: { key1: string; key2: string }) => void;
  play: () => void;
  pause: () => void;
  seek: (progress: number) => void;          // progress: 0–100
  setVolume: (v: number) => void;
  /** Manually advance to the next song — bypasses crossfade */
  forceNext: () => void;
}

export interface UseDualAudioEngineReturn extends DualAudioEngineState, DualAudioEngineControls {
  /** Stable ref to the active HTMLAudioElement — use only for PlayerBar's direct DOM reads */
  activeAudioRef: React.RefObject<HTMLAudioElement | null>;
}

// ──────────────────────────────────────────
//  Internal state via useReducer for atomicity
// ──────────────────────────────────────────
interface EngineState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  progress: number;
  isHighQuality: boolean;
  streamLoading: boolean;
  isPreloading: boolean;
}

type EngineAction =
  | { type: 'SONG_LOADING' }
  | { type: 'STREAM_READY'; url: string; isHQ: boolean }
  | { type: 'PRELOAD_READY' }
  | { type: 'PRELOAD_START' }
  | { type: 'TICK'; currentTime: number; duration: number }
  | { type: 'PAUSE' }
  | { type: 'PLAY' }
  | { type: 'CROSSFADE_COMPLETE' }
  | { type: 'RESET' };

function engineReducer(state: EngineState, action: EngineAction): EngineState {
  switch (action.type) {
    case 'SONG_LOADING':
      return { ...state, streamLoading: true, isHighQuality: false, isPreloading: false, currentTime: 0, duration: 0, progress: 0 };
    case 'STREAM_READY':
      return { ...state, streamLoading: false, isHighQuality: action.isHQ, isPlaying: true };
    case 'PRELOAD_START':
      return { ...state, isPreloading: true };
    case 'PRELOAD_READY':
      return { ...state, isPreloading: false };
    case 'TICK':
      return {
        ...state,
        currentTime: action.currentTime,
        duration: action.duration,
        progress: action.duration > 0 ? (action.currentTime / action.duration) * 100 : 0,
      };
    case 'PAUSE':
      return { ...state, isPlaying: false };
    case 'PLAY':
      return { ...state, isPlaying: true };
    case 'CROSSFADE_COMPLETE':
      return { ...state, isPreloading: false };
    case 'RESET':
      return { isPlaying: false, currentTime: 0, duration: 0, progress: 0, isHighQuality: false, streamLoading: false, isPreloading: false };
    default:
      return state;
  }
}

const INIT_STATE: EngineState = {
  isPlaying: false, currentTime: 0, duration: 0, progress: 0,
  isHighQuality: false, streamLoading: false, isPreloading: false,
};

// ──────────────────────────────────────────
//  Hook
// ──────────────────────────────────────────
export function useDualAudioEngine(
  onSongEnded: (finishedSong: AnyTrack) => void,
  onCrossfadeSwap: (nextSong: AnyTrack) => void,
  onPreloadStart: (nextSong: AnyTrack) => void,
): UseDualAudioEngineReturn {
  const { settings } = usePlayerSettings();
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  // ── Two independent audio instances ───────────────────────────────────────
  const audioA = useRef<HTMLAudioElement>(new Audio());
  const audioB = useRef<HTMLAudioElement>(new Audio());

  /** 'A' | 'B' — which instance is currently playing */
  const activeSlot = useRef<'A' | 'B'>('A');

  /** Stable ref to the active audio element for PlayerBar DOM reads */
  const activeAudioRef = useRef<HTMLAudioElement | null>(audioA.current);

  // ── State ──────────────────────────────────────────────────────────────────
  const [state, dispatch] = useReducer(engineReducer, INIT_STATE);
  const [currentSong, setCurrentSong] = useState<AnyTrack | null>(null);
  const [volume, setVolumeState] = useState(1.0);

  const currentSongRef = useRef<AnyTrack | null>(null);
  const nextSongRef = useRef<AnyTrack | null>(null);      // song buffered in standby
  const profileKeysRef = useRef({ key1: '', key2: '' });
  const volumeRef = useRef(1.0);

  // ── Preload / crossfade control flags ─────────────────────────────────────
  const isNextPreloadedRef = useRef(false);  // true: standby audio has src+loaded
  const isCrossfadingRef = useRef(false);
  const crossfadeTimerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const preloadTriggeredRef = useRef(false);    // prevents double-trigger at 75%

  // ──────────────────────────────────────────
  //  Helpers
  // ──────────────────────────────────────────
  const getActive = useCallback((): HTMLAudioElement =>
    activeSlot.current === 'A' ? audioA.current : audioB.current, []);

  const getStandby = useCallback((): HTMLAudioElement =>
    activeSlot.current === 'A' ? audioB.current : audioA.current, []);

  const swapSlots = useCallback(() => {
    activeSlot.current = activeSlot.current === 'A' ? 'B' : 'A';
    activeAudioRef.current = getActive();
  }, [getActive]);

  /** Clean up the standby audio so it doesn't leak memory/bandwidth */
  const resetStandby = useCallback(() => {
    const sb = getStandby();
    sb.pause();
    sb.src = '';
    isNextPreloadedRef.current = false;
    nextSongRef.current = null;
    preloadTriggeredRef.current = false;
  }, [getStandby]);

  /** Apply volume to both audio elements simultaneously */
  const applyVolume = useCallback((v: number, activeOverride?: number) => {
    getActive().volume = activeOverride ?? v;
    // Standby volume is managed separately during crossfade
  }, [getActive]);

  // ──────────────────────────────────────────
  //  requestAnimationFrame tick
  // ──────────────────────────────────────────
  const startRAF = useCallback(() => {
    const tick = () => {
      const active = getActive();
      const cur = active.currentTime;
      const dur = isFinite(active.duration) && active.duration > 0 ? active.duration : 0;

      if (dur > 0) {
        dispatch({ type: 'TICK', currentTime: cur, duration: dur });

        const { seamlessPreload, crossfade, crossfadeDuration } = settingsRef.current;

        // ── Preload trigger at 75% ──────────────────────────────────────────
        if (
          seamlessPreload &&
          !preloadTriggeredRef.current &&
          !isNextPreloadedRef.current &&
          !isCrossfadingRef.current &&
          dur > 0 &&
          (cur / dur) >= 0.75
        ) {
          preloadTriggeredRef.current = true;
          // Will be handled by the preload logic outside RAF via a flag read
          // We dispatch an event to trigger preload from the useEffect below
          window.dispatchEvent(new CustomEvent('engine:trigger-preload'));
        }

        // ── Crossfade trigger at (duration - crossfadeDuration) ────────────
        if (
          seamlessPreload &&
          crossfade &&
          isNextPreloadedRef.current &&
          !isCrossfadingRef.current &&
          dur > 0 &&
          (dur - cur) <= crossfadeDuration &&
          (dur - cur) > 0
        ) {
          window.dispatchEvent(new CustomEvent('engine:trigger-crossfade'));
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [getActive]);

  const stopRAF = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // ──────────────────────────────────────────
  //  Preload trigger listener
  // ──────────────────────────────────────────
  useEffect(() => {
    const handlePreload = () => {
      const next = nextSongRef.current;
      if (!next || isNextPreloadedRef.current) return;

      console.log(`[DualAudio] Preloading next: "${next.artist} - ${next.title}"`);
      dispatch({ type: 'PRELOAD_START' });

      onPreloadStart(next);

      const { key1, key2 } = profileKeysRef.current;
      // Fire-and-forget — result arrives via "stream:preloaded" Wails event
      GetStreamURLForPreload(next.id, next.artist, next.title, key1, key2);
    };

    window.addEventListener('engine:trigger-preload', handlePreload);
    return () => window.removeEventListener('engine:trigger-preload', handlePreload);
  }, []);

  // ──────────────────────────────────────────
  //  Crossfade trigger listener
  // ──────────────────────────────────────────
  useEffect(() => {
    const handleCrossfade = () => {
      if (isCrossfadingRef.current || !isNextPreloadedRef.current) return;
      const nextSong = nextSongRef.current;
      if (!nextSong) return;

      isCrossfadingRef.current = true;
      console.log('[DualAudio] Crossfade started');

      const fadeOutAudio = getActive();
      const fadeInAudio = getStandby();
      const fadeDuration = settingsRef.current.crossfadeDuration * 1000;
      const steps = 30;
      const intervalMs = fadeDuration / steps;
      const userVol = volumeRef.current;

      fadeInAudio.volume = 0;
      fadeInAudio.play().catch(err => console.warn('[DualAudio] Standby play error:', err));

      // ── Immediately swap slots so UI binds to the new song (fadeInAudio) ──
      swapSlots();

      // ── Immediately update currentSong & lyrics to the NEXT song ──────────
      // This ensures the UI (Title, Artist, Lyrics, Duration slider) swaps instantly.
      currentSongRef.current = nextSong;
      setCurrentSong(nextSong);
      onCrossfadeSwap(nextSong);

      let step = 0;
      crossfadeTimerRef.current = window.setInterval(() => {
        step++;
        const ratio = step / steps;
        fadeOutAudio.volume = Math.max(0, userVol * (1 - ratio));
        fadeInAudio.volume = Math.min(userVol, userVol * ratio);

        if (step >= steps) {
          clearInterval(crossfadeTimerRef.current!);
          crossfadeTimerRef.current = null;

          // Tear down the old audio (which is now fading out in the background)
          fadeOutAudio.pause();
          fadeOutAudio.src = '';

          // Reset flags
          isNextPreloadedRef.current = false;
          isCrossfadingRef.current = false;
          preloadTriggeredRef.current = false;
          nextSongRef.current = null;

          dispatch({ type: 'CROSSFADE_COMPLETE' });
          console.log('[DualAudio] Crossfade complete — old audio detached');
        }
      }, intervalMs);
    };

    window.addEventListener('engine:trigger-crossfade', handleCrossfade);
    return () => window.removeEventListener('engine:trigger-crossfade', handleCrossfade);
  }, [getActive, getStandby, swapSlots, onCrossfadeSwap]);

  // ──────────────────────────────────────────
  //  Wails Event: "stream:ready" (active song)
  // ──────────────────────────────────────────
  useEffect(() => {
    const off = EventsOn(
      'stream:ready',
      (data: { songId: string; url: string; isHQ: boolean }) => {
        const cur = currentSongRef.current;
        if (!cur || cur.id !== data.songId) {
          console.log(`[DualAudio] stream:ready stale — expected ${cur?.id}, got ${data.songId}`);
          return;
        }

        const playURL = data.isHQ ? data.url : getPreviewURL(cur);
        if (!playURL) {
          console.warn('[DualAudio] No playable URL for active song');
          dispatch({ type: 'SONG_LOADING' }); // reset
          return;
        }

        console.log(`[DualAudio] stream:ready — ${data.isHQ ? 'HQ YouTube' : 'iTunes preview'} for "${cur.title}"`);

        const active = getActive();
        active.src = playURL;
        active.volume = volumeRef.current;
        active.play()
          .then(() => {
            dispatch({ type: 'STREAM_READY', url: playURL, isHQ: data.isHQ });
            startRAF();
          })
          .catch(err => {
            console.error('[DualAudio] Playback failed:', err);
            // Graceful fallback to iTunes preview if YouTube URL failed
            if (data.isHQ) {
              const fallback = getPreviewURL(cur);
              if (fallback && currentSongRef.current?.id === data.songId) {
                console.warn('[DualAudio] YouTube playback failed — falling back to iTunes preview');
                active.src = fallback;
                active.play()
                  .then(() => { dispatch({ type: 'STREAM_READY', url: fallback, isHQ: false }); startRAF(); })
                  .catch(() => dispatch({ type: 'RESET' }));
              } else {
                dispatch({ type: 'RESET' });
              }
            } else {
              dispatch({ type: 'RESET' });
            }
          });
      }
    );
    return () => { off(); };
  }, [getActive, startRAF]);

  // ──────────────────────────────────────────
  //  Wails Event: "stream:preloaded" (standby song)
  // ──────────────────────────────────────────
  useEffect(() => {
    const off = EventsOn(
      'stream:preloaded',
      (data: { songId: string; url: string; isHQ: boolean }) => {
        const next = nextSongRef.current;
        if (!next || next.id !== data.songId) {
          console.log(`[DualAudio] stream:preloaded stale — expected ${next?.id}, got ${data.songId}`);
          return;
        }

        const playURL = data.isHQ ? data.url : getPreviewURL(next);
        if (!playURL) {
          console.warn('[DualAudio] No preload URL available — preload skipped');
          preloadTriggeredRef.current = false;
          dispatch({ type: 'PRELOAD_READY' });
          return;
        }

        console.log(`[DualAudio] stream:preloaded — buffering "${next.title}" into standby`);
        const standby = getStandby();
        standby.src = playURL;
        standby.volume = 0;
        standby.load(); // Buffer, do NOT play yet
        isNextPreloadedRef.current = true;

        dispatch({ type: 'PRELOAD_READY' });
      }
    );
    return () => { off(); };
  }, [getStandby]);

  // ──────────────────────────────────────────
  //  Song-end handler (no crossfade path)
  // ──────────────────────────────────────────
  useEffect(() => {
    const handleEnded = () => {
      if (isCrossfadingRef.current) return; // crossfade handles its own completion

      const finished = currentSongRef.current;
      if (!finished) return;

      console.log(`[DualAudio] Song ended: "${finished.title}"`);

      if (settingsRef.current.seamlessPreload && isNextPreloadedRef.current) {
        // ── Seamless instant-swap (preload on, crossfade off) ──────────────
        console.log('[DualAudio] Instant seamless swap (no crossfade)');
        const active = getActive();
        const standby = getStandby();

        active.pause();
        active.src = '';

        standby.volume = volumeRef.current;
        swapSlots();

        const nextSong = nextSongRef.current;
        if (nextSong) {
          currentSongRef.current = nextSong;
          setCurrentSong(nextSong);
          onCrossfadeSwap(nextSong); // reuses the same callback
        }

        getActive().play().catch(err => console.warn('[DualAudio] Instant swap play error:', err));
        dispatch({ type: 'PLAY' });

        isNextPreloadedRef.current = false;
        nextSongRef.current = null;
        preloadTriggeredRef.current = false;
      } else {
        // ── Standard end: notify App.tsx to advance the queue ─────────────
        stopRAF();
        dispatch({ type: 'PAUSE' });
        onSongEnded(finished);
      }
    };

    audioA.current.addEventListener('ended', handleEnded);
    audioB.current.addEventListener('ended', handleEnded);
    return () => {
      audioA.current.removeEventListener('ended', handleEnded);
      audioB.current.removeEventListener('ended', handleEnded);
    };
  }, [getActive, getStandby, swapSlots, stopRAF, onSongEnded, onCrossfadeSwap]);

  // ──────────────────────────────────────────
  //  Cleanup on unmount
  // ──────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopRAF();
      if (crossfadeTimerRef.current) clearInterval(crossfadeTimerRef.current);
      audioA.current.pause();
      audioA.current.src = '';
      audioB.current.pause();
      audioB.current.src = '';
    };
  }, [stopRAF]);

  // ──────────────────────────────────────────
  //  Public API
  // ──────────────────────────────────────────

  /**
   * playSong — resets engine and starts loading a new song.
   * Also accepts the NEXT song in queue (for preload targeting).
   */
  const playSong = useCallback((
    song: AnyTrack,
    userVolume: number,
    keys: { key1: string; key2: string },
    nextSong?: AnyTrack,
  ) => {
    console.log(`[DualAudio] playSong: "${song.artist} - ${song.title}"`);

    // ── Abort any in-flight crossfade ──────────────────────────────────────
    if (crossfadeTimerRef.current) {
      clearInterval(crossfadeTimerRef.current);
      crossfadeTimerRef.current = null;
    }
    isCrossfadingRef.current = false;
    stopRAF();

    // ── Reset both audio instances ─────────────────────────────────────────
    audioA.current.pause();
    audioA.current.src = '';
    audioB.current.pause();
    audioB.current.src = '';

    // Reset to slot A as active
    activeSlot.current = 'A';
    activeAudioRef.current = audioA.current;

    // ── Reset flags ────────────────────────────────────────────────────────
    isNextPreloadedRef.current = false;
    preloadTriggeredRef.current = false;
    isCrossfadingRef.current = false;

    // ── Update refs ────────────────────────────────────────────────────────
    currentSongRef.current = song;
    nextSongRef.current = nextSong ?? null;
    profileKeysRef.current = keys;
    volumeRef.current = userVolume;

    // ── Update state ───────────────────────────────────────────────────────
    setCurrentSong(song);
    dispatch({ type: 'SONG_LOADING' });

    // ── Fire async stream resolution (non-blocking) ────────────────────────
    console.log(`[DualAudio] Requesting stream for "${song.artist} - ${song.title}"`);
    GetStreamURLAsync(song.id, song.artist, song.title, keys.key1, keys.key2);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopRAF]);

  /** Update the next song reference when queue changes (call from App.tsx) */
  const setNextSong = useCallback((next: AnyTrack | null) => {
    nextSongRef.current = next;
  }, []);

  const play = useCallback(() => {
    const active = getActive();
    if (!active.src) return;
    active.play()
      .then(() => { dispatch({ type: 'PLAY' }); startRAF(); })
      .catch(console.error);
  }, [getActive, startRAF]);

  const pause = useCallback(() => {
    getActive().pause();
    stopRAF();
    dispatch({ type: 'PAUSE' });
  }, [getActive, stopRAF]);

  const seek = useCallback((progress: number) => {
    const active = getActive();
    if (!active.duration || !isFinite(active.duration)) return;
    active.currentTime = (progress / 100) * active.duration;
    dispatch({ type: 'TICK', currentTime: active.currentTime, duration: active.duration });
  }, [getActive]);

  const setVolume = useCallback((v: number) => {
    volumeRef.current = v;
    setVolumeState(v);
    getActive().volume = v;
    // Don't touch standby volume during crossfade — it's being animated
    if (!isCrossfadingRef.current) {
      getStandby().volume = 0; // standby stays silent until crossfade starts
    }
  }, [getActive, getStandby]);

  const forceNext = useCallback(() => {
    if (crossfadeTimerRef.current) {
      clearInterval(crossfadeTimerRef.current);
      crossfadeTimerRef.current = null;
    }
    isCrossfadingRef.current = false;
    const finished = currentSongRef.current;
    if (!finished) return;
    stopRAF();
    dispatch({ type: 'PAUSE' });
    onSongEnded(finished);
  }, [stopRAF, onSongEnded]);

  return {
    // State
    currentSong,
    isPlaying: state.isPlaying,
    currentTime: state.currentTime,
    duration: state.duration,
    progress: state.progress,
    isHighQuality: state.isHighQuality,
    streamLoading: state.streamLoading,
    volume,
    isPreloading: state.isPreloading,
    // Controls
    playSong: playSong as any,
    play,
    pause,
    seek,
    setVolume,
    forceNext,
    // Ref
    activeAudioRef,
    // Internal setter for queue management
    _setNextSong: setNextSong,
  } as UseDualAudioEngineReturn & { _setNextSong: (t: AnyTrack | null) => void };
}
