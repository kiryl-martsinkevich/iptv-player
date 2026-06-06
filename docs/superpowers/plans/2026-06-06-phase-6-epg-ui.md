# Phase 6 — EPG UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full EPG UI for both platforms: channel list with Now/Next, a 2-hour timeline grid, and a program detail overlay — all wired to the core parser/EPG model. TV uses D-pad focus; desktop uses mouse.

**Architecture:**
- `useEpgData(m3uUrl, xmltvUrl)` hook (one per platform) loads M3U + XMLTV, builds `buildEpgMapping`, pre-computes `getNowNext` + channel programs into a `ChannelEntry[]`.  
- XMLTV parsing is deferred off the main thread: **TV** uses `InteractionManager.runAfterInteractions`; **Desktop** uses a Vite module Web Worker (`XmltvWorker.ts`).  
- Grid renders a fixed 2-hour window (current hour to +2 h). Each program cell is positioned with `left = (start − windowStart) × PX_PER_MIN` and `width = duration × PX_PER_MIN` (8 px/min). Programs outside the window are clamped/hidden.  
- **TV layout:** full-screen `EpgScreen` — left `ChannelList`, right EPG grid (`FlatList` channels × horizontal `ScrollView` programs). Selecting a channel navigates to `PlayerScreen`. `ProgramDetail` is a `Modal`.  
- **Desktop layout:** `EpgPage` — left sidebar (`ChannelList`) + right area (video player on top, EPG grid on bottom). `ProgramDetail` is an absolutely-positioned overlay panel.  
- `App.tsx` on both platforms: source-URL input form → EPG screen (temporary until Phase 8 Settings UI).

**Tech stack:** React, @iptv-player/core (parseM3u, parseXmltv, buildEpgMapping, getNowNext), react-native FlatList/Modal/Pressable (TV), HTML/CSS (desktop), Vite module worker (desktop), InteractionManager (TV)

---

## File Map

| Path | Role |
|------|------|
| `packages/tv/src/epg/useEpgData.ts` | Hook: fetch M3U+XMLTV, InteractionManager defer, ChannelEntry[] |
| `packages/tv/src/epg/types.ts` | Local `ChannelEntry`, grid constants |
| `packages/tv/src/epg/components/ChannelRow.tsx` | Single Pressable channel row with NowNext labels |
| `packages/tv/src/epg/components/ChannelList.tsx` | FlatList of ChannelRow |
| `packages/tv/src/epg/components/EpgGrid.tsx` | FlatList(channels) × ScrollView(programs) 2-hour grid |
| `packages/tv/src/epg/components/ProgramDetail.tsx` | Modal overlay with program info |
| `packages/tv/src/epg/EpgScreen.tsx` | Top-level: channel list + grid + player |
| `packages/tv/src/App.tsx` | Source input → EpgScreen |
| `packages/desktop/src/epg/useEpgData.ts` | Hook: fetch M3U+XMLTV, Web Worker, ChannelEntry[] |
| `packages/desktop/src/epg/workers/XmltvWorker.ts` | Vite module worker: parseXmltv → postMessage |
| `packages/desktop/src/epg/types.ts` | Shared `ChannelEntry`, grid constants (mirrors TV) |
| `packages/desktop/src/epg/components/ChannelRow.tsx` | HTML channel row with NowNext |
| `packages/desktop/src/epg/components/ChannelList.tsx` | Scrollable sidebar channel list |
| `packages/desktop/src/epg/components/EpgGrid.tsx` | CSS horizontal-scroll 2-hour grid |
| `packages/desktop/src/epg/components/ProgramDetail.tsx` | Absolute overlay panel |
| `packages/desktop/src/epg/EpgPage.tsx` | Full layout: sidebar + player + grid |
| `packages/desktop/src/App.tsx` | Source input → EpgPage |

---

### Task 1: TV shared types + `useEpgData` hook

**Files:**
- Create: `packages/tv/src/epg/types.ts`
- Create: `packages/tv/src/epg/useEpgData.ts`

- [ ] **Step 1: Write `packages/tv/src/epg/types.ts`**

