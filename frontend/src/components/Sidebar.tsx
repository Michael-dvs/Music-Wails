import { Home, Search, Library, ListMusic } from 'lucide-react';
import UserBadge from './UserBadge';
import appIcon from '../assets/appicon.png';
import { motion } from 'framer-motion';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export default function Sidebar({ activeTab, setActiveTab }: SidebarProps) {
  const menuItems = [
    { id: 'home',      icon: Home,      label: 'Home' },
    { id: 'search',    icon: Search,    label: 'Search' },
    { id: 'library',   icon: Library,   label: 'Library' },
    { id: 'playlists', icon: ListMusic, label: 'Playlists' },
  ];

  return (
    /* BACKGROUND ADAPTIF: Abu-abu super muda di Light Mode, Hitam/Abu-tua di Dark Mode */
    <div className="w-full h-full flex flex-col p-5 pb-5 z-10 bg-[#F9F9F9]/90 dark:bg-[#1a1a1a]/90 backdrop-blur-lg border-r border-gray-200 dark:border-white/5">
      
      {/* Logo */}
      <div className="flex items-center space-x-3 mb-8 px-1">
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

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden">
        {/* TEKS HEADER MENU: Menggunakan gray-400 untuk Light Mode agar terlihat rapi */}
        <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3 px-3">
          Menu
        </p>
        
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-all duration-200 text-[13px] font-medium ${
                isActive
                  ? 'bg-brand-500/10 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200/60 hover:text-gray-900 dark:hover:bg-white/5 dark:hover:text-white'
              }`}
              title={item.label}
            >
              <Icon
                className={`w-4 h-4 flex-shrink-0 ${
                  isActive ? 'text-brand-600 dark:text-brand-400' : 'text-gray-500 dark:text-gray-400'
                }`}
              />
              <span className="truncate">{item.label}</span>
              {isActive && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-500" />
              )}
            </button>
          );
        })}
      </nav>

      {/* User Badge — bottom of sidebar */}
      {/* DIVIDER: Garis yang adaptif, abu-abu lembut di Light Mode */}
      <div className="mt-auto pt-4 border-t border-gray-200 dark:border-white/5">
        <UserBadge setActiveTab={setActiveTab} />
      </div>
    </div>
  );
}