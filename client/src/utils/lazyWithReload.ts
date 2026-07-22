import { ComponentType, lazy, LazyExoticComponent } from 'react';

const RELOAD_KEY = 'spin-master:chunk-reload-at';
const RELOAD_COOLDOWN_MS = 10_000;

function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /Failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    /Loading chunk [\d]+ failed/i.test(message)
  );
}

/** Reload once after a deploy invalidates hashed lazy chunks; avoid loops with a short cooldown. */
export function reloadForStaleChunk(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || '0');
    const now = Date.now();
    if (now - last < RELOAD_COOLDOWN_MS) {
      return false;
    }
    sessionStorage.setItem(RELOAD_KEY, String(now));
  } catch {
    // sessionStorage unavailable — still attempt reload
  }
  window.location.reload();
  return true;
}

export function isStaleChunkError(error: unknown): boolean {
  return isChunkLoadError(error);
}

/**
 * Like React.lazy, but on missing/stale deploy chunks reloads the page once
 * so the browser picks up the new index.html asset map.
 */
export function lazyWithReload<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await factory();
    } catch (error) {
      if (isChunkLoadError(error) && reloadForStaleChunk()) {
        // Hang until reload completes so ErrorBoundary does not flash.
        return new Promise(() => {});
      }
      throw error;
    }
  });
}
