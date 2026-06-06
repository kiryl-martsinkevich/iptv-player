import React from 'react';
import type { ChannelEntry } from '../types';
import { ChannelRow } from './ChannelRow';

interface Props {
  entries: ChannelEntry[];
  activeUrl: string | null;
  onSelect: (entry: ChannelEntry) => void;
}

export function ChannelList({ entries, activeUrl, onSelect }: Props): React.ReactElement {
  return (
    <div style={{ width: 220, overflowY: 'auto', borderRight: '1px solid #222', flexShrink: 0 }}>
      {entries.map(entry => (
        <ChannelRow
          key={entry.m3uChannel.url}
          entry={entry}
          isActive={entry.m3uChannel.url === activeUrl}
          onClick={() => onSelect(entry)}
        />
      ))}
    </div>
  );
}
