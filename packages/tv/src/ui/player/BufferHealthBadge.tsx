import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
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
    <View style={styles.overlay}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    bottom: 48,
    left: 0,
    right: 0,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.72)',
    paddingVertical: 14,
  },
  // Large text for 10-foot TV viewing distance
  text: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
