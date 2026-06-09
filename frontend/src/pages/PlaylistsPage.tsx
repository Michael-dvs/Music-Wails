import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Play, Loader2, Clock, Music2, Disc3, Pencil, Plus, Sparkles, Trash2, AlertTriangle, X, GripVertical, RefreshCw, MoreHorizontal } from 'lucide-react';
import { getPlaylist, getPlaylistTracks, addTrackToPlaylist, updatePlaylistCover, deletePlaylist, removeTrackFromPlaylist, updatePlaylistTrackOrder, updatePlaylistName } from '../lib/supabaseOps';
import type { Playlist, PlaylistTrack } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useContextMenu } from '../contexts/ContextMenuContext';
import { supabase } from '../lib/supabase';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

// ── Shared utility exports ────────────────────────────────────────
export function getStoragePathFromUrl(url: string, bucketName: string): string | null {
  try {
    const parts = url.split(`/storage/v1/object/public/${bucketName}/`);
    if (parts.length === 2) {
      return decodeURIComponent(parts[1]);
    }
  } catch (e) {
    console.warn('[StorageCleanup] Failed to parse URL:', url, e);
  }
  return null;
}

function formatDuration(ms?: number): string {
  if (!ms || ms <= 0) return '--:--';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function getHighResArtwork(url: string | null | undefined): string {
  if (!url) return '';
  return url.replace(/\d+x\d+bb\.jpg/, '500x500bb.jpg');
}

export function getReleaseYear(date?: string): string {
  if (!date) return '';
  try {
    return new Date(date).getFullYear().toString();
  } catch {
    return '';
  }
}

// ── Recommended Track shape (from iTunes) ─────────────────────────
interface RecommendedTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  coverArt: string;
  previewUrl: string;
  duration: number; // millisecond duration
}

// ── Props ─────────────────────────────────────────────────────────
interface PlaylistsPageProps {
  initialPlaylistId: string;
  onPlaySong?: (song: any, queue: any[], source?: 'playlist' | 'search') => void;
  onBack: () => void;
}

