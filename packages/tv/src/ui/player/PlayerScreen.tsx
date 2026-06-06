import React, { useCallback, useEffect, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
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
  const [volume, setVolume] = useState(1);

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

  const adjustVolume = useCallback((delta: number) => {
    setVolume(prev => {
      const next = Math.max(0, Math.min(1, +(prev + delta).toFixed(1)));
      controller.setVolume(next);
      return next;
    });
  }, [controller]);

  return (
    <View style={styles.container}>
      {VideoComponent}
      <BufferHealthBadge status={controller.status} />
      <View style={styles.volumeBar}>
        <Pressable style={styles.volBtn} onPress={() => adjustVolume(-0.1)}>
          <Text style={styles.volBtnText}>🔉</Text>
        </Pressable>
        <View style={styles.volTrack}>
          <View style={[styles.volFill, { width: `${volume * 100}%` }]} />
        </View>
        <Text style={styles.volLabel}>{Math.round(volume * 100)}%</Text>
        <Pressable style={styles.volBtn} onPress={() => adjustVolume(+0.1)}>
          <Text style={styles.volBtnText}>🔊</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  volumeBar: {
    position: 'absolute',
    bottom: 16,
    left: 24,
    right: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  volBtn: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  volBtnText: {
    fontSize: 22,
  },
  volTrack: {
    flex: 1,
    height: 6,
    backgroundColor: '#333',
    borderRadius: 3,
  },
  volFill: {
    height: 6,
    backgroundColor: '#e50914',
    borderRadius: 3,
  },
  volLabel: {
    color: '#aaa',
    fontSize: 15,
    fontWeight: '600',
    minWidth: 40,
    textAlign: 'right',
  },
});
