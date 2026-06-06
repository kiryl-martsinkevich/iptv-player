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
  }, [channels, activeTab, searchQuery, favourites, epgData, epgMapping]);

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
