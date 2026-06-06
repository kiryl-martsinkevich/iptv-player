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
