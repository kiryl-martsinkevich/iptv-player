import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

type Tab = 'favourites' | 'categories';

interface Props {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  favouriteCount: number;
}

export function ChannelTabs({
  activeTab,
  onTabChange,
  searchQuery,
  onSearchChange,
  favouriteCount,
}: Props): React.ReactElement {
  return (
    <View>
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search channels…"
          placeholderTextColor="#555"
          value={searchQuery}
          onChangeText={onSearchChange}
          autoCapitalize="none"
        />
      </View>
      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tab, activeTab === 'favourites' && styles.tabActive]}
          onPress={() => onTabChange('favourites')}
        >
          <Text style={[styles.tabText, activeTab === 'favourites' && styles.tabTextActive]}>
            ★ Favourites{favouriteCount > 0 ? ` (${favouriteCount})` : ''}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === 'categories' && styles.tabActive]}
          onPress={() => onTabChange('categories')}
        >
          <Text style={[styles.tabText, activeTab === 'categories' && styles.tabTextActive]}>
            📁 Categories
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  searchWrap: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  searchInput: {
    backgroundColor: '#222',
    color: '#fff',
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 18,
    borderWidth: 1,
    borderColor: '#333',
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#e50914',
  },
  tabText: {
    color: '#888',
    fontSize: 16,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#fff',
  },
});
