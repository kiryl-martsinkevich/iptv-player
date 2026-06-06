import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { EpgScreen } from './epg/EpgScreen';

interface Sources {
  m3uUrl: string;
  xmltvUrl: string;
}

export function App(): React.ReactElement {
  const [sources, setSources] = useState<Sources | null>(null);
  const [m3uInput, setM3uInput] = useState('');
  const [xmltvInput, setXmltvInput] = useState('');

  if (sources) {
    return <EpgScreen m3uUrl={sources.m3uUrl} xmltvUrl={sources.xmltvUrl} />;
  }

  return (
    <View style={styles.setup}>
      <Text style={styles.heading}>IPTV Player</Text>
      <Text style={styles.label}>M3U URL</Text>
      <TextInput
        style={styles.input}
        value={m3uInput}
        onChangeText={setM3uInput}
        placeholder="https://example.com/playlist.m3u"
        placeholderTextColor="#555"
        autoCapitalize="none"
      />
      <Text style={styles.label}>XMLTV URL (optional)</Text>
      <TextInput
        style={styles.input}
        value={xmltvInput}
        onChangeText={setXmltvInput}
        placeholder="https://example.com/epg.xml"
        placeholderTextColor="#555"
        autoCapitalize="none"
      />
      <TouchableOpacity
        style={[styles.btn, !m3uInput && styles.btnDisabled]}
        onPress={() => m3uInput && setSources({ m3uUrl: m3uInput, xmltvUrl: xmltvInput })}
        disabled={!m3uInput}
      >
        <Text style={styles.btnText}>Load Channels</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  setup: { flex: 1, backgroundColor: '#111', justifyContent: 'center', paddingHorizontal: 80 },
  heading: { color: '#fff', fontSize: 48, fontWeight: '700', marginBottom: 40, textAlign: 'center' },
  label: { color: '#aaa', fontSize: 22, marginBottom: 8 },
  input: {
    backgroundColor: '#222',
    color: '#fff',
    fontSize: 20,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#333',
  },
  btn: { backgroundColor: '#e50914', borderRadius: 8, paddingVertical: 18, alignItems: 'center', marginTop: 8 },
  btnDisabled: { backgroundColor: '#555' },
  btnText: { color: '#fff', fontSize: 26, fontWeight: '700' },
});
