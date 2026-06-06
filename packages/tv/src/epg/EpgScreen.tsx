import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { type BufferProfile } from '@iptv-player/core';
import { PlayerScreen } from '../ui/player/PlayerScreen';
import { ChannelList } from './components/ChannelList';
import { EpgGrid } from './components/EpgGrid';
import type { ChannelEntry } from './types';
import { useEpgData } from './useEpgData';

interface Props {
  m3uUrl: string;
  xmltvUrl: string;
  bufferProfile: BufferProfile;
}

export function EpgScreen({ m3uUrl, xmltvUrl, bufferProfile }: Props): React.ReactElement {
  const { channels, status, error } = useEpgData(m3uUrl, xmltvUrl);
  const [activeChannel, setActiveChannel] = useState<ChannelEntry | null>(null);

  if (activeChannel) {
    return (
      <PlayerScreen
        streamUrl={activeChannel.m3uChannel.url}
        bufferProfile={bufferProfile}
        onBack={() => setActiveChannel(null)}
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
      <ChannelList
        entries={channels}
        selectedUrl={null}
        onSelect={setActiveChannel}
      />
      <EpgGrid entries={channels} />
    </View>
  );
}

const styles = StyleSheet.create({
  layout: { flex: 1, flexDirection: 'row', backgroundColor: '#111' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111' },
  msg: { color: '#ccc', fontSize: 24, marginTop: 16 },
  err: { color: '#e50914', fontSize: 20 },
});
