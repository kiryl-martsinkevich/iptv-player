import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { PlayerScreen } from './ui/player/PlayerScreen';

// Demo HLS stream — replace with a real channel URL from the user's M3U source.
const DEMO_URL = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';

export function App(): React.ReactElement {
  const [started, setStarted] = useState(false);

  if (started) {
    return <PlayerScreen streamUrl={DEMO_URL} />;
  }

  return (
    <View style={styles.splash}>
      <Text style={styles.title}>IPTV Player</Text>
      <TouchableOpacity style={styles.button} onPress={() => setStarted(true)}>
        <Text style={styles.buttonText}>Play Demo Stream</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
  },
  title: {
    color: '#fff',
    fontSize: 52,
    fontWeight: '700',
    letterSpacing: 1,
  },
  button: {
    backgroundColor: '#e50914',
    paddingHorizontal: 48,
    paddingVertical: 18,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '600',
  },
});
