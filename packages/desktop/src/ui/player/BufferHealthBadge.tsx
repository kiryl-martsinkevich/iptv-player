import React from 'react';
import type { PlaybackStatus } from '@iptv-player/core';

interface Props {
  status: PlaybackStatus;
}

export function BufferHealthBadge({ status }: Props): React.ReactElement | null {
  let label: string | null = null;

  if (status.kind === 'loading') label = 'Loading…';
  else if (status.kind === 'buffering') label = 'Buffering…';
  else if (status.kind === 'error') label = `⚠ ${status.message}`;

  if (label === null) return null;

  return (
    <div style={overlay}>
      <span style={text}>{label}</span>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: 'absolute',
  bottom: 24,
  left: 0,
  right: 0,
  display: 'flex',
  justifyContent: 'center',
  background: 'rgba(0,0,0,0.72)',
  padding: '10px 0',
};

const text: React.CSSProperties = {
  color: '#fff',
  fontSize: 16,
  fontWeight: 600,
};
