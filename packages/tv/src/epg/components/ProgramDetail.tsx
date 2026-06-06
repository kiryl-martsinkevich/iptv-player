import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { EpgProgramme } from '@iptv-player/core';
import { formatTime } from '../types';

interface Props {
  program: EpgProgramme | null;
  onClose: () => void;
}

export function ProgramDetail({ program, onClose }: Props): React.ReactElement | null {
  if (!program) return null;
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{program.title}</Text>
          <Text style={styles.time}>
            {formatTime(program.start)} – {formatTime(program.stop)}
          </Text>
          {program.description ? (
            <Text style={styles.desc}>{program.description}</Text>
          ) : null}
          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.8)' },
  card: { width: 700, backgroundColor: '#1e1e1e', borderRadius: 12, padding: 40 },
  title: { color: '#fff', fontSize: 32, fontWeight: '700', marginBottom: 8 },
  time: { color: '#aaa', fontSize: 20, marginBottom: 16 },
  desc: { color: '#ccc', fontSize: 18, lineHeight: 26, marginBottom: 24 },
  closeBtn: { alignSelf: 'flex-end', backgroundColor: '#e50914', paddingHorizontal: 32, paddingVertical: 12, borderRadius: 8 },
  closeText: { color: '#fff', fontSize: 20, fontWeight: '600' },
});
