import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Flame, Globe2, Music, Coffee, ChevronRight, Sparkles } from 'lucide-react';
import { main } from '../../wailsjs/go/models';
import { GetPlaylist } from '../../wailsjs/go/main/App';
import PlaylistDetail from './PlaylistDetail';

const CATEGORIES = [
  { id: 'global', name: 'Global Hits', subtitle: 'Top tracks worldwide', icon: <Globe2 className="w-6 h-6" />, gradient: 'from-blue-600 via-indigo-600 to-purple-700', accentColor: '#6366f1' },
  { id: 'id', name: 'Top Indonesia', subtitle: 'Lagu terpopuler hari ini', icon: <Flame className="w-6 h-6" />, gradient: 'from-orange-500 via-red-500 to-rose-600', accentColor: '#ef4444' },
  { id: 'pop', name: 'Pop Populer', subtitle: 'Pop hits & chart-toppers', icon: <Music className="w-6 h-6" />, gradient: 'from-pink-500 via-rose-500 to-fuchsia-600', accentColor: '#ec4899' },
  { id: 'focus', name: 'Focus & Study', subtitle: 'Instrumental & chill', icon: <Coffee className="w-6 h-6" />, gradient: 'from-emerald-500 via-teal-500 to-cyan-600', accentColor: '#14b8a6' },
];

interface CategoryData {
  songs: main.Song[];
  loaded: boolean;
}

export default function Home({ onPlaySong }: { onPlaySong: (song: main.Song, queue: main.Song[]) => void }) {
  const [categoryData, setCategoryData] = useState<Record<string, CategoryData>>({});
  const [heroLoading, setHeroLoading] = useState(true);
  const [selectedPlaylist, setSelectedPlaylist] = useState<string | null>(null);

  useEffect(() => {
    const fetchAll = async () => {
      setHeroLoading(true);
      for (const cat of CATEGORIES) {
        try {
          const res = await GetPlaylist(cat.id);
          setCategoryData(prev => ({
            ...prev,
            [cat.id]: { songs: res || [], loaded: true }
          }));
          if (cat.id === CATEGORIES[0].id) setHeroLoading(false);
        } catch (e) {
          console.error(`Failed to fetch ${cat.id}:`, e);
          setCategoryData(prev => ({
            ...prev,
            [cat.id]: { songs: [], loaded: true }
          }));
          if (cat.id === CATEGORIES[0].id) setHeroLoading(false);
        }
      }
    };
    fetchAll();
  }, []);

  const heroCategory = CATEGORIES[0];
  const heroSongs = categoryData[heroCategory.id]?.songs || [];
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
            onClick={() => heroSongs.length > 0 && onPlaySong(heroSong, heroSongs)}
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
                className="w-48 h-48 rounded-2xl shadow-2xl shadow-black/60 border border-black/10 dark:border-white/10 object-cover"
              />
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="flex flex-col space-y-3 pb-2"
              >
                <div className="flex items-center space-x-2">
                  <Sparkles className="w-4 h-4 text-brand-400" />
                  <span className="text-xs font-semibold uppercase tracking-widest text-brand-300">Daily Mix</span>
                </div>
                <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight leading-tight text-balance">
                  {heroCategory.name}
                </h1>
                <p className="text-white/70 text-sm">{heroSongs.length} tracks • {heroCategory.subtitle}</p>
                <div className="flex items-center space-x-3 mt-2">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      onPlaySong(heroSong, heroSongs);
                    }}
                    // FIX: Teks dan ikon pada tombol merah HARUS selalu putih (text-white fill-white)
                    className="flex items-center space-x-2 bg-brand-500 hover:bg-brand-600 text-white px-6 py-2.5 rounded-full font-semibold shadow-lg shadow-brand-500/30 hover:shadow-brand-500/50 transition-all hover:scale-105 active:scale-95"
                  >
                    <Play className="w-5 h-5 fill-white" />
                    <span>Play</span>
                  </button>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePlaylistClick(heroCategory.id);
                    }}
                    className="text-white/70 hover:text-white text-sm underline underline-offset-4 decoration-white/20 hover:decoration-white/50 transition-all"
                  >
                    View All
                  </button>
                </div>
              </motion.div>
            </div>
          </motion.div>
        ) : null}
      </div>

      {/* Category Sections */}
      <div className="flex flex-col space-y-10 p-8 pt-10">
        {CATEGORIES.map((cat, catIdx) => {
          const songs = categoryData[cat.id]?.songs || [];
          const loaded = categoryData[cat.id]?.loaded ?? false;
          const isLarge = catIdx === 1; 

          return (
            <motion.section 
              key={cat.id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: catIdx * 0.1 + 0.2 }}
            >
              {/* Section Header */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center space-x-3">
                  {/* FIX: Hapus "text-black dark:text-white". Ikon dalam kotak gradient warna pekat HARUS selalu putih. */}
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${cat.gradient} flex items-center justify-center text-white shadow-lg`}>
                    {cat.icon}
                  </div>
                  <div>
                    {/* FIX: text-gray-900 untuk judul kategori di Light Mode */}
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">{cat.name}</h2>
                    {/* FIX: text-gray-500 untuk subtitle di Light Mode */}
                    <p className="text-xs text-gray-500 dark:text-gray-400">{cat.subtitle}</p>
                  </div>
                </div>
                <button 
                  onClick={() => handlePlaylistClick(cat.id)}
                  className="flex items-center space-x-1 text-sm text-gray-600 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors group"
                >
                  <span>See all</span>
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>

              {/* Cards */}
              {!loaded ? (
                <div className="flex space-x-4 overflow-hidden">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className={`flex-shrink-0 ${isLarge ? 'w-56 h-56' : 'w-44 h-44'} rounded-xl bg-gray-200 dark:bg-white/5 animate-pulse`} />
                  ))}
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
                      onPlay={() => onPlaySong(song, songs)} 
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

// Individual Song Card
function SongCard({ song, idx, large, accentColor, onPlay }: { 
  song: main.Song; 
  idx: number; 
  large: boolean; 
  accentColor: string;
  onPlay: () => void 
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
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: idx * 0.04, duration: 0.3 }}
      onClick={onPlay}
      className={`group cursor-pointer flex-shrink-0 flex flex-col relative ${large ? 'w-56' : 'w-44'}`}
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
          alt={song.title} 
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
        {/* Hover overlay with play button */}
        <div className="absolute inset-0 bg-white/30 dark:bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="w-12 h-12 bg-brand-500 rounded-full flex items-center justify-center transform translate-y-4 group-hover:translate-y-0 transition-all duration-300 shadow-xl shadow-brand-500/30">
            {/* FIX: Ikon play HARUS selalu putih karena background tombolnya merah */}
            <Play className="text-white w-6 h-6 fill-white ml-0.5" />
          </div>
        </div>
        {/* Bottom gradient inside image */}
        <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-black/50 to-transparent pointer-events-none opacity-0 dark:opacity-100" />
      </div>

      {/* Song Info */}
      <div className="mt-3 px-1">
        {/* FIX: Judul lagu menggunakan gray-900 di Light Mode */}
        <h3 className="text-gray-900 dark:text-white font-semibold text-sm line-clamp-1 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">{song.title}</h3>
        {/* FIX: Artis menggunakan gray-500 di Light Mode */}
        <p className="text-gray-500 dark:text-gray-400 text-xs line-clamp-1 mt-0.5">{song.artist}</p>
      </div>
    </motion.div>
  );
}