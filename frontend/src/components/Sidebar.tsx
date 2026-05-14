import { Home, Search, Library, ListMusic } from 'lucide-react';

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
    <div className="w-60 h-full flex flex-col p-5 z-10 glass">
      {/* Logo */}
      <div className="flex items-center space-x-3 mb-8 px-1">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-brand-500 shadow-lg shadow-brand-500/30">
          <ListMusic className="text-black dark:text-white w-4 h-4" />
        </div>
        <h1 className="text-[15px] font-semibold tracking-tight text-black dark:text-white">Music-Wails</h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5">
        <p className="text-[10px] font-semibold text-[var(--app-text-secondary)] uppercase tracking-widest mb-3 px-3">
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
                  ? 'bg-brand-500/15 text-brand-400'
                  : 'text-[var(--app-text-secondary)] hover:bg-black/5 dark:hover:bg-white/5 hover:text-brand-500 dark:hover:text-brand-400'
              }`}
            >
              <Icon
                className={`w-4 h-4 flex-shrink-0 ${
                  isActive ? 'text-brand-500' : 'text-[var(--app-text-secondary)]'
                }`}
              />
              <span>{item.label}</span>
              {/* Active indicator dot */}
              {isActive && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-500" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="pt-4 border-t border-[var(--app-divider)]">
        <p className="text-[10px] text-[var(--app-text-secondary)] text-center leading-relaxed">
          Music-Wails v1.0
          <br />
          <span className="opacity-60">Powered by Wails + React</span>
        </p>
      </div>
    </div>
  );
}
