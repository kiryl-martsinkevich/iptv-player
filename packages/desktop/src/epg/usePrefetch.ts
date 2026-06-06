import { useCallback, useRef } from 'react';

function bandwidthMbps(): number {
  const nav = navigator as Navigator & { connection?: { downlink?: number } };
  return nav.connection?.downlink ?? Infinity;
}

export function usePrefetch(enabled: boolean, minBandwidthMbps: number): {
  prefetch: (url: string) => void;
} {
  const prefetched = useRef(new Set<string>());

  const prefetch = useCallback(
    (url: string) => {
      if (!enabled) return;
      if (prefetched.current.has(url)) return;
      if (bandwidthMbps() < minBandwidthMbps) return;
      prefetched.current.add(url);
      const ac = new AbortController();
      fetch(url, { method: 'GET', signal: ac.signal })
        .then(res => { ac.abort(); return res.body?.cancel(); })
        .catch(() => {});
    },
    [enabled, minBandwidthMbps],
  );

  return { prefetch };
}
