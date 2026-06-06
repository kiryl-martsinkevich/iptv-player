# Channel Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat channel list with Favourites/Categories tabs, persistent search, right-click/long-press context menus, and lazy EPG Now/Next computation.

**Architecture:** `AppSettings` gains `favouriteUrls: string[]` (core). New `ChannelTabs` and `ChannelContextMenu` components per platform. `ChannelRow` gains `onContextMenu` (desktop) / `onLongPress` (TV). `useEpgData` returns structural entries immediately, Now/Next computed on demand for visible channels only. `EpgPage`/`EpgScreen` orchestrates tabs + search + favourites filtering.

**Tech Stack:** TypeScript strict, React (RN-Web desktop, react-native-tvos TV), localStorage/AsyncStorage for favourites persistence (via existing `useSettings`).

---

### Task 1: Core — Add favouriteUrls to AppSettings

**Files:**
- Modify: `packages/core/src/settings/appSettings.ts`
- Modify: `packages/core/tests/settings/appSettings.test.ts`

- [ ] **Step 1: Add favouriteUrls field and wire it in**

```ts
// packages/core/src/settings/appSettings.ts — add to AppSettings interface:
favouriteUrls: string[];

// Add to DEFAULT_SETTINGS:
favouriteUrls: [],
```

Full file after edit:

```ts
import type { BufferProfile } from '../playback/bufferProfile';

export interface AppSettings {
  m3uUrl: string;
  xmltvUrl: string;
  bufferProfile: BufferProfile;
  prefetchEnabled: boolean;
  favouriteUrls: string[];
}

export const DEFAULT_SETTINGS: AppSettings = {
  m3uUrl: '',
  xmltvUrl: '',
  bufferProfile: { kind: 'aggressive' },
  prefetchEnabled: false,
  favouriteUrls: [],
};

export function mergeSettings(partial: Partial<AppSettings>): AppSettings {
  const bp = partial.bufferProfile ?? DEFAULT_SETTINGS.bufferProfile;
  return {
    ...DEFAULT_SETTINGS,
    ...partial,
    bufferProfile: { ...bp } as BufferProfile,
  };
}
```

- [ ] **Step 2: Add tests for favouriteUrls**

Add these tests to `packages/core/tests/settings/appSettings.test.ts`:

```ts
// After the existing DEFAULT_SETTINGS describe block, add inside it:
it('has empty favouriteUrls', () => {
  expect(DEFAULT_SETTINGS.favouriteUrls).toEqual([]);
});

// After the existing mergeSettings describe block, add inside it:
it('merges favouriteUrls', () => {
  const result = mergeSettings({ favouriteUrls: ['http://a.com/stream'] });
  expect(result.favouriteUrls).toEqual(['http://a.com/stream']);
});

it('favouriteUrls defaults to empty array', () => {
  const result = mergeSettings({});
  expect(result.favouriteUrls).toEqual([]);
});
```

- [ ] **Step 3: Run tests to verify they pass**

```bash
pnpm test -- --testPathPattern='appSettings'
```
Expected: 3 new tests pass (12 total in appSettings.test.ts)

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/settings/appSettings.ts packages/core/tests/settings/appSettings.test.ts
git commit -m "feat(core): add favouriteUrls to AppSettings"
```

---

### Task 2: Desktop — ChannelTabs and ChannelContextMenu

**Files:**
- Create: `packages/desktop/src/epg/components/ChannelTabs.tsx`
- Create: `packages/desktop/src/epg/components/ChannelContextMenu.tsx`

- [ ] **Step 1: Write ChannelTabs component**

```tsx
// packages/desktop/src/epg/components/ChannelTabs.tsx
import React from 'react';

type Tab = 'favourites' | 'categories';

interface Props {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  favouriteCount: number;
}

const tabBar: React.CSSProperties = {
  display: 'flex',
  borderBottom: '1px solid #222',
  flexShrink: 0,
};

const tabBtn = (isActive: boolean): React.CSSProperties => ({
  flex: 1,
  padding: '8px 0',
  textAlign: 'center',
  border: 'none',
  background: isActive ? '#e50914' : 'transparent',
  color: isActive ? '#fff' : '#888',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  borderBottom: isActive ? 'none' : '1px solid transparent',
});

