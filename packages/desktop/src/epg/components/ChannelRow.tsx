import React from 'react';
import type { ChannelEntry } from '../types';

interface Props {
  entry: ChannelEntry;
  isActive: boolean;
  onClick: () => void;
}

export function ChannelRow({ entry, isActive, onClick }: Props): React.ReactElement {
  const { m3uChannel, nowNext } = entry;
  return (
    <div
      onClick={onClick}
      style={{
        padding: '10px 14px',
        borderBottom: '1px solid #222',
        backgroundColor: isActive ? '#e50914' : '#1a1a1a',
        cursor: 'pointer',
      }}
    >
      <div style={{ color: '#fff', fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {m3uChannel.name}
      </div>
      {nowNext.now && (
        <div style={{ color: '#aaa', fontSize: 12, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          ▶ {nowNext.now.title}
        </div>
      )}
      {nowNext.next && (
        <div style={{ color: '#555', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          → {nowNext.next.title}
        </div>
      )}
    </div>
  );
}
