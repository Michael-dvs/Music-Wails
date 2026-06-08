import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

// ──────────────────────────────────────────
//  Types
// ──────────────────────────────────────────
export interface PlayerSettings {
  seamlessPreload: boolean;
  crossfade: boolean;
  crossfadeDuration: number; // seconds, range 2–10
}

interface PlayerSettingsContextValue {
  settings: PlayerSettings;
  setSeamlessPreload: (v: boolean) => void;
  setCrossfade: (v: boolean) => void;
  setCrossfadeDuration: (v: number) => void;
}

// ──────────────────────────────────────────
//  Defaults & Storage Key
// ──────────────────────────────────────────
const STORAGE_KEY = 'music_player_settings';

const DEFAULTS: PlayerSettings = {
  seamlessPreload: false,
  crossfade: false,
  crossfadeDuration: 5,
};

function loadFromStorage(): PlayerSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PlayerSettings>;
      return {
        seamlessPreload: parsed.seamlessPreload ?? DEFAULTS.seamlessPreload,
        crossfade: parsed.crossfade ?? DEFAULTS.crossfade,
        crossfadeDuration: Math.min(10, Math.max(2, parsed.crossfadeDuration ?? DEFAULTS.crossfadeDuration)),
      };
    }
  } catch (_) {}
  return { ...DEFAULTS };
}

// ──────────────────────────────────────────
//  Context
// ──────────────────────────────────────────
const PlayerSettingsContext = createContext<PlayerSettingsContextValue | null>(null);

export function PlayerSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<PlayerSettings>(loadFromStorage);

  // Persist to localStorage whenever settings change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (_) {}
  }, [settings]);

  const setSeamlessPreload = useCallback((v: boolean) => {
    setSettings(prev => ({
      ...prev,
      seamlessPreload: v,
      // If disabling preload, also disable crossfade (it depends on preload)
      crossfade: v ? prev.crossfade : false,
    }));
  }, []);

  const setCrossfade = useCallback((v: boolean) => {
    setSettings(prev => ({ ...prev, crossfade: v }));
  }, []);

  const setCrossfadeDuration = useCallback((v: number) => {
    setSettings(prev => ({
      ...prev,
      crossfadeDuration: Math.min(10, Math.max(2, Math.round(v))),
    }));
  }, []);

  return (
    <PlayerSettingsContext.Provider
      value={{ settings, setSeamlessPreload, setCrossfade, setCrossfadeDuration }}
    >
      {children}
    </PlayerSettingsContext.Provider>
  );
}

// ──────────────────────────────────────────
//  Hook
// ──────────────────────────────────────────
export function usePlayerSettings(): PlayerSettingsContextValue {
  const ctx = useContext(PlayerSettingsContext);
  if (!ctx) throw new Error('usePlayerSettings must be used inside <PlayerSettingsProvider>');
  return ctx;
}