const searchWrap: React.CSSProperties = {
  padding: '8px',
  borderBottom: '1px solid #222',
  flexShrink: 0,
};

const searchInput: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: '#222',
  color: '#fff',
  border: '1px solid #333',
  borderRadius: 4,
  padding: '6px 10px',
  fontSize: 12,
  outline: 'none',
};

export function ChannelTabs({
  activeTab,
  onTabChange,
  searchQuery,
  onSearchChange,
  favouriteCount,
}: Props): React.ReactElement {
  return (
    <div>
      <div style={searchWrap}>
        <input
          style={searchInput}
          type="text"
          placeholder="Search channels…"
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
        />
      </div>
      <div style={tabBar}>
        <button style={tabBtn(activeTab === 'favourites')} onClick={() => onTabChange('favourites')}>
          ★ Favourites{favouriteCount > 0 ? ` (${favouriteCount})` : ''}
        </button>
        <button style={tabBtn(activeTab === 'categories')} onClick={() => onTabChange('categories')}>
          📁 Categories
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write ChannelContextMenu component**

```tsx
// packages/desktop/src/epg/components/ChannelContextMenu.tsx
import React, { useEffect, useRef } from 'react';
import type { ChannelEntry } from '../types';

interface Props {
  entry: ChannelEntry;
  x: number;
  y: number;
  isFavourite: boolean;
  onPlay: (entry: ChannelEntry) => void;
  onToggleFavourite: (entry: ChannelEntry) => void;
  onClose: () => void;
}

const overlay: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 200,
};

const menu = (x: number, y: number): React.CSSProperties => ({
  position: 'absolute',
  left: x,
  top: y,
  background: '#222',
  border: '1px solid #444',
  borderRadius: 8,
  padding: '4px 0',
  minWidth: 180,
  boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
});

const item: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '8px 16px',
  textAlign: 'left',
  border: 'none',
  background: 'transparent',
  color: '#fff',
  fontSize: 13,
  cursor: 'pointer',
};

const itemHover: React.CSSProperties = {
  ...item,
  background: '#333',
};

export function ChannelContextMenu({
  entry,
  x,
  y,
  isFavourite,
  onPlay,
  onToggleFavourite,
  onClose,
}: Props): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div style={overlay} onClick={onClose} onContextMenu={e => { e.preventDefault(); onClose(); }}>
      <div style={menu(x, y)} ref={ref}>
        <button
          style={item}
          onMouseEnter={e => { (e.target as HTMLElement).style.background = '#333'; }}
          onMouseLeave={e => { (e.target as HTMLElement).style.background = 'transparent'; }}
          onClick={() => { onPlay(entry); onClose(); }}
        >
          ▶ Play
        </button>
        <button
          style={item}
          onMouseEnter={e => { (e.target as HTMLElement).style.background = '#333'; }}
          onMouseLeave={e => { (e.target as HTMLElement).style.background = 'transparent'; }}
          onClick={() => { onToggleFavourite(entry); onClose(); }}
        >
          {isFavourite ? '★ Remove from Favourites' : '☆ Add to Favourites'}
        </button>
      </div>
    </div>
  );
}
```

Note to implementer: the `itemHover` style is declared but not used inline — the hover handlers on `item` achieve the effect. Keep `itemHover` or remove it at your discretion.

- [ ] **Step 3: Verify typecheck on the desktop package**

```bash
pnpm typecheck
```
Expected: no errors in core; desktop has no tsc check setup, manually verify the files have no obvious TS issues.

- [ ] **Step 4: Commit**

```bash
git add packages/desktop/src/epg/components/ChannelTabs.tsx packages/desktop/src/epg/components/ChannelContextMenu.tsx
git commit -m "feat(desktop): add ChannelTabs and ChannelContextMenu components"
```

---

### Task 3: Desktop — ChannelRow and ChannelList context menu props

**Files:**
- Modify: `packages/desktop/src/epg/components/ChannelRow.tsx`
- Modify: `packages/desktop/src/epg/components/ChannelList.tsx`

- [ ] **Step 1: Add onContextMenu to ChannelRow**

Replace the existing `packages/desktop/src/epg/components/ChannelRow.tsx`:

```tsx
import React from 'react';
import type { ChannelEntry } from '../types';

interface Props {
  entry: ChannelEntry;
  isActive: boolean;
  onClick: () => void;
  onMouseEnter?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export function ChannelRow({ entry, isActive, onClick, onMouseEnter, onContextMenu }: Props): React.ReactElement {
  const { m3uChannel, nowNext } = entry;
  return (
    <div
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onContextMenu={onContextMenu}
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

- [ ] **Step 2: Add onContextMenu to ChannelList**

Replace `packages/desktop/src/epg/components/ChannelList.tsx`:

```tsx
import React from 'react';
import type { ChannelEntry } from '../types';
import { ChannelRow } from './ChannelRow';

interface Props {
  entries: ChannelEntry[];
  activeUrl: string | null;
  onSelect: (entry: ChannelEntry) => void;
  onFocus?: (entry: ChannelEntry) => void;
  onContextMenu?: (entry: ChannelEntry, e: React.MouseEvent) => void;
}

export function ChannelList({ entries, activeUrl, onSelect, onFocus, onContextMenu }: Props): React.ReactElement {
  return (
    <div style={{ flex: 1, overflowY: 'auto', flexShrink: 0 }}>
      {entries.map(entry => (
        <ChannelRow
          key={entry.m3uChannel.url}
          entry={entry}
          isActive={entry.m3uChannel.url === activeUrl}
          onClick={() => onSelect(entry)}
          onMouseEnter={onFocus ? () => onFocus(entry) : undefined}
          onContextMenu={onContextMenu ? (e) => { e.preventDefault(); onContextMenu(entry, e); } : undefined}
        />
      ))}
    </div>
  );
}
```

Note the width/right-border styles are removed from ChannelList — the parent (EpgPage) will handle the layout now since it needs to wrap ChannelTabs + ChannelList inside the sidebar column.

- [ ] **Step 3: Commit**

```bash
git add packages/desktop/src/epg/components/ChannelRow.tsx packages/desktop/src/epg/components/ChannelList.tsx
git commit -m "feat(desktop): add context menu support to ChannelRow and ChannelList"
```

---

### Task 4: Desktop — EpgPage integration and lazy EPG

**Files:**
- Modify: `packages/desktop/src/epg/EpgPage.tsx`
- Modify: `packages/desktop/src/epg/useEpgData.ts`

- [ ] **Step 1: Modify useEpgData for lazy Now/Next computation**

Replace `packages/desktop/src/epg/useEpgData.ts`. The key change: return structural entries immediately after M3U parse (status='ready', channels without Now/Next). After XMLTV worker completes, store raw `epgData` so the page can compute Now/Next on demand. Export a helper `enrichEntry` that the page calls lazily.

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildEpgMapping,
  getNowNext,
  parseM3u,
  type EpgChannel,
  type EpgData,
  type EpgProgramme,
  type XmltvResult,
} from '@iptv-player/core';
import type { ChannelEntry } from './types';

// In plain-browser dev (no Tauri), route through the local CORS proxy.
function proxyUrl(url: string): string {
  if (typeof window !== 'undefined' && !('__TAURI__' in window)) {
    return `/__proxy__/${url}`;
  }
  return url;
}

type Status = 'idle' | 'loading' | 'ready' | 'error';

interface WorkerResponse {
  ok: boolean;
  result?: XmltvResult;
  error?: string;
}

export interface UseEpgDataResult {
  channels: ChannelEntry[];
  epgData: EpgData | null;
  epgMapping: Map<string, string> | null;
  status: Status;
  error: string | null;
  reload: () => void;
}

/**
 * Compute Now/Next and programmes for a single channel entry from raw EPG data.
 * Called lazily by the page for visible channels only.
 */
export function enrichEntry(
  entry: ChannelEntry,
  epgData: EpgData | null,
  mapping: Map<string, string> | null,
): ChannelEntry {
  if (!epgData || !mapping) return entry;
  const epgId = mapping.get(entry.m3uChannel.url);
  if (!epgId) return entry;
  const now = new Date();
  const progs = epgData.programmes
    .filter(p => p.channelId === epgId)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  return {
    ...entry,
    epgChannelId: epgId,
    nowNext: getNowNext(epgData.programmes, epgId, now),
    programs: progs,
  };
}

export function useEpgData(m3uUrl: string, xmltvUrl: string): UseEpgDataResult {
  const [channels, setChannels] = useState<ChannelEntry[]>([]);
  const [epgData, setEpgData] = useState<EpgData | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const epgMappingRef = useRef<Map<string, string> | null>(null);

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
          fetch(proxyUrl(m3uUrl)).then(r => {
            if (!r.ok) throw new Error(`M3U fetch failed: ${r.status}`);
            return r.text();
          }),
          xmltvUrl
            ? fetch(proxyUrl(xmltvUrl)).then(r => {
                if (!r.ok) throw new Error(`XMLTV fetch failed: ${r.status}`);
                return r.text();
              })
            : Promise.resolve(null),
        ]);

        if (cancelled) return;
        const m3uChannels = parseM3u(m3uText);

        // Phase 1: structural entries immediately — no EPG yet
        const structural: ChannelEntry[] = m3uChannels.map(ch => ({
          m3uChannel: ch,
          epgChannelId: undefined,
          nowNext: {},
          programs: [],
        }));
        setChannels(structural);
        setStatus('ready');

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
            // Store mapping for lazy enrichment
            epgMappingRef.current = buildEpgMapping(m3uChannels, data.channels);
            setEpgData(data);
          };
          worker.onerror = () => {
            if (cancelled) return;
            setError('Worker error during XMLTV parse');
            setStatus('error');
            worker?.terminate();
          };
          worker.postMessage({ xmltvText });
        }
        // No XMLTV case: already returned structural entries above, done.
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

  return { channels, epgData, epgMapping: epgMappingRef.current, status, error, reload };
}
```

- [ ] **Step 2: Rewrite EpgPage with tabs, search, favourites, context menu**

Replace `packages/desktop/src/epg/EpgPage.tsx`:

```tsx
import React, { useMemo, useState } from 'react';
import { type BufferProfile } from '@iptv-player/core';
import { useHlsJsController } from '../playback/HlsJsController';
import { BufferHealthBadge } from '../ui/player/BufferHealthBadge';
import { useSettings } from '../settings/useSettings';
import type { ChannelEntry } from './types';
import { ChannelList } from './components/ChannelList';
import { ChannelContextMenu } from './components/ChannelContextMenu';
import { ChannelTabs } from './components/ChannelTabs';
import { EpgGrid } from './components/EpgGrid';
import { enrichEntry, useEpgData } from './useEpgData';
import { usePrefetch } from './usePrefetch';

type Tab = 'favourites' | 'categories';

interface Props {
  m3uUrl: string;
  xmltvUrl: string;
  bufferProfile: BufferProfile;
  prefetchEnabled: boolean;
}

function groupByCategory(entries: ChannelEntry[]): Map<string, ChannelEntry[]> {
  const map = new Map<string, ChannelEntry[]>();
  for (const e of entries) {
    const cat = e.m3uChannel.groupTitle || 'Uncategorized';
    const list = map.get(cat);
    if (list) {
      list.push(e);
    } else {
      map.set(cat, [e]);
    }
  }
  return map;
}

export function EpgPage({ m3uUrl, xmltvUrl, bufferProfile, prefetchEnabled }: Props): React.ReactElement {
  const { channels, epgData, epgMapping, status, error } = useEpgData(m3uUrl, xmltvUrl);
  const { settings, updateSettings } = useSettings();
  const { controller, VideoComponent } = useHlsJsController();
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('favourites');
  const [searchQuery, setSearchQuery] = useState('');
  const [contextMenu, setContextMenu] = useState<{ entry: ChannelEntry; x: number; y: number } | null>(null);
  const { prefetch } = usePrefetch(prefetchEnabled, 2);

  const favourites = useMemo(() => new Set(settings.favouriteUrls), [settings.favouriteUrls]);

  // Enrich visible entries with Now/Next + programmes on demand.
  // Only channels that pass the current tab+search filter get enriched.
  const displayChannels = useMemo(() => {
    // Tab filter
    let filtered: ChannelEntry[];
    if (activeTab === 'favourites') {
      filtered = channels.filter(c => favourites.has(c.m3uChannel.url));
    } else {
      // Categories tab: flatten all groups (collapsing handled at render)
      filtered = channels;
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter(c => c.m3uChannel.name.toLowerCase().includes(q));
    }

    // Enrich with EPG
    return filtered.map(e => enrichEntry(e, epgData, epgMapping));
  }, [channels, activeTab, searchQuery, favourites, epgData]);

  const categories = useMemo(() => {
    if (activeTab !== 'categories') return null;
    return groupByCategory(displayChannels);
  }, [activeTab, displayChannels]);

  const handleSelect = (entry: ChannelEntry) => {
    setActiveUrl(entry.m3uChannel.url);
    controller.load(entry.m3uChannel.url, bufferProfile, { stallTimeoutSec: 8, retryMaxDelayMs: 30_000 });
  };

  const toggleFavourite = (entry: ChannelEntry) => {
    const url = entry.m3uChannel.url;
    const next = favourites.has(url)
      ? settings.favouriteUrls.filter(u => u !== url)
      : [...settings.favouriteUrls, url];
    updateSettings({ favouriteUrls: next });
  };

  const sidebarStyle: React.CSSProperties = {
    width: 240,
    display: 'flex',
    flexDirection: 'column',
    borderRight: '1px solid #222',
    flexShrink: 0,
    background: '#1a1a1a',
  };

  const emptyHint: React.CSSProperties = {
    color: '#666',
    fontSize: 12,
    padding: '16px 14px',
    textAlign: 'center',
    lineHeight: 1.5,
  };

  return (
    <div style={{ display: 'flex', height: '100%', background: '#111', overflow: 'hidden' }}>
      {status === 'loading' ? (
        <div style={{ width: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: 13 }}>
          Loading…
        </div>
      ) : status === 'error' ? (
        <div style={{ width: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e50914', fontSize: 13, padding: 16 }}>
          {error}
        </div>
      ) : (
        <div style={sidebarStyle}>
          <ChannelTabs
            activeTab={activeTab}
            onTabChange={setActiveTab}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            favouriteCount={settings.favouriteUrls.length}
          />
          {activeTab === 'favourites' && displayChannels.length === 0 ? (
            <div style={emptyHint}>
              No favourites yet.<br />Right-click a channel<br />to add it to Favourites.
            </div>
          ) : activeTab === 'categories' && categories ? (
            <CategoryList
              categories={categories}
              activeUrl={activeUrl}
              onSelect={handleSelect}
              onFocus={entry => prefetch(entry.m3uChannel.url)}
              onContextMenu={(entry, e) => setContextMenu({ entry, x: e.clientX, y: e.clientY })}
            />
          ) : (
            <ChannelList
              entries={displayChannels}
              activeUrl={activeUrl}
              onSelect={handleSelect}
              onFocus={entry => prefetch(entry.m3uChannel.url)}
              onContextMenu={(entry, e) => setContextMenu({ entry, x: e.clientX, y: e.clientY })}
            />
          )}
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ position: 'relative', height: '55%', flexShrink: 0, background: '#000' }}>
          {VideoComponent}
          <BufferHealthBadge status={controller.status} />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid #222' }}>
          <EpgGrid entries={displayChannels} />
        </div>
      </div>

      {contextMenu && (
        <ChannelContextMenu
          entry={contextMenu.entry}
          x={contextMenu.x}
          y={contextMenu.y}
          isFavourite={favourites.has(contextMenu.entry.m3uChannel.url)}
          onPlay={handleSelect}
          onToggleFavourite={toggleFavourite}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

// Renders categories as sections with collapsible headers
function CategoryList({
  categories,
  activeUrl,
  onSelect,
  onFocus,
  onContextMenu,
}: {
  categories: Map<string, ChannelEntry[]>;
  activeUrl: string | null;
  onSelect: (entry: ChannelEntry) => void;
  onFocus: (entry: ChannelEntry) => void;
  onContextMenu: (entry: ChannelEntry, e: React.MouseEvent) => void;
}): React.ReactElement {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleCollapse = (cat: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const catHeader: React.CSSProperties = {
    padding: '8px 14px',
    background: '#222',
    color: '#aaa',
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    cursor: 'pointer',
    borderBottom: '1px solid #333',
    display: 'flex',
    justifyContent: 'space-between',
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      {[...categories.entries()].map(([cat, entries]) => (
        <div key={cat}>
          <div style={catHeader} onClick={() => toggleCollapse(cat)}>
            <span>{cat}</span>
            <span style={{ color: '#666' }}>{entries.length}</span>
          </div>
          {!collapsed.has(cat) && (
            <ChannelList
              entries={entries}
              activeUrl={activeUrl}
              onSelect={onSelect}
              onFocus={onFocus}
              onContextMenu={onContextMenu}
            />
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Run lint and core tests to verify**

```bash
pnpm lint && pnpm test
```
Expected: 74 tests pass (71 existing + 3 new), lint clean.

- [ ] **Step 4: Commit**

```bash
git add packages/desktop/src/epg/EpgPage.tsx packages/desktop/src/epg/useEpgData.ts
git commit -m "feat(desktop): tabs, search, favourites, context menu, lazy EPG in EpgPage"
```

---

### Task 5: TV — ChannelTabs and ChannelContextMenu

**Files:**
- Create: `packages/tv/src/epg/components/ChannelTabs.tsx`
- Create: `packages/tv/src/epg/components/ChannelContextMenu.tsx`

- [ ] **Step 1: Write TV ChannelTabs component**

```tsx
// packages/tv/src/epg/components/ChannelTabs.tsx
import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

type Tab = 'favourites' | 'categories';

interface Props {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  favouriteCount: number;
}

export function ChannelTabs({
  activeTab,
  onTabChange,
  searchQuery,
  onSearchChange,
  favouriteCount,
}: Props): React.ReactElement {
  return (
    <View>
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search channels…"
          placeholderTextColor="#555"
          value={searchQuery}
          onChangeText={onSearchChange}
          autoCapitalize="none"
        />
      </View>
      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tab, activeTab === 'favourites' && styles.tabActive]}
          onPress={() => onTabChange('favourites')}
        >
          <Text style={[styles.tabText, activeTab === 'favourites' && styles.tabTextActive]}>
            ★ Favourites{favouriteCount > 0 ? ` (${favouriteCount})` : ''}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === 'categories' && styles.tabActive]}
          onPress={() => onTabChange('categories')}
        >
          <Text style={[styles.tabText, activeTab === 'categories' && styles.tabTextActive]}>
            📁 Categories
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  searchWrap: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  searchInput: {
    backgroundColor: '#222',
    color: '#fff',
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 18,
    borderWidth: 1,
    borderColor: '#333',
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#e50914',
  },
  tabText: {
    color: '#888',
    fontSize: 16,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#fff',
  },
});
```

- [ ] **Step 2: Write TV ChannelContextMenu component**

```tsx
// packages/tv/src/epg/components/ChannelContextMenu.tsx
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
```

- [ ] **Step 3: Commit**

```bash
git add packages/tv/src/epg/components/ChannelTabs.tsx packages/tv/src/epg/components/ChannelContextMenu.tsx
git commit -m "feat(tv): add ChannelTabs and ChannelContextMenu components"
```

---

### Task 6: TV — ChannelRow and ChannelList long press support

**Files:**
- Modify: `packages/tv/src/epg/components/ChannelRow.tsx`
- Modify: `packages/tv/src/epg/components/ChannelList.tsx`

- [ ] **Step 1: Add onLongPress to TV ChannelRow**

Replace `packages/tv/src/epg/components/ChannelRow.tsx`:

```tsx
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import type { ChannelEntry } from '../types';

