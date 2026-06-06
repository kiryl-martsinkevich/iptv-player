import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { type AppSettings, type BufferProfile } from '@iptv-player/core';

interface Props {
  visible: boolean;
  settings: AppSettings;
  onSave: (patch: Partial<AppSettings>) => void;
  onClose: () => void;
}

type NamedProfile = Exclude<BufferProfile['kind'], 'custom'>;

const PROFILES: { kind: NamedProfile; label: string; desc: string }[] = [
  { kind: 'conservative', label: 'Conservative', desc: '30 s — less memory, faster start' },
  { kind: 'balanced', label: 'Balanced', desc: '60 s — good for most connections' },
  { kind: 'aggressive', label: 'Aggressive', desc: '120 s — best for slow or unreliable streams' },
];

export function SettingsModal({ visible, settings, onSave, onClose }: Props): React.ReactElement {
  const [m3uUrl, setM3uUrl] = useState(settings.m3uUrl);
  const [xmltvUrl, setXmltvUrl] = useState(settings.xmltvUrl);
  const [bufferProfile, setBufferProfile] = useState<BufferProfile>(settings.bufferProfile);

  useEffect(() => {
    if (visible) {
      setM3uUrl(settings.m3uUrl);
      setXmltvUrl(settings.xmltvUrl);
      setBufferProfile(settings.bufferProfile);
    }
  }, [visible]);

  const handleSave = () => {
    onSave({ m3uUrl, xmltvUrl, bufferProfile });
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <ScrollView style={styles.panel} contentContainerStyle={styles.content}>
          <Text style={styles.heading}>Settings</Text>

          <Text style={styles.sectionTitle}>Sources</Text>
          <Text style={styles.label}>M3U URL</Text>
          <TextInput
            style={styles.input}
            value={m3uUrl}
            onChangeText={setM3uUrl}
            placeholder="https://example.com/playlist.m3u"
            placeholderTextColor="#555"
            autoCapitalize="none"
          />
          <Text style={styles.label}>XMLTV URL (optional)</Text>
          <TextInput
            style={styles.input}
            value={xmltvUrl}
            onChangeText={setXmltvUrl}
            placeholder="https://example.com/epg.xml"
            placeholderTextColor="#555"
            autoCapitalize="none"
          />

          <Text style={styles.sectionTitle}>Buffer Profile</Text>
          {PROFILES.map(p => (
            <TouchableOpacity
              key={p.kind}
              style={[styles.profileRow, bufferProfile.kind === p.kind && styles.profileRowActive]}
              onPress={() => setBufferProfile({ kind: p.kind })}
            >
              <Text style={styles.profileLabel}>{p.label}</Text>
              <Text style={styles.profileDesc}>{p.desc}</Text>
            </TouchableOpacity>
          ))}

          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center' },
  panel: { width: 600, maxHeight: '80%', backgroundColor: '#1a1a1a', borderRadius: 12, borderWidth: 1, borderColor: '#333' },
  content: { padding: 36 },
  heading: { color: '#fff', fontSize: 34, fontWeight: '700', marginBottom: 28 },
  sectionTitle: { color: '#aaa', fontSize: 16, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginTop: 20, marginBottom: 12 },
  label: { color: '#ccc', fontSize: 18, marginBottom: 8 },
  input: { backgroundColor: '#222', color: '#fff', fontSize: 18, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 16, borderWidth: 1, borderColor: '#333' },
  profileRow: { padding: 16, borderRadius: 8, borderWidth: 1, borderColor: '#333', marginBottom: 8 },
  profileRowActive: { borderColor: '#e50914', backgroundColor: 'rgba(229,9,20,0.1)' },
  profileLabel: { color: '#fff', fontSize: 20, fontWeight: '600' },
  profileDesc: { color: '#888', fontSize: 16, marginTop: 4 },
  btnRow: { flexDirection: 'row', gap: 12, marginTop: 28 },
  cancelBtn: { flex: 1, borderRadius: 8, borderWidth: 1, borderColor: '#555', paddingVertical: 16, alignItems: 'center' },
  cancelBtnText: { color: '#aaa', fontSize: 20, fontWeight: '600' },
  saveBtn: { flex: 1, backgroundColor: '#e50914', borderRadius: 8, paddingVertical: 16, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 20, fontWeight: '600' },
});
