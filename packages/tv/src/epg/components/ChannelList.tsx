import React from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import type { ChannelEntry } from '../types';
import { ChannelRow } from './ChannelRow';

interface Props {
  entries: ChannelEntry[];
  selectedUrl: string | null;
  onSelect: (entry: ChannelEntry) => void;
}

export function ChannelList({ entries, selectedUrl, onSelect }: Props): React.ReactElement {
  return (
    <View style={styles.container}>
      <FlatList
        data={entries}
        keyExtractor={item => item.m3uChannel.url}
        renderItem={({ item }) => (
          <ChannelRow
            entry={item}
            isSelected={item.m3uChannel.url === selectedUrl}
            onSelect={() => onSelect(item)}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: 340, borderRightWidth: 1, borderRightColor: '#222' },
});
