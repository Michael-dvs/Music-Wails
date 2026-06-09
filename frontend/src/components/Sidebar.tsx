import { useState, useEffect, useCallback } from 'react';
import {
  Home, Search, Heart, Clock, TrendingUp, ListMusic, Plus, ChevronDown, Library
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import UserBadge from './UserBadge';
import appIcon from '../assets/appicon.png';
import { getPlaylists } from '../lib/supabaseOps';
import type { Playlist } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useTranslation } from 'react-i18next';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onAddPlaylist: () => void;
}

// ── Shared Nav Button ────────────────────────────────────────────
function NavItem({
  id,
  icon: Icon,
  label,
  activeTab,
  setActiveTab,
  indent = false,
  coverUrl,
}: {
  id: string;
  icon: React.ElementType;
  label: string;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  indent?: boolean;
  coverUrl?: string;
}) {
  const isActive = activeTab === id;
  const paddingClass = indent ? 'pl-[36px] pr-3 py-2' : 'px-3 py-2';

  return (
    <button
      id={`sidebar-nav-${id.replace(':', '-')}`}
      onClick={() => setActiveTab(id)}
      className={`w-full flex items-center gap-4 rounded-md transition-colors text-sm font-medium ${paddingClass} ${
        isActive
          ? 'bg-brand-500/10 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400'
          : 'text-zinc-400 hover:text-zinc-100'
      }`}
      title={label}
    >
      {coverUrl ? (
        <img
          src={coverUrl}
          alt=""
          className="w-5 h-5 rounded-sm object-cover flex-shrink-0"
        />
      ) : (
        <Icon
          className={`flex-shrink-0 w-5 h-5 ${
            isActive ? 'text-brand-600 dark:text-brand-400' : 'text-zinc-400'
          }`}
        />
      )}
      <span className="truncate flex-1 text-left">{label}</span>
      {isActive && (
        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-500 flex-shrink-0" />
      )}
    </button>
  );
}

// ── Section Label ────────────────────────────────────────────────
function SectionLabel({ children, icon: Icon }: { children: React.ReactNode, icon?: React.ElementType }) {
  return (
    <div className="flex items-center gap-2 text-xs font-semibold tracking-widest text-zinc-500 uppercase mb-2 px-3">
      {Icon && <Icon className="w-4 h-4 flex-shrink-0" />}
      <span>{children}</span>
    </div>
  );
}

