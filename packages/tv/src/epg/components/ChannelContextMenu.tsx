import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ChannelEntry } from '../types';

interface Props {
  visible: boolean;
  entry: ChannelEntry | null;
  isFavourite: boolean;
  onPlay: (entry: ChannelEntry) => void;
  onToggleFavourite: (entry: ChannelEntry) => void;
  onClose: () => void;
}

export function ChannelContextMenu({
  visible,
  entry,
  isFavourite,
  onPlay,
  onToggleFavourite,
  onClose,
}: Props): React.ReactElement {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.menu}>
          {entry && (
            <>
              <Pressable
                style={styles.item}
                onPress={() => { onPlay(entry); onClose(); }}
              >
                <Text style={styles.itemText}>▶ Play</Text>
              </Pressable>
              <View style={styles.divider} />
              <Pressable
                style={styles.item}
                onPress={() => { onToggleFavourite(entry); onClose(); }}
              >
                <Text style={styles.itemText}>
                  {isFavourite ? '★ Remove from Favourites' : '☆ Add to Favourites'}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menu: {
    backgroundColor: '#222',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#444',
    minWidth: 320,
  },
  item: {
    paddingHorizontal: 28,
    paddingVertical: 22,
  },
  itemText: {
    color: '#fff',
    fontSize: 22,
  },
  divider: {
    height: 1,
    backgroundColor: '#333',
  },
});
