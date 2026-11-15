import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type TransitionMode = 'crossfade' | 'fade' | 'off';

interface AudioSettings {
  seamlessPreload: boolean;
  transitionMode: TransitionMode;
  crossfadeDuration: number;
}

interface AudioSettingsContextType extends AudioSettings {
  setSeamlessPreload: (value: boolean) => void;
  setTransitionMode: (value: TransitionMode) => void;
  setCrossfadeDuration: (value: number) => void;
}

const defaults: AudioSettings = {
  seamlessPreload: true,
  transitionMode: 'crossfade',
  crossfadeDuration: 3,
};
const storageKey = 'audio_settings';
const AudioSettingsContext = createContext<AudioSettingsContextType | undefined>(undefined);

function loadSettings(): AudioSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return defaults;
    return {
      seamlessPreload: typeof saved.seamlessPreload === 'boolean' ? saved.seamlessPreload : defaults.seamlessPreload,
      transitionMode: saved.transitionMode === 'crossfade' || saved.transitionMode === 'fade' || saved.transitionMode === 'off'
        ? saved.transitionMode : defaults.transitionMode,
      crossfadeDuration: typeof saved.crossfadeDuration === 'number' && Number.isFinite(saved.crossfadeDuration)
        && saved.crossfadeDuration >= 1 && saved.crossfadeDuration <= 6
        ? saved.crossfadeDuration : defaults.crossfadeDuration,
    };
  } catch {
    return defaults;
  }
}

export function AudioSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AudioSettings>(loadSettings);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(settings));
    } catch {
      // Playback settings still apply for this session when storage is unavailable.
    }
  }, [settings]);

  return (
    <AudioSettingsContext.Provider value={{
      ...settings,
      setSeamlessPreload: value => setSettings(previous => ({ ...previous, seamlessPreload: value })),
      setTransitionMode: value => setSettings(previous => ({ ...previous, transitionMode: value })),
      setCrossfadeDuration: value => {
        if (Number.isFinite(value) && value >= 1 && value <= 6) {
          setSettings(previous => ({ ...previous, crossfadeDuration: value }));
        }
      },
    }}>
      {children}
    </AudioSettingsContext.Provider>
  );
}

export function useAudioSettings() {
  const context = useContext(AudioSettingsContext);
  if (!context) throw new Error('useAudioSettings must be used within an AudioSettingsProvider');
  return context;
}
