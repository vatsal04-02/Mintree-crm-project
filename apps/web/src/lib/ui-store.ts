import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Density = "compact" | "comfortable";
export type Locale = "en" | "hi";
export type Theme = "light" | "dark";

export interface SavedView {
  name: string;
  search: Record<string, string | number | undefined>;
  hidden: string[];
}

interface UiState {
  density: Density;
  locale: Locale;
  theme: Theme;
  paletteOpen: boolean;
  navOpen: boolean;
  stockViews: SavedView[];
  stockHidden: string[];
  setDensity: (d: Density) => void;
  setLocale: (l: Locale) => void;
  setTheme: (t: Theme) => void;
  setPaletteOpen: (open: boolean) => void;
  setNavOpen: (open: boolean) => void;
  setStockHidden: (cols: string[]) => void;
  saveStockView: (v: SavedView) => void;
  deleteStockView: (name: string) => void;
}

/** UI state only (brief §3). Server data lives in TanStack Query. */
export const useUi = create<UiState>()(
  persist(
    (set) => ({
      density: "compact",
      locale: "en",
      theme: "light",
      paletteOpen: false,
      navOpen: false,
      stockViews: [],
      stockHidden: ["bin", "value"],
      setDensity: (density) => set({ density }),
      setLocale: (locale) => set({ locale }),
      setTheme: (theme) => set({ theme }),
      setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
      setNavOpen: (navOpen) => set({ navOpen }),
      setStockHidden: (stockHidden) => set({ stockHidden }),
      saveStockView: (v) =>
        set((s) => ({ stockViews: [...s.stockViews.filter((x) => x.name !== v.name), v] })),
      deleteStockView: (name) => set((s) => ({ stockViews: s.stockViews.filter((x) => x.name !== name) })),
    }),
    {
      name: "factory-os-ui",
      partialize: (s) => ({
        density: s.density,
        locale: s.locale,
        theme: s.theme,
        stockViews: s.stockViews,
        stockHidden: s.stockHidden,
      }),
    },
  ),
);
