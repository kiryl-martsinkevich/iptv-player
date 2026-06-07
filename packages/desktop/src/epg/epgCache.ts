import {
  deserializeEpg,
  serializeEpg,
  type EpgData,
  type M3uChannel,
} from '@iptv-player/core';

interface CachedData {
  m3uUrl: string;
  m3uChannels: M3uChannel[];
  epgSnapshot: ReturnType<typeof serializeEpg> | null;
  cachedAt: string;
}

const CACHE_PREFIX = 'iptv-epg-cache:';

function cacheKey(m3uUrl: string): string {
  return CACHE_PREFIX + m3uUrl;
}

export function loadFromCache(m3uUrl: string): CachedData | null {
  try {
    const raw = localStorage.getItem(cacheKey(m3uUrl));
    if (!raw) return null;
    const data = JSON.parse(raw) as CachedData;
    if (data.m3uUrl !== m3uUrl) return null;
    return data;
  } catch {
    return null;
  }
}

export function saveToCache(
  m3uUrl: string,
  m3uChannels: M3uChannel[],
  epgData: EpgData | null,
): void {
  try {
    const data: CachedData = {
      m3uUrl,
      m3uChannels,
      epgSnapshot: epgData ? serializeEpg(epgData) : null,
      cachedAt: new Date().toISOString(),
    };
    localStorage.setItem(cacheKey(m3uUrl), JSON.stringify(data));
  } catch {
    // localStorage quota exceeded — ignore
  }
}

export function restoreEpgData(cached: CachedData): EpgData | null {
  if (!cached.epgSnapshot) return null;
  try {
    return deserializeEpg(cached.epgSnapshot).result;
  } catch {
    return null;
  }
}
