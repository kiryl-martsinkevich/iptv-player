import React, { useEffect } from 'react';
import type { BufferProfile } from '@iptv-player/core';
import { useHlsJsController } from '../../playback/HlsJsController';
import { BufferHealthBadge } from './BufferHealthBadge';

interface Props {
  streamUrl: string;
  bufferProfile?: BufferProfile;
}

export function PlayerPage({
  streamUrl,
  bufferProfile = { kind: 'aggressive' },
}: Props): React.ReactElement {
  const { controller, VideoComponent } = useHlsJsController();

  useEffect(() => {
    controller.load(streamUrl, bufferProfile);
    return () => {
      controller.dispose();
    };
    // Re-load when the stream URL changes; bufferProfile intentionally excluded.
  }, [streamUrl]);

  return (
    <div style={{ flex: 1, position: 'relative', background: '#000', width: '100%', height: '100%' }}>
      {VideoComponent}
      <BufferHealthBadge status={controller.status} />
    </div>
  );
}
