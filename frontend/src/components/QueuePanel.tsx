import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Music, Play } from 'lucide-react';
import { main } from '../../wailsjs/go/models';

interface QueuePanelProps {
  isOpen: boolean;
  onClose: () => void;
  queue: main.SmartTrack[];
  currentSong: main.SmartTrack | null;
  onPlayTrack: (track: main.SmartTrack) => void;
  isSmartShuffleActive: boolean;
}

export default function QueuePanel({
  isOpen,
  onClose,
  queue,
  currentSong,
  onPlayTrack,
  isSmartShuffleActive,
}: QueuePanelProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="absolute right-0 top-0 bottom-0 w-80 z-40 flex flex-col bg-black/50 backdrop-blur-2xl border-l border-white/10 shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-white/10">
            <div className="flex items-center space-x-2">
              <h2 className="text-white font-semibold text-lg">Up Next</h2>
              {isSmartShuffleActive && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="flex items-center space-x-1 bg-purple-500/20 border border-purple-500/30 rounded-full px-2 py-0.5"
                >
                  <Sparkles className="w-3 h-3 text-purple-400" />
                  <span className="text-purple-300 text-xs font-medium">Smart</span>
                </motion.div>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Queue List */}
          <div className="flex-1 overflow-y-auto py-2 space-y-1 px-2">
            {queue.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-500 space-y-2">
                <Music className="w-10 h-10 opacity-30" />
                <p className="text-sm">Queue is empty</p>
              </div>
            ) : (
              queue.map((track, idx) => {
                const isActive = currentSong?.id === track.id;
                const isLastFM = track.source === 'lastfm';

                return (
                  <motion.div
                    key={`${track.id}-${idx}`}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    onClick={() => onPlayTrack(track)}
                    className={`group flex items-center space-x-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-200 ${
                      isActive
                        ? 'bg-white/15 border border-white/20'
                        : 'hover:bg-white/8 border border-transparent'
                    }`}
                  >
                    {/* Cover Art */}
                    <div className="relative w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">
                      {track.coverArt ? (
                        <img src={track.coverArt} alt={track.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-white/10 flex items-center justify-center">
                          <Music className="w-4 h-4 text-white/40" />
                        </div>
                      )}
                      {isActive && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                        </div>
                      )}
                      {!isActive && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <Play className="w-3 h-3 text-white fill-white" />
                        </div>
                      )}
                    </div>

                    {/* Track Info */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${isActive ? 'text-white' : 'text-gray-200 group-hover:text-white'}`}>
                        {track.title}
                      </p>
                      <p className="text-xs text-gray-400 truncate">{track.artist}</p>
                    </div>

                    {/* Source Badge */}
                    {isLastFM && (
                      <Sparkles className="w-3.5 h-3.5 text-purple-400 flex-shrink-0 opacity-70" />
                    )}
                  </motion.div>
                );
              })
            )}
          </div>

          {/* Footer hint */}
          {isSmartShuffleActive && (
            <div className="px-4 py-3 border-t border-white/10">
              <p className="text-xs text-gray-500 text-center">
                <Sparkles className="w-3 h-3 inline mr-1 text-purple-400" />
                Auto-generating based on your taste
              </p>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