```ts
import type { EpgProgramme, M3uChannel, NowNext } from '@iptv-player/core';

export interface ChannelEntry {
  m3uChannel: M3uChannel;
  epgChannelId: string | undefined;
  nowNext: NowNext;
  programs: EpgProgramme[]; // pre-filtered for this channel, sorted by start
}

export const PX_PER_MIN = 8;
export const GRID_HOURS = 2;

export function getGridWindow(): { start: Date; end: Date } {
  const start = new Date();
  start.setMinutes(0, 0, 0); // floor to current hour
  const end = new Date(start.getTime() + GRID_HOURS * 60 * 60 * 1000);
  return { start, end };
}

export function cellLeft(progStart: Date, windowStart: Date): number {
  return Math.max(0, (progStart.getTime() - windowStart.getTime()) / 60000 * PX_PER_MIN);
}

export function cellWidth(progStart: Date, progStop: Date, windowStart: Date, windowEnd: Date): number {
  const cs = Math.max(progStart.getTime(), windowStart.getTime());
  const ce = Math.min(progStop.getTime(), windowEnd.getTime());
  return Math.max(0, (ce - cs) / 60000 * PX_PER_MIN);
}

export function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
```

- [ ] **Step 2: Write `packages/tv/src/epg/useEpgData.ts`**

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { InteractionManager } from 'react-native';
import {
  buildEpgMapping,
  getNowNext,
  parseM3u,
  parseXmltv,
  type EpgData,
} from '@iptv-player/core';
import type { ChannelEntry } from './types';

type Status = 'idle' | 'loading' | 'ready' | 'error';

export interface UseEpgDataResult {
  channels: ChannelEntry[];
  epgData: EpgData | null;
  status: Status;
  error: string | null;
  reload: () => void;
}

export function useEpgData(m3uUrl: string, xmltvUrl: string): UseEpgDataResult {
  const [channels, setChannels] = useState<ChannelEntry[]>([]);
  const [epgData, setEpgData] = useState<EpgData | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const reloadKey = useRef(0);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => {
    reloadKey.current += 1;
    setTick(t => t + 1);
  }, []);

  useEffect(() => {
    if (!m3uUrl) return;

    let cancelled = false;
    setStatus('loading');
    setError(null);

    const run = async () => {
      try {
        const [m3uText, xmltvText] = await Promise.all([
          fetch(m3uUrl).then(r => {
            if (!r.ok) throw new Error(`M3U fetch failed: ${r.status}`);
            return r.text();
          }),
          xmltvUrl
            ? fetch(xmltvUrl).then(r => {
                if (!r.ok) throw new Error(`XMLTV fetch failed: ${r.status}`);
                return r.text();
              })
            : Promise.resolve(null),
        ]);

        if (cancelled) return;
        const m3uChannels = parseM3u(m3uText);

        if (xmltvText) {
          // Defer XMLTV parsing off the interaction/animation frame.
          InteractionManager.runAfterInteractions(() => {
            if (cancelled) return;
            try {
              const xmltvResult = parseXmltv(xmltvText);
              const data: EpgData = {
                channels: xmltvResult.channels.map(c => ({
                  id: c.id,
                  displayName: c.displayName,
                  iconUrl: c.iconUrl,
                })),
                programmes: xmltvResult.programmes,
              };
              const mapping = buildEpgMapping(m3uChannels, data.channels);
              const now = new Date();
              const entries: ChannelEntry[] = m3uChannels.map(ch => {
                const epgId = mapping.get(ch.url);
                const progs = epgId
                  ? data.programmes
                      .filter(p => p.channelId === epgId)
                      .sort((a, b) => a.start.getTime() - b.start.getTime())
                  : [];
                return {
                  m3uChannel: ch,
                  epgChannelId: epgId,
                  nowNext: epgId ? getNowNext(data.programmes, epgId, now) : {},
                  programs: progs,
                };
              });
              setEpgData(data);
              setChannels(entries);
              setStatus('ready');
            } catch (err) {
              setError(err instanceof Error ? err.message : 'EPG parse error');
              setStatus('error');
            }
          });
        } else {
          // No XMLTV — just M3U channels, no EPG data
          const entries: ChannelEntry[] = m3uChannels.map(ch => ({
            m3uChannel: ch,
            epgChannelId: undefined,
            nowNext: {},
            programs: [],
          }));
          setChannels(entries);
          setEpgData(null);
          setStatus('ready');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Load error');
          setStatus('error');
        }
      }
    };

    run();
    return () => { cancelled = true; };
  }, [m3uUrl, xmltvUrl, tick]);

  return { channels, epgData, status, error, reload };
}
```

- [ ] **Step 3: Typecheck**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm --filter @iptv-player/tv typecheck 2>&1
```

