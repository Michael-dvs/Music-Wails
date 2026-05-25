import { useState, useEffect, useRef, useCallback } from 'react';
import { Search as SearchIcon, Play, Loader2, X, Clock, Music2, User, Disc3 } from 'lucide-react';
import { main } from '../../wailsjs/go/models';
import { SearchSongs } from '../../wailsjs/go/main/App';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchAPI } from '../lib/fetchAPI';
import AlbumDetail, { getAvatarColor, getInitials, getHighResArtwork } from './AlbumDetail';

const ANIMATED_PLACEHOLDERS = [
  'Cari lagu Tulus...',
  'Find Taylor Swift...',
  'Cari playlist santai...',
  'Search The Weeknd...',
  'Temukan Pamungkas...',
  'Explore K-Pop hits...',
  'Discover Billie Eilish...',
  'Cari Hindia songs...',
];

const HISTORY_KEY = 'vibestream_search_history';
const MAX_HISTORY = 5;

function getSearchHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveSearchHistory(query: string) {
  const history = getSearchHistory();
  const filtered = history.filter(h => h.toLowerCase() !== query.toLowerCase());
  filtered.unshift(query);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered.slice(0, MAX_HISTORY)));
}

function removeFromHistory(query: string): string[] {
  const history = getSearchHistory().filter(h => h !== query);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  return history;
}

// ── iTunes Artist type ──────────────────────────────────────────────
interface ItunesArtist {
  artistId: number;
  artistName: string;
  primaryGenreName?: string;
  artistLinkUrl?: string;
}

