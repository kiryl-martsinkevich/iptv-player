import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import type { BufferProfile } from '@iptv-player/core';
import { useRnVideoController } from '../../playback/RnVideoController';
import { BufferHealthBadge } from './BufferHealthBadge';

interface Props {
  streamUrl: string;
  bufferProfile?: BufferProfile;
}

export function PlayerScreen({
  streamUrl,
  bufferProfile = { kind: 'aggressive' },
}: Props): React.ReactElement {
  const { controller, VideoComponent } = useRnVideoController();

  useEffect(() => {
    controller.load(streamUrl, bufferProfile);
    return () => {
      controller.dispose();
    };
    // Re-load when the stream URL changes; bufferProfile intentionally excluded
    // so the user can adjust it without interrupting playback.
  }, [streamUrl]);

  return (
    <View style={styles.container}>
      {VideoComponent}
      <BufferHealthBadge status={controller.status} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
});
