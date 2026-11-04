import { useEffect } from "react";

export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

type Handler = (e: KeyboardEvent) => void;

/**
 * Single-key shortcuts ("j", "k", "/", "enter", "e") ignore keystrokes while a field has focus.
 * "mod+k" fires everywhere.
 */
export function useHotkeys(map: Record<string, Handler>, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const combo = mod ? `mod+${key}` : key;
      const handler = map[combo];
      if (!handler) return;
      if (!mod && (isTyping(e.target) || e.altKey)) return;
      if (!mod && document.querySelector("[role=dialog]")) return;
      e.preventDefault();
      handler(e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [map, enabled]);
}
