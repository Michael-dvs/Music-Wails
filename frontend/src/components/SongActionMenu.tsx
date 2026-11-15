import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MoreVertical, ListPlus, ListMusic, Heart, FolderPlus, Copy, Check } from 'lucide-react';
import { main } from '../../wailsjs/go/models';
import { useAuth } from '../contexts/AuthContext';

interface SongActionMenuProps {
  song: main.Song;
  onPlayNext?: (song: main.Song) => void;
  onAddToQueue?: (song: main.Song) => void;
  onOpenAddToPlaylist?: (song: main.Song) => void;
  align?: 'left' | 'right';
  className?: string;
  triggerClassName?: string;
}

export default function SongActionMenu({
  song,
  onPlayNext,
  onAddToQueue,
  onOpenAddToPlaylist,
  align = 'right',
  className = '',
  triggerClassName = '',
}: SongActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const { isFavorited, addFavorite, removeFavorite } = useAuth();
  const favorited = isFavorited ? isFavorited(String(song.id)) : false;

  const toggleOpen = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(prev => !prev);
  }, []);

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handlePlayNext = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    onPlayNext?.(song);
  }, [onPlayNext, song]);

  const handleAddToQueue = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    onAddToQueue?.(song);
  }, [onAddToQueue, song]);

  const handleToggleFavorite = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    const trackIdStr = String(song.id);
    if (favorited) {
      await removeFavorite(trackIdStr);
    } else {
      await addFavorite({
        itunes_track_id: trackIdStr,
        title: song.title,
        artist: song.artist,
        album: song.album || '',
        artwork_url: song.coverArt || '',
        preview_url: song.streamUrl || '',
      });
    }
  }, [favorited, removeFavorite, addFavorite, song]);

  const handleOpenAddToPlaylist = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    onOpenAddToPlaylist?.(song);
  }, [onOpenAddToPlaylist, song]);

  const handleCopyInfo = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(`${song.artist} - ${song.title}`);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
      setIsOpen(false);
    }, 600);
  }, [song]);

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleOpen}
        aria-label={`Menu aksi untuk ${song.title}`}
        aria-haspopup="true"
        aria-expanded={isOpen}
        title="Opsi lagu"
        className={`p-1.5 rounded-lg text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${triggerClassName}`}
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.12 }}
            role="menu"
            aria-label="Tindakan lagu"
            className={`absolute top-full mt-1 z-50 w-52 py-1.5 bg-white/95 dark:bg-[#202022]/95 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-xl shadow-xl text-xs text-gray-800 dark:text-gray-200 ${
              align === 'right' ? 'right-0 origin-top-right' : 'left-0 origin-top-left'
            }`}
          >
            {onPlayNext && (
              <button
                type="button"
                role="menuitem"
                onClick={handlePlayNext}
                className="w-full flex items-center space-x-2.5 px-3.5 py-2 text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:bg-black/5 dark:focus-visible:bg-white/5"
              >
                <ListPlus className="w-4 h-4 text-gray-400" />
                <span>Putar Berikutnya</span>
              </button>
            )}

            {onAddToQueue && (
              <button
                type="button"
                role="menuitem"
                onClick={handleAddToQueue}
                className="w-full flex items-center space-x-2.5 px-3.5 py-2 text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:bg-black/5 dark:focus-visible:bg-white/5"
              >
                <ListMusic className="w-4 h-4 text-gray-400" />
                <span>Tambahkan ke Antrean</span>
              </button>
            )}

            <button
              type="button"
              role="menuitem"
              onClick={handleToggleFavorite}
              className="w-full flex items-center space-x-2.5 px-3.5 py-2 text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:bg-black/5 dark:focus-visible:bg-white/5"
            >
              <Heart
                className={`w-4 h-4 ${
                  favorited ? 'text-brand-500 fill-brand-500' : 'text-gray-400'
                }`}
              />
              <span>{favorited ? 'Hapus dari Favorit' : 'Tambahkan ke Favorit'}</span>
            </button>

            {onOpenAddToPlaylist && (
              <button
                type="button"
                role="menuitem"
                onClick={handleOpenAddToPlaylist}
                className="w-full flex items-center space-x-2.5 px-3.5 py-2 text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:bg-black/5 dark:focus-visible:bg-white/5"
              >
                <FolderPlus className="w-4 h-4 text-gray-400" />
                <span>Tambahkan ke Playlist...</span>
              </button>
            )}

            <div className="my-1 border-t border-black/5 dark:border-white/5" />

            <button
              type="button"
              role="menuitem"
              onClick={handleCopyInfo}
              className="w-full flex items-center space-x-2.5 px-3.5 py-2 text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:bg-black/5 dark:focus-visible:bg-white/5"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-500" />
                  <span className="text-emerald-500 font-medium">Tersalin ke Clipboard</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-gray-400" />
                  <span>Salin Info Lagu</span>
                </>
              )}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
