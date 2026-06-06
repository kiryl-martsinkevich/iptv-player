import React from 'react';
import type { ChannelEntry } from '../types';
import { ChannelRow } from './ChannelRow';

interface Props {
  entries: ChannelEntry[];
  activeUrl: string | null;
  onSelect: (entry: ChannelEntry) => void;
  onFocus?: (entry: ChannelEntry) => void;
  onContextMenu?: (entry: ChannelEntry, e: React.MouseEvent) => void;
}

export function ChannelList({ entries, activeUrl, onSelect, onFocus, onContextMenu }: Props): React.ReactElement {
  return (
    <div style={{ flex: 1, overflowY: 'auto', flexShrink: 0 }}>
      {entries.map(entry => (
        <ChannelRow
          key={entry.m3uChannel.url}
          entry={entry}
          isActive={entry.m3uChannel.url === activeUrl}
          onClick={() => onSelect(entry)}
          onMouseEnter={onFocus ? () => onFocus(entry) : undefined}
          onContextMenu={onContextMenu ? (e) => { e.preventDefault(); onContextMenu(entry, e); } : undefined}
        />
      ))}
    </div>
  );
}
