import { Home, Search, Library, ListMusic, Music2 } from 'lucide-react';
import UserBadge from './UserBadge';
import appIcon from '../assets/appicon.png';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  selectedPlaylistId?: string | null;
  onSelectPlaylist?: (playlistId: string) => void;
}

export default function Sidebar({
  activeTab,
  setActiveTab,
  selectedPlaylistId,
  onSelectPlaylist,
}: SidebarProps) {
  // Deteksi platform macOS agar layout window control (traffic lights) tidak bertabrakan dengan logo
  const isMac = typeof navigator !== 'undefined' && (/Mac/i.test(navigator.userAgent) || /Mac/i.test(navigator.platform));
  const { user, playlists } = useAuth();

  const menuItems = [
    { id: 'home',      icon: Home,      label: 'Home' },
    { id: 'search',    icon: Search,    label: 'Search' },
    { id: 'library',   icon: Library,   label: 'Library' },
    { id: 'playlists', icon: ListMusic, label: 'Playlists' },
  ];

  const hasPlaylists = Boolean(user && playlists && playlists.length > 0);

  return (
    /* BACKGROUND ADAPTIF: Abu-abu super muda di Light Mode, Hitam/Abu-tua di Dark Mode */
    <div 
      className={`w-full h-full flex flex-col px-5 pb-5 z-10 bg-[#F9F9F9]/90 dark:bg-[#1a1a1a]/90 backdrop-blur-lg border-r border-gray-200 dark:border-white/5 relative ${
        isMac ? 'pt-12' : 'pt-5'
      }`}
    >
      {/* Area draggable di atas untuk mempermudah drag jendela di macOS */}
      {isMac && (
        <div 
          className="w-full h-9 absolute top-0 left-0 z-0 pointer-events-auto"
          style={{ '--wails-draggable': 'drag' } as React.CSSProperties}
        />
      )}
      
      {/* Logo */}
      <div 
        className="flex items-center space-x-3 mb-6 px-1 relative z-10 select-none flex-shrink-0"
        style={{ '--wails-draggable': 'no-drag' } as React.CSSProperties}
      >
        <div className="w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center shadow-lg shadow-brand-500/30 flex-shrink-0">
          <motion.img
            src={appIcon}
            alt="Music-Wails"
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1,    opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
        <h1 className="text-[15px] font-semibold tracking-tight text-gray-900 dark:text-white truncate">
          Music-Wails
        </h1>
      </div>

      {/* Main Navigation Menu (Fixed at top) */}
      <nav className="flex-shrink-0 space-y-0.5">
        <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2.5 px-3">
          Menu
        </p>
        
        {menuItems.map((item) => {
          const Icon = item.icon;
          // When a specific playlist in quick list is active, don't mark the main Playlists button as selected unless on overview
          const isOverviewActive = activeTab === item.id && (item.id !== 'playlists' || !selectedPlaylistId);
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-all duration-200 text-[13px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                isOverviewActive
                  ? 'bg-brand-500/10 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200/60 hover:text-gray-900 dark:hover:bg-white/5 dark:hover:text-white'
              }`}
              title={item.label}
              aria-label={item.label}
              aria-current={isOverviewActive ? 'page' : undefined}
            >
              <Icon
                className={`w-4 h-4 flex-shrink-0 ${
                  isOverviewActive ? 'text-brand-600 dark:text-brand-400' : 'text-gray-500 dark:text-gray-400'
                }`}
              />
              <span className="truncate">{item.label}</span>
              {isOverviewActive && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-500" />
              )}
            </button>
          );
        })}
      </nav>

      {/* User Playlist Quick List (Separated, Scrollable, visible when playlists exist) */}
      {hasPlaylists ? (
        <div className="flex-1 min-h-0 flex flex-col mt-4">
          <div className="flex items-center justify-between px-3 mb-2 select-none flex-shrink-0">
            <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
              Koleksi Playlist
            </span>
            <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 tabular-nums">
              {playlists.length}
            </span>
          </div>

          <div 
            tabIndex={0}
            role="region"
            aria-label="Daftar akses cepat playlist tersimpan"
            className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 space-y-0.5 px-0.5 no-scrollbar focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500 rounded-lg"
          >
            {playlists.map((pl) => {
              const isSelected = activeTab === 'playlists' && selectedPlaylistId === pl.id;

              return (
                <button
                  key={pl.id}
                  type="button"
                  onClick={() => {
                    if (onSelectPlaylist) {
                      onSelectPlaylist(pl.id);
                    } else {
                      setActiveTab('playlists');
                    }
                  }}
                  title={pl.name}
                  aria-label={`Buka playlist ${pl.name}`}
                  aria-current={isSelected ? 'page' : undefined}
                  className={`w-full group flex items-center space-x-2.5 px-3 py-2 rounded-lg text-left transition-all duration-150 text-[12px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                    isSelected
                      ? 'bg-brand-500/10 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400 font-semibold'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200/50 hover:text-gray-900 dark:hover:bg-white/5 dark:hover:text-white'
                  }`}
                >
                  {pl.cover_url ? (
                    <img
                      src={pl.cover_url}
                      alt=""
                      className="w-4 h-4 rounded object-cover flex-shrink-0"
                    />
                  ) : (
                    <Music2
                      className={`w-3.5 h-3.5 flex-shrink-0 ${
                        isSelected
                          ? 'text-brand-500'
                          : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300'
                      }`}
                    />
                  )}
                  <span className="truncate flex-1">{pl.name}</span>
                  {isSelected && (
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-500 flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex-1" />
      )}

      {/* User Badge — bottom of sidebar */}
      <div className="mt-auto pt-3 border-t border-gray-200 dark:border-white/5 flex-shrink-0">
        <UserBadge setActiveTab={setActiveTab} />
      </div>
    </div>
  );
}
