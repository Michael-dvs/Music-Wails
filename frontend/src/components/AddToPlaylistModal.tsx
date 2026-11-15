import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, FolderPlus, Check, Loader2, Music } from 'lucide-react';
import { supabase, DbPlaylist } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { main } from '../../wailsjs/go/models';

interface AddToPlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  song: main.Song | null;
}

export default function AddToPlaylistModal({ isOpen, onClose, song }: AddToPlaylistModalProps) {
  const { user, refreshPlaylists } = useAuth();
  const [playlists, setPlaylists] = useState<DbPlaylist[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingPlaylistId, setSavingPlaylistId] = useState<string | null>(null);
  const [successPlaylistId, setSuccessPlaylistId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const fetchPlaylists = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: plErr } = await supabase
        .from('playlists')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (plErr) throw plErr;
      setPlaylists(data || []);
    } catch (err: any) {
      setError(err?.message || 'Gagal memuat playlist.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (isOpen) {
      setSuccessPlaylistId(null);
      setError(null);
      setNewPlaylistName('');
      fetchPlaylists();
    }
  }, [isOpen, fetchPlaylists]);

  const handleAddToPlaylist = async (playlistId: string) => {
    if (!song || !user) return;
    setSavingPlaylistId(playlistId);
    setError(null);

    try {
      // Get current max order_index in this playlist
      const { data: countData } = await supabase
        .from('playlist_tracks')
        .select('order_index')
        .eq('playlist_id', playlistId)
        .order('order_index', { ascending: false })
        .limit(1);

      const nextOrder = countData && countData.length > 0 ? (countData[0].order_index ?? 0) + 1 : 0;

      const { error: insertErr } = await supabase.from('playlist_tracks').insert({
        playlist_id: playlistId,
        track_id: String(song.id),
        title: song.title,
        artist: song.artist,
        album: song.album || '',
        cover_url: song.coverArt || '',
        duration: Math.floor((song.duration || 0) / 1000),
        order_index: nextOrder,
      });

      if (insertErr) throw insertErr;

      setSuccessPlaylistId(playlistId);
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err: any) {
      setError(err?.message || 'Gagal menambahkan lagu ke playlist.');
    } finally {
      setSavingPlaylistId(null);
    }
  };

  const handleCreatePlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newPlaylistName.trim();
    if (!name || !user) return;

    setIsCreating(true);
    setError(null);

    try {
      const { data, error: createErr } = await supabase
        .from('playlists')
        .insert({
          user_id: user.id,
          name,
        })
        .select()
        .single();

      if (createErr) throw createErr;
      if (data) {
        setPlaylists(prev => [data, ...prev]);
        setNewPlaylistName('');
        await refreshPlaylists();
        // Automatically add song to the newly created playlist
        await handleAddToPlaylist(data.id);
      }
    } catch (err: any) {
      setError(err?.message || 'Gagal membuat playlist baru.');
      setIsCreating(false);
    }
  };

  if (!isOpen || !song) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.15 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-to-playlist-title"
          className="relative w-full max-w-md bg-white dark:bg-[#1c1c1e] text-gray-900 dark:text-white rounded-2xl shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden flex flex-col max-h-[85vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-black/10 dark:border-white/10">
            <div className="flex items-center space-x-2">
              <FolderPlus className="w-5 h-5 text-brand-500" />
              <h2 id="add-to-playlist-title" className="text-base font-semibold">
                Tambahkan ke Playlist
              </h2>
            </div>
            <button
              onClick={onClose}
              aria-label="Tutup dialog"
              className="p-1 rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Song Summary */}
          <div className="flex items-center space-x-3 px-6 py-3 bg-black/5 dark:bg-white/5 border-b border-black/5 dark:border-white/5">
            <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-gray-200 dark:bg-gray-800">
              {song.coverArt ? (
                <img src={song.coverArt} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Music className="w-5 h-5 text-gray-400" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">{song.title}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{song.artist}</p>
            </div>
          </div>

          {/* Create New Playlist Input */}
          <form onSubmit={handleCreatePlaylist} className="px-6 pt-4 pb-2">
            <div className="flex space-x-2">
              <input
                type="text"
                placeholder="Nama playlist baru..."
                value={newPlaylistName}
                onChange={e => setNewPlaylistName(e.target.value)}
                disabled={isCreating}
                className="flex-1 text-sm bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2 outline-none focus:ring-2 focus:ring-brand-500 text-gray-900 dark:text-white placeholder-gray-400"
              />
              <button
                type="submit"
                disabled={isCreating || !newPlaylistName.trim()}
                className="flex items-center space-x-1 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                {isCreating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                <span>Buat</span>
              </button>
            </div>
          </form>

          {/* Error Message */}
          {error && (
            <div className="px-6 py-2">
              <p className="text-xs text-red-500">{error}</p>
            </div>
          )}

          {/* Playlists List */}
          <div className="flex-1 overflow-y-auto px-6 py-3 space-y-1.5 no-scrollbar">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
              </div>
            ) : playlists.length === 0 ? (
              <div className="text-center py-8 text-xs text-gray-400">
                Belum ada playlist. Buat playlist pertama Anda di atas.
              </div>
            ) : (
              playlists.map(pl => {
                const isSaving = savingPlaylistId === pl.id;
                const isSuccess = successPlaylistId === pl.id;

                return (
                  <button
                    key={pl.id}
                    type="button"
                    onClick={() => handleAddToPlaylist(pl.id)}
                    disabled={isSaving || isSuccess}
                    className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 border border-transparent hover:border-black/5 dark:hover:border-white/5 transition-all text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    <span className="text-sm font-medium truncate flex-1">{pl.name}</span>
                    {isSaving && <Loader2 className="w-4 h-4 animate-spin text-brand-500" />}
                    {isSuccess && <Check className="w-4 h-4 text-emerald-500" />}
                  </button>
                );
              })
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
