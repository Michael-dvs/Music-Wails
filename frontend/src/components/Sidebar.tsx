import { Home, Search, Library, ListMusic } from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab }: { activeTab: string, setActiveTab: (tab: string) => void }) {
  const menuItems = [
    { id: 'home', icon: Home, label: 'Home' },
    { id: 'search', icon: Search, label: 'Search' },
    { id: 'library', icon: Library, label: 'Library' },
    { id: 'playlists', icon: ListMusic, label: 'Playlists' },
  ];

  return (
    <div className="w-64 h-full glass flex flex-col p-6 space-y-8 z-10">
      <div className="flex items-center space-x-3">
        <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center">
          <ListMusic className="text-white w-5 h-5" />
        </div>
        <h1 className="text-xl font-bold tracking-tight text-white">Music-Wails</h1>
      </div>

      <nav className="flex-1 space-y-2">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Menu</div>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center space-x-4 px-4 py-3 rounded-xl transition-all duration-300 ${
                isActive 
                  ? 'bg-brand-500/20 text-brand-400 shadow-[inset_0_0_12px_rgba(139,92,246,0.2)]' 
                  : 'text-gray-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'text-brand-400' : ''}`} />
              <span className="font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto">
        <div className="bg-white/5 rounded-xl p-4 border border-white/5">
          <p className="text-xs text-gray-400 text-center">
            Music-Wails v1.0<br/>
            Powered by Wails & React
          </p>
        </div>
      </div>
    </div>
  );
}
