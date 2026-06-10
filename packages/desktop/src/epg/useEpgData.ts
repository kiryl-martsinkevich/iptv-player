import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildEpgMapping,
  getNowNext,
  parseM3u,
  type EpgData,
  type EpgProgramme,
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
  /** Pre-indexed programmes by EPG channel id — O(1) lookup in enrichEntry. */
  programmesById: Map<string, EpgProgramme[]> | null;
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
 *
 * Uses `programmesById` (pre-indexed Map<epgId, EpgProgramme[]>) for O(1) lookup.
 * Falls back to full-programme scan if index is null (before XMLTV arrives).
 */
export function enrichEntry(
  entry: ChannelEntry,
  epgData: EpgData | null,
  mapping: Map<string, string> | null,
  programmesById: Map<string, EpgProgramme[]> | null,
): ChannelEntry {
  if (!epgData || !mapping) return entry;
  const epgId = mapping.get(entry.m3uChannel.url);
  if (!epgId) return entry;
  const now = new Date();

  // O(1) lookup via pre-built index; fall back to filter if index unavailable
  const progs = programmesById
    ? (programmesById.get(epgId) ?? [])
    : epgData.programmes
        .filter(p => p.channelId === epgId)
        .sort((a, b) => a.start.getTime() - b.start.getTime());

  return {
    ...entry,
    epgChannelId: epgId,
    // progs is already this channel's sorted programme list — passing it
    // avoids getNowNext re-scanning the full programme array per channel.
    nowNext: getNowNext(progs, epgId, now),
    programs: progs,
  };
}

/** Build a channelId → sorted programmes index for O(1) enrichEntry lookups. */
function indexProgrammes(programmes: EpgProgramme[]): Map<string, EpgProgramme[]> {
  const map = new Map<string, EpgProgramme[]>();
  for (const p of programmes) {
    const list = map.get(p.channelId);
    if (list) {
      list.push(p);
    } else {
      map.set(p.channelId, [p]);
    }
  }
  // Sort each channel's programmes by start time once
  for (const list of map.values()) {
    list.sort((a, b) => a.start.getTime() - b.start.getTime());
  }
  return map;
}

export function useEpgData(m3uUrl: string, xmltvUrl: string): UseEpgDataResult {
  const [channels, setChannels] = useState<ChannelEntry[]>([]);
  const [epgData, setEpgData] = useState<EpgData | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tick, setTick] = useState(0);
  const epgMappingRef = useRef<Map<string, string> | null>(null);
  const programmesByIdRef = useRef<Map<string, EpgProgramme[]> | null>(null);

  const reload = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    if (!m3uUrl) return;

    let cancelled = false;
    let worker: Worker | null = null;

    // Phase 0: try cache first for instant display.
    // Only on initial mount (tick === 0): an explicit reload must hit the
    // network and surface its errors, so it must not count as a cache hit.
    const cached = tick === 0 ? loadFromCache(m3uUrl) : null;
    if (cached) {
      const restoredEpg = restoreEpgData(cached);
      epgMappingRef.current = restoredEpg
        ? buildEpgMapping(cached.m3uChannels, restoredEpg.channels)
        : null;
      programmesByIdRef.current = restoredEpg
        ? indexProgrammes(restoredEpg.programmes)
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
            programmesByIdRef.current = indexProgrammes(data.programmes);
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

  return { channels, epgData, epgMapping: epgMappingRef.current, programmesById: programmesByIdRef.current, status, error, reload, refreshing };
}
