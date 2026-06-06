import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { EpgScreen } from './epg/EpgScreen';
import { useSettings } from './settings/useSettings';
import { SettingsModal } from './settings/SettingsModal';

export function App(): React.ReactElement {
  const { settings, updateSettings, loading } = useSettings();
  const [showSettings, setShowSettings] = useState(false);
  const [m3uInput, setM3uInput] = useState('');
  const [xmltvInput, setXmltvInput] = useState('');

  // Pre-fill inputs once settings load from AsyncStorage
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!loading && !initializedRef.current) {
      initializedRef.current = true;
      setM3uInput(settings.m3uUrl);
      setXmltvInput(settings.xmltvUrl);
    }
  }, [loading, settings.m3uUrl, settings.xmltvUrl]);

  // Reset inputs when URL is cleared (e.g., from SettingsModal)
  useEffect(() => {
    if (!settings.m3uUrl) {
      setM3uInput('');
      setXmltvInput('');
    }
  }, [settings.m3uUrl]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#e50914" />
      </View>
    );
  }

  if (settings.m3uUrl) {
    return (
      <View style={styles.fill}>
        <EpgScreen
          m3uUrl={settings.m3uUrl}
          xmltvUrl={settings.xmltvUrl}
          bufferProfile={settings.bufferProfile}
        />
        <TouchableOpacity style={styles.gearBtn} onPress={() => setShowSettings(true)}>
          <Text style={styles.gearText}>⚙</Text>
        </TouchableOpacity>
        <SettingsModal
          visible={showSettings}
          settings={settings}
          onSave={updateSettings}
          onClose={() => setShowSettings(false)}
        />
      </View>
    );
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
        onPress={() => m3uInput && updateSettings({ m3uUrl: m3uInput, xmltvUrl: xmltvInput })}
        disabled={!m3uInput}
      >
        <Text style={styles.btnText}>Load Channels</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111' },
  setup: { flex: 1, backgroundColor: '#111', justifyContent: 'center', paddingHorizontal: 80 },
  heading: { color: '#fff', fontSize: 48, fontWeight: '700', marginBottom: 40, textAlign: 'center' },
  label: { color: '#aaa', fontSize: 22, marginBottom: 8 },
  input: {
    backgroundColor: '#222', color: '#fff', fontSize: 20, borderRadius: 8,
    paddingHorizontal: 20, paddingVertical: 14, marginBottom: 24, borderWidth: 1, borderColor: '#333',
  },
  btn: { backgroundColor: '#e50914', borderRadius: 8, paddingVertical: 18, alignItems: 'center', marginTop: 8 },
  btnDisabled: { backgroundColor: '#555' },
  btnText: { color: '#fff', fontSize: 26, fontWeight: '700' },
  gearBtn: {
    position: 'absolute', bottom: 24, right: 24,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 22, width: 44, height: 44,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#444',
  },
  gearText: { color: '#fff', fontSize: 20 },
});
