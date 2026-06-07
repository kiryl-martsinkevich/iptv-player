import type { BufferProfile } from '../playback/bufferProfile';

export interface AppSettings {
  m3uUrl: string;
  xmltvUrl: string;
  bufferProfile: BufferProfile;
  prefetchEnabled: boolean;
  favouriteUrls: string[];
  /** Channel names parallel to favouriteUrls — used for name-based
   *  fallback matching when playlist URLs change between sessions. */
  favouriteNames: string[];
}

export const DEFAULT_SETTINGS: AppSettings = {
  m3uUrl: '',
  xmltvUrl: '',
  bufferProfile: { kind: 'aggressive' },
  prefetchEnabled: false,
  favouriteUrls: [],
  favouriteNames: [],
};

export function mergeSettings(partial: Partial<AppSettings>): AppSettings {
  const bp = partial.bufferProfile ?? DEFAULT_SETTINGS.bufferProfile;
  return {
    ...DEFAULT_SETTINGS,
    ...partial,
    bufferProfile: { ...bp } as BufferProfile,
  };
}
