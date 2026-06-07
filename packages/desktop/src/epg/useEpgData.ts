import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildEpgMapping,
  getNowNext,
  parseM3u,
  type EpgData,
  type XmltvResult,
} from '@iptv-player/core';
import type { ChannelEntry } from './types';
import { loadFromCache, restoreEpgData, saveToCache } from './epgCache';

// In plain-browser dev (no Tauri), route through the local CORS proxy.
function proxyUrl(url: string): string {
  if (typeof window !== 'undefined' && !('__TAURI__' in window)) {
    return `/__proxy__/${url}`;
  }
  return url;
}

type Status = 'idle' | 'loading' | 'ready' | 'error';

interface WorkerResponse {
  ok: boolean;
  result?: XmltvResult;
  error?: string;
}

export interface UseEpgDataResult {
  channels: ChannelEntry[];
  epgData: EpgData | null;
  epgMapping: Map<string, string> | null;
  status: Status;
  error: string | null;
  reload: () => void;
  refreshing: boolean;
}

function structuralEntries(raw: ReturnType<typeof parseM3u>): ChannelEntry[] {
  return raw.map(ch => ({
    m3uChannel: ch,
    epgChannelId: undefined,
    nowNext: {},
    programs: [],
  }));
}

/**
 * Compute Now/Next and programmes for a single channel entry from raw EPG data.
 * Called lazily by EpgPage for visible channels only.
 */
export function enrichEntry(
  entry: ChannelEntry,
  epgData: EpgData | null,
  mapping: Map<string, string> | null,
): ChannelEntry {
  if (!epgData || !mapping) return entry;
  const epgId = mapping.get(entry.m3uChannel.url);
  if (!epgId) return entry;
  const now = new Date();
  const progs = epgData.programmes
    .filter(p => p.channelId === epgId)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  return {
    ...entry,
    epgChannelId: epgId,
    nowNext: getNowNext(epgData.programmes, epgId, now),
    programs: progs,
  };
}

export function useEpgData(m3uUrl: string, xmltvUrl: string): UseEpgDataResult {
  const [channels, setChannels] = useState<ChannelEntry[]>([]);
  const [epgData, setEpgData] = useState<EpgData | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tick, setTick] = useState(0);
  const epgMappingRef = useRef<Map<string, string> | null>(null);

  const reload = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    if (!m3uUrl) return;

    let cancelled = false;
    let worker: Worker | null = null;

    // Phase 0: try cache first for instant display
    const cached = loadFromCache(m3uUrl);
    if (cached && tick === 0) {
      // tick === 0: initial mount. On explicit reload (tick > 0), skip cache.
      const restoredEpg = restoreEpgData(cached);
      epgMappingRef.current = restoredEpg
        ? buildEpgMapping(cached.m3uChannels, restoredEpg.channels)
        : null;
      setChannels(structuralEntries(cached.m3uChannels));
      if (restoredEpg) setEpgData(restoredEpg);
      setStatus('ready');

      // Now refresh from network in background
      setRefreshing(true);
    } else {
      setStatus('loading');
      setError(null);
    }

    const run = async () => {
      try {
        const [m3uText, xmltvText] = await Promise.all([
          fetch(proxyUrl(m3uUrl)).then(r => {
            if (!r.ok) throw new Error(`M3U fetch failed: ${r.status}`);
            return r.text();
          }),
          xmltvUrl
            ? fetch(proxyUrl(xmltvUrl)).then(r => {
                if (!r.ok) throw new Error(`XMLTV fetch failed: ${r.status}`);
                return r.text();
              })
            : Promise.resolve(null),
        ]);

        if (cancelled) return;

        // Parse M3U — typically fast enough for main thread, but if there was
        // a cache hit the UI is already interactive so this is non-blocking.
        const m3uChannels = parseM3u(m3uText);

        // Phase 1: structural entries immediately
        setChannels(structuralEntries(m3uChannels));
        if (cached) {
          // Already had cached data; just updating. Stay 'ready'.
          setRefreshing(true);
        } else {
          setStatus('ready');
        }

        if (xmltvText) {
          worker = new Worker(new URL('./workers/XmltvWorker.ts', import.meta.url), { type: 'module' });
          worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
            if (cancelled) return;
            worker?.terminate();
            if (!e.data.ok || !e.data.result) {
              if (!cached) {
                setError(e.data.error ?? 'XMLTV parse error');
                setStatus('error');
              }
              setRefreshing(false);
              return;
            }
            const xmltvResult = e.data.result;
            const data: EpgData = {
              channels: xmltvResult.channels.map(c => ({
                id: c.id,
                displayName: c.displayName,
                iconUrl: c.iconUrl,
              })),
              programmes: xmltvResult.programmes,
            };
            epgMappingRef.current = buildEpgMapping(m3uChannels, data.channels);
            setEpgData(data);
            setRefreshing(false);

            // Persist to cache for next launch
            saveToCache(m3uUrl, m3uChannels, data);
          };
          worker.onerror = () => {
            if (cancelled) return;
            if (!cached) {
              setError('Worker error during XMLTV parse');
              setStatus('error');
            }
            setRefreshing(false);
            worker?.terminate();
          };
          worker.postMessage({ xmltvText });
        } else {
          setRefreshing(false);
          // No XMLTV — still cache the M3U channels
          saveToCache(m3uUrl, m3uChannels, null);
        }
      } catch (err) {
        if (!cancelled) {
          if (!cached) {
            setError(err instanceof Error ? err.message : 'Load error');
            setStatus('error');
          }
          setRefreshing(false);
        }
      }
    };

    run();
    return () => {
      cancelled = true;
      worker?.terminate();
    };
  }, [m3uUrl, xmltvUrl, tick]);

  return { channels, epgData, epgMapping: epgMappingRef.current, status, error, reload, refreshing };
}