interface Props {
  entry: ChannelEntry;
  isSelected: boolean;
  onSelect: () => void;
  onLongPress?: () => void;
}

export function ChannelRow({ entry, isSelected, onSelect, onLongPress }: Props): React.ReactElement {
  const { m3uChannel, nowNext } = entry;
  return (
    <Pressable
      style={[styles.row, isSelected && styles.rowSelected]}
      onPress={onSelect}
      onLongPress={onLongPress}
    >
      <View>
        <Text style={styles.name} numberOfLines={1}>{m3uChannel.name}</Text>
        {nowNext.now && (
          <Text style={styles.nowLabel} numberOfLines={1}>▶ {nowNext.now.title}</Text>
        )}
        {nowNext.next && (
          <Text style={styles.nextLabel} numberOfLines={1}>→ {nowNext.next.title}</Text>
        )}
      </View>
    </Pressable>
  );
}
```

Wait — the current ChannelRow uses `Pressable` which expects a single root element. The current code already has that. Let me provide the correct file. The change is:
1. Add `onLongPress` to Props
2. Pass `onLongPress={onLongPress}` to the Pressable
3. Import `View` is NOT needed — Pressable already has a single child (Text elements are wrapped in a fragment implicitly by JSX)

Actually, looking at the current code more carefully:

```tsx
<Pressable
  style={[styles.row, isSelected && styles.rowSelected]}
  onPress={onSelect}
