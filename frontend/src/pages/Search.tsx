import { useState, useEffect, useRef, useCallback } from 'react';
import { Search as SearchIcon, Play, Loader2, X, Clock, Sparkles } from 'lucide-react';
import { main } from '../../wailsjs/go/models';
import { SearchSongs } from '../../wailsjs/go/main/App';
import { motion, AnimatePresence } from 'framer-motion';

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

export default function Search({ onPlaySong }: { onPlaySong: (song: main.Song, queue: main.Song[]) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<main.Song[]>([]);
  const [loading, setLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [history, setHistory] = useState<string[]>(getSearchHistory());
  const inputRef = useRef<HTMLInputElement>(null);

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

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.trim().length > 2) {
        setLoading(true);
        try {
          const songs = await SearchSongs(query);
          setResults(songs || []);
          // Save to history on successful search
          if (songs && songs.length > 0) {
            saveSearchHistory(query.trim());
            setHistory(getSearchHistory());
          }
        } catch (e) {
          console.error(e);
        } finally {
          setLoading(false);
        }
      } else if (query.trim().length === 0) {
        setResults([]);
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

  const showPlaceholder = !isFocused && query.length === 0;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="w-full h-full flex flex-col p-8 space-y-6 overflow-y-auto pb-32"
    >
      {/* Search Bar with Animated Placeholder */}
      <div className="relative max-w-2xl w-full">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-10">
          <SearchIcon className="text-gray-400 w-6 h-6" />
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
                  className="text-gray-400 text-base"
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
          className="w-full bg-white/10 border border-white/20 rounded-full py-4 pl-12 pr-12 text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 backdrop-blur-md shadow-lg transition-all"
        />
        
        {/* Clear / Loading indicator */}
        <div className="absolute inset-y-0 right-0 pr-4 flex items-center space-x-2">
          {query.length > 0 && !loading && (
            <button 
              onClick={() => { setQuery(''); setResults([]); }}
              className="p-1 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
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
                className="group flex items-center space-x-1.5 bg-white/8 hover:bg-white/15 backdrop-blur-md border border-white/10 hover:border-white/20 rounded-full px-3 py-1.5 cursor-pointer transition-all duration-200"
                onClick={() => handleHistoryClick(term)}
              >
                <span className="text-sm text-gray-300 group-hover:text-white transition-colors">{term}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleHistoryRemove(term);
                  }}
                  className="p-0.5 rounded-full opacity-0 group-hover:opacity-100 hover:bg-white/10 text-gray-400 hover:text-white transition-all"
                >
                  <X className="w-3 h-3" />
                </button>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results */}
      <div className="flex-1">
        {results.length > 0 ? (
          <div>
            <h2 className="text-xl font-bold text-white mb-6 flex items-center space-x-2">
              <Sparkles className="w-5 h-5 text-brand-400" />
              <span>Top Results</span>
              <span className="text-sm font-normal text-gray-500 ml-2">({results.length})</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {results.map((song, idx) => (
                <motion.div 
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04, duration: 0.3 }}
                  key={song.id}
                  onClick={() => onPlaySong(song, results)}
                  className="group flex items-center space-x-4 bg-white/5 hover:bg-white/10 border border-transparent hover:border-white/10 p-3 rounded-xl cursor-pointer transition-all duration-300"
                >
                  <div className="relative w-16 h-16 flex-shrink-0">
                    <img src={song.coverArt} alt={song.title} className="w-full h-full object-cover rounded-lg shadow-md" />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
                      <Play className="text-white w-6 h-6 fill-white" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-white font-semibold truncate group-hover:text-brand-400 transition-colors">{song.title}</h4>
                    <p className="text-gray-400 text-sm truncate">{song.artist}</p>
                    <div className="flex items-center space-x-2 mt-0.5">
                      <p className="text-gray-500 text-xs truncate">{song.album}</p>
                      {song.genre && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-gray-500 border border-white/5">{song.genre}</span>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        ) : (
          query.length > 2 && !loading && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center h-64 text-gray-400"
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
