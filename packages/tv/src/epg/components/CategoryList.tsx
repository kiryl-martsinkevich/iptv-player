import React, { useState } from 'react';
import { Pressable, SectionList, StyleSheet, Text } from 'react-native';
import type { ChannelEntry } from '../types';
import { ChannelRow } from './ChannelRow';

interface CategorySection {
  title: string;
  data: ChannelEntry[];
}

interface Props {
  entries: ChannelEntry[];
  selectedUrl: string | null;
  onSelect: (entry: ChannelEntry) => void;
  onLongPress?: (entry: ChannelEntry) => void;
}

export function CategoryList({ entries, selectedUrl, onSelect, onLongPress }: Props): React.ReactElement {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const sections: CategorySection[] = (() => {
    const map = new Map<string, ChannelEntry[]>();
    for (const e of entries) {
      const cat = e.m3uChannel.groupTitle || 'Uncategorized';
      const list = map.get(cat);
      if (list) {
        list.push(e);
      } else {
        map.set(cat, [e]);
      }
    }
    return [...map.entries()].map(([title, data]) => ({ title, data }));
  })();

  const toggleCollapse = (cat: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  return (
    <SectionList
      style={styles.list}
      sections={sections}
      keyExtractor={item => item.m3uChannel.url}
      renderSectionHeader={({ section }) => (
        <Pressable
          style={styles.header}
          onPress={() => toggleCollapse(section.title)}
        >
          <Text style={styles.headerText}>{section.title}</Text>
          <Text style={styles.headerCount}>{section.data.length}</Text>
        </Pressable>
      )}
      renderItem={({ item, section }) => {
        if (collapsed.has(section.title)) return null;
        return (
          <ChannelRow
            entry={item}
            isSelected={item.m3uChannel.url === selectedUrl}
            onSelect={() => onSelect(item)}
            onLongPress={onLongPress ? () => onLongPress(item) : undefined}
          />
        );
      }}
      stickySectionHeadersEnabled={false}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#222',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerText: {
    color: '#aaa',
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  headerCount: {
    color: '#666',
    fontSize: 13,
  },
});
