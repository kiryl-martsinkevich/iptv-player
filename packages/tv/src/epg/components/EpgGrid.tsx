import React, { useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { EpgProgramme } from '@iptv-player/core';
import type { ChannelEntry } from '../types';
import { cellLeft, cellWidth, formatTime, getGridWindow, GRID_HOURS, PX_PER_MIN } from '../types';
import { ProgramDetail } from './ProgramDetail';

interface Props {
  entries: ChannelEntry[];
  selectedUrl?: string | null;
}

const TRACK_WIDTH = GRID_HOURS * 60 * PX_PER_MIN; // 960

export function EpgGrid({ entries, selectedUrl }: Props): React.ReactElement {
  const [selected, setSelected] = useState<EpgProgramme | null>(null);
  const { start: windowStart, end: windowEnd } = getGridWindow();
  const now = new Date();

  // When a channel is selected on the left, show only that channel's timeline
  const visibleEntries = selectedUrl
    ? entries.filter(e => e.m3uChannel.url === selectedUrl)
    : entries;

  const nowLeft = cellLeft(now, windowStart);

  return (
    <View style={styles.container}>
      {/* Time header */}
      <View style={styles.headerRow}>
        <View style={styles.labelCell} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ width: TRACK_WIDTH, flexDirection: 'row' }}>
            {Array.from({ length: GRID_HOURS * 2 }).map((_, i) => {
              const t = new Date(windowStart.getTime() + i * 30 * 60 * 1000);
              return (
                <View key={i} style={{ width: 30 * PX_PER_MIN }}>
                  <Text style={styles.headerLabel}>{formatTime(t)}</Text>
                </View>
              );
            })}
          </View>
        </ScrollView>
      </View>

      {/* Channel rows */}
      <FlatList
        data={visibleEntries}
        keyExtractor={item => item.m3uChannel.url}
        renderItem={({ item }) => {
          const visible = item.programs.filter(
            p => p.stop.getTime() > windowStart.getTime() && p.start.getTime() < windowEnd.getTime(),
          );
          return (
            <View style={styles.row}>
              <View style={styles.labelCell}>
                <Text style={styles.channelName} numberOfLines={2}>{item.m3uChannel.name}</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ width: TRACK_WIDTH, height: ROW_H, position: 'relative' }}>
                  {/* Now indicator */}
                  <View style={[styles.nowLine, { left: nowLeft }]} />
                  {visible.map(prog => {
                    const left = cellLeft(prog.start, windowStart);
                    const width = cellWidth(prog.start, prog.stop, windowStart, windowEnd);
                    const isCurrent = prog.start <= now && prog.stop > now;
                    return (
                      <Pressable
                        key={prog.start.toISOString()}
                        style={[styles.cell, { left, width }, isCurrent && styles.cellCurrent]}
                        onPress={() => setSelected(prog)}
                      >
                        <Text style={styles.cellText} numberOfLines={2}>{prog.title}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
          );
        }}
      />

      <ProgramDetail program={selected} onClose={() => setSelected(null)} />
    </View>
  );
}

const ROW_H = 72;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  headerRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#333' },
  headerLabel: { color: '#888', fontSize: 14, paddingLeft: 4 },
  row: { flexDirection: 'row', height: ROW_H, borderBottomWidth: 1, borderBottomColor: '#222' },
  labelCell: { width: 160, justifyContent: 'center', paddingHorizontal: 8, backgroundColor: '#1a1a1a' },
  channelName: { color: '#ccc', fontSize: 14, fontWeight: '600' },
  nowLine: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: '#e50914', zIndex: 10 },
  cell: {
    position: 'absolute',
    top: 4,
    height: ROW_H - 8,
    backgroundColor: '#2a2a2a',
    borderRadius: 4,
    borderLeftWidth: 2,
    borderLeftColor: '#444',
    padding: 4,
    overflow: 'hidden',
  },
  cellCurrent: { backgroundColor: '#1d3a1d', borderLeftColor: '#4caf50' },
  cellText: { color: '#fff', fontSize: 13 },
});