export default function Search({
  onPlaySong,
  onNavigateToArtist,
}: {
  onPlaySong: (song: main.Song, queue: main.Song[], source: 'playlist' | 'search') => void;
  onNavigateToArtist?: (artistId: number, artistName: string, genre?: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<main.Song[]>([]);
  const [artists, setArtists] = useState<ItunesArtist[]>([]);
  const [albums, setAlbums] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingAlbums, setLoadingAlbums] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [history, setHistory] = useState<string[]>(getSearchHistory());
  const inputRef = useRef<HTMLInputElement>(null);

  // Local state to navigate to album detail within search tab
  const [selectedAlbum, setSelectedAlbum] = useState<any | null>(null);

  const handleArtistClick = useCallback((artist: ItunesArtist) => {
    if (onNavigateToArtist) {
      onNavigateToArtist(artist.artistId, artist.artistName, artist.primaryGenreName);
    }
  }, [onNavigateToArtist]);

  // Animated placeholder
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [placeholderVisible, setPlaceholderVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderVisible(false);
      setTimeout(() => {
        setPlaceholderIdx(prev => (prev + 1) % ANIMATED_PLACEHOLDERS.length);
        setPlaceholderVisible(true);
      }, 300);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Debounced unified search — tracks (YouTube) + artists (iTunes) + albums (iTunes) concurrently
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.trim().length > 2) {
        setLoading(true);
        setLoadingAlbums(true);
        try {
          const [songs, artistRes, albumRes] = await Promise.all([
            SearchSongs(query).catch(() => []),
            fetchAPI<any>(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=musicArtist&limit=5&country=id`)
              .then(d => (d.results ?? []) as ItunesArtist[])
              .catch(() => [] as ItunesArtist[]),
            fetchAPI<any>(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=album&limit=10&country=id`)
              .then(d => d.results ?? [])
              .catch(() => []),
          ]);
          setResults(songs || []);
          setArtists(artistRes);
          setAlbums(albumRes);
          // Save to history on successful search
          if ((songs && songs.length > 0) || artistRes.length > 0 || albumRes.length > 0) {
            saveSearchHistory(query.trim());
            setHistory(getSearchHistory());
          }
        } catch (e) {
          console.error(e);
        } finally {
          setLoading(false);
          setLoadingAlbums(false);
        }
      } else if (query.trim().length === 0) {
        setResults([]);
        setArtists([]);
        setAlbums([]);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [query]);

  const handleHistoryClick = useCallback((term: string) => {
    setQuery(term);
    inputRef.current?.focus();
  }, []);

  const handleHistoryRemove = useCallback((term: string) => {
    const updated = removeFromHistory(term);
    setHistory(updated);
  }, []);

  if (selectedAlbum) {
    return (
      <AnimatePresence mode="wait">
        <AlbumDetail
          album={selectedAlbum}
          onBack={() => setSelectedAlbum(null)}
          onPlaySong={onPlaySong}
          onNavigateToArtist={onNavigateToArtist}
        />
      </AnimatePresence>
    );
  }

  const showPlaceholder = !isFocused && query.length === 0;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="w-full h-full flex flex-col p-8 space-y-6 overflow-y-auto pb-32 no-scrollbar"
    >
      {/* Search Bar with Animated Placeholder */}
      <div className="relative max-w-2xl w-full">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-10">
          <SearchIcon className="text-gray-600 dark:text-gray-400 w-6 h-6" />
        </div>
        
        {/* Animated Placeholder Overlay */}
        {showPlaceholder && (
          <div className="absolute inset-y-0 left-12 flex items-center pointer-events-none z-[5]">
            <AnimatePresence mode="wait">
              {placeholderVisible && (
                <motion.span
                  key={placeholderIdx}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 0.5, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3 }}
                  className="text-gray-600 dark:text-gray-400 text-base"
                >
                  {ANIMATED_PLACEHOLDERS[placeholderIdx]}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        )}

        <input 
          ref={inputRef}
          type="text" 
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className="w-full bg-black/10 dark:bg-white/10 border border-black/20 dark:border-white/20 rounded-full py-4 pl-12 pr-12 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 backdrop-blur-md shadow-lg transition-all"
        />
        
        {/* Clear / Loading indicator */}
        <div className="absolute inset-y-0 right-0 pr-4 flex items-center space-x-2">
          {query.length > 0 && !loading && (
            <button 
              onClick={() => { setQuery(''); setResults([]); }}
              className="p-1 rounded-full hover:bg-black/10 dark:hover:bg-white/10 text-gray-600 dark:text-gray-400 hover:text-brand-500 dark:hover:text-brand-400 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          {loading && (
            <Loader2 className="text-brand-400 w-5 h-5 animate-spin" />
          )}
        </div>
      </div>

      {/* Search History Chips */}
      <AnimatePresence>
        {history.length > 0 && query.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center flex-wrap gap-2 max-w-2xl"
          >
            <Clock className="w-4 h-4 text-gray-500 mr-1" />
            {history.map((term) => (
              <motion.div
                key={term}
                layout
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.2 }}
                className="group flex items-center space-x-1.5 bg-black/8 dark:bg-white/8 hover:bg-black/15 dark:hover:bg-white/15 backdrop-blur-md border border-black/10 dark:border-white/10 hover:border-black/20 dark:border-white/20 rounded-full px-3 py-1.5 cursor-pointer transition-all duration-200"
                onClick={() => handleHistoryClick(term)}
              >
                <span className="text-sm text-gray-700 dark:text-gray-300 group-hover:text-brand-500 dark:hover:text-brand-400 transition-colors">{term}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleHistoryRemove(term);
                  }}
                  className="p-0.5 rounded-full opacity-0 group-hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 text-gray-600 dark:text-gray-400 hover:text-brand-500 dark:hover:text-brand-400 transition-all"
                >
                  <X className="w-3 h-3" />
                </button>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results */}
      <div className="flex-1 flex flex-col space-y-8">
        {/* ── Artists Section ─────────────────────────────────── */}
        <AnimatePresence>
          {artists.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <h2 className="text-xl font-bold text-black dark:text-white mb-4 flex items-center space-x-2">
                <User className="w-5 h-5 text-brand-400" />
                <span>Artists</span>
              </h2>
              <div className="flex space-x-6 overflow-x-auto pb-3 no-scrollbar">
                {artists.map((artist, idx) => {
                  const gradient = getAvatarColor(artist.artistName);
                  const initials = getInitials(artist.artistName);
                  return (
                    <motion.button
                      key={artist.artistId}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: idx * 0.05 }}
                      onClick={() => handleArtistClick(artist)}
                      // Wrapper is plain flex-col — NO rounded-full here (that caused the square-ring bug)
                      className="flex flex-col items-center space-y-2.5 flex-shrink-0 group cursor-pointer focus:outline-none"
                    >
                      {/* Ring lives on the w-20 circle itself, not the button wrapper */}
                      <div
                        className={`w-20 h-20 rounded-full bg-gradient-to-br ${gradient}
                          flex items-center justify-center shadow-md select-none
                          group-hover:scale-110 group-hover:shadow-xl transition-all duration-300
                          group-focus-visible:ring-2 group-focus-visible:ring-brand-500
                          group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-[var(--app-bg)]`}
                      >
                        <span className="text-xl font-black text-white/90 leading-none tracking-tight">
                          {initials}
                        </span>
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-brand-500 dark:group-hover:text-brand-400 transition-colors max-w-[84px] truncate">
                          {artist.artistName}
                        </p>
                        {artist.primaryGenreName && (
                          <p className="text-[10px] text-gray-500 mt-0.5">{artist.primaryGenreName}</p>
                        )}
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Albums Section ─────────────────────────────────── */}
        <AnimatePresence>
          {albums.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col space-y-4"
            >
              <h2 className="text-xl font-bold text-black dark:text-white mb-2 flex items-center space-x-2">
                <Disc3 className="w-5 h-5 text-brand-400" />
                <span>Albums</span>
              </h2>
              <div className="flex space-x-4 overflow-x-auto pb-3 no-scrollbar">
                {albums.map((album, idx) => {
                  const coverArt = getHighResArtwork(album.artworkUrl100);
                  const year = album.releaseDate ? album.releaseDate.slice(0, 4) : '';
                  return (
                    <motion.div
                      key={album.collectionId}
                      initial={{ opacity: 0, scale: 0.92 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: idx * 0.03, duration: 0.3 }}
                      onClick={() => setSelectedAlbum(album)}
                      className="w-40 flex-shrink-0 flex flex-col cursor-pointer group focus:outline-none"
                    >
                      <div className="relative w-40 h-40 rounded-xl overflow-hidden shadow-md border border-black/5 dark:border-white/5 group-hover:scale-[1.02] transition-all duration-300">
                        <img
                          src={coverArt}
                          alt={album.collectionName}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                          <div className="w-10 h-10 bg-brand-500 rounded-full flex items-center justify-center shadow-xl">
                            <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 px-0.5 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate group-hover:text-brand-500 dark:group-hover:text-brand-400 transition-colors">
                          {album.collectionName}
                        </p>
                        <p className="text-xs text-gray-500 truncate mt-0.5">
                          {album.artistName}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {year}
                        </p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Songs Section ────────────────────────────────────── */}
        {results.length > 0 ? (
          <div>
            <h2 className="text-xl font-bold text-black dark:text-white mb-6 flex items-center space-x-2">
              <Music2 className="w-5 h-5 text-brand-400" />
              <span>Songs</span>
              <span className="text-sm font-normal text-gray-500 ml-2">({results.length})</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {results.map((song, idx) => (
                <motion.div 
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04, duration: 0.3 }}
                  key={song.id}
                  onClick={() => onPlaySong(song, [song], 'search')}
                  className="group flex items-center space-x-4 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-transparent hover:border-black/10 dark:border-white/10 p-3 rounded-xl cursor-pointer transition-all duration-300"
                >
                  <div className="relative w-16 h-16 flex-shrink-0">
                    <img src={song.coverArt} alt={song.title} className="w-full h-full object-cover rounded-lg shadow-md" />
                    <div className="absolute inset-0 bg-white/40 dark:bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
                      <Play className="text-black dark:text-white w-6 h-6 fill-black dark:fill-white" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-black dark:text-white font-semibold truncate group-hover:text-brand-400 transition-colors">{song.title}</h4>
                    <p className="text-gray-600 dark:text-gray-400 text-sm truncate">{song.artist}</p>
                    <div className="flex items-center space-x-2 mt-0.5">
                      <p className="text-gray-500 text-xs truncate">{song.album}</p>
                      {song.genre && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/5 text-gray-500 border border-black/5 dark:border-white/5">{song.genre}</span>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        ) : (
          query.length > 2 && !loading && artists.length === 0 && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center h-64 text-gray-600 dark:text-gray-400"
            >
              <SearchIcon className="w-12 h-12 mb-4 opacity-50" />
              <p>No results found for "{query}"</p>
            </motion.div>
          )
        )}
      </div>
    </motion.div>
  );
}
