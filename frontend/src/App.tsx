import { useState, useRef, useEffect, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';

import Sidebar from './components/Sidebar';
import PlayerBar from './components/PlayerBar';
import QueuePanel from './components/QueuePanel';
import Search from './pages/Search';
import Home from './pages/Home';
import Lyrics from './pages/Lyrics';

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
//  App
// ──────────────────────────────────────────
function App() {
  const [activeTab, setActiveTab] = useState('home');

  // Current playback
  const [currentSong, setCurrentSong] = useState<AnyTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [bgColor, setBgColor] = useState('rgb(17, 24, 39)');
  const [isHighQuality, setIsHighQuality] = useState(false);
  const [streamLoading, setStreamLoading] = useState(false);
  const [audioDuration, setAudioDuration] = useState(0);

  // Queue
  const [queue, setQueue] = useState<AnyTrack[]>([]);
  const [isShuffle, setIsShuffle] = useState(false);
  const [isSmartShuffleActive, setIsSmartShuffleActive] = useState(false);
  const [isGeneratingQueue, setIsGeneratingQueue] = useState(false);
  // Stable ref so callbacks always see the latest queue
  const queueRef = useRef<AnyTrack[]>([]);
  useEffect(() => { queueRef.current = queue; }, [queue]);

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
  const rafRef = useRef<number | null>(null);
  const currentSongRef = useRef<AnyTrack | null>(null);
  const isGeneratingRef = useRef(false); // prevents concurrent builds

  useEffect(() => { currentSongRef.current = currentSong; }, [currentSong]);
  useEffect(() => { isGeneratingRef.current = isGeneratingQueue; }, [isGeneratingQueue]);

  // ── Dynamic background via ColorThief ──
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
          setBgColor(`rgb(${r},${g},${b})`);
        }
      } catch (_) {}
    };
  }, [currentSong]);

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
  //  Smart Queue builder (called immediately on play & recursively)
  // ──────────────────────────────────────────
  const buildAndSetSmartQueue = useCallback(async (seed: AnyTrack, appendToQueue: AnyTrack[] = []) => {
    if (isGeneratingRef.current) return;
    isGeneratingRef.current = true;
    setIsGeneratingQueue(true);
    console.log(`[SmartShuffle] Building queue for "${seed.artist} - ${seed.title}"`);

    try {
      const genre = (seed as any).genre ?? '';
      const recommendations = await BuildSmartQueue(seed.artist, seed.title, genre, seed.id);

      if (recommendations && recommendations.length > 0) {
        console.log(`[SmartShuffle] ${recommendations.length} tracks received`);
        setIsSmartShuffleActive(true);
        // If appendToQueue is provided, append to it; otherwise start fresh with seed + recs
        const newQueue: AnyTrack[] = appendToQueue.length > 0
          ? [...appendToQueue, ...recommendations]
          : [seed, ...recommendations];  // seed is the currently-playing song
        setQueue(newQueue);
        queueRef.current = newQueue;
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

  // ── Navigation (reads from queueRef for stability) ──
  const playNext = useCallback(() => {
    const song = currentSongRef.current;
    const q = queueRef.current;
    if (!q.length || !song) return;
    let nextIdx: number;
    if (isShuffle) {
      nextIdx = Math.floor(Math.random() * q.length);
    } else {
      const cur = q.findIndex(s => s.id === song.id);
      nextIdx = (cur + 1) % q.length;
    }
    playSongCore(q[nextIdx], q);
  }, [isShuffle]);

  const playPrev = useCallback(() => {
    const song = currentSongRef.current;
    const q = queueRef.current;
    if (!q.length || !song) return;
    const cur = q.findIndex(s => s.id === song.id);
    const prev = cur <= 0 ? q.length - 1 : cur - 1;
    playSongCore(q[prev], q);
  }, []);

  // ── Song end handler: advance queue + recursive Smart Shuffle trigger ──
  const handleSongEnd = useCallback(async () => {
    const song = currentSongRef.current;
    const q = queueRef.current;
    if (!song) return;

    const curIdx = q.findIndex(s => s.id === song.id);
    const nextIdx = curIdx + 1;

    // Trigger recursive build when 3 songs remain
    if (curIdx >= q.length - 3 && !isGeneratingRef.current) {
      const seedSong = q[q.length - 1] ?? song;
      buildAndSetSmartQueue(seedSong, q);
    }

    if (nextIdx < q.length) {
      playSongCore(q[nextIdx], q);
    } else {
      // Batch might still be arriving — retry after a short delay
      setTimeout(() => {
        const latestQ = queueRef.current;
        const latestIdx = latestQ.findIndex(s => s.id === currentSongRef.current?.id);
        if (latestIdx + 1 < latestQ.length) {
          playSongCore(latestQ[latestIdx + 1], latestQ);
        }
      }, 600);
    }
  }, [buildAndSetSmartQueue]);

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

    // Phase 1: iTunes preview — instant play
    const previewURL = getPreviewURL(song);
    if (previewURL && audioRef.current) {
      audioRef.current.src = previewURL;
      audioRef.current.play()
        .then(() => { setIsPlaying(true); setStreamLoading(false); })
        .catch(err => { console.error('Preview error:', err); setStreamLoading(false); });
    } else {
      setStreamLoading(false);
    }

    // Phase 2: YouTube lazy-load (background)
    try {
      const ytURL = await GetFullStreamURL(song.artist, song.title);
      if (ytURL && ytURL.trim() !== '') {
        const savedTime = audioRef.current?.currentTime ?? 0;
        if (audioRef.current) {
          audioRef.current.src = ytURL;
          audioRef.current.currentTime = savedTime;
          audioRef.current.play()
            .then(() => { setIsHighQuality(true); setIsPlaying(true); })
            .catch(() => {
              // Swap failed → restore preview
              if (previewURL && audioRef.current) {
                audioRef.current.src = previewURL;
                audioRef.current.currentTime = savedTime;
                audioRef.current.play().catch(() => {});
              }
              setIsHighQuality(false);
            });
        }
      }
    } catch (e: any) {
      const is429 = String(e).includes('429') || String(e).includes('quota');
      console.warn(`[YouTube] ${is429 ? 'Rate-limited (429)' : 'Error'} — staying on iTunes preview`);
      setIsHighQuality(false);
    }
  }, [fetchLyricsBackground]);

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
  //  Handlers for Home/Search pages
  //  These call playSong which handles queue clearing + Smart Shuffle trigger
  // ──────────────────────────────────────────
  const handlePlaySong = useCallback((song: main.Song, _sourceQueue: main.Song[]) => {
    // Cast to AnyTrack; ignore the sourceQueue — Smart Shuffle fills the queue instead
    playSong(song as AnyTrack, []);
  }, [playSong]);

  return (
    <div
      className="h-screen w-screen overflow-hidden flex transition-colors duration-1000 ease-in-out relative"
      style={{ backgroundColor: bgColor }}
    >
      <div className="absolute inset-0 bg-black/60 z-0 pointer-events-none" />

      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main content area — relative so QueuePanel can overlay */}
      <div className="flex-1 relative h-full overflow-hidden">
        <main className="w-full h-full relative z-10">
          <AnimatePresence mode="wait">
            {activeTab === 'home' && !showLyrics && (
              <Home key="home" onPlaySong={handlePlaySong} />
            )}
            {activeTab === 'search' && !showLyrics && (
              <Search key="search" onPlaySong={handlePlaySong} />
            )}
            {(activeTab === 'library' || activeTab === 'playlists') && !showLyrics && (
              <div key="placeholder" className="w-full h-full flex items-center justify-center text-gray-400">
                <h2 className="text-2xl font-semibold capitalize">{activeTab} — Coming Soon</h2>
              </div>
            )}
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
              />
            )}
          </AnimatePresence>
        </main>

        {/* Queue Panel — overlays from the right */}
        <QueuePanel
          isOpen={showQueue}
          onClose={() => setShowQueue(false)}
          queue={queue as main.SmartTrack[]}
          currentSong={currentSong as main.SmartTrack}
          onPlayTrack={(track) => playSongCore(track, queueRef.current)}
          isSmartShuffleActive={isSmartShuffleActive}
        />
      </div>

      <PlayerBar
        currentSong={currentSong as main.Song}
        isPlaying={isPlaying}
        setIsPlaying={setIsPlaying}
        audioRef={audioRef}
        progress={progress}
        setProgress={setProgress}
        isShuffle={isShuffle}
        setIsShuffle={(v) => { setIsShuffle(v); if (v) setIsSmartShuffleActive(false); }}
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

export default App;
