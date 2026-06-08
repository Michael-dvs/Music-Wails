import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Link2, Music2, Sparkles, Save, Check, Loader2, AlertCircle } from 'lucide-react';
import { main } from '../../wailsjs/go/models';
import { ScrapeSpotifyPlaylist } from '../../wailsjs/go/main/App';
import { createPlaylist, addTrackToPlaylist, importTracksFromLink } from '../lib/supabaseOps';
import { useAuth } from '../contexts/AuthContext';

// ── Helpers ───────────────────────────────────────────────────────
function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

type AnyTrack = main.Song | main.SmartTrack;

// ── Track Row in Quick Add list ───────────────────────────────────
function QuickAddRow({
  track,
  isSelected,
  onToggle,
}: {
  track: AnyTrack;
  isSelected: boolean;
  onToggle: (track: AnyTrack) => void;
}) {
  return (
    <motion.div
      layout
      className="flex items-center gap-3 px-3 py-2 rounded-xl
        hover:bg-zinc-800/80
        transition-all duration-150 group cursor-pointer"
      onClick={() => onToggle(track)}
    >
      {/* Cover art */}
      <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 bg-zinc-800">
        {track.coverArt ? (
          <img
            src={track.coverArt}
            alt={track.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Music2 className="w-4 h-4 text-zinc-500" />
          </div>
        )}
      </div>

      {/* Title + Artist */}
      <div className="flex-1 min-w-0">
        <p className={`text-[13px] font-medium truncate leading-tight transition-colors
          ${isSelected ? 'text-brand-400' : 'text-zinc-100'}`}>
          {track.title}
        </p>
        <p className="text-[11px] text-zinc-400 truncate leading-tight mt-0.5">
          {track.artist}
          {track.duration ? (
            <span className="ml-2 opacity-60">{formatDuration(track.duration)}</span>
          ) : null}
        </p>
      </div>

      {/* Toggle button */}
      <motion.div
        whileTap={{ scale: 0.85 }}
        className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0
          transition-all duration-200
          ${isSelected
            ? 'bg-brand-500 text-white shadow-md shadow-brand-500/30'
            : 'bg-zinc-800 text-zinc-500 group-hover:bg-brand-500/15 group-hover:text-brand-400'
          }`}
      >
        {isSelected ? (
          <Check className="w-3.5 h-3.5" />
        ) : (
          <Plus className="w-3.5 h-3.5" />
        )}
      </motion.div>
    </motion.div>
  );
}

// ── Main Modal Component ─────────────────────────────────────────
interface AddPlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  suggestedTracks: AnyTrack[];
  onPlaylistCreated?: (playlistId: string, playlistName: string) => void;
}

export default function AddPlaylistModal({
  isOpen,
  onClose,
  suggestedTracks,
  onPlaylistCreated,
}: AddPlaylistModalProps) {
  const { user } = useAuth();

  const [playlistName, setPlaylistName] = useState('');
  const [importLink, setImportLink] = useState('');
  const [selectedTracks, setSelectedTracks] = useState<AnyTrack[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [loadingText, setLoadingText] = useState('Menyimpan…');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const isSelectedTrack = useCallback(
    (track: AnyTrack) => selectedTracks.some(t => t.id === track.id),
    [selectedTracks]
  );

  const toggleTrack = useCallback((track: AnyTrack) => {
    setSelectedTracks(prev =>
      prev.some(t => t.id === track.id)
        ? prev.filter(t => t.id !== track.id)
        : [...prev, track]
    );
  }, []);

  const resetState = () => {
    setPlaylistName('');
    setImportLink('');
    setSelectedTracks([]);
    setSaveError(null);
    setSaveSuccess(false);
    setLoadingText('Menyimpan…');
  };

  const handleClose = () => {
    if (!isSaving) {
      resetState();
      onClose();
    }
  };

  const handleSave = async () => {
    if (!playlistName.trim()) {
      setSaveError('Nama playlist tidak boleh kosong.');
      return;
    }
    if (!user) {
      setSaveError('Kamu harus login untuk membuat playlist.');
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setLoadingText('Membuat Playlist...');

    try {
      console.log('[AddPlaylistModal] Creating playlist:', playlistName);

      // ── Step 1: CREATE the playlist row ──────────────────────
      const playlist = await createPlaylist(user.id, playlistName.trim());
      console.log('[AddPlaylistModal] Playlist created:', playlist.id);

      // ── Step 2a: ADD manually selected tracks ─────────────────
      if (selectedTracks.length > 0) {
        setLoadingText(`Menambahkan ${selectedTracks.length} lagu...`);
        for (const track of selectedTracks) {
          try {
            await addTrackToPlaylist({
              playlistId: playlist.id,
              trackId: String(track.id),
              title: track.title,
              artist: track.artist,
              album: '',
              coverUrl: track.coverArt ?? '',
            });
          } catch (err: any) {
            console.warn('[AddPlaylistModal] Track add failed (non-fatal):', err.message);
          }
        }
      }

      // ── Step 2b: IMPORT from Spotify Link ───────────────
      if (importLink.trim()) {
        const link = importLink.trim();
        if (link.includes('spotify.com')) {
          setLoadingText('Mengimpor dari Spotify...');
          const tracks = await ScrapeSpotifyPlaylist(link);
          if (tracks && tracks.length > 0) {
            setLoadingText(`Menyimpan ${tracks.length} lagu Spotify...`);
            for (let i = 0; i < tracks.length; i++) {
              const track = tracks[i];
              const fakeTrackId = `spotify-${Date.now()}-${i}`;
              try {
                await addTrackToPlaylist({
                  playlistId: playlist.id,
                  trackId: fakeTrackId,
                  title: track.title,
                  artist: track.artist,
                  album: '',
                  coverUrl: track.coverUrl || '',
                });
              } catch (err: any) {
                console.warn('[AddPlaylistModal] Spotify track add failed (non-fatal):', err.message);
              }
            }
          }
        } else if (link.includes('apple.com')) {
           setLoadingText('Mengimpor dari iTunes...');
           await importTracksFromLink({
             playlistId: playlist.id,
             url: link,
           });
        }
      }

      setSaveSuccess(true);
      onPlaylistCreated?.(playlist.id, playlist.name);

      // Signal Sidebar to re-fetch immediately (mirrors the playlistUpdated event
      // used in PlaylistsPage for cover changes — same listener, same effect).
      window.dispatchEvent(new Event('playlistUpdated'));

      // Close after brief success flash
      setTimeout(() => {
        resetState();
        onClose();
      }, 800);

    } catch (err: any) {
      console.error('[AddPlaylistModal] Save failed:', err.message);
      setSaveError(err.message ?? 'Gagal membuat playlist. Coba lagi.');
    } finally {
      setIsSaving(false);
    }
  };

  const canSave = playlistName.trim().length > 0 && !isSaving && !saveSuccess;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* ── Backdrop ────────────────────────────────────────── */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-md"
            onClick={handleClose}
          />

          {/* ── Modal Panel ─────────────────────────────────────── */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.93, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.93, y: 24 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="fixed z-[100] inset-0 flex items-center justify-center pointer-events-none"
          >
            <div className="
              pointer-events-auto relative w-full max-w-[380px] mx-4
              rounded-2xl overflow-hidden
              bg-zinc-900/95
              backdrop-blur-md
              border border-zinc-800
              shadow-2xl shadow-black/50
            ">
              {/* ── Header ──────────────────────────────────────── */}
              <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-zinc-800">
                <div className="flex items-center gap-2.5">
                  <h2 className="text-[15px] font-semibold text-zinc-100">
                    Playlist Baru
                  </h2>
                </div>
                <button
                  id="add-playlist-modal-close"
                  onClick={handleClose}
                  disabled={isSaving}
                  className="w-7 h-7 flex items-center justify-center rounded-full
                    text-zinc-500 hover:text-zinc-100
                    hover:bg-zinc-800
                    disabled:opacity-40
                    transition-all duration-150"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* ── Body ────────────────────────────────────────── */}
              <div className="px-5 py-4 space-y-4 max-h-[62vh] overflow-y-auto no-scrollbar">

                {/* ① Playlist Name */}
                <div>
                  <label className="text-[10.5px] font-semibold text-zinc-400 uppercase tracking-widest mb-1.5 block">
                    Nama Playlist <span className="text-red-400">*</span>
                  </label>
                  <input
                    id="playlist-name-input"
                    autoFocus
                    type="text"
                    value={playlistName}
                    onChange={e => { setPlaylistName(e.target.value); setSaveError(null); }}
                    onKeyDown={e => e.key === 'Enter' && canSave && handleSave()}
                    placeholder="My Awesome Mix…"
                    maxLength={80}
                    className="
                      w-full px-3.5 py-2.5 rounded-xl text-[13px]
                      bg-zinc-800/50
                      border border-zinc-700
                      text-zinc-100
                      placeholder:text-zinc-500
                      focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500/40
                      transition-all duration-150
                    "
                  />
                </div>

                {/* ② Import Link (Optional) */}
                <div>
                  <label className="text-[10.5px] font-semibold text-zinc-400 uppercase tracking-widest mb-1.5 block">
                    Import dari Link <span className="text-[10px] font-normal normal-case opacity-70">(opsional)</span>
                  </label>
                  <div className="relative">
                    <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
                    <input
                      id="playlist-import-link-input"
                      type="text"
                      value={importLink}
                      onChange={e => setImportLink(e.target.value)}
                      placeholder="Tempel link Spotify atau Apple Music…"
                      className="
                        w-full pl-9 pr-3.5 py-2.5 rounded-xl text-[13px]
                        bg-zinc-800/50
                        border border-zinc-700
                        text-zinc-100
                        placeholder:text-zinc-500
                        focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500/40
                        transition-all duration-150
                      "
                    />
                  </div>
                  <p className="mt-1 text-[10.5px] text-zinc-500">
                    Akan mencari dan menambahkan lagu secara otomatis.
                  </p>
                </div>

                {/* ③ Quick Add from Queue / Suggestions */}
                {suggestedTracks.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[10.5px] font-semibold text-zinc-400 uppercase tracking-widest">
                        Tambah dari Queue
                      </label>
                      {selectedTracks.length > 0 && (
                        <motion.span
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="text-[10.5px] font-semibold text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded-full"
                        >
                          {selectedTracks.length} dipilih
                        </motion.span>
                      )}
                    </div>
                    <div className="space-y-0.5 -mx-1">
                      {suggestedTracks.slice(0, 7).map(track => (
                        <QuickAddRow
                          key={track.id}
                          track={track}
                          isSelected={isSelectedTrack(track)}
                          onToggle={toggleTrack}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Empty state (no queue) */}
                {suggestedTracks.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-5 text-center">
                    <Music2 className="w-9 h-9 text-zinc-700 mb-2" />
                    <p className="text-[12px] text-zinc-500">
                      Putar lagu terlebih dahulu untuk menampilkan saran di sini.
                    </p>
                  </div>
                )}

                {/* Error */}
                <AnimatePresence>
                  {saveError && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20"
                    >
                      <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                      <p className="text-[12px] text-red-400">{saveError}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* ── Footer ──────────────────────────────────────── */}
              <div className="px-5 py-4 border-t border-zinc-800">
                <motion.button
                  id="save-playlist-btn"
                  onClick={handleSave}
                  disabled={!canSave}
                  whileTap={canSave ? { scale: 0.97 } : {}}
                  className={`
                    w-full flex items-center justify-center gap-2
                    px-4 py-2.5 rounded-xl text-[13px] font-semibold
                    transition-all duration-200
                    ${saveSuccess
                      ? 'bg-green-500 text-white shadow-lg shadow-green-500/25'
                      : 'bg-brand-500 hover:bg-brand-600 text-zinc-100 shadow-lg shadow-brand-500/25 disabled:opacity-40 disabled:cursor-not-allowed'
                    }
                  `}
                >
                  {saveSuccess ? (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="flex items-center gap-2 text-white"
                    >
                      <Check className="w-4 h-4" /> Playlist Dibuat!
                    </motion.span>
                  ) : isSaving ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> {loadingText}</>
                  ) : (
                    <><Save className="w-4 h-4" /> Simpan Playlist</>
                  )}
                </motion.button>

                {/* Track count hint */}
                {(selectedTracks.length > 0 || importLink.trim()) && !saveSuccess && !isSaving && (
                  <p className="text-center text-[11px] text-zinc-500 mt-2">
                    {[
                      selectedTracks.length > 0 && `${selectedTracks.length} lagu dari queue`,
                      importLink.trim() && 'lagu dari link',
                    ].filter(Boolean).join(' + ')} akan ditambahkan
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
