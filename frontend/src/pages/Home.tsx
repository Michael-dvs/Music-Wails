import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Flame, Globe2, Music, Coffee, ChevronRight, AlertCircle, RotateCcw, Sparkles } from 'lucide-react';
import { main } from '../../wailsjs/go/models';
import { GetPlaylist } from '../../wailsjs/go/main/App';
import PlaylistDetail from './PlaylistDetail';
import SongActionMenu from '../components/SongActionMenu';

const CATEGORIES = [
  { id: 'global', name: 'Global Hits', subtitle: 'Top tracks worldwide', icon: <Globe2 className="w-6 h-6" />, gradient: 'from-blue-600 via-indigo-600 to-purple-700', accentColor: '#6366f1' },
  { id: 'id', name: 'Top Indonesia', subtitle: 'Lagu terpopuler hari ini', icon: <Flame className="w-6 h-6" />, gradient: 'from-orange-500 via-red-500 to-rose-600', accentColor: '#ef4444' },
  { id: 'pop', name: 'Pop Populer', subtitle: 'Pop hits & chart-toppers', icon: <Music className="w-6 h-6" />, gradient: 'from-pink-500 via-rose-500 to-fuchsia-600', accentColor: '#ec4899' },
  { id: 'focus', name: 'Focus & Study', subtitle: 'Instrumental & chill', icon: <Coffee className="w-6 h-6" />, gradient: 'from-emerald-500 via-teal-500 to-cyan-600', accentColor: '#14b8a6' },
];

interface CategoryData {
  songs: main.Song[];
  loaded: boolean;
  error?: string | null;
}

interface HomeProps {
  onPlaySong: (song: main.Song, queue: main.Song[], source: 'playlist' | 'search') => void;
  onPlayNext?: (song: main.Song) => void;
  onAddToQueue?: (song: main.Song) => void;
  onOpenAddToPlaylist?: (song: main.Song) => void;
}

