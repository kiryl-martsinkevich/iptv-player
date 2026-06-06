import React, { useState } from 'react';
import { useHlsJsController } from '../playback/HlsJsController';
import { BufferHealthBadge } from '../ui/player/BufferHealthBadge';
import type { ChannelEntry } from './types';
import { ChannelList } from './components/ChannelList';
import { EpgGrid } from './components/EpgGrid';
import { useEpgData } from './useEpgData';

interface Props {
  m3uUrl: string;
  xmltvUrl: string;
}

export function EpgPage({ m3uUrl, xmltvUrl }: Props): React.ReactElement {
  const { channels, status, error } = useEpgData(m3uUrl, xmltvUrl);
  const { controller, VideoComponent } = useHlsJsController();
  const [activeUrl, setActiveUrl] = useState<string | null>(null);

  const handleSelect = (entry: ChannelEntry) => {
    setActiveUrl(entry.m3uChannel.url);
    controller.load(entry.m3uChannel.url, { kind: 'aggressive' });
  };

  return (
    <div style={{ display: 'flex', height: '100%', background: '#111', overflow: 'hidden' }}>
      {/* Left sidebar: channel list */}
      {status === 'loading' ? (
        <div style={{ width: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: 13 }}>
          Loading…
        </div>
      ) : status === 'error' ? (
        <div style={{ width: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e50914', fontSize: 13, padding: 16 }}>
          {error}
        </div>
      ) : (
        <ChannelList entries={channels} activeUrl={activeUrl} onSelect={handleSelect} />
      )}

      {/* Right area: player + grid */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Player */}
        <div style={{ position: 'relative', height: '55%', flexShrink: 0, background: '#000' }}>
          {VideoComponent}
          <BufferHealthBadge status={controller.status} />
        </div>

        {/* EPG grid */}
        <div style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid #222' }}>
          <EpgGrid entries={channels} />
        </div>
      </div>
    </div>
  );
}
