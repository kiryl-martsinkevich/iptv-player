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