// ── Component ─────────────────────────────────────────────────────
export default function PlaylistsPage({ initialPlaylistId, onPlaySong, onBack }: PlaylistsPageProps) {
  const { user } = useAuth();
  const { openContextMenu } = useContextMenu();
  
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [tracks, setTracks] = useState<PlaylistTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Inline editing name
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");

  // Recommendations
  const [recommendations, setRecommendations] = useState<RecommendedTrack[]>([]);
  const [recsLoading, setRecsLoading] = useState(false);
  const [addingTrackId, setAddingTrackId] = useState<string | null>(null);

  // Delete playlist
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const deleteMatch = playlist ? deleteConfirmText === playlist.name : false;

  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeDropdownTrackId, setActiveDropdownTrackId] = useState<string | null>(null);
  const prevSeedArtistsRef = useRef<string[]>([]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleGlobalClick = () => {
      setActiveDropdownTrackId(null);
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  // ── Cover Upload Handler ────────────────────────────────────────
  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !playlist || !user) return;

    setUploading(true);
    try {
      const timestamp = Date.now();
      const fileExt = file.name.split('.').pop() || 'jpg';
      const filePath = `${user.id}/${playlist.id}-${timestamp}.${fileExt}`;

      // 1. Upload file to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('playlist-covers')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // 2. Get Public URL
      const { data: { publicUrl } } = supabase.storage
        .from('playlist-covers')
        .getPublicUrl(filePath);

      // 3. Clean up the old custom cover image from storage if it exists
      if (playlist.cover_url) {
        const oldPath = getStoragePathFromUrl(playlist.cover_url, 'playlist-covers');
        if (oldPath) {
          console.log('[PlaylistsPage] Cleaning up old cover:', oldPath);
          const { error: removeError } = await supabase.storage
            .from('playlist-covers')
            .remove([oldPath]);
          if (removeError) {
            console.warn('[PlaylistsPage] Failed to clean up old cover:', removeError.message);
          } else {
            console.log('[PlaylistsPage] Old cover cleaned up successfully.');
          }
        }
      }

      // 4. Update the playlists cover_url in Supabase
      await updatePlaylistCover(playlist.id, publicUrl);

      // 5. Update local state
      setPlaylist(prev => prev ? { ...prev, cover_url: publicUrl } : null);

      // 6. Dispatch CustomEvent for re-fetching the sidebar
      window.dispatchEvent(new CustomEvent('playlistUpdated', { detail: { playlistId: playlist.id, coverUrl: publicUrl } }));

      console.log('[PlaylistsPage] Custom cover updated successfully:', publicUrl);
    } catch (err: any) {
      console.error('[PlaylistsPage] Cover upload failed:', err);
      alert(`Gagal mengunggah gambar cover: ${err.message}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };


  // ── Fetch Playlist Data ─────────────────────────────────────────
  useEffect(() => {
    if (!initialPlaylistId) return;

    let cancelled = false;

    const loadPlaylist = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getPlaylist(initialPlaylistId);
        setPlaylist(data);
        setEditedName(data?.name || "");

        const trackData = await getPlaylistTracks(initialPlaylistId);

        if (!cancelled) {
          setPlaylist(data);
          setTracks(trackData);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'Failed to load playlist');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadPlaylist();

    return () => { cancelled = true; };
  }, [initialPlaylistId]);

  // ── Handlers ────────────────────────────────────────────────────
  const handlePlayTrack = useCallback((track: PlaylistTrack) => {
    if (!onPlaySong) return;
    
    // Convert to song format expected by player
    const toSong = (t: PlaylistTrack) => ({
      id: t.track_id,
      title: t.title,
      artist: t.artist,
      album: t.album ?? '',
      coverArt: t.cover_url ?? '',
      duration: t.duration ?? 0,
      streamUrl: '',
      genre: '',
    });

    const song = toSong(track);
    const queue = tracks.map(toSong);
    onPlaySong(song, queue, 'playlist');
  }, [tracks, onPlaySong]);

  const handleNameSave = async () => {
    if (!playlist) return;
    const trimmedName = editedName.trim();
    if (!trimmedName || trimmedName === playlist.name) {
      setIsEditingName(false);
      setEditedName(playlist.name);
      return;
    }
    
    try {
      await updatePlaylistName(playlist.id, trimmedName);
      setPlaylist({ ...playlist, name: trimmedName });
      setIsEditingName(false);
      window.dispatchEvent(new Event('playlistUpdated'));
    } catch (err) {
      console.error('[PlaylistsPage] Failed to update playlist name:', err);
      setEditedName(playlist.name); // revert on error
    }
  };

  const handlePlayAll = useCallback(() => {
    if (tracks.length > 0) handlePlayTrack(tracks[0]);
  }, [tracks, handlePlayTrack]);

  // ── Fetch Recommendations ────────────────────────────────────────
  const fetchRecommendations = useCallback(async (currentTracks: PlaylistTrack[], forceRefresh = false) => {
    if (currentTracks.length === 0) return;
    setRecsLoading(true);
    setRecommendations([]);

    try {
      // Pick 1-2 unique artists at random from the playlist
      const uniqueArtists = [...new Set(currentTracks.map(t => t.artist))];
      
      let availableArtists = uniqueArtists;
      if (forceRefresh && uniqueArtists.length > 2) {
        availableArtists = uniqueArtists.filter(artist => !prevSeedArtistsRef.current.includes(artist));
        if (availableArtists.length === 0) {
          availableArtists = uniqueArtists;
        }
      }

      const shuffled = availableArtists.sort(() => Math.random() - 0.5);
      const seedArtists = shuffled.slice(0, Math.min(2, shuffled.length));
      
      prevSeedArtistsRef.current = seedArtists;

      // Track IDs already in playlist (for dedup)
      const existingIds = new Set(currentTracks.map(t => t.track_id));
      const existingTitles = new Set(currentTracks.map(t => t.title.toLowerCase()));

      // Fetch from iTunes for each seed artist concurrently
      const fetches = seedArtists.map(artist =>
        fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(artist)}&entity=song&limit=10&country=id`)
          .then(r => r.json())
          .then(d => d?.results ?? [])
          .catch(() => [])
      );
      const results = await Promise.all(fetches);
      const combined: RecommendedTrack[] = [];

      for (const batch of results) {
        for (const item of batch) {
          const id = String(item.trackId);
          if (existingIds.has(id)) continue;
          if (existingTitles.has((item.trackName ?? '').toLowerCase())) continue;
          if (combined.some(r => r.id === id)) continue;
          combined.push({
            id,
            title: item.trackName ?? '',
            artist: item.artistName ?? '',
            album: item.collectionName ?? '',
            coverArt: (item.artworkUrl100 ?? '').replace('100x100bb', '300x300bb'),
            previewUrl: item.previewUrl ?? '',
            duration: item.trackTimeMillis ?? 0,
          });
          if (combined.length >= 5) break;
        }
        if (combined.length >= 5) break;
      }

      setRecommendations(combined.slice(0, 5));
      console.log(`[Recommendations] ${combined.length} suggestions found for artists:`, seedArtists);
    } catch (err) {
      console.error('[Recommendations] Fetch failed:', err);
    } finally {
      setRecsLoading(false);
    }
  }, []);

  // Trigger recommendations whenever tracks update (and there are tracks)
  useEffect(() => {
    if (!loading && tracks.length > 0) {
      fetchRecommendations(tracks);
    }
  }, [loading, tracks, fetchRecommendations]);

  // ── Add Recommended Track to Playlist ────────────────────────────
  const handleAddRecommendedTrack = useCallback(async (rec: RecommendedTrack) => {
    if (!initialPlaylistId || addingTrackId === rec.id) return;
    setAddingTrackId(rec.id);
    try {
      await addTrackToPlaylist({
        playlistId: initialPlaylistId,
        trackId: rec.id,
        title: rec.title,
        artist: rec.artist,
        album: rec.album,
        coverUrl: rec.coverArt,
        duration: rec.duration,
      });
      // Move rec to tracks list and remove from recommendations
      setTracks(prev => [
        ...prev,
        {
          id: `temp-${rec.id}`,
          playlist_id: initialPlaylistId,
          track_id: rec.id,
          title: rec.title,
          artist: rec.artist,
          album: rec.album,
          cover_url: rec.coverArt,
          duration: rec.duration,
          added_at: new Date().toISOString(),
        } as PlaylistTrack,
      ]);
      setRecommendations(prev => prev.filter(r => r.id !== rec.id));
    } catch (err: any) {
      console.error('[Recommendations] addTrackToPlaylist failed:', err);
    } finally {
      setAddingTrackId(null);
    }
  }, [initialPlaylistId, addingTrackId]);

  // ── Delete Playlist ──────────────────────────────────────────────
  const handleDeletePlaylist = useCallback(async () => {
    if (!playlist || !deleteMatch || isDeleting) return;
    setIsDeleting(true);
    try {
      await deletePlaylist(playlist.id);
      // Remove from sidebar instantly
      window.dispatchEvent(new Event('playlistUpdated'));
      // Navigate back to the playlist list / home
      onBack();
    } catch (err: any) {
      console.error('[PlaylistsPage] deletePlaylist failed:', err);
      setIsDeleting(false);
    }
  }, [playlist, deleteMatch, isDeleting, onBack]);

  // ── Drag and Drop Reorder Handler ────────────────────────────────
  const handleDragEnd = useCallback(async (result: any) => {
    if (!result.destination || !playlist) return;
    if (result.destination.index === result.source.index) return;

    const reordered = Array.from(tracks);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);

    // Update order_index for all tracks based on their new position
    const updatedTracks = reordered.map((track, index) => ({
      ...track,
      order_index: index,
    }));

    // Optimistic local update
    setTracks(updatedTracks);

    try {
      const trackOrders = updatedTracks.map(t => ({
        id: t.id,
        order_index: t.order_index!,
      }));
      await updatePlaylistTrackOrder(playlist.id, trackOrders);
    } catch (err: any) {
      console.error('[PlaylistsPage] Failed to save track order:', err);
      // Revert on failure
      const fetchedTracks = await getPlaylistTracks(playlist.id);
      setTracks(fetchedTracks);
    }
  }, [playlist, tracks]);

  // ── Remove Track Handler ─────────────────────────────────────────
  const handleRemoveTrack = useCallback(async (trackId: string) => {
    if (!playlist) return;
    // Optimistic update
    const originalTracks = [...tracks];
    setTracks(prev => prev.filter(t => t.track_id !== trackId));
    try {
      await removeTrackFromPlaylist(playlist.id, trackId);
    } catch (err: any) {
      console.error('[PlaylistsPage] Failed to remove track:', err);
      setTracks(originalTracks); // Revert on failure
      alert(`Gagal menghapus lagu: ${err.message}`);
    }
  }, [playlist, tracks]);

  // ── Render Helpers ──────────────────────────────────────────────
  // Use the first track's cover art if the playlist itself doesn't have one
  const coverUrl = playlist?.cover_url || (tracks.length > 0 ? tracks[0].cover_url : null);

  return (
    <>
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="w-full h-full flex flex-col overflow-y-auto pb-36 no-scrollbar bg-[var(--app-bg)]"
    >
      {/* ── Header ────────────────────────────────────────────────── */}
      <div
        className="relative w-full px-8 pt-8 pb-10 flex items-end space-x-8 flex-shrink-0"
        style={{ background: 'linear-gradient(180deg, rgba(250,36,60,0.12) 0%, transparent 100%)' }}
      >
        <motion.button
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={onBack}
          className="absolute top-6 left-6 z-10 flex items-center space-x-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-brand-500 dark:hover:text-brand-400 transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          <span>Back</span>
        </motion.button>

        {/* Delete Playlist button — top right */}
        {!loading && playlist && (
          <button
            onClick={() => { setShowDeleteModal(true); setDeleteConfirmText(''); }}
            title="Hapus Playlist"
            className="absolute top-4 right-4 z-10 text-zinc-500 hover:text-red-500 transition-colors cursor-pointer"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        )}

        {loading ? (
          <div className="w-52 h-52 rounded-2xl bg-black/10 dark:bg-white/10 animate-pulse mt-10 flex-shrink-0" />
        ) : (
          <div
            className="relative group w-52 h-52 rounded-2xl overflow-hidden shadow-2xl shadow-black/50 border border-black/10 dark:border-white/10 flex-shrink-0 mt-10 bg-gray-200 dark:bg-gray-800 flex items-center justify-center cursor-pointer select-none"
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleCoverUpload}
              accept="image/*"
              className="hidden"
              disabled={uploading}
            />

            {coverUrl ? (
              <img
                src={getHighResArtwork(coverUrl)}
                alt={playlist?.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <Disc3 className="w-16 h-16 text-gray-400 dark:text-gray-600" />
            )}

            {/* Hover Pencil Overlay */}
            <div
              onClick={() => !uploading && fileInputRef.current?.click()}
              className={`absolute inset-0 bg-black/50 backdrop-blur-sm flex flex-col items-center justify-center text-white transition-opacity duration-200 ${
                uploading 
                  ? 'opacity-100' 
                  : 'opacity-0 group-hover:opacity-100'
              }`}
            >
              {uploading ? (
                <Loader2 className="w-8 h-8 text-white animate-spin" />
              ) : (
                <div className="flex flex-col items-center space-y-1.5">
                  <Pencil className="w-6 h-6 text-white" />
                  <span className="text-[11px] font-medium tracking-wide">Ubah Cover</span>
                </div>
              )}
            </div>
          </div>
        )}


        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex flex-col space-y-3 pb-1 min-w-0"
        >
          <span className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
            Playlist
          </span>
          {loading ? (
            <div className="h-12 w-64 rounded-lg bg-black/10 dark:bg-white/10 animate-pulse" />
          ) : isEditingName ? (
            <input
              type="text"
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              onBlur={handleNameSave}
              onKeyDown={(e) => e.key === 'Enter' && handleNameSave()}
              autoFocus
              className="text-4xl md:text-5xl font-black text-gray-900 dark:text-white tracking-tight leading-tight bg-transparent border-none outline-none ring-0 w-full p-0 m-0"
            />
          ) : (
            <h1 
              className="text-4xl md:text-5xl font-black text-gray-900 dark:text-white tracking-tight leading-tight cursor-pointer hover:underline"
              onClick={() => setIsEditingName(true)}
              title="Click to edit name"
            >
              {playlist?.name || 'Unknown Playlist'}
            </h1>
          )}

          <div className="flex items-center flex-wrap gap-x-2 text-sm">
            <span className="font-semibold text-gray-900 dark:text-white">
              {user?.user_metadata?.full_name || user?.email || 'User'}
            </span>
            <span className="text-gray-400">·</span>
            <span className="text-gray-500 dark:text-gray-400">
              {tracks.length} {tracks.length === 1 ? 'song' : 'songs'}
            </span>
          </div>

          <button
            onClick={handlePlayAll}
            disabled={loading || tracks.length === 0}
            className="mt-1 flex items-center space-x-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-full font-semibold shadow-lg shadow-brand-500/30 transition-all hover:scale-105 active:scale-95 w-fit"
          >
            <Play className="w-5 h-5 fill-white" />
            <span>Play All</span>
          </button>
        </motion.div>
      </div>

      {/* ── Track list ────────────────────────────────────────────── */}
      <div className="px-8 mt-4">
        <div className="grid grid-cols-[32px_32px_1fr_80px_40px] gap-4 px-4 py-3 border-b border-black/10 dark:border-white/10 text-xs font-semibold uppercase tracking-wider text-gray-500">
          <span></span>
          <span className="text-center">#</span>
          <span>Title</span>
          <span className="flex items-center justify-end">
            <Clock className="w-3.5 h-3.5" />
          </span>
          <span></span>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-brand-400" />
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-20 text-red-500 space-y-2">
            <Music2 className="w-10 h-10 opacity-40" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {!loading && !error && tracks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500 space-y-2">
            <Music2 className="w-10 h-10 opacity-40" />
            <p className="text-sm">No tracks in this playlist.</p>
          </div>
        )}

        {!loading && !error && tracks.length > 0 && (
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="playlist-tracks">
              {(provided) => (
                <div
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  className="flex flex-col"
                >
                  {tracks.map((track, idx) => (
                    <Draggable key={track.id} draggableId={track.id} index={idx}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          onClick={() => handlePlayTrack(track)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            openContextMenu(e.clientX, e.clientY, {
                              id: track.track_id,
                              title: track.title,
                              artist: track.artist,
                              album: track.album ?? '',
                              coverArt: track.cover_url ?? '',
                            });
                          }}
                          className={`group grid grid-cols-[32px_32px_1fr_80px_40px] gap-4 px-4 py-3.5 rounded-xl cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-all duration-150 items-center ${
                            snapshot.isDragging ? 'bg-black/25 dark:bg-white/5 shadow-lg border border-black/10 dark:border-white/10 scale-[1.01]' : ''
                          }`}
                        >
                          {/* Grip handle */}
                          <div
                            {...provided.dragHandleProps}
                            className="flex items-center justify-center text-gray-600 dark:text-gray-400 hover:text-brand-500 transition-colors cursor-grab active:cursor-grabbing"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <GripVertical className="w-4 h-4" />
                          </div>

                          {/* Index / Play */}
                          <div className="text-center">
                            <span className="text-sm text-gray-400 group-hover:hidden tabular-nums">
                              {idx + 1}
                            </span>
                            <Play className="w-4 h-4 text-brand-400 fill-brand-400 hidden group-hover:block mx-auto" />
                          </div>

                          {/* Title / Artist / Cover */}
                          <div className="min-w-0 flex items-center space-x-3">
                            {track.cover_url && (
                              <img
                                src={track.cover_url}
                                alt={track.title}
                                className="w-10 h-10 rounded shadow-sm object-cover flex-shrink-0"
                              />
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate group-hover:text-brand-500 dark:group-hover:text-brand-400 transition-colors">
                                {track.title}
                              </p>
                              <p className="text-xs text-gray-500 truncate mt-0.5">{track.artist}</p>
                            </div>
                          </div>

                          {/* Duration */}
                          <span className="text-sm text-gray-400 text-right tabular-nums">
                            {formatDuration(track.duration ?? undefined)}
                          </span>

                          {/* Action Dropdown */}
                          <div className="relative flex items-center justify-end">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveDropdownTrackId(prev => prev === track.id ? null : track.id);
                              }}
                              className="w-8 h-8 flex items-center justify-center rounded-full text-zinc-500 hover:text-zinc-300 hover:bg-black/10 dark:hover:bg-white/10 transition-all"
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </button>

                            <AnimatePresence>
                              {activeDropdownTrackId === track.id && (
                                <motion.div
                                  initial={{ opacity: 0, scale: 0.95, y: -5 }}
                                  animate={{ opacity: 1, scale: 1, y: 0 }}
                                  exit={{ opacity: 0, scale: 0.95, y: -5 }}
                                  transition={{ duration: 0.15 }}
                                  className="absolute right-0 top-full mt-1 w-44 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-950 shadow-xl z-50 py-1.5 pointer-events-auto"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveTrack(track.track_id);
                                      setActiveDropdownTrackId(null);
                                    }}
                                    className="w-full flex items-center space-x-2 px-3.5 py-2 text-xs font-semibold text-red-500 hover:bg-red-500/10 transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Hapus dari Playlist</span>
                                  </button>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        )}
        {/* ── Recommendations Section ──────────────────────────────── */}
        <AnimatePresence>
          {(recsLoading || recommendations.length > 0) && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="px-8 mt-10 mb-6"
            >
              {/* Section header */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                  Recommended For You
                </h3>
                <button
                  onClick={() => fetchRecommendations(tracks, true)}
                  disabled={recsLoading}
                  className="p-1.5 rounded-full text-zinc-500 hover:text-zinc-300 hover:bg-black/10 dark:hover:bg-white/10 transition-all disabled:opacity-50"
                  title="Refresh Rekomendasi"
                >
                  <RefreshCw className={`w-4 h-4 ${recsLoading ? 'animate-spin text-brand-500' : ''}`} />
                </button>
              </div>

              {recsLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Finding recommendations...</span>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {recommendations.map((rec) => (
                    <motion.div
                      key={rec.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      className="group flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-all duration-150 cursor-default"
                    >
                      {/* Cover */}
                      <img
                        src={rec.coverArt}
                        alt={rec.title}
                        className="w-10 h-10 rounded-lg object-cover shadow-sm flex-shrink-0"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                          {rec.title}
                        </p>
                        <p className="text-xs text-gray-500 truncate">{rec.artist}</p>
                      </div>

                      {/* Add button */}
                      <button
                        onClick={() => handleAddRecommendedTrack(rec)}
                        disabled={addingTrackId === rec.id}
                        className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full 
                          bg-brand-500/10 hover:bg-brand-500/20 text-brand-500 transition-all duration-150
                          hover:scale-110 active:scale-95 disabled:opacity-50 disabled:cursor-default"
                        title={`Add "${rec.title}" to playlist`}
                      >
                        {addingTrackId === rec.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Plus className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>

    {/* ── Delete Playlist Confirmation Modal ─────────────────────────── */}
    <AnimatePresence>
      {showDeleteModal && playlist && (
        <motion.div
          key="delete-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm"
          onClick={() => !isDeleting && setShowDeleteModal(false)}
        />
      )}

      {showDeleteModal && playlist && (
        <motion.div
          key="delete-modal"
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-[201] flex items-center justify-center pointer-events-none"
        >
          <div className="pointer-events-auto w-full max-w-[400px] mx-4 rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800 shadow-2xl shadow-black/70">
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-red-500/15 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                </div>
                <h2 className="text-[15px] font-bold text-zinc-100">Hapus Playlist</h2>
              </div>
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
                className="w-7 h-7 flex items-center justify-center rounded-full text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-40 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-5 space-y-4">
              {/* Warning banner */}
              <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl bg-red-500/10 border border-red-500/20">
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-[13px] text-red-300 leading-relaxed">
                  <strong className="text-red-400">Tindakan ini tidak dapat dibatalkan.</strong>{' '}
                  Playlist beserta semua lagunya akan dihapus secara permanen.
                </p>
              </div>

              {/* Confirm by typing name */}
              <div>
                <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest mb-1.5 block">
                  Ketik{' '}
                  <span className="text-zinc-200 font-bold normal-case tracking-normal">
                    {playlist.name}
                  </span>{' '}
                  untuk mengkonfirmasi
                </label>
                <input
                  autoFocus
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && deleteMatch && handleDeletePlaylist()}
                  placeholder={playlist.name}
                  className="w-full px-3.5 py-2.5 rounded-xl text-[13px]
                    bg-zinc-800/50 border border-zinc-700 text-zinc-100
                    placeholder:text-zinc-600
                    focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500/40
                    transition-all duration-150"
                  disabled={isDeleting}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 pb-5">
              <motion.button
                onClick={handleDeletePlaylist}
                disabled={!deleteMatch || isDeleting}
                whileTap={deleteMatch && !isDeleting ? { scale: 0.97 } : {}}
                className={`w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl text-[13px] font-semibold
                  transition-all duration-200
                  ${deleteMatch && !isDeleting
                    ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-900/40 cursor-pointer'
                    : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                  }`}
              >
                {isDeleting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Menghapus...</>
                ) : (
                  <><Trash2 className="w-4 h-4" /> Konfirmasi Hapus</>
                )}
              </motion.button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  </>
  );
}
