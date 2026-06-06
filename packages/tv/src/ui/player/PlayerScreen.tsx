import React, { useEffect } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import type { BufferProfile } from '@iptv-player/core';
import { useRnVideoController } from '../../playback/RnVideoController';
import { BufferHealthBadge } from './BufferHealthBadge';

interface Props {
  streamUrl: string;
  bufferProfile?: BufferProfile;
  onBack?: () => void;
}

export function PlayerScreen({
  streamUrl,
  bufferProfile = { kind: 'aggressive' },
  onBack,
}: Props): React.ReactElement {
  const { controller, VideoComponent } = useRnVideoController();

  useEffect(() => {
    controller.load(streamUrl, bufferProfile);
    return () => {
      controller.dispose();
    };
  }, [streamUrl]);

  useEffect(() => {
    if (!onBack) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

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