>
  <Text style={styles.name} numberOfLines={1}>{m3uChannel.name}</Text>
  {nowNext.now && (
    <Text style={styles.nowLabel} numberOfLines={1}>▶ {nowNext.now.title}</Text>
  )}
  ...
</Pressable>
```

Pressable requires a single child. Currently there are multiple Text elements which violates it. But wait, React Native Pressable handles multiple children by wrapping them... actually no, Pressable expects a single child view.

Actually looking at the current code, it uses Pressable with 3 Text children directly. This works in React Native because they're automatically wrapped. But more importantly, this is the current state and it works. I just need to add `onLongPress` prop.

Correct implementation:

```tsx
// packages/tv/src/epg/components/ChannelRow.tsx
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import type { ChannelEntry } from '../types';

interface Props {
  entry: ChannelEntry;
  isSelected: boolean;
  onSelect: () => void;
  onLongPress?: () => void;
}

export function ChannelRow({ entry, isSelected, onSelect, onLongPress }: Props): React.ReactElement {
  const { m3uChannel, nowNext } = entry;
  return (
    <Pressable
      style={[styles.row, isSelected && styles.rowSelected]}
      onPress={onSelect}
      onLongPress={onLongPress}
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

- [ ] **Step 2: Add onLongPress to TV ChannelList**

Replace `packages/tv/src/epg/components/ChannelList.tsx`:

```tsx
import React from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import type { ChannelEntry } from '../types';
import { ChannelRow } from './ChannelRow';

interface Props {
  entries: ChannelEntry[];
  selectedUrl: string | null;
  onSelect: (entry: ChannelEntry) => void;
  onLongPress?: (entry: ChannelEntry) => void;
}

export function ChannelList({ entries, selectedUrl, onSelect, onLongPress }: Props): React.ReactElement {
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
            onLongPress={onLongPress ? () => onLongPress(item) : undefined}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, borderRightWidth: 1, borderRightColor: '#222' },
});
```

- [ ] **Step 3: Commit**

```bash
git add packages/tv/src/epg/components/ChannelRow.tsx packages/tv/src/epg/components/ChannelList.tsx
git commit -m "feat(tv): add long press support to ChannelRow and ChannelList"
```

---

### Task 7: TV — EpgScreen integration and lazy EPG

**Files:**
- Modify: `packages/tv/src/epg/EpgScreen.tsx`
- Modify: `packages/tv/src/epg/useEpgData.ts`

- [ ] **Step 1: Modify TV useEpgData for lazy Now/Next computation**

Replace `packages/tv/src/epg/useEpgData.ts`. Same pattern as desktop — return structural entries immediately, store raw EPG data, export `enrichEntry` helper:

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
  epgMapping: Map<string, string> | null;
  status: Status;
  error: string | null;
  reload: () => void;
}

/** Compute Now/Next and programmes for a single entry from raw EPG data. */
export function enrichEntry(
  entry: ChannelEntry,
  epgData: EpgData | null,
  mapping: Map<string, string> | null,
): ChannelEntry {
  if (!epgData || !mapping) return entry;
  const epgId = mapping.get(entry.m3uChannel.url);
  if (!epgId) return entry;
  const now = new Date();
  const progs = epgData.programmes
    .filter(p => p.channelId === epgId)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  return {
    ...entry,
    epgChannelId: epgId,
    nowNext: getNowNext(epgData.programmes, epgId, now),
    programs: progs,
  };
}

export function useEpgData(m3uUrl: string, xmltvUrl: string): UseEpgDataResult {
  const [channels, setChannels] = useState<ChannelEntry[]>([]);
  const [epgData, setEpgData] = useState<EpgData | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const reloadKey = useRef(0);
  const [tick, setTick] = useState(0);
  const epgMappingRef = useRef<Map<string, string> | null>(null);

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

        // Phase 1: structural entries immediately
        const structural: ChannelEntry[] = m3uChannels.map(ch => ({
          m3uChannel: ch,
          epgChannelId: undefined,
          nowNext: {},
          programs: [],
        }));
        setChannels(structural);
        setStatus('ready');

        if (xmltvText) {
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
              epgMappingRef.current = buildEpgMapping(m3uChannels, data.channels);
              setEpgData(data);
            } catch (err) {
              setError(err instanceof Error ? err.message : 'EPG parse error');
              setStatus('error');
            }
          });
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

  return { channels, epgData, epgMapping: epgMappingRef.current, status, error, reload };
}
```

- [ ] **Step 2: Rewrite TV EpgScreen with tabs, search, favourites, context menu**

Replace `packages/tv/src/epg/EpgScreen.tsx`:

```tsx
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

