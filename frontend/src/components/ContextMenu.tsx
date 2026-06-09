/**
 * ContextMenu.tsx — Global right-click context menu for track rows
 *
 * Architecture:
 * - Rendered via React Portal to `document.body` so z-index is never clipped
 * - Positioned at mouse (x, y) from onContextMenu event
 * - Receives `songData` from the parent that triggered the menu
 * - Closes on click-outside, scroll, or Escape key
 */

import React, { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Heart, ListPlus, ListEnd, ChevronRight, Loader2, Check } from 'lucide-react';
import { toggleFavorite, addTrackToPlaylist, getPlaylists } from '../lib/supabaseOps';
import { useAuth } from '../contexts/AuthContext';
import type { Playlist } from '../lib/supabase';

// ── Song data shape expected by context menu ────────────────────
export interface ContextMenuSongData {
  id: string;
  title: string;
  artist: string;
  album?: string;
  coverArt?: string;
  previewUrl?: string;
}

// ── Context Menu State (passed from parent via custom event or props) ──
export interface ContextMenuState {
  x: number;
  y: number;
  song: ContextMenuSongData;
}

interface ContextMenuProps {
  state: ContextMenuState | null;
  onClose: () => void;
  onPlayNext: (song: ContextMenuSongData) => void;
  onAddQueue?: (song: ContextMenuSongData) => void;
}

