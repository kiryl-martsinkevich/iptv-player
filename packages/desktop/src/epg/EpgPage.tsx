import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  const { channels, epgData, epgMapping, programmesById, status, error, refreshing } = useEpgData(m3uUrl, xmltvUrl);
  const { settings, updateSettings } = useSettings();
  const { controller, VideoComponent } = useHlsJsController();
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('favourites');
  const [searchInput, setSearchInput] = useState('');
  // Debounce the filter query so enrichment runs only after typing stops.
  // The input field uses searchInput (instant feedback); filtering uses
  // searchQuery (debounced) so keystrokes don't trigger 500+ enrichEntry calls.
  const [searchQuery, setSearchQuery] = useState('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const onSearchChange = (value: string) => {
    setSearchInput(value);
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setSearchQuery(value), 200);
  };
  useEffect(() => () => clearTimeout(searchTimerRef.current), []);

  const [contextMenu, setContextMenu] = useState<{ entry: ChannelEntry; x: number; y: number } | null>(null);
  const [volume, setVolume] = useState(1);
  const { prefetch } = usePrefetch(prefetchEnabled, 2);

  const favourites = useMemo(() => new Set(settings.favouriteUrls), [settings.favouriteUrls]);

  // Enrich visible entries with Now/Next + programmes on demand.
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

    return filtered.map(e => enrichEntry(e, epgData, epgMapping, programmesById));
  }, [channels, activeTab, searchQuery, favourites, epgData, epgMapping, programmesById]);

  const categories = useMemo(() => {
    if (activeTab !== 'categories') return null;
    return groupByCategory(displayChannels);
  }, [activeTab, displayChannels]);

  // Category collapse state — lifted so EpgGrid can filter to expanded categories
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    if (!categories) return new Set();
    return new Set(categories.keys());
  });

  // Reset collapsed when categories change (tab switch, search, reload)
  const categoriesKey = useMemo(() => {
    if (!categories) return '';
    return [...categories.keys()].join('|');
  }, [categories]);

  // Sync collapsed when category set changes (tab switch, search, reload)
  useEffect(() => {
    if (!categories) return;
    setCollapsed(new Set(categories.keys()));
  }, [categories, categoriesKey]);

  const toggleCollapse = (cat: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  // EPG grid shows only channels from expanded categories (or selected channel)
  const gridChannels = useMemo(() => {
    if (activeUrl) {
      // Show only the playing channel's timeline
      return displayChannels.filter(c => c.m3uChannel.url === activeUrl);
    }
    if (activeTab === 'categories' && categories) {
      // Show only channels from expanded categories
      const visibleUrls = new Set<string>();
      for (const [cat, entries] of categories) {
        if (!collapsed.has(cat)) {
          for (const e of entries) {
            visibleUrls.add(e.m3uChannel.url);
          }
        }
      }
      return displayChannels.filter(c => visibleUrls.has(c.m3uChannel.url));
    }
    // Favourites tab: show all (they're all visible)
    return displayChannels;
  }, [displayChannels, activeUrl, activeTab, categories, collapsed]);

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

  const refreshBar: React.CSSProperties = {
    height: 2,
    background: refreshing ? '#e50914' : 'transparent',
    transition: 'background 0.3s',
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
            searchQuery={searchInput}
            onSearchChange={onSearchChange}
            favouriteCount={settings.favouriteUrls.length}
          />
          <div style={refreshBar} title={refreshing ? 'Refreshing…' : undefined} />
          {activeTab === 'favourites' && displayChannels.length === 0 ? (
            <div style={emptyHint}>
              No favourites yet.<br />Right-click a channel<br />to add it to Favourites.
            </div>
          ) : activeTab === 'categories' && categories ? (
            <CategoryList
              categories={categories}
              activeUrl={activeUrl}
              collapsed={collapsed}
              onToggleCollapse={toggleCollapse}
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
          <div style={{
            position: 'absolute', bottom: 8, left: 8, right: 8,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ color: '#888', fontSize: 11 }}>🔊</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={e => {
                const v = parseFloat(e.target.value);
                setVolume(v);
                controller.setVolume(v);
              }}
              style={{ flex: 1, accentColor: '#e50914' }}
            />
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid #222' }}>
          <EpgGrid entries={gridChannels} />
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
  collapsed,
  onToggleCollapse,
  onSelect,
  onFocus,
  onContextMenu,
}: {
  categories: Map<string, ChannelEntry[]>;
  activeUrl: string | null;
  collapsed: Set<string>;
  onToggleCollapse: (cat: string) => void;
  onSelect: (entry: ChannelEntry) => void;
  onFocus: (entry: ChannelEntry) => void;
  onContextMenu: (entry: ChannelEntry, e: React.MouseEvent) => void;
}): React.ReactElement {
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
          <div style={catHeader} onClick={() => onToggleCollapse(cat)}>
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
