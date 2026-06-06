import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildEpgMapping,
  getNowNext,
  parseM3u,
  type EpgData,
  type XmltvResult,
} from '@iptv-player/core';
import type { ChannelEntry } from './types';

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
}

/**
 * Compute Now/Next and programmes for a single channel entry from raw EPG data.
 * Called lazily by the page for visible channels only.
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
  const [tick, setTick] = useState(0);
  const epgMappingRef = useRef<Map<string, string> | null>(null);

  const reload = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    if (!m3uUrl) return;

    let cancelled = false;
    let worker: Worker | null = null;
    setStatus('loading');
    setError(null);

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
        const m3uChannels = parseM3u(m3uText);

        // Phase 1: structural entries immediately — no EPG yet
        const structural: ChannelEntry[] = m3uChannels.map(ch => ({
          m3uChannel: ch,
          epgChannelId: undefined,
          nowNext: {},
          programs: [],
        }));
        setChannels(structural);
        setStatus('ready');

        if (xmltvText) {
          worker = new Worker(new URL('./workers/XmltvWorker.ts', import.meta.url), { type: 'module' });
          worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
            if (cancelled) return;
            worker?.terminate();
            if (!e.data.ok || !e.data.result) {
              setError(e.data.error ?? 'XMLTV parse error');
              setStatus('error');
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
          };
          worker.onerror = () => {
            if (cancelled) return;
            setError('Worker error during XMLTV parse');
            setStatus('error');
            worker?.terminate();
          };
          worker.postMessage({ xmltvText });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Load error');
          setStatus('error');
        }
      }
    };

    run();
    return () => {
      cancelled = true;
      worker?.terminate();
    };
  }, [m3uUrl, xmltvUrl, tick]);

  return { channels, epgData, epgMapping: epgMappingRef.current, status, error, reload };
}
