import React, { useState } from 'react';
import { type AppSettings, type BufferProfile } from '@iptv-player/core';

interface Props {
  settings: AppSettings;
  onSave: (patch: Partial<AppSettings>) => void;
  onClose: () => void;
}

type NamedProfile = Exclude<BufferProfile['kind'], 'custom'>;

const PROFILES: { kind: NamedProfile; label: string; desc: string }[] = [
  { kind: 'conservative', label: 'Conservative', desc: '30 s buffer — less memory, faster channel start' },
  { kind: 'balanced', label: 'Balanced', desc: '60 s buffer — good for most connections' },
  { kind: 'aggressive', label: 'Aggressive', desc: '120 s buffer — best for slow or unreliable streams' },
];

export function SettingsPanel({ settings, onSave, onClose }: Props): React.ReactElement {
  const [m3uUrl, setM3uUrl] = useState(settings.m3uUrl);
  const [xmltvUrl, setXmltvUrl] = useState(settings.xmltvUrl);
  const [bufferProfile, setBufferProfile] = useState<BufferProfile>(settings.bufferProfile);
  const [prefetchEnabled, setPrefetchEnabled] = useState(settings.prefetchEnabled);

  const handleSave = () => {
    onSave({ m3uUrl, xmltvUrl, bufferProfile, prefetchEnabled });
    onClose();
  };

  return (
    <div style={overlay}>
      <div style={panel}>
        <div style={headerRow}>
          <span style={titleStyle}>Settings</span>
          <button style={closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={section}>
          <div style={sectionTitle}>Sources</div>
          <label style={labelStyle}>M3U URL</label>
          <input style={inputStyle} value={m3uUrl} onChange={e => setM3uUrl(e.target.value)} placeholder="https://example.com/playlist.m3u" />
          <label style={{ ...labelStyle, marginTop: 12 }}>XMLTV URL (optional)</label>
          <input style={inputStyle} value={xmltvUrl} onChange={e => setXmltvUrl(e.target.value)} placeholder="https://example.com/epg.xml" />
        </div>

        <div style={section}>
          <div style={sectionTitle}>Buffer Profile</div>
          {PROFILES.map(p => (
            <div
              key={p.kind}
              style={{ ...profileRow, ...(bufferProfile.kind === p.kind ? profileRowActive : {}) }}
              onClick={() => setBufferProfile({ kind: p.kind })}
            >
              <div style={profileLabel}>{p.label}</div>
              <div style={profileDesc}>{p.desc}</div>
            </div>
          ))}
        </div>

        <div style={section}>
          <div style={sectionTitle}>Prefetch</div>
          <label style={toggleRow}>
            <input type="checkbox" checked={prefetchEnabled} onChange={e => setPrefetchEnabled(e.target.checked)} />
            <span style={toggleLabel}>Pre-fetch channel manifest on hover (requires ≥ 2 Mbps)</span>
          </label>
        </div>

        <button style={saveBtn} onClick={handleSave}>Save Changes</button>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
};
const panel: React.CSSProperties = {
  background: '#1a1a1a', borderRadius: 10, padding: 28, width: 440,
  maxHeight: '80vh', overflowY: 'auto', border: '1px solid #333',
};
const headerRow: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24,
};
const titleStyle: React.CSSProperties = { color: '#fff', fontSize: 18, fontWeight: 700 };
const closeBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: '#aaa', fontSize: 18, cursor: 'pointer', lineHeight: 1,
};
const section: React.CSSProperties = { marginBottom: 24 };
const sectionTitle: React.CSSProperties = {
  color: '#aaa', fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: 1, marginBottom: 10,
};
const labelStyle: React.CSSProperties = { display: 'block', color: '#ccc', fontSize: 12, marginBottom: 4 };
const inputStyle: React.CSSProperties = {
  width: '100%', background: '#222', color: '#fff', border: '1px solid #333',
  borderRadius: 6, padding: '8px 12px', fontSize: 13, boxSizing: 'border-box', outline: 'none',
};
const profileRow: React.CSSProperties = {
  padding: '10px 14px', borderRadius: 6, border: '1px solid #333', marginBottom: 6, cursor: 'pointer',
};
const profileRowActive: React.CSSProperties = { borderColor: '#e50914', background: 'rgba(229,9,20,0.1)' };
const profileLabel: React.CSSProperties = { color: '#fff', fontSize: 13, fontWeight: 600 };
const profileDesc: React.CSSProperties = { color: '#888', fontSize: 11, marginTop: 2 };
const toggleRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' };
const toggleLabel: React.CSSProperties = { color: '#ccc', fontSize: 13 };
const saveBtn: React.CSSProperties = {
  width: '100%', background: '#e50914', color: '#fff', border: 'none', borderRadius: 6,
  padding: '12px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
};