Expected: exits 0.

---

### Task 2: TV EPG components

**Files:**
- Create: `packages/tv/src/epg/components/ChannelRow.tsx`
- Create: `packages/tv/src/epg/components/ChannelList.tsx`
- Create: `packages/tv/src/epg/components/ProgramDetail.tsx`
- Create: `packages/tv/src/epg/components/EpgGrid.tsx`

- [ ] **Step 1: Write `ChannelRow.tsx`**

```tsx
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ChannelEntry } from '../types';

interface Props {
  entry: ChannelEntry;
  isSelected: boolean;
  onSelect: () => void;
}

export function ChannelRow({ entry, isSelected, onSelect }: Props): React.ReactElement {
  const { m3uChannel, nowNext } = entry;
  return (
    <Pressable
      style={[styles.row, isSelected && styles.rowSelected]}
      onPress={onSelect}
    >
      <Text style={styles.name} numberOfLines={1}>{m3uChannel.name}</Text>
      {nowNext.now && (
        <Text style={styles.nowLabel} numberOfLines={1}>▶ {nowNext.now.title}</Text>
      )}
      {nowNext.next && (
        <Text style={styles.nextLabel} numberOfLines={1}>→ {nowNext.next.title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    backgroundColor: '#1a1a1a',
  },
  rowSelected: {
    backgroundColor: '#e50914',
  },
  name: { color: '#fff', fontSize: 22, fontWeight: '600' },
  nowLabel: { color: '#aaa', fontSize: 16, marginTop: 2 },
  nextLabel: { color: '#666', fontSize: 14 },
});
```

- [ ] **Step 2: Write `ChannelList.tsx`**

```tsx
import React from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import type { ChannelEntry } from '../types';
import { ChannelRow } from './ChannelRow';

interface Props {
  entries: ChannelEntry[];
  selectedUrl: string | null;
  onSelect: (entry: ChannelEntry) => void;
}

export function ChannelList({ entries, selectedUrl, onSelect }: Props): React.ReactElement {
  return (
    <View style={styles.container}>
      <FlatList
        data={entries}
        keyExtractor={item => item.m3uChannel.url}
        renderItem={({ item }) => (
          <ChannelRow
            entry={item}
            isSelected={item.m3uChannel.url === selectedUrl}
            onSelect={() => onSelect(item)}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: 340, borderRightWidth: 1, borderRightColor: '#222' },
});
```

- [ ] **Step 3: Write `ProgramDetail.tsx`**

```tsx
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
```

- [ ] **Step 4: Write `EpgGrid.tsx`**

The grid uses a FlatList (channels, vertical) where each row has a fixed-width horizontal ScrollView (time axis). Programs are absolutely positioned within a 960 px-wide (2 h × 8 px/min) track.

```tsx
import React, { useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { EpgProgramme } from '@iptv-player/core';
import type { ChannelEntry } from '../types';
import { cellLeft, cellWidth, formatTime, getGridWindow, GRID_HOURS, PX_PER_MIN } from '../types';
import { ProgramDetail } from './ProgramDetail';

interface Props {
  entries: ChannelEntry[];
}

const TRACK_WIDTH = GRID_HOURS * 60 * PX_PER_MIN; // 960

export function EpgGrid({ entries }: Props): React.ReactElement {
  const [selected, setSelected] = useState<EpgProgramme | null>(null);
  const { start: windowStart, end: windowEnd } = getGridWindow();
  const now = new Date();

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
        data={entries}
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
```

- [ ] **Step 5: Typecheck**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm --filter @iptv-player/tv typecheck 2>&1
```

Expected: exits 0.

---

### Task 3: TV `EpgScreen` + updated `App.tsx`

**Files:**
- Create: `packages/tv/src/epg/EpgScreen.tsx`
- Modify: `packages/tv/src/App.tsx`

- [ ] **Step 1: Write `EpgScreen.tsx`**

```tsx
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { PlayerScreen } from '../ui/player/PlayerScreen';
import { ChannelList } from './components/ChannelList';
import { EpgGrid } from './components/EpgGrid';
import type { ChannelEntry } from './types';
import { useEpgData } from './useEpgData';