function groupByCategory(entries: ChannelEntry[]): Map<string, ChannelEntry[]> {
  const map = new Map<string, ChannelEntry[]>();
  for (const e of entries) {
    const cat = e.m3uChannel.groupTitle || 'Uncategorized';
    const list = map.get(cat);
    if (list) {
      list.push(e);
    } else {
      map.set(cat, [e]);
    }
  }
  return map;
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
  }, [channels, activeTab, searchQuery, favourites, epgData]);

  const categories = useMemo(() => {
    if (activeTab !== 'categories') return null;
    return groupByCategory(displayChannels);
  }, [activeTab, displayChannels]);

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

  // Full-screen player when a channel is selected
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
```

Note to implementer: The `PlayerScreen` on TV currently replaces the entire EpgScreen view (full-screen player). This is the existing TV pattern — no split-screen player like desktop. The `activeUrl` state replaces the previous `activeChannel` state.

- [ ] **Step 3: Run lint**

```bash
pnpm lint
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/tv/src/epg/EpgScreen.tsx packages/tv/src/epg/useEpgData.ts
git commit -m "feat(tv): tabs, search, favourites, context menu, lazy EPG in EpgScreen"
```

---

### Task 8: Full verification

- [ ] **Step 1: Run full test suite**

```bash
pnpm test && pnpm lint && pnpm typecheck
```
Expected: 74 tests pass, lint clean, typecheck clean.

- [ ] **Step 2: Update CLAUDE.md phase entry**

Add to the phase progress table in `CLAUDE.md`:
```markdown
| 9 — Channel navigation | ✅ complete | Tabs (Favourites/Categories), search, right-click/long-press context menu, favouriteUrls persistence, lazy EPG Now/Next — 74 tests, typecheck + lint clean |
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md — Phase 9 complete"
```

---

## Task completion checklist

| # | Task | Depends on |
|---|------|------------|
| 1 | Core — favouriteUrls in AppSettings | — |
| 2 | Desktop — ChannelTabs + ChannelContextMenu | — |
| 3 | Desktop — ChannelRow + ChannelList context menu | 2 |
| 4 | Desktop — EpgPage integration + lazy EPG | 1, 3 |
| 5 | TV — ChannelTabs + ChannelContextMenu | — |
| 6 | TV — ChannelRow + ChannelList long press | 5 |
| 7 | TV — EpgScreen integration + lazy EPG | 1, 6 |
| 8 | Full verification + CLAUDE.md update | all |
