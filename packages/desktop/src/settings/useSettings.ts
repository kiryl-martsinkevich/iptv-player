import { useState, useCallback, useEffect, useRef } from 'react';
import { type AppSettings, DEFAULT_SETTINGS, mergeSettings } from '@iptv-player/core';

const STORAGE_KEY = 'iptv-player-settings';

function load(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return mergeSettings(JSON.parse(raw) as Partial<AppSettings>);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useSettings(): {
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
} {
  const [settings, setSettings] = useState<AppSettings>(load);

  // Defer localStorage writes to avoid blocking renders.
  // Writing synchronously inside setState updaters causes visible jank
  // during playback because JSON.stringify + setItem block the main thread
  // long enough to drop video frames.
  const pendingRef = useRef<AppSettings | null>(null);

  useEffect(() => {
    if (!pendingRef.current) return;
    const s = pendingRef.current;
    // Defer to the next microtask so React finishes painting first
    const id = requestIdleCallback(
      () => {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* quota exceeded */ }
      },
      { timeout: 5000 },
    );
    pendingRef.current = null;
    return () => cancelIdleCallback(id);
  }, [settings]);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      pendingRef.current = next;
      return next;
    });
  }, []);

  return { settings, updateSettings };
}