interface Props {
  m3uUrl: string;
  xmltvUrl: string;
}

export function EpgScreen({ m3uUrl, xmltvUrl }: Props): React.ReactElement {
  const { channels, status, error } = useEpgData(m3uUrl, xmltvUrl);
  const [activeChannel, setActiveChannel] = useState<ChannelEntry | null>(null);

  if (activeChannel) {
    return (
      <PlayerScreen
        streamUrl={activeChannel.m3uChannel.url}
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
```

- [ ] **Step 2: Add `onBack` prop to `PlayerScreen`**

`packages/tv/src/ui/player/PlayerScreen.tsx` needs an optional `onBack?: () => void` prop. When Back is pressed on the TV remote, it calls `onBack`. Add a `BackHandler` listener:

Replace the current `PlayerScreen.tsx` with:

```tsx
import React, { useEffect } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import type { BufferProfile } from '@iptv-player/core';
import { useRnVideoController } from '../../playback/RnVideoController';
import { BufferHealthBadge } from './BufferHealthBadge';

interface Props {
  streamUrl: string;
  bufferProfile?: BufferProfile;
  onBack?: () => void;
}

export function PlayerScreen({
  streamUrl,
  bufferProfile = { kind: 'aggressive' },
  onBack,
}: Props): React.ReactElement {
  const { controller, VideoComponent } = useRnVideoController();

  useEffect(() => {
    controller.load(streamUrl, bufferProfile);
    return () => {
      controller.dispose();
    };
  }, [streamUrl]);

  useEffect(() => {
    if (!onBack) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  return (
    <View style={styles.container}>
      {VideoComponent}
      <BufferHealthBadge status={controller.status} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
});
```

- [ ] **Step 3: Update `App.tsx` (source input → EpgScreen)**

Replace `packages/tv/src/App.tsx`:

```tsx
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
```

- [ ] **Step 4: Typecheck**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm --filter @iptv-player/tv typecheck 2>&1
```

Expected: exits 0.

---

### Task 4: Desktop shared types + Web Worker + `useEpgData`

**Files:**
- Create: `packages/desktop/src/epg/types.ts`
- Create: `packages/desktop/src/epg/workers/XmltvWorker.ts`
- Create: `packages/desktop/src/epg/useEpgData.ts`

- [ ] **Step 1: Write `packages/desktop/src/epg/types.ts`** (mirrors TV, no RN imports)

```ts
import type { EpgProgramme, M3uChannel, NowNext } from '@iptv-player/core';

export interface ChannelEntry {
  m3uChannel: M3uChannel;
  epgChannelId: string | undefined;
  nowNext: NowNext;
  programs: EpgProgramme[];
}

export const PX_PER_MIN = 8;
export const GRID_HOURS = 2;

export function getGridWindow(): { start: Date; end: Date } {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  const end = new Date(start.getTime() + GRID_HOURS * 60 * 60 * 1000);
  return { start, end };
}

export function cellLeft(progStart: Date, windowStart: Date): number {
  return Math.max(0, (progStart.getTime() - windowStart.getTime()) / 60000 * PX_PER_MIN);
}

export function cellWidth(progStart: Date, progStop: Date, windowStart: Date, windowEnd: Date): number {
  const cs = Math.max(progStart.getTime(), windowStart.getTime());
  const ce = Math.min(progStop.getTime(), windowEnd.getTime());
  return Math.max(0, (ce - cs) / 60000 * PX_PER_MIN);
}

export function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
```

- [ ] **Step 2: Write `XmltvWorker.ts`**

```ts
/// <reference lib="webworker" />
import { parseXmltv } from '@iptv-player/core';

export interface WorkerInput {
  xmltvText: string;
}

// XmltvResult with Date objects passes through structured clone correctly.
self.onmessage = (e: MessageEvent<WorkerInput>) => {
  try {
    const result = parseXmltv(e.data.xmltvText);
    self.postMessage({ ok: true, result });
  } catch (err) {
    self.postMessage({ ok: false, error: err instanceof Error ? err.message : 'Parse error' });
  }
};
```

- [ ] **Step 3: Write `packages/desktop/src/epg/useEpgData.ts`**

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildEpgMapping,
  getNowNext,
  parseM3u,
  type EpgData,
  type XmltvResult,
} from '@iptv-player/core';
import type { ChannelEntry } from './types';

type Status = 'idle' | 'loading' | 'ready' | 'error';

interface WorkerResponse {
  ok: boolean;
  result?: XmltvResult;
  error?: string;
}

export interface UseEpgDataResult {
  channels: ChannelEntry[];
  epgData: EpgData | null;
  status: Status;
  error: string | null;
  reload: () => void;
}

export function useEpgData(m3uUrl: string, xmltvUrl: string): UseEpgDataResult {
  const [channels, setChannels] = useState<ChannelEntry[]>([]);
  const [epgData, setEpgData] = useState<EpgData | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    if (!m3uUrl) return;

    let cancelled = false;
    let worker: Worker | null = null;
    setStatus('loading');
    setError(null);

    const run = async () => {
      try {
        const [m3uText, xmltvText] = await Promise.all([
          fetch(m3uUrl).then(r => {
            if (!r.ok) throw new Error(`M3U fetch failed: ${r.status}`);
            return r.text();
          }),
          xmltvUrl
            ? fetch(xmltvUrl).then(r => {
                if (!r.ok) throw new Error(`XMLTV fetch failed: ${r.status}`);
                return r.text();
              })
            : Promise.resolve(null),
        ]);

        if (cancelled) return;
        const m3uChannels = parseM3u(m3uText);

        if (xmltvText) {
          worker = new Worker(new URL('./workers/XmltvWorker.ts', import.meta.url), { type: 'module' });
          worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
            if (cancelled) return;
            worker?.terminate();
            if (!e.data.ok || !e.data.result) {
              setError(e.data.error ?? 'XMLTV parse error');
              setStatus('error');
              return;
            }
            const xmltvResult = e.data.result;
            const data: EpgData = {
              channels: xmltvResult.channels.map(c => ({
                id: c.id,
                displayName: c.displayName,
                iconUrl: c.iconUrl,
              })),
              programmes: xmltvResult.programmes,
            };
            const mapping = buildEpgMapping(m3uChannels, data.channels);
            const now = new Date();
            const entries: ChannelEntry[] = m3uChannels.map(ch => {
              const epgId = mapping.get(ch.url);
              const progs = epgId
                ? data.programmes
                    .filter(p => p.channelId === epgId)
                    .sort((a, b) => a.start.getTime() - b.start.getTime())
                : [];
              return {
                m3uChannel: ch,
                epgChannelId: epgId,
                nowNext: epgId ? getNowNext(data.programmes, epgId, now) : {},
                programs: progs,
              };
            });
            setEpgData(data);
            setChannels(entries);
            setStatus('ready');
          };
          worker.onerror = () => {
            if (cancelled) return;
            setError('Worker error during XMLTV parse');
            setStatus('error');
            worker?.terminate();
          };
          worker.postMessage({ xmltvText });
        } else {
          const entries: ChannelEntry[] = m3uChannels.map(ch => ({
            m3uChannel: ch,
            epgChannelId: undefined,
            nowNext: {},
            programs: [],
          }));
          setChannels(entries);
          setEpgData(null);
          setStatus('ready');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Load error');
          setStatus('error');
        }
      }
    };

    run();
    return () => {
      cancelled = true;
      worker?.terminate();
    };
  }, [m3uUrl, xmltvUrl, tick]);

  return { channels, epgData, status, error, reload };
}
```

- [ ] **Step 4: Typecheck**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm --filter @iptv-player/desktop typecheck 2>&1
```

Expected: exits 0. (Worker file is a module worker; `/// <reference lib="webworker" />` provides `self`, `MessageEvent`, etc.)

---

### Task 5: Desktop EPG components

**Files:**
- Create: `packages/desktop/src/epg/components/ChannelRow.tsx`
- Create: `packages/desktop/src/epg/components/ChannelList.tsx`
- Create: `packages/desktop/src/epg/components/ProgramDetail.tsx`
- Create: `packages/desktop/src/epg/components/EpgGrid.tsx`

- [ ] **Step 1: Write `ChannelRow.tsx`**

```tsx
import React from 'react';
import type { ChannelEntry } from '../types';

interface Props {
  entry: ChannelEntry;
  isActive: boolean;
  onClick: () => void;
}

export function ChannelRow({ entry, isActive, onClick }: Props): React.ReactElement {
  const { m3uChannel, nowNext } = entry;
  return (
    <div
      onClick={onClick}
      style={{
        padding: '10px 14px',
        borderBottom: '1px solid #222',
        backgroundColor: isActive ? '#e50914' : '#1a1a1a',
        cursor: 'pointer',
      }}
    >
      <div style={{ color: '#fff', fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {m3uChannel.name}
      </div>
      {nowNext.now && (
        <div style={{ color: '#aaa', fontSize: 12, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          ▶ {nowNext.now.title}
        </div>
      )}
      {nowNext.next && (
        <div style={{ color: '#555', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          → {nowNext.next.title}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write `ChannelList.tsx`**

```tsx
import React from 'react';
import type { ChannelEntry } from '../types';
import { ChannelRow } from './ChannelRow';

interface Props {
  entries: ChannelEntry[];
  activeUrl: string | null;
  onSelect: (entry: ChannelEntry) => void;
}

export function ChannelList({ entries, activeUrl, onSelect }: Props): React.ReactElement {
  return (
    <div style={{ width: 220, overflowY: 'auto', borderRight: '1px solid #222', flexShrink: 0 }}>
      {entries.map(entry => (
        <ChannelRow
          key={entry.m3uChannel.url}
          entry={entry}
          isActive={entry.m3uChannel.url === activeUrl}
          onClick={() => onSelect(entry)}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Write `ProgramDetail.tsx`**

```tsx
import React from 'react';
import type { EpgProgramme } from '@iptv-player/core';
import { formatTime } from '../types';

interface Props {
  program: EpgProgramme | null;
  onClose: () => void;
}

export function ProgramDetail({ program, onClose }: Props): React.ReactElement | null {
  if (!program) return null;
  return (
    <div
      style={{
        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.8)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        style={{ background: '#1e1e1e', borderRadius: 10, padding: 32, maxWidth: 520, width: '90%' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ color: '#fff', fontSize: 22, fontWeight: 700, marginBottom: 8 }}>{program.title}</div>
        <div style={{ color: '#aaa', fontSize: 14, marginBottom: 14 }}>
          {formatTime(program.start)} – {formatTime(program.stop)}
        </div>
        {program.description && (
          <div style={{ color: '#ccc', fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
            {program.description}
          </div>
        )}
        <button
          onClick={onClose}
          style={{ background: '#e50914', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', cursor: 'pointer', fontSize: 14 }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write `EpgGrid.tsx`**

```tsx
import React, { useState } from 'react';
import type { EpgProgramme } from '@iptv-player/core';
import type { ChannelEntry } from '../types';
import { cellLeft, cellWidth, formatTime, getGridWindow, GRID_HOURS, PX_PER_MIN } from '../types';
import { ProgramDetail } from './ProgramDetail';

interface Props {
  entries: ChannelEntry[];
}

const TRACK_W = GRID_HOURS * 60 * PX_PER_MIN; // 960
const ROW_H = 56;
const LABEL_W = 140;

export function EpgGrid({ entries }: Props): React.ReactElement {
  const [selected, setSelected] = useState<EpgProgramme | null>(null);
  const { start: windowStart, end: windowEnd } = getGridWindow();
  const now = new Date();
  const nowLeft = LABEL_W + cellLeft(now, windowStart);

  return (
    <div style={{ overflowX: 'auto', position: 'relative', flex: 1 }}>
      {/* Time header */}
      <div style={{ display: 'flex', borderBottom: '1px solid #333', position: 'sticky', top: 0, background: '#111', zIndex: 10 }}>
        <div style={{ width: LABEL_W, flexShrink: 0 }} />
        {Array.from({ length: GRID_HOURS * 2 }).map((_, i) => {
          const t = new Date(windowStart.getTime() + i * 30 * 60 * 1000);
          return (
            <div key={i} style={{ width: 30 * PX_PER_MIN, flexShrink: 0, borderLeft: '1px solid #222', padding: '4px 4px' }}>
              <span style={{ color: '#777', fontSize: 11 }}>{formatTime(t)}</span>
            </div>
          );
        })}
      </div>

      {/* Rows */}
      <div style={{ position: 'relative' }}>
        {/* Now indicator */}
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: nowLeft, width: 2, background: '#e50914', zIndex: 5, pointerEvents: 'none' }} />

        {entries.map(entry => {
          const visible = entry.programs.filter(
            p => p.stop.getTime() > windowStart.getTime() && p.start.getTime() < windowEnd.getTime(),
          );
          return (
            <div key={entry.m3uChannel.url} style={{ display: 'flex', height: ROW_H, borderBottom: '1px solid #222' }}>
              {/* Channel label */}
              <div style={{ width: LABEL_W, flexShrink: 0, background: '#1a1a1a', padding: '0 8px', display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
                <span style={{ color: '#ccc', fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {entry.m3uChannel.name}
                </span>
              </div>
              {/* Program track */}
              <div style={{ width: TRACK_W, flexShrink: 0, position: 'relative', height: ROW_H }}>
                {visible.map(prog => {
                  const left = cellLeft(prog.start, windowStart);
                  const width = cellWidth(prog.start, prog.stop, windowStart, windowEnd);
                  const isCurrent = prog.start <= now && prog.stop > now;
                  return (
                    <div
                      key={prog.start.toISOString()}
                      onClick={() => setSelected(prog)}
                      style={{
                        position: 'absolute',
                        left,
                        width: Math.max(0, width - 2),
                        top: 4,
                        height: ROW_H - 8,
                        background: isCurrent ? '#1d3a1d' : '#2a2a2a',
                        borderLeft: `3px solid ${isCurrent ? '#4caf50' : '#444'}`,
                        borderRadius: 3,
                        padding: '2px 4px',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        boxSizing: 'border-box',
                      }}
                    >
                      <span style={{ color: '#fff', fontSize: 11, whiteSpace: 'nowrap' }}>{prog.title}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {selected && <ProgramDetail program={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
```

- [ ] **Step 5: Typecheck**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm --filter @iptv-player/desktop typecheck 2>&1
```

Expected: exits 0.

---

### Task 6: Desktop `EpgPage` + updated `App.tsx`

**Files:**
- Create: `packages/desktop/src/epg/EpgPage.tsx`
- Modify: `packages/desktop/src/App.tsx`

- [ ] **Step 1: Write `EpgPage.tsx`**

```tsx
import React, { useState } from 'react';
import { useHlsJsController } from '../playback/HlsJsController';
import { BufferHealthBadge } from '../ui/player/BufferHealthBadge';
import type { ChannelEntry } from './types';
import { ChannelList } from './components/ChannelList';
import { EpgGrid } from './components/EpgGrid';
import { useEpgData } from './useEpgData';

interface Props {
  m3uUrl: string;
  xmltvUrl: string;
}

export function EpgPage({ m3uUrl, xmltvUrl }: Props): React.ReactElement {
  const { channels, status, error } = useEpgData(m3uUrl, xmltvUrl);
  const { controller, VideoComponent } = useHlsJsController();
  const [activeUrl, setActiveUrl] = useState<string | null>(null);

  const handleSelect = (entry: ChannelEntry) => {
    setActiveUrl(entry.m3uChannel.url);
    controller.load(entry.m3uChannel.url, { kind: 'aggressive' });
  };

  return (
    <div style={{ display: 'flex', height: '100%', background: '#111', overflow: 'hidden' }}>
      {/* Left sidebar: channel list */}
      {status === 'loading' ? (
        <div style={{ width: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: 13 }}>
          Loading…
        </div>
      ) : status === 'error' ? (
        <div style={{ width: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e50914', fontSize: 13, padding: 16 }}>
          {error}
        </div>
      ) : (
        <ChannelList entries={channels} activeUrl={activeUrl} onSelect={handleSelect} />
      )}

      {/* Right area: player + grid */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Player */}
        <div style={{ position: 'relative', height: '55%', flexShrink: 0, background: '#000' }}>
          {VideoComponent}
          <BufferHealthBadge status={controller.status} />
        </div>

        {/* EPG grid */}
        <div style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid #222' }}>
          <EpgGrid entries={channels} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update `App.tsx`**

Replace `packages/desktop/src/App.tsx`:

```tsx
import React, { useState } from 'react';
import { EpgPage } from './epg/EpgPage';

interface Sources {
  m3uUrl: string;
  xmltvUrl: string;
}

export function App(): React.ReactElement {
  const [sources, setSources] = useState<Sources | null>(null);
  const [m3uInput, setM3uInput] = useState('');
  const [xmltvInput, setXmltvInput] = useState('');

  if (sources) {
    return <EpgPage m3uUrl={sources.m3uUrl} xmltvUrl={sources.xmltvUrl} />;
  }

  return (
    <div style={splash}>
      <h1 style={heading}>IPTV Player</h1>
      <div style={field}>
        <label style={labelStyle}>M3U URL</label>
        <input
          style={inputStyle}
          value={m3uInput}
          onChange={e => setM3uInput(e.target.value)}
          placeholder="https://example.com/playlist.m3u"
        />
      </div>
      <div style={field}>
        <label style={labelStyle}>XMLTV URL (optional)</label>
        <input
          style={inputStyle}
          value={xmltvInput}
          onChange={e => setXmltvInput(e.target.value)}
          placeholder="https://example.com/epg.xml"
        />
      </div>
      <button
        style={{ ...btn, ...(!m3uInput ? btnDisabled : {}) }}
        disabled={!m3uInput}
        onClick={() => m3uInput && setSources({ m3uUrl: m3uInput, xmltvUrl: xmltvInput })}
      >
        Load Channels
      </button>
    </div>
  );
}

const splash: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  height: '100%', background: '#111', gap: 0,
};
const heading: React.CSSProperties = { color: '#fff', fontSize: 36, fontWeight: 700, marginBottom: 32 };
const field: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20, width: 400 };
const labelStyle: React.CSSProperties = { color: '#aaa', fontSize: 13 };
const inputStyle: React.CSSProperties = {
  background: '#222', color: '#fff', border: '1px solid #333', borderRadius: 6,
  padding: '10px 14px', fontSize: 14, outline: 'none',
};
const btn: React.CSSProperties = {
  background: '#e50914', color: '#fff', border: 'none', borderRadius: 6,
  padding: '12px 32px', fontSize: 16, fontWeight: 600, cursor: 'pointer', marginTop: 8,
};
const btnDisabled: React.CSSProperties = { background: '#555', cursor: 'not-allowed' };
```

- [ ] **Step 3: Typecheck**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm --filter @iptv-player/desktop typecheck 2>&1
```

Expected: exits 0.

---

### Task 7: Full verification + CLAUDE.md update

- [ ] **Step 1: Full typecheck (TV + desktop)**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm --filter @iptv-player/tv typecheck 2>&1 && pnpm --filter @iptv-player/desktop typecheck 2>&1
```

Expected: both exit 0.

- [ ] **Step 2: Lint**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm lint 2>&1
```

Expected: exits 0.

- [ ] **Step 3: Core tests**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm test 2>&1 | tail -6
```

Expected: 58 tests pass.

- [ ] **Step 4: Update CLAUDE.md phase 6 row to ✅ complete**

---

## Self-Review

**Spec coverage:**
- ✅ Now/Next per channel — `useEpgData` pre-computes via `getNowNext`, displayed in `ChannelRow`
- ✅ EPG grid (channels × time) — `EpgGrid` both platforms, 2-h window, proportional cells
- ✅ ProgramDetail — `ProgramDetail` both platforms, shows title/time/description
- ✅ XMLTV off main thread — TV: `InteractionManager.runAfterInteractions`; Desktop: Vite module Worker
- ✅ M3U → EPG channel mapping — `buildEpgMapping` called in both hooks
- ✅ D-pad navigable TV UI — `Pressable` / `FlatList` use react-native-tvos focus engine
- ✅ Mouse-navigable desktop UI — click handlers on all interactive elements
- ✅ Source input form (temporary until Phase 8) — both `App.tsx` updated

**Placeholder scan:** none.

**Type consistency:**
- `ChannelEntry` defined independently in each package but identical structure ✅
- `getGridWindow`, `cellLeft`, `cellWidth`, `formatTime` duplicated (TV + Desktop) — same signatures ✅  
- `EpgProgramme`, `M3uChannel`, `NowNext` all imported from `@iptv-player/core` ✅
- `XmltvResult` worker response uses core's type directly ✅
