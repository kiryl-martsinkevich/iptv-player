import type { BufferProfile } from '../playback/bufferProfile';

export interface AppSettings {
  m3uUrl: string;
  xmltvUrl: string;
  bufferProfile: BufferProfile;
  prefetchEnabled: boolean;
  favouriteUrls: string[];
}

export const DEFAULT_SETTINGS: AppSettings = {
  m3uUrl: '',
  xmltvUrl: '',
  bufferProfile: { kind: 'aggressive' },
  prefetchEnabled: false,
  favouriteUrls: [],
};

export function mergeSettings(partial: Partial<AppSettings>): AppSettings {
  const bp = partial.bufferProfile ?? DEFAULT_SETTINGS.bufferProfile;
  return {
    ...DEFAULT_SETTINGS,
    ...partial,
    bufferProfile: { ...bp } as BufferProfile,
  };
}
