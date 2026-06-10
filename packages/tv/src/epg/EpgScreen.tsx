import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { findFavouriteIndex, matchFavouriteUrls, type AppSettings } from '@iptv-player/core';
import { PlayerScreen } from '../ui/player/PlayerScreen';
import { ChannelList } from './components/ChannelList';
import { CategoryList } from './components/CategoryList';
import { ChannelContextMenu } from './components/ChannelContextMenu';
import { ChannelTabs } from './components/ChannelTabs';
import { EpgGrid } from './components/EpgGrid';
import type { ChannelEntry } from './types';
import { enrichEntry, useEpgData } from './useEpgData';

type Tab = 'favourites' | 'categories';

interface Props {
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
}

export function EpgScreen({ settings, updateSettings }: Props): React.ReactElement {
  const { m3uUrl, xmltvUrl, bufferProfile } = settings;
  const { channels, epgData, epgMapping, programmesById, status, error } = useEpgData(m3uUrl, xmltvUrl);
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('favourites');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const onSearchChange = (value: string) => {
    setSearchInput(value);
    if (searchTimerRef.current !== undefined) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setSearchQuery(value), 200);
  };
  useEffect(
    () => () => {
      if (searchTimerRef.current !== undefined) clearTimeout(searchTimerRef.current);
    },
    [],
  );

  const [contextEntry, setContextEntry] = useState<ChannelEntry | null>(null);

  const favourites = useMemo(
    () => matchFavouriteUrls(settings.favouriteUrls, settings.favouriteNames, channels.map(c => c.m3uChannel)),
    [settings.favouriteUrls, settings.favouriteNames, channels],
  );

  const displayChannels = useMemo(() => {
    let filtered: ChannelEntry[];
    if (activeTab === 'favourites') {
      filtered = channels.filter(c => favourites.has(c.m3uChannel.url));
    } else {
      filtered = channels;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter(c => c.m3uChannel.name.toLowerCase().includes(q));
    }
    return filtered.map(e => enrichEntry(e, epgData, epgMapping, programmesById));
  }, [channels, activeTab, searchQuery, favourites, epgData, epgMapping, programmesById]);

  const handleSelect = (entry: ChannelEntry) => {
    setActiveUrl(entry.m3uChannel.url);
  };

  const toggleFavourite = (entry: ChannelEntry) => {
    const { url, name } = entry.m3uChannel;
    const idx = findFavouriteIndex({ url, name }, settings.favouriteUrls, settings.favouriteNames);
    if (idx >= 0) {
      updateSettings({
        favouriteUrls: settings.favouriteUrls.filter((_, i) => i !== idx),
        favouriteNames: settings.favouriteNames.filter((_, i) => i !== idx),
      });
    } else {
      updateSettings({
        favouriteUrls: [...settings.favouriteUrls, url],
        favouriteNames: [...settings.favouriteNames, name],
      });
    }
  };

  if (activeUrl) {
    return (
      <PlayerScreen
        streamUrl={activeUrl}
        bufferProfile={bufferProfile}
        onBack={() => setActiveUrl(null)}
      />
    );
  }

  if (status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#e50914" />
        <Text style={styles.msg}>Loading EPG…</Text>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.err}>{error ?? 'Unknown error'}</Text>
      </View>
    );
  }

  return (
    <View style={styles.layout}>
      <View style={styles.sidebar}>
        <ChannelTabs
          activeTab={activeTab}
          onTabChange={setActiveTab}
          searchQuery={searchInput}
          onSearchChange={onSearchChange}
          favouriteCount={favourites.size}
        />
        {activeTab === 'favourites' && displayChannels.length === 0 ? (
          <View style={styles.emptyHint}>
            <Text style={styles.emptyText}>
              No favourites yet.{'\n'}Long-press a channel{'\n'}to add it to Favourites.
            </Text>
          </View>
        ) : activeTab === 'categories' ? (
          <CategoryList
            entries={displayChannels}
            selectedUrl={null}
            onSelect={handleSelect}
            onLongPress={entry => setContextEntry(entry)}
          />
        ) : (
          <ChannelList
            entries={displayChannels}
            selectedUrl={null}
            onSelect={handleSelect}
            onLongPress={entry => setContextEntry(entry)}
          />
        )}
      </View>
      <EpgGrid entries={displayChannels} selectedUrl={null} />

      <ChannelContextMenu
        visible={contextEntry !== null}
        entry={contextEntry}
        isFavourite={contextEntry ? favourites.has(contextEntry.m3uChannel.url) : false}
        onPlay={handleSelect}
        onToggleFavourite={toggleFavourite}
        onClose={() => setContextEntry(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  layout: { flex: 1, flexDirection: 'row', backgroundColor: '#111' },
  sidebar: { width: 340, borderRightWidth: 1, borderRightColor: '#222' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111' },
  msg: { color: '#ccc', fontSize: 24, marginTop: 16 },
  err: { color: '#e50914', fontSize: 20 },
  emptyHint: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyText: {
    color: '#666',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
});
