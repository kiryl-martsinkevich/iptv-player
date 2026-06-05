interface MappableChannel {
  url: string;
  tvgId?: string;
  name: string;
}

interface MappableEpgChannel {
  id: string;
  displayName: string;
}

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

// Single-row DP Levenshtein distance, O(min(|a|,|b|)) space.
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const dp: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const val =
        a[i - 1] === b[j - 1]
          ? dp[j - 1]
          : 1 + Math.min(dp[j - 1], dp[j], prev);
      dp[j - 1] = prev;
      prev = val;
    }
    dp[b.length] = prev;
  }

  return dp[b.length];
}

/**
 * Returns Map<channelUrl, epgChannelId> using three-tier matching:
 *   1. Exact tvg-id
 *   2. Normalized display-name exact match (lowercase, strip punctuation)
 *   3. Levenshtein distance ≤ 2 fuzzy fallback
 */
export function buildEpgMapping(
  channels: ReadonlyArray<MappableChannel>,
  epgChannels: ReadonlyArray<MappableEpgChannel>,
): Map<string, string> {
  const mapping = new Map<string, string>();
  if (epgChannels.length === 0) return mapping;

  const epgById = new Map(epgChannels.map((e) => [e.id, e]));
  const epgByNorm = new Map(epgChannels.map((e) => [normalizeName(e.displayName), e.id]));

  for (const ch of channels) {
    // 1. Exact tvg-id
    if (ch.tvgId && epgById.has(ch.tvgId)) {
      mapping.set(ch.url, ch.tvgId);
      continue;
    }

    // 2. Normalized name exact
    const norm = normalizeName(ch.name);
    const exactId = epgByNorm.get(norm);
    if (exactId !== undefined) {
      mapping.set(ch.url, exactId);
      continue;
    }

    // 3. Fuzzy — pick closest within threshold
    let best: { id: string; dist: number } | null = null;
    for (const [epgNorm, epgId] of epgByNorm) {
      const dist = levenshtein(norm, epgNorm);
      if (dist <= 2 && (best === null || dist < best.dist)) {
        best = { id: epgId, dist };
      }
    }
    if (best !== null) {
      mapping.set(ch.url, best.id);
    }
  }

  return mapping;
}
