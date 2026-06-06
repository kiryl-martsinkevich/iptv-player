import type { BufferProfile } from '../playback/bufferProfile';

export interface AppSettings {
  m3uUrl: string;
  xmltvUrl: string;
  bufferProfile: BufferProfile;
  prefetchEnabled: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  m3uUrl: '',
  xmltvUrl: '',
  bufferProfile: { kind: 'aggressive' },
  prefetchEnabled: false,
};

export function mergeSettings(partial: Partial<AppSettings>): AppSettings {
  return { ...DEFAULT_SETTINGS, ...partial };
}
