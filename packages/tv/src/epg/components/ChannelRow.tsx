import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import type { ChannelEntry } from '../types';

interface Props {
  entry: ChannelEntry;
  isSelected: boolean;
  onSelect: () => void;
}

export function ChannelRow({ entry, isSelected, onSelect }: Props): React.ReactElement {
  const { m3uChannel, nowNext } = entry;
  return (
    <Pressable
      style={[styles.row, isSelected && styles.rowSelected]}
      onPress={onSelect}
    >
      <Text style={styles.name} numberOfLines={1}>{m3uChannel.name}</Text>
      {nowNext.now && (
        <Text style={styles.nowLabel} numberOfLines={1}>▶ {nowNext.now.title}</Text>
      )}
      {nowNext.next && (
        <Text style={styles.nextLabel} numberOfLines={1}>→ {nowNext.next.title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    backgroundColor: '#1a1a1a',
  },
  rowSelected: {
    backgroundColor: '#e50914',
  },
  name: { color: '#fff', fontSize: 22, fontWeight: '600' },
  nowLabel: { color: '#aaa', fontSize: 16, marginTop: 2 },
  nextLabel: { color: '#666', fontSize: 14 },
});
