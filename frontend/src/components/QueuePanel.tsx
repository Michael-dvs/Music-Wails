import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Music, Play, GripVertical } from 'lucide-react';
import { main } from '../../wailsjs/go/models';
import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface QueuePanelProps {
  isOpen: boolean;
  onClose: () => void;
  queue: main.SmartTrack[];
  currentSong: main.SmartTrack | null;
  onPlayTrack: (track: main.SmartTrack) => void;
  isSmartShuffleActive: boolean;
  onReorderQueue?: (newOrder: main.SmartTrack[]) => void;
  onRemoveTrack?: (index: number) => void;
}

interface TrackRowProps {
  track: main.SmartTrack;
  isActive: boolean;
  isLastFM: boolean;
  onPlayTrack?: (track: main.SmartTrack) => void;
  dragHandleProps?: any;
  isOverlay?: boolean;
  index?: number;
  onRemoveTrack?: (index: number) => void;
}

function TrackRow({
  track,
  isActive,
  isLastFM,
  onPlayTrack,
  dragHandleProps,
  isOverlay = false,
  index,
  onRemoveTrack,
}: TrackRowProps) {
  return (
    <div
      onClick={() => onPlayTrack && onPlayTrack(track)}
      className={`group flex items-center space-x-2 px-2 py-2.5 rounded-xl transition-all duration-200 ${
        isOverlay
          ? 'bg-white/90 dark:bg-zinc-900/90 border border-black/10 dark:border-white/10 cursor-grabbing shadow-2xl backdrop-blur-md'
          : isActive
            ? 'bg-black/15 dark:bg-white/15 border border-black/20 dark:border-white/20 cursor-pointer'
            : 'hover:bg-black/8 dark:hover:bg-white/8 border border-transparent cursor-pointer'
      }`}
    >
      {/* Drag Handle */}
      <div
        {...dragHandleProps}
        onClick={(e) => e.stopPropagation()} // Prevent playing when clicking handle
        className={`flex-shrink-0 p-1 rounded-md transition-opacity cursor-grab active:cursor-grabbing ${
          isOverlay
            ? 'opacity-100 text-brand-500'
            : 'opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-black/10 dark:hover:bg-white/10'
        }`}
      >
        <GripVertical className="w-4 h-4" />
      </div>

      {/* Cover Art */}
      <div className="relative w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">
        {track.coverArt ? (
          <img src={track.coverArt} alt={track.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-black/10 dark:bg-white/10 flex items-center justify-center">
            <Music className="w-4 h-4 text-black/40 dark:text-white/40" />
          </div>
        )}
        {isActive && (
          <div className="absolute inset-0 bg-white/40 dark:bg-black/40 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
          </div>
        )}
        {!isActive && (
          <div className="absolute inset-0 bg-white/40 dark:bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <Play className="w-3 h-3 text-black dark:text-white fill-black dark:fill-white" />
          </div>
        )}
      </div>

      {/* Track Info */}
      <div className="flex-1 min-w-0 pl-1">
        <p className={`text-sm font-medium truncate ${isActive ? 'text-black dark:text-white' : 'text-gray-800 dark:text-gray-200 group-hover:text-brand-500 dark:hover:text-brand-400'}`}>
          {track.title}
        </p>
        <p className="text-xs text-gray-600 dark:text-gray-400 truncate">{track.artist}</p>
      </div>

      {/* Source Badge */}
      {isLastFM && (
        <Sparkles className="w-3.5 h-3.5 text-purple-400 flex-shrink-0 opacity-70" />
      )}

      {/* Remove Button */}
      {!isOverlay && onRemoveTrack && index !== undefined && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onRemoveTrack(index);
          }}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400 hover:text-red-500 cursor-pointer p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

interface SortableTrackItemProps {
  track: main.SmartTrack;
  index: number;
  isActive: boolean;
  isLastFM: boolean;
  onPlayTrack: (track: main.SmartTrack) => void;
  onRemoveTrack?: (index: number) => void;
}

function SortableTrackItem({
  track,
  index,
  isActive,
  isLastFM,
  onPlayTrack,
  onRemoveTrack,
}: SortableTrackItemProps) {
  const id = `${track.id}-${index}`;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={`transition-all duration-200 ${
        isDragging
          ? 'opacity-30 border border-dashed border-zinc-600 bg-transparent rounded-xl'
          : ''
      }`}
    >
      <TrackRow
        track={track}
        index={index}
        isActive={isActive}
        isLastFM={isLastFM}
        onPlayTrack={onPlayTrack}
        onRemoveTrack={onRemoveTrack}
        dragHandleProps={listeners}
      />
    </div>
  );
}

export default function QueuePanel({
  isOpen,
  onClose,
  queue,
  currentSong,
  onPlayTrack,
  isSmartShuffleActive,
  onReorderQueue,
  onRemoveTrack,
}: QueuePanelProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;
    if (!onReorderQueue) return;

    const oldIndex = queue.findIndex((track, idx) => `${track.id}-${idx}` === active.id);
    const newIndex = queue.findIndex((track, idx) => `${track.id}-${idx}` === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      const newQueue = arrayMove(queue, oldIndex, newIndex);
      onReorderQueue(newQueue);
    }
  };

  const handleDragCancel = () => {
    setActiveId(null);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="absolute right-0 top-0 bottom-0 w-80 z-40 flex flex-col bg-white/50 dark:bg-black/50 backdrop-blur-2xl border-l border-black/10 dark:border-white/10 shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-black/10 dark:border-white/10">
            <div className="flex items-center space-x-2">
              <h2 className="text-black dark:text-white font-semibold text-lg">Up Next</h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 text-gray-600 dark:text-gray-400 hover:text-brand-500 dark:hover:text-brand-400 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Queue List */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={(event) => setActiveId(event.active.id as string)}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <SortableContext
              items={queue.map((track, idx) => `${track.id}-${idx}`)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex-1 overflow-y-auto py-2 space-y-1 px-2">
                {queue.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-500 space-y-2">
                    <Music className="w-10 h-10 opacity-30" />
                    <p className="text-sm">Queue is empty</p>
                  </div>
                ) : (
                  queue.map((track, idx) => {
                    const isActive = currentSong?.id === track.id;
                    const isLastFM = (track as any).source === 'lastfm';
                    const dragId = `${track.id}-${idx}`;

                    return (
                      <SortableTrackItem
                        key={dragId}
                        track={track}
                        index={idx}
                        isActive={isActive}
                        isLastFM={isLastFM}
                        onPlayTrack={onPlayTrack}
                        onRemoveTrack={onRemoveTrack}
                      />
                    );
                  })
                )}
              </div>
            </SortableContext>

            <DragOverlay>
              {activeId ? (() => {
                const activeIndex = queue.findIndex(
                  (track, idx) => `${track.id}-${idx}` === activeId
                );
                if (activeIndex === -1) return null;
                const activeTrack = queue[activeIndex];
                const isActive = currentSong?.id === activeTrack.id;
                const isLastFM = (activeTrack as any).source === 'lastfm';
                return (
                  <div className="z-[9999] shadow-2xl scale-105 cursor-grabbing select-none rounded-xl w-[304px]">
                    <TrackRow
                      track={activeTrack}
                      isActive={isActive}
                      isLastFM={isLastFM}
                      isOverlay
                    />
                  </div>
                );
              })() : null}
            </DragOverlay>
          </DndContext>

          {/* Footer hint */}
          {isSmartShuffleActive && (
            <div className="px-4 py-3 border-t border-black/10 dark:border-white/10">
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