export default function Home({
  onPlaySong,
  onPlayNext,
  onAddToQueue,
  onOpenAddToPlaylist,
}: HomeProps) {
  const [categoryData, setCategoryData] = useState<Record<string, CategoryData>>({});
  const [heroLoading, setHeroLoading] = useState(true);
  const [selectedPlaylist, setSelectedPlaylist] = useState<string | null>(null);

  const fetchCategory = useCallback(async (catId: string) => {
    setCategoryData(prev => ({
      ...prev,
      [catId]: { songs: prev[catId]?.songs || [], loaded: false, error: null }
    }));
    if (catId === CATEGORIES[0].id) setHeroLoading(true);

    try {
      const res = await GetPlaylist(catId);
      setCategoryData(prev => ({
        ...prev,
        [catId]: { songs: res || [], loaded: true, error: null }
      }));
    } catch (e: any) {
      console.error(`Failed to fetch ${catId}:`, e);
      setCategoryData(prev => ({
        ...prev,
        [catId]: { songs: [], loaded: true, error: e?.message || 'Gagal memuat kategori ini.' }
      }));
    } finally {
      if (catId === CATEGORIES[0].id) setHeroLoading(false);
    }
  }, []);

  const fetchAll = useCallback(async () => {
    for (const cat of CATEGORIES) {
      fetchCategory(cat.id);
    }
  }, [fetchCategory]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const heroCategory = CATEGORIES[0];
  const heroData = categoryData[heroCategory.id];
  const heroSongs = heroData?.songs || [];
  const heroSong = heroSongs[0];

  const handlePlaylistClick = useCallback((catId: string) => {
    setSelectedPlaylist(catId);
  }, []);

  const handleBack = useCallback(() => {
    setSelectedPlaylist(null);
  }, []);

  if (selectedPlaylist) {
    const cat = CATEGORIES.find(c => c.id === selectedPlaylist);
    const songs = categoryData[selectedPlaylist]?.songs || [];
    return (
      <AnimatePresence mode="wait">
        <PlaylistDetail
          key={selectedPlaylist}
          songs={songs}
          playlistName={cat?.name || 'Playlist'}
          playlistColor={cat?.accentColor || '#8b5cf6'}
          onPlaySong={onPlaySong}
          onBack={handleBack}
          onPlayNext={onPlayNext}
          onAddToQueue={onAddToQueue}
          onOpenAddToPlaylist={onOpenAddToPlaylist}
        />
      </AnimatePresence>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="w-full h-full flex flex-col overflow-y-auto pb-32 no-scrollbar"
    >
      {/* Hero Section */}
      <div className="relative w-full h-[320px] overflow-hidden flex-shrink-0">
        {heroLoading ? (
          <div className="w-full h-full animate-shimmer rounded-b-3xl" />
        ) : heroSong ? (
          <motion.div 
            initial={{ opacity: 0, scale: 1.05 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8 }}
            className="relative w-full h-full cursor-pointer group"
            onClick={() => heroSongs.length > 0 && onPlaySong(heroSong, heroSongs, 'playlist')}
          >
            <img 
              src={heroSong.coverArt} 
              alt="" 
              className="absolute inset-0 w-full h-full object-cover blur-[60px] scale-125 opacity-60"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/80" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-transparent" />

            <div className="relative z-10 h-full flex items-end p-8 space-x-8">
              <motion.img 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                src={heroSong.coverArt} 
                alt="" 
                className="w-48 h-48 rounded-2xl shadow-2xl shadow-black/60 border border-black/10 dark:border-white/10 object-cover flex-shrink-0"
              />
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="flex flex-col space-y-3 pb-2 min-w-0"
              >
                <div className="flex items-center space-x-2">
                  <Sparkles className="w-4 h-4 text-brand-400" />
                  <span className="text-xs font-semibold uppercase tracking-widest text-brand-300">Daily Mix</span>
                </div>
                <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight leading-tight text-balance truncate">
                  {heroCategory.name}
                </h1>
                <p className="text-white/70 text-sm">{heroSongs.length} tracks • {heroCategory.subtitle}</p>
                <div className="flex items-center space-x-3 mt-2">
                  <button 
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPlaySong(heroSong, heroSongs, 'playlist');
                    }}
                    aria-label={`Putar ${heroCategory.name}`}
                    className="flex items-center space-x-2 bg-brand-500 hover:bg-brand-600 text-white px-6 py-2.5 rounded-full font-semibold shadow-lg shadow-brand-500/30 hover:shadow-brand-500/50 transition-all hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    <Play className="w-5 h-5 fill-white" />
                    <span>Play</span>
                  </button>
                  <button 
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePlaylistClick(heroCategory.id);
                    }}
                    aria-label={`Lihat semua lagu di ${heroCategory.name}`}
                    className="text-white/70 hover:text-white text-sm underline underline-offset-4 decoration-white/20 hover:decoration-white/50 transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white rounded"
                  >
                    View All
                  </button>
                  {heroSong && (
                    <SongActionMenu
                      song={heroSong}
                      onPlayNext={onPlayNext}
                      onAddToQueue={onAddToQueue}
                      onOpenAddToPlaylist={onOpenAddToPlaylist}
                      triggerClassName="text-white/80 hover:text-white hover:bg-white/10 rounded-full"
                    />
                  )}
                </div>
              </motion.div>
            </div>
          </motion.div>
        ) : (
          /* Empty or Error state for Hero: NO blank unexplained 320px gap */
          <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-gradient-to-br from-black/5 via-black/10 to-black/20 dark:from-white/5 dark:via-white/10 dark:to-transparent rounded-b-3xl border-b border-black/10 dark:border-white/10 text-center space-y-3">
            <AlertCircle className="w-10 h-10 text-brand-500 opacity-80" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              {heroData?.error ? 'Gagal Memuat Rekomendasi Utama' : 'Belum Ada Lagu Unggulan'}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md">
              {heroData?.error || 'Koleksi unggulan harian sedang diperbarui atau belum tersedia.'}
            </p>
            <button
              type="button"
              onClick={() => fetchCategory(heroCategory.id)}
              className="flex items-center space-x-2 px-4 py-2 rounded-full bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold shadow-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Coba Lagi</span>
            </button>
          </div>
        )}
      </div>

      {/* Category Sections */}
      <div className="flex flex-col space-y-10 p-8 pt-10">
        {CATEGORIES.map((cat, catIdx) => {
          const data = categoryData[cat.id];
          const songs = data?.songs || [];
          const loaded = data?.loaded ?? false;
          const error = data?.error;
          const isLarge = catIdx === 1; 

          return (
            <motion.section 
              key={cat.id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(catIdx, 3) * 0.1 + 0.1 }}
            >
              {/* Section Header */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center space-x-3">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${cat.gradient} flex items-center justify-center text-white shadow-lg flex-shrink-0`}>
                    {cat.icon}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">{cat.name}</h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{cat.subtitle}</p>
                  </div>
                </div>
                <button 
                  type="button"
                  onClick={() => handlePlaylistClick(cat.id)}
                  aria-label={`Lihat semua lagu di kategori ${cat.name}`}
                  className="flex items-center space-x-1 text-sm text-gray-600 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors group focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500 rounded"
                >
                  <span>See all</span>
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>

              {/* Cards / Error / Empty States */}
              {!loaded ? (
                <div className="flex space-x-4 overflow-hidden">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className={`flex-shrink-0 ${isLarge ? 'w-56 h-56' : 'w-44 h-44'} rounded-xl bg-gray-200 dark:bg-white/5 animate-pulse`} />
                  ))}
                </div>
              ) : error ? (
                <div className="p-6 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center space-x-3">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <p className="text-xs sm:text-sm font-medium">{error}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => fetchCategory(cat.id)}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-semibold hover:bg-red-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Muat Ulang</span>
                  </button>
                </div>
              ) : songs.length === 0 ? (
                <div className="p-6 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-gray-500 text-xs sm:text-sm text-center">
                  Belum ada lagu yang tersedia di kategori ini.
                </div>
              ) : (
                <div className="scroll-x-container flex space-x-4 pb-2">
                  {songs.slice(0, isLarge ? 8 : 12).map((song, idx) => (
                    <SongCard 
                      key={song.id || idx} 
                      song={song} 
                      idx={idx} 
                      large={isLarge} 
                      accentColor={cat.accentColor}
                      onPlay={() => onPlaySong(song, songs, 'playlist')} 
                      onPlayNext={onPlayNext}
                      onAddToQueue={onAddToQueue}
                      onOpenAddToPlaylist={onOpenAddToPlaylist}
                    />
                  ))}
                </div>
              )}
            </motion.section>
          );
        })}
      </div>
    </motion.div>
  );
}

