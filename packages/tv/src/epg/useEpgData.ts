import { useCallback, useEffect, useRef, useState } from 'react';
import { InteractionManager } from 'react-native';
import {
  buildEpgMapping,
  getNowNext,
  parseM3u,
  parseXmltv,
  type EpgData,
  type EpgProgramme,
} from '@iptv-player/core';
import type { ChannelEntry } from './types';

type Status = 'idle' | 'loading' | 'ready' | 'error';

export interface UseEpgDataResult {
  channels: ChannelEntry[];
  epgData: EpgData | null;
  epgMapping: Map<string, string> | null;
  /** Pre-indexed programmes by EPG channel id — O(1) lookup in enrichEntry. */
  programmesById: Map<string, EpgProgramme[]> | null;
  status: Status;
  error: string | null;
  reload: () => void;
}

/**
 * Compute Now/Next and programmes for a single entry from raw EPG data.
 * Uses the programmesById index when available; falls back to a full scan.
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
  const progs = programmesById
    ? (programmesById.get(epgId) ?? [])
    : epgData.programmes
        .filter(p => p.channelId === epgId)
        .sort((a, b) => a.start.getTime() - b.start.getTime());
  return {
    ...entry,
    epgChannelId: epgId,
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
  const reloadKey = useRef(0);
  const [tick, setTick] = useState(0);
  const epgMappingRef = useRef<Map<string, string> | null>(null);
  const programmesByIdRef = useRef<Map<string, EpgProgramme[]> | null>(null);

  const reload = useCallback(() => {
    reloadKey.current += 1;
    setTick(t => t + 1);
  }, []);

  useEffect(() => {
    if (!m3uUrl) return;

    let cancelled = false;
    setStatus('loading');
    setError(null);

    const run = async () => {
      try {
        const [m3uText, xmltvText] = await Promise.all([
          fetch(m3uUrl).then(r => {
            if (!r.ok) throw new Error(`M3U fetch failed: ${r.status}`);
            return r.text();
          }),
          xmltvUrl
            ? fetch(xmltvUrl).then(r => {
                if (!r.ok) throw new Error(`XMLTV fetch failed: ${r.status}`);
                return r.text();
              })
            : Promise.resolve(null),
        ]);

        if (cancelled) return;
        const m3uChannels = parseM3u(m3uText);

        // Phase 1: structural entries immediately
        const structural: ChannelEntry[] = m3uChannels.map(ch => ({
          m3uChannel: ch,
          epgChannelId: undefined,
          nowNext: {},
          programs: [],
        }));
        setChannels(structural);
        setStatus('ready');

        if (xmltvText) {
          InteractionManager.runAfterInteractions(() => {
            if (cancelled) return;
            try {
              const xmltvResult = parseXmltv(xmltvText);
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
            } catch (err) {
              setError(err instanceof Error ? err.message : 'EPG parse error');
              setStatus('error');
            }
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Load error');
          setStatus('error');
        }
      }
    };

    run();
    return () => { cancelled = true; };
  }, [m3uUrl, xmltvUrl, tick]);

  return { channels, epgData, epgMapping: epgMappingRef.current, programmesById: programmesByIdRef.current, status, error, reload };
}
