import type { M3uChannel } from '../parsers/m3u';

/**
 * Match stored favourite (URL, name) pairs against the current M3U channel list.
 *
 * Exact URL match first — fast, always correct when the playlist hasn't
 * changed. Falls back to case-insensitive name match so favourites survive
 * playlist refreshes where stream URLs rotate but channel names stay the same.
 */
export function matchFavouriteUrls(
  favouriteUrls: readonly string[],
  favouriteNames: readonly string[],
  m3uChannels: readonly M3uChannel[],
): Set<string> {
  const matched = new Set<string>();

  // Fast-path: URL lookup set
  const urlSet = new Set(m3uChannels.map(ch => ch.url));

  // Name → URL index for fallback
  const nameToUrl = new Map<string, string>();
  for (const ch of m3uChannels) {
    const key = normalizeName(ch.name);
    if (!nameToUrl.has(key)) {
      nameToUrl.set(key, ch.url);
    }
  }

  for (let i = 0; i < favouriteUrls.length; i++) {
    const favUrl = favouriteUrls[i];

    // Exact URL match (handles unchanged playlists)
    if (urlSet.has(favUrl)) {
      matched.add(favUrl);
      continue;
    }

    // Name-based fallback (handles rotated stream URLs)
    const favName = favouriteNames[i] ?? '';
    if (favName) {
      const key = normalizeName(favName);
      const currentUrl = nameToUrl.get(key);
      if (currentUrl) {
        matched.add(currentUrl);
      }
    }
  }

  return matched;
}

function normalizeName(s: string): string {
  return s.trim().toLowerCase();
}
