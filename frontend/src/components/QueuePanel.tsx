import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion';
import { X, Music, Play, ChevronUp, ChevronDown, Trash2, RefreshCw, GripVertical } from 'lucide-react';
import { main } from '../../wailsjs/go/models';

interface QueuePanelProps {
  isOpen: boolean;
  onClose: () => void;
  queue: main.SmartTrack[];
  currentSong: main.SmartTrack | null;
  onPlayTrack: (track: main.SmartTrack) => void;
  isSmartShuffleActive: boolean;
  onRemoveTrack?: (index: number) => void;
  onMoveUp?: (index: number) => void;
  onMoveDown?: (index: number) => void;
  onClearQueue?: () => void;
  onReorderQueue?: (newQueue: main.SmartTrack[]) => void;
  onRefreshAutoQueue?: () => void;
  isGeneratingQueue?: boolean;
}

interface QueueItemRowProps {
  track: main.SmartTrack;
  idx: number;
  isActive: boolean;
  totalLength: number;
  onPlayTrack: (track: main.SmartTrack) => void;
  onMoveUp?: (index: number) => void;
  onMoveDown?: (index: number) => void;
  onRemoveTrack?: (index: number) => void;
}

function QueueItemRow({
  track,
  idx,
  isActive,
  totalLength,
  onPlayTrack,
  onMoveUp,
  onMoveDown,
  onRemoveTrack,
}: QueueItemRowProps) {
  const dragControls = useDragControls();
  const stableKey = (track as any).queueId || (track as any).queueKey || track.id || `track-${idx}`;

  return (
    <Reorder.Item
      key={stableKey}
      value={track}
      dragListener={false}
      dragControls={dragControls}
      className={`group flex items-center space-x-1.5 px-2 py-2 rounded-xl transition-colors duration-150 select-none ${
        isActive
          ? 'bg-black/15 dark:bg-white/15 border border-black/20 dark:border-white/20'
          : 'hover:bg-black/5 dark:hover:bg-white/5 border border-transparent'
      }`}
    >
      {/* Drag Handle */}
      <div
        onPointerDown={(e) => {
          e.preventDefault();
          dragControls.start(e);
        }}
        className="cursor-grab active:cursor-grabbing p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors opacity-40 group-hover:opacity-100 flex-shrink-0 touch-none"
        title="Tarik untuk mengubah urutan"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </div>

      {/* Track info and play button */}
      <div
        role="button"
        tabIndex={0}
        aria-label={`Putar ${track.title} oleh ${track.artist}`}
        onClick={() => onPlayTrack(track)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onPlayTrack(track);
          }
        }}
        className="flex-1 min-w-0 flex items-center space-x-2.5 cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        {/* Cover Art */}
        <div className="relative w-9 h-9 rounded-lg overflow-hidden flex-shrink-0">
          {track.coverArt ? (
            <img src={track.coverArt} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-black/10 dark:bg-white/10 flex items-center justify-center">
              <Music className="w-4 h-4 text-black/40 dark:text-white/40" />
            </div>
          )}
          {isActive && (
            <div className="absolute inset-0 bg-white/40 dark:bg-black/40 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
            </div>
          )}
          {!isActive && (
            <div className="absolute inset-0 bg-white/40 dark:bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Play className="w-3 h-3 text-black dark:text-white fill-black dark:fill-white" />
            </div>
          )}
        </div>

        {/* Track Info */}
        <div className="flex-1 min-w-0 text-left">
          <p className={`text-xs sm:text-sm font-medium truncate ${isActive ? 'text-black dark:text-white font-semibold' : 'text-gray-800 dark:text-gray-200 group-hover:text-brand-500 dark:group-hover:text-brand-400'}`}>
            {track.title}
          </p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{track.artist}</p>
        </div>
      </div>

      {/* Actions: Reorder and Remove buttons for keyboard/click users */}
      <div className="flex items-center space-x-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        {onMoveUp && (
          <button
            type="button"
            disabled={idx === 0}
            onClick={(e) => { e.stopPropagation(); onMoveUp(idx); }}
            aria-label={`Pindahkan ${track.title} ke atas`}
            title="Pindah ke Atas"
            className="p-1 rounded text-gray-400 hover:text-black dark:hover:text-white disabled:opacity-20 disabled:hover:text-gray-400 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500"
          >
            <ChevronUp className="w-3 h-3" />
          </button>
        )}
        {onMoveDown && (
          <button
            type="button"
            disabled={idx === totalLength - 1}
            onClick={(e) => { e.stopPropagation(); onMoveDown(idx); }}
            aria-label={`Pindahkan ${track.title} ke bawah`}
            title="Pindah ke Bawah"
            className="p-1 rounded text-gray-400 hover:text-black dark:hover:text-white disabled:opacity-20 disabled:hover:text-gray-400 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500"
          >
            <ChevronDown className="w-3 h-3" />
          </button>
        )}
        {onRemoveTrack && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemoveTrack(idx); }}
            aria-label={`Hapus ${track.title} dari antrean`}
            title="Hapus dari antrean"
            className="p-1 rounded text-gray-400 hover:text-red-500 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
    </Reorder.Item>
  );
}

