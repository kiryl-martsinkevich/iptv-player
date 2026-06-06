import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { type BufferProfile } from '@iptv-player/core';
import { PlayerScreen } from '../ui/player/PlayerScreen';
import { useSettings } from '../settings/useSettings';
import { ChannelList } from './components/ChannelList';
import { ChannelContextMenu } from './components/ChannelContextMenu';
import { ChannelTabs } from './components/ChannelTabs';
import { EpgGrid } from './components/EpgGrid';
import type { ChannelEntry } from './types';
import { enrichEntry, useEpgData } from './useEpgData';

type Tab = 'favourites' | 'categories';

interface Props {
  m3uUrl: string;
  xmltvUrl: string;
  bufferProfile: BufferProfile;
}

export function EpgScreen({ m3uUrl, xmltvUrl, bufferProfile }: Props): React.ReactElement {
  const { channels, epgData, epgMapping, status, error } = useEpgData(m3uUrl, xmltvUrl);
  const { settings, updateSettings } = useSettings();
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('favourites');
  const [searchQuery, setSearchQuery] = useState('');
  const [contextEntry, setContextEntry] = useState<ChannelEntry | null>(null);

  const favourites = useMemo(() => new Set(settings.favouriteUrls), [settings.favouriteUrls]);

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
    return filtered.map(e => enrichEntry(e, epgData, epgMapping));
  }, [channels, activeTab, searchQuery, favourites, epgData, epgMapping]);

  const handleSelect = (entry: ChannelEntry) => {
    setActiveUrl(entry.m3uChannel.url);
  };

  const toggleFavourite = (entry: ChannelEntry) => {
    const url = entry.m3uChannel.url;
    const next = favourites.has(url)
      ? settings.favouriteUrls.filter(u => u !== url)
      : [...settings.favouriteUrls, url];
    updateSettings({ favouriteUrls: next });
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
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          favouriteCount={settings.favouriteUrls.length}
        />
        {activeTab === 'favourites' && displayChannels.length === 0 ? (
          <View style={styles.emptyHint}>
            <Text style={styles.emptyText}>
              No favourites yet.{'\n'}Long-press a channel{'\n'}to add it to Favourites.
            </Text>
          </View>
        ) : (
          <ChannelList
            entries={displayChannels}
            selectedUrl={null}
            onSelect={handleSelect}
            onLongPress={entry => setContextEntry(entry)}
          />
        )}
      </View>
      <EpgGrid entries={displayChannels} />

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