// Individual Song Card with keyboard accessibility & semantic button roles
function SongCard({
  song,
  idx,
  large,
  accentColor,
  onPlay,
  onPlayNext,
  onAddToQueue,
  onOpenAddToPlaylist,
}: { 
  song: main.Song; 
  idx: number; 
  large: boolean; 
  accentColor: string; 
  onPlay: () => void;
  onPlayNext?: (song: main.Song) => void;
  onAddToQueue?: (song: main.Song) => void;
  onOpenAddToPlaylist?: (song: main.Song) => void;
}) {
  const [dominantColor, setDominantColor] = useState(accentColor);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (song.coverArt) {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.src = song.coverArt;
      img.onload = () => {
        try {
          const ColorThiefClass = (window as any).ColorThief;
          if (ColorThiefClass) {
            const ct = new ColorThiefClass();
            const color = ct.getColor(img);
            setDominantColor(`rgb(${color[0]}, ${color[1]}, ${color[2]})`);
          }
        } catch {}
      };
    }
  }, [song.coverArt]);

  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-label={`Putar ${song.title} oleh ${song.artist}`}
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: Math.min(idx, 8) * 0.03, duration: 0.25 }}
      onClick={onPlay}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onPlay();
        }
      }}
      className={`group cursor-pointer flex-shrink-0 flex flex-col relative rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${large ? 'w-56' : 'w-44'}`}
    >
      {/* Card with gradient bg */}
      <div 
        className={`relative ${large ? 'h-56' : 'h-44'} rounded-2xl overflow-hidden shadow-sm dark:shadow-lg border border-black/5 dark:border-white/5 transition-all duration-300 group-hover:shadow-md dark:group-hover:shadow-xl group-hover:border-black/15 dark:border-white/15 group-hover:scale-[1.03]`}
        style={{ 
          background: `linear-gradient(145deg, ${dominantColor}33 0%, ${dominantColor}11 50%, transparent 100%)`
        }}
      >
        <img 
          ref={imgRef}
          src={song.coverArt} 
          alt="" 
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
        {/* Hover overlay with play button */}
        <div className="absolute inset-0 bg-white/30 dark:bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="w-12 h-12 bg-brand-500 rounded-full flex items-center justify-center transform translate-y-4 group-hover:translate-y-0 transition-all duration-300 shadow-xl shadow-brand-500/30">
            <Play className="text-white w-6 h-6 fill-white ml-0.5" />
          </div>
        </div>
        {/* Bottom gradient inside image */}
        <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-black/50 to-transparent pointer-events-none opacity-0 dark:opacity-100" />

        {/* Action Menu overlay */}
        <div className="absolute top-2 right-2 z-20 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
          <SongActionMenu
            song={song}
            onPlayNext={onPlayNext}
            onAddToQueue={onAddToQueue}
            onOpenAddToPlaylist={onOpenAddToPlaylist}
            triggerClassName="bg-black/60 hover:bg-black/80 text-white rounded-full p-1"
          />
        </div>
      </div>

      {/* Song Info */}
      <div className="mt-3 px-1 min-w-0">
        <h3 className="text-gray-900 dark:text-white font-semibold text-sm line-clamp-1 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
          {song.title}
        </h3>
        <p className="text-gray-500 dark:text-gray-400 text-xs line-clamp-1 mt-0.5">
          {song.artist}
        </p>
      </div>
    </motion.div>
  );
}