// ── Sub-menu: Playlist Picker ────────────────────────────────────
function PlaylistSubMenu({
  playlists,
  isLoading,
  onSelect,
  addStatus,
}: {
  playlists: Playlist[];
  isLoading: boolean;
  onSelect: (playlistId: string, playlistName: string) => void;
  addStatus: Record<string, 'idle' | 'loading' | 'done'>;
}) {
  return (
    <div className="min-w-[180px] max-w-[220px] rounded-xl shadow-2xl shadow-black/50 border border-white/10 bg-[#1e1e1e] py-1.5 overflow-hidden">
      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
        </div>
      ) : playlists.length === 0 ? (
        <p className="px-4 py-3 text-xs text-zinc-500 italic">No playlists yet</p>
      ) : (
        <div
          className="max-h-48 overflow-y-auto space-y-0.5 px-1"
          onWheel={(e) => e.stopPropagation()}
          onScroll={(e) => e.stopPropagation()}
        >
          {playlists.map((pl) => {
            const status = addStatus[pl.id] || 'idle';
            return (
              <button
                key={pl.id}
                onClick={(e) => { e.stopPropagation(); onSelect(pl.id, pl.name); }}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-zinc-200 hover:bg-white/10 hover:text-white transition-colors text-left"
                disabled={status === 'loading'}
              >
                {status === 'loading' ? (
                  <Loader2 className="w-5 h-5 animate-spin text-zinc-400 flex-shrink-0" />
                ) : status === 'done' ? (
                  <Check className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                ) : pl.cover_url ? (
                  <img src={pl.cover_url} alt="" className="w-5 h-5 rounded-sm object-cover flex-shrink-0" />
                ) : (
                  <span className="w-5 h-5 rounded-sm bg-white/10 flex-shrink-0" />
                )}
                <span className="truncate">{pl.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main Context Menu Component ──────────────────────────────────
const ContextMenu = forwardRef<HTMLDivElement, ContextMenuProps>(({ state, onClose, onPlayNext, onAddQueue }, ref) => {
  const { user, isFavorited, refreshFavorites } = useAuth();
  const menuRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => menuRef.current!);

  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playlistsLoading, setPlaylistsLoading] = useState(false);

  // Status feedback states
  const [likeStatus, setLikeStatus] = useState<'idle' | 'loading' | 'done'>('idle');
  const [addStatus, setAddStatus] = useState<Record<string, 'idle' | 'loading' | 'done'>>({});

  // ── Reposition to stay within viewport ────────────────────────
  const [adjustedPos, setAdjustedPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!state) {
      setAdjustedPos(null);
      return;
    }
    if (!menuRef.current) return;
    const el = menuRef.current;
    const rect = el.getBoundingClientRect();
    const menuWidth = rect.width || 200;
    const menuHeight = rect.height || 180;

    let { x, y } = state;
    // Flip horizontally if it overflows the right edge
    if (x + menuWidth > window.innerWidth) {
      x = x - menuWidth;
      if (x < 8) x = 8;
    }
    // Flip vertically if it overflows the bottom edge
    if (y + menuHeight > window.innerHeight) {
      y = y - menuHeight;
      if (y < 8) y = 8;
    }
    setAdjustedPos({ x, y });
  }, [state]);

  // ── Close on click-outside, Escape, scroll ─────────────────────
  useEffect(() => {
    if (!state) return;

    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onScroll = (e: Event) => {
      if (menuRef.current && menuRef.current.contains(e.target as Node)) {
        return;
      }
      onClose();
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('scroll', onScroll, true);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [state, onClose]);

  // ── Reset status feedback on new menu open ────────────────────
  useEffect(() => {
    if (state) {
      setLikeStatus('idle');
      setAddStatus({});
      setShowPlaylistMenu(false);
      setAdjustedPos(null);
    }
  }, [state?.song?.id]);

  // ── Fetch playlists when hovering "Add to Playlist" ───────────
  const handleShowPlaylistMenu = useCallback(async () => {
    if (showPlaylistMenu) return;
    setShowPlaylistMenu(true);
    setPlaylistsLoading(true);
    try {
      const data = await getPlaylists();
      setPlaylists(data);
    } finally {
      setPlaylistsLoading(false);
    }
  }, [showPlaylistMenu]);

  // ── Actions ───────────────────────────────────────────────────
  const handlePlayNext = () => {
    if (state?.song) onPlayNext(state.song);
    onClose();
  };

  const handleAddQueue = () => {
    if (state?.song && onAddQueue) onAddQueue(state.song);
    onClose();
  };

  const handleToggleLike = async () => {
    if (!state?.song || !user || likeStatus !== 'idle') return;
    setLikeStatus('loading');
    try {
      await toggleFavorite({
        userId: user.id,
        trackId: state.song.id,
        title: state.song.title,
        artist: state.song.artist,
        album: state.song.album,
        artworkUrl: state.song.coverArt,
        previewUrl: state.song.previewUrl,
      });
      await refreshFavorites();
      setLikeStatus('done');
      setTimeout(onClose, 600);
    } catch (err) {
      console.error('[ContextMenu] toggleFavorite failed:', err);
      setLikeStatus('idle');
    }
  };

  const handleAddToPlaylist = async (playlistId: string, playlistName: string) => {
    if (!state?.song || addStatus[playlistId] === 'loading') return;
    setAddStatus(prev => ({ ...prev, [playlistId]: 'loading' }));
    try {
      await addTrackToPlaylist({
        playlistId,
        trackId: state.song.id,
        title: state.song.title,
        artist: state.song.artist,
        album: state.song.album,
        coverUrl: state.song.coverArt,
      });
      setAddStatus(prev => ({ ...prev, [playlistId]: 'done' }));
      setTimeout(() => {
        setShowPlaylistMenu(false);
        onClose();
      }, 500);
    } catch (err: any) {
      console.error('[ContextMenu] addTrackToPlaylist failed:', err);
      setAddStatus(prev => ({ ...prev, [playlistId]: 'idle' }));
    }
  };

  // ── Favorite state ────────────────────────────────────────────
  const alreadyFavorited = state ? isFavorited(state.song.id) : false;

  if (!state) return null;

  const menuPos = adjustedPos || {
    x: state.x + 200 > window.innerWidth ? Math.max(8, state.x - 200) : state.x,
    y: state.y + 250 > window.innerHeight ? Math.max(8, state.y - 250) : state.y,
  };
  const openLeft = menuPos.x + 200 + 200 > window.innerWidth;
  const openUpward = menuPos.y > window.innerHeight / 2;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="context-menu"
        ref={menuRef}
        initial={{ opacity: 0, scale: 0.94, y: -6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: -6 }}
        transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
        style={{
          position: 'fixed',
          left: menuPos.x,
          top: menuPos.y,
          zIndex: 9999,
          minWidth: 200,
        }}
        className="fixed z-[9999] rounded-xl shadow-2xl shadow-black/60 border border-white/10 bg-[#1e1e1e] py-1.5 overflow-visible select-none"
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Song info header */}
        <div className="px-4 py-2.5 border-b border-white/8 mb-1">
          <p className="text-[13px] font-semibold text-white truncate max-w-[180px]">{state.song.title}</p>
          <p className="text-[11px] text-zinc-400 truncate max-w-[180px]">{state.song.artist}</p>
        </div>

        {/* Menu items */}
        <div className="py-0.5 space-y-0.5 px-1">
          {/* Play Next */}
          <MenuButton
            icon={<Play className="w-4 h-4" />}
            label="Play Next"
            onClick={handlePlayNext}
          />

          {/* Add to Queue */}
          {onAddQueue && (
            <MenuButton
              icon={<ListEnd className="w-4 h-4" />}
              label="Add to Queue"
              onClick={handleAddQueue}
            />
          )}

          {/* Save to Liked Songs */}
          <MenuButton
            icon={
              likeStatus === 'loading' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : likeStatus === 'done' || alreadyFavorited ? (
                <Heart className="w-4 h-4 fill-rose-500 text-rose-500" />
              ) : (
                <Heart className="w-4 h-4" />
              )
            }
            label={alreadyFavorited ? 'Remove from Liked' : 'Save to Liked Songs'}
            onClick={handleToggleLike}
            disabled={likeStatus === 'loading'}
            accent={alreadyFavorited}
          />

          {/* Add to Playlist */}
          <div
            className="relative"
            onMouseEnter={handleShowPlaylistMenu}
            onMouseLeave={() => setShowPlaylistMenu(false)}
          >
            <MenuButton
              icon={<ListPlus className="w-4 h-4" />}
              label="Add to Playlist"
              suffix={<ChevronRight className="w-3.5 h-3.5 text-zinc-500" />}
              onClick={() => handleShowPlaylistMenu()}
            />
            <AnimatePresence>
              {showPlaylistMenu && (
                <motion.div
                  initial={{ opacity: 0, x: openLeft ? 6 : -6, scale: 0.97 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: openLeft ? 6 : -6, scale: 0.97 }}
                  transition={{ duration: 0.12, ease: 'easeOut' }}
                  className={`absolute ${openLeft ? 'right-full pr-1.5' : 'left-full pl-1.5'} ${
                    openUpward ? 'bottom-0' : 'top-0'
                  } z-[10001]`}
                >
                  <PlaylistSubMenu
                    playlists={playlists}
                    isLoading={playlistsLoading}
                    onSelect={handleAddToPlaylist}
                    addStatus={addStatus}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
});

ContextMenu.displayName = 'ContextMenu';

export default ContextMenu;

// ── Reusable menu button ─────────────────────────────────────────
function MenuButton({
  icon,
  label,
  onClick,
  disabled,
  accent,
  suffix,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  accent?: boolean;
  suffix?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors duration-100
        ${disabled ? 'opacity-50 cursor-default' : 'cursor-pointer hover:bg-white/10'}
        ${accent ? 'text-rose-400' : 'text-zinc-200 hover:text-white'}
      `}
    >
      <span className="flex-shrink-0">{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {suffix && <span className="flex-shrink-0">{suffix}</span>}
    </button>
  );
}
