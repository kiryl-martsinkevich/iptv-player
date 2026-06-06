import React, { useState } from 'react';
import { PlayerPage } from './ui/player/PlayerPage';

// Demo HLS stream — replace with a real channel URL from the user's M3U source.
const DEMO_URL = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';

export function App(): React.ReactElement {
  const [started, setStarted] = useState(false);

  if (started) {
    return <PlayerPage streamUrl={DEMO_URL} />;
  }

  return (
    <div style={splash}>
      <p style={title}>IPTV Player</p>
      <button style={button} onClick={() => setStarted(true)}>
        Play Demo Stream
      </button>
    </div>
  );
}

const splash: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  background: '#111',
  gap: 32,
};

const title: React.CSSProperties = {
  color: '#fff',
  fontSize: 40,
  fontWeight: 700,
  letterSpacing: 1,
  margin: 0,
};

const button: React.CSSProperties = {
  background: '#e50914',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  padding: '14px 32px',
  fontSize: 18,
  fontWeight: 600,
  cursor: 'pointer',
};
