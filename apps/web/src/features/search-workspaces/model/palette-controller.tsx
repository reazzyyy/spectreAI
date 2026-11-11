"use client";

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

type PaletteControllerValue = {
  openPalette: () => void;
};

const PaletteControllerContext = createContext<PaletteControllerValue | null>(
  null,
);

export interface PaletteControllerProviderProps {
  openPalette: () => void;
  children: ReactNode;
}

/** Lets shell chrome (ProjectBar switcher) open the command palette. */
export function PaletteControllerProvider({
  openPalette,
  children,
}: PaletteControllerProviderProps) {
  const value = useMemo(() => ({ openPalette }), [openPalette]);
  return (
    <PaletteControllerContext.Provider value={value}>
      {children}
    </PaletteControllerContext.Provider>
  );
}

/** Opens global project search; no-op outside AppShell. */
export function useOpenCommandPalette(): () => void {
  return useContext(PaletteControllerContext)?.openPalette ?? (() => undefined);
}
