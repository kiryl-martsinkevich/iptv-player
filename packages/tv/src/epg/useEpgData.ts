import { useCallback, useEffect, useRef, useState } from 'react';
import { InteractionManager } from 'react-native';
import {
  buildEpgMapping,
  getNowNext,
  parseM3u,
  parseXmltv,
  type EpgData,
} from '@iptv-player/core';
import type { ChannelEntry } from './types';

type Status = 'idle' | 'loading' | 'ready' | 'error';

export interface UseEpgDataResult {
  channels: ChannelEntry[];
  epgData: EpgData | null;
  status: Status;
  error: string | null;
  reload: () => void;
}

export function useEpgData(m3uUrl: string, xmltvUrl: string): UseEpgDataResult {
  const [channels, setChannels] = useState<ChannelEntry[]>([]);
  const [epgData, setEpgData] = useState<EpgData | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const reloadKey = useRef(0);
  const [tick, setTick] = useState(0);

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

        if (xmltvText) {
          // Defer XMLTV parsing off the interaction/animation frame.
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
              const mapping = buildEpgMapping(m3uChannels, data.channels);
              const now = new Date();
              const entries: ChannelEntry[] = m3uChannels.map(ch => {
                const epgId = mapping.get(ch.url);
                const progs = epgId
                  ? data.programmes
                      .filter(p => p.channelId === epgId)
                      .sort((a, b) => a.start.getTime() - b.start.getTime())
                  : [];
                return {
                  m3uChannel: ch,
                  epgChannelId: epgId,
                  nowNext: epgId ? getNowNext(data.programmes, epgId, now) : {},
                  programs: progs,
                };
              });
              setEpgData(data);
              setChannels(entries);
              setStatus('ready');
            } catch (err) {
              setError(err instanceof Error ? err.message : 'EPG parse error');
              setStatus('error');
            }
          });
        } else {
          // No XMLTV — just M3U channels, no EPG data
          const entries: ChannelEntry[] = m3uChannels.map(ch => ({
            m3uChannel: ch,
            epgChannelId: undefined,
            nowNext: {},
            programs: [],
          }));
          setChannels(entries);
          setEpgData(null);
          setStatus('ready');
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

  return { channels, epgData, status, error, reload };
}