// ── Main Sidebar ─────────────────────────────────────────────────
export default function Sidebar({ activeTab, setActiveTab, onAddPlaylist }: SidebarProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [playlistsOpen, setPlaylistsOpen] = useState(true);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(true);

  const fetchPlaylists = useCallback(async () => {
    if (!user) {
      setPlaylists([]);
      setIsLoadingPlaylists(false);
      return;
    }
    try {
      const data = await getPlaylists();
      setPlaylists(data);
    } catch (err) {
      console.error('[Sidebar] Failed to fetch playlists', err);
    } finally {
      setIsLoadingPlaylists(false);
    }
  }, [user]);

  useEffect(() => {
    fetchPlaylists();

    const handleUpdate = () => {
      console.log('[Sidebar] playlistUpdated event received, re-fetching playlists...');
      fetchPlaylists();
    };
    window.addEventListener('playlistUpdated', handleUpdate);

    if (!user) {
      return () => {
        window.removeEventListener('playlistUpdated', handleUpdate);
      };
    }
    
    // Subscribe to realtime updates for playlists
    const channel = supabase
      .channel('public:playlists')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'playlists', filter: `user_id=eq.${user.id}` },
        () => {
          fetchPlaylists();
        }
      )
      .subscribe();

    return () => {
      window.removeEventListener('playlistUpdated', handleUpdate);
      supabase.removeChannel(channel);
    };
  }, [fetchPlaylists, user]);

  return (
    <div className="w-full h-full flex flex-col p-4 pb-4 z-10 bg-[#F9F9F9]/90 dark:bg-[#1a1a1a]/90 backdrop-blur-lg border-r border-gray-200 dark:border-white/5 overflow-hidden">

      {/* ── Logo ─────────────────────────────────────────────── */}
      <div className="flex items-center space-x-3 mb-6 px-1 flex-shrink-0">
        <div className="w-9 h-9 rounded-lg overflow-hidden flex items-center justify-center shadow-lg shadow-brand-500/30 flex-shrink-0">
          <motion.img
            src={appIcon}
            alt="Music-Wails"
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
        <h1 className="text-[14px] font-semibold tracking-tight text-gray-900 dark:text-white truncate">
          Music-Wails
        </h1>
      </div>

      {/* ── Navigation ───────────────────────────────────────── */}
      <nav className="flex-1 flex flex-col min-h-0 space-y-4 overflow-hidden">

        {/* ── Menu Section (Home + Search) ─────────────────── */}
        <div className="flex-shrink-0">
          <SectionLabel>{t('sidebar.menu')}</SectionLabel>
          <div className="space-y-0.5">
            <NavItem id="home"   icon={Home}   label={t('sidebar.home')}   activeTab={activeTab} setActiveTab={setActiveTab} />
            <NavItem id="search" icon={Search} label={t('sidebar.search')} activeTab={activeTab} setActiveTab={setActiveTab} />
          </div>
        </div>

        {/* ── Library Section ──────────────────────────────── */}
        <div className="flex-shrink-0">
          <SectionLabel icon={Library}>{t('sidebar.library')}</SectionLabel>
          <div className="space-y-0.5">
            <NavItem id="liked"           icon={Heart}      label={t('sidebar.likedSongs')}      activeTab={activeTab} setActiveTab={setActiveTab} indent />
            <NavItem id="recently-played" icon={Clock}      label={t('sidebar.recentlyPlayed')}  activeTab={activeTab} setActiveTab={setActiveTab} indent />
            <NavItem id="top-tracks"      icon={TrendingUp} label={t('sidebar.topTracks')}       activeTab={activeTab} setActiveTab={setActiveTab} indent />
          </div>
        </div>

        {/* ── Playlists Section ────────────────────────────── */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Standard header for Playlists */}
          <div className="flex items-center gap-2 text-xs font-semibold tracking-widest text-zinc-500 uppercase mb-2 px-3 w-full flex-shrink-0">
            <div className="flex items-center gap-2">
              <ListMusic className="w-4 h-4 flex-shrink-0" />
              <span>{t('sidebar.playlists')}</span>
            </div>
            
            <div className="ml-auto flex items-center gap-2">
              <button
                id="sidebar-playlists-toggle"
                onClick={() => setPlaylistsOpen(prev => !prev)}
                className="w-5 h-5 flex items-center justify-center rounded-md text-zinc-500 hover:text-zinc-100 hover:bg-white/10 transition-colors"
              >
                <motion.div
                  animate={{ rotate: playlistsOpen ? 0 : -90 }}
                  transition={{ duration: 0.2, ease: 'easeInOut' }}
                >
                  <ChevronDown className="w-4 h-4" />
                </motion.div>
              </button>
              <button
                id="sidebar-add-playlist"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddPlaylist();
                }}
                title={t('sidebar.addPlaylist') || 'Add Playlist'}
                className="w-5 h-5 flex items-center justify-center rounded-md text-zinc-500 hover:text-zinc-100 hover:bg-white/10 transition-all duration-150"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Collapsible playlist items */}
          <AnimatePresence initial={false}>
            {playlistsOpen && (
              <motion.div
                key="playlist-items"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                className="flex-1 flex flex-col min-h-0 overflow-hidden"
              >
                <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent pr-2 space-y-0.5 pb-1">
                  {!user ? (
                    <p className="pl-[36px] pr-3 py-1.5 text-[11px] text-zinc-500 italic">
                      {t('sidebar.loginToCreate')}
                    </p>
                  ) : isLoadingPlaylists ? (
                    <p className="pl-[36px] pr-3 py-1.5 text-[11px] text-zinc-500 italic animate-pulse">
                      {t('sidebar.loading')}
                    </p>
                  ) : playlists.length === 0 ? (
                    <p className="pl-[36px] pr-3 py-1.5 text-[11px] text-zinc-500 italic">
                      {t('sidebar.noPlaylists')}
                    </p>
                  ) : (
                    playlists.map(playlist => (
                      <NavItem
                        key={playlist.id}
                        id={`playlist:${playlist.id}`}
                        icon={ListMusic}
                        label={playlist.name}
                        activeTab={activeTab}
                        setActiveTab={setActiveTab}
                        indent
                        coverUrl={playlist.cover_url || undefined}
                      />
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </nav>

      {/* ── User Badge — bottom of sidebar ───────────────────── */}
      <div className="flex-shrink-0 mt-auto pt-4 border-t border-gray-200 dark:border-white/5">
        <UserBadge setActiveTab={setActiveTab} />
      </div>
    </div>
  );
}