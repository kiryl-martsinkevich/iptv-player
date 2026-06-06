import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { type AppSettings, DEFAULT_SETTINGS, mergeSettings } from '@iptv-player/core';

const STORAGE_KEY = '@iptv-player/settings';

export function useSettings(): {
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
  loading: boolean;
} {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => {
        if (raw) setSettings(mergeSettings(JSON.parse(raw) as Partial<AppSettings>));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  return { settings, updateSettings, loading };
}
