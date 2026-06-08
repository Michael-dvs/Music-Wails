/**
 * ContextMenuContext.tsx
 * Exposes a global `openContextMenu(x, y, song)` function
 * so any track row, anywhere in the app, can trigger the context menu
 * without prop-drilling through every page component.
 */

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { ContextMenuState, ContextMenuSongData } from '../components/ContextMenu';

interface ContextMenuContextType {
  contextMenu: ContextMenuState | null;
  openContextMenu: (x: number, y: number, song: ContextMenuSongData) => void;
  closeContextMenu: () => void;
}

const ContextMenuContext = createContext<ContextMenuContextType | null>(null);

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const openContextMenu = useCallback((x: number, y: number, song: ContextMenuSongData) => {
    setContextMenu({ x, y, song });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  return (
    <ContextMenuContext.Provider value={{ contextMenu, openContextMenu, closeContextMenu }}>
      {children}
    </ContextMenuContext.Provider>
  );
}

export function useContextMenu(): ContextMenuContextType {
  const ctx = useContext(ContextMenuContext);
  if (!ctx) throw new Error('useContextMenu must be used inside <ContextMenuProvider>');
  return ctx;
}