export default function QueuePanel({
  isOpen,
  onClose,
  queue,
  currentSong,
  onPlayTrack,
  isSmartShuffleActive,
  onRemoveTrack,
  onMoveUp,
  onMoveDown,
  onClearQueue,
  onReorderQueue,
  onRefreshAutoQueue,
  isGeneratingQueue = false,
}: QueuePanelProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          role="dialog"
          aria-label="Panel Antrean Pemutaran"
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="absolute right-0 top-0 bottom-0 w-80 sm:w-88 z-40 flex flex-col bg-white/70 dark:bg-black/70 backdrop-blur-2xl border-l border-black/10 dark:border-white/10 shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-black/10 dark:border-white/10">
            <div className="flex items-center space-x-2">
              <h2 className="text-black dark:text-white font-semibold text-base sm:text-lg">Up Next</h2>
              <span className="text-xs text-gray-500 dark:text-gray-400">({queue.length})</span>
            </div>
            <div className="flex items-center space-x-1">
              {/* Refresh Auto-Generated Queue (only refreshes recommendations, never resets current playback) */}
              {onRefreshAutoQueue && currentSong && (
                <button
                  type="button"
                  onClick={onRefreshAutoQueue}
                  disabled={isGeneratingQueue}
                  aria-label="Segarkan rekomendasi antrean"
                  title="Segarkan Rekomendasi Antrean"
                  className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-gray-500 hover:text-brand-500 dark:hover:text-brand-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isGeneratingQueue ? 'animate-spin text-brand-500' : ''}`} />
                </button>
              )}

              {queue.length > 1 && onClearQueue && (
                <button
                  type="button"
                  onClick={onClearQueue}
                  aria-label="Kosongkan sisa antrean"
                  title="Kosongkan Sisa Antrean"
                  className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                aria-label="Tutup panel antrean"
                title="Tutup Antrean"
                className="p-1.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 text-gray-600 dark:text-gray-400 hover:text-brand-500 dark:hover:text-brand-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Queue List with Seamless Drag-and-Drop Reordering */}
          {queue.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 space-y-2 p-4 text-center">
              <Music className="w-10 h-10 opacity-30" />
              <p className="text-sm font-medium">Antrean saat ini kosong</p>
              <p className="text-xs text-gray-400">Pilih lagu dari pencarian, album, atau perpustakaan untuk menambahkannya ke antrean.</p>
            </div>
          ) : onReorderQueue ? (
            <Reorder.Group
              axis="y"
              values={queue}
              onReorder={onReorderQueue}
              className="flex-1 overflow-y-auto py-2 space-y-1 px-2 no-scrollbar"
            >
              {queue.map((track, idx) => (
                <QueueItemRow
                  key={(track as any).queueId || (track as any).queueKey || track.id || `track-${idx}`}
                  track={track}
                  idx={idx}
                  isActive={currentSong?.id === track.id}
                  totalLength={queue.length}
                  onPlayTrack={onPlayTrack}
                  onMoveUp={onMoveUp}
                  onMoveDown={onMoveDown}
                  onRemoveTrack={onRemoveTrack}
                />
              ))}
            </Reorder.Group>
          ) : (
            <div className="flex-1 overflow-y-auto py-2 space-y-1 px-2 no-scrollbar">
              {queue.map((track, idx) => {
                const isActive = currentSong?.id === track.id;

                return (
                  <div
                    key={(track as any).queueId || (track as any).queueKey || track.id || `track-${idx}`}
                    className={`group flex items-center space-x-2.5 px-2.5 py-2 rounded-xl transition-all duration-200 ${
                      isActive
                        ? 'bg-black/15 dark:bg-white/15 border border-black/20 dark:border-white/20'
                        : 'hover:bg-black/5 dark:hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      aria-label={`Putar ${track.title} oleh ${track.artist}`}
                      onClick={() => onPlayTrack(track)}
                      className="flex-1 min-w-0 flex items-center space-x-2.5 cursor-pointer rounded-lg"
                    >
                      <div className="relative w-9 h-9 rounded-lg overflow-hidden flex-shrink-0">
                        {track.coverArt ? (
                          <img src={track.coverArt} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-black/10 dark:bg-white/10 flex items-center justify-center">
                            <Music className="w-4 h-4 text-black/40 dark:text-white/40" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <p className={`text-xs sm:text-sm font-medium truncate ${isActive ? 'text-black dark:text-white font-semibold' : 'text-gray-800 dark:text-gray-200 group-hover:text-brand-500 dark:group-hover:text-brand-400'}`}>
                          {track.title}
                        </p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{track.artist}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer hint */}
          {isSmartShuffleActive && (
            <div className="px-4 py-3 border-t border-black/10 dark:border-white/10">
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                Rekomendasi otomatis aktif berdasarkan riwayat putar
              </p>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
