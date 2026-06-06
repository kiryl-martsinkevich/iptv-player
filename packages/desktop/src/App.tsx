import React, { useState } from 'react';
import { EpgPage } from './epg/EpgPage';
import { useSettings } from './settings/useSettings';
import { SettingsPanel } from './settings/SettingsPanel';

export function App(): React.ReactElement {
  const { settings, updateSettings } = useSettings();
  const [showSettings, setShowSettings] = useState(false);
  const [m3uInput, setM3uInput] = useState(settings.m3uUrl);
  const [xmltvInput, setXmltvInput] = useState(settings.xmltvUrl);

  if (settings.m3uUrl) {
    return (
      <>
        <EpgPage
          m3uUrl={settings.m3uUrl}
          xmltvUrl={settings.xmltvUrl}
          bufferProfile={settings.bufferProfile}
          prefetchEnabled={settings.prefetchEnabled}
        />
        <button style={gearBtn} title="Settings" onClick={() => setShowSettings(true)}>⚙</button>
        {showSettings && (
          <SettingsPanel
            settings={settings}
            onSave={updateSettings}
            onClose={() => setShowSettings(false)}
          />
        )}
      </>
    );
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
        onClick={() => m3uInput && updateSettings({ m3uUrl: m3uInput, xmltvUrl: xmltvInput })}
      >
        Load Channels
      </button>
    </div>
  );
}

const splash: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  height: '100%', background: '#111',
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
const gearBtn: React.CSSProperties = {
  position: 'fixed', bottom: 16, right: 16, background: 'rgba(0,0,0,0.6)',
  border: '1px solid #444', borderRadius: '50%', width: 40, height: 40,
  color: '#fff', fontSize: 18, cursor: 'pointer', display: 'flex',
  alignItems: 'center', justifyContent: 'center', zIndex: 50,
};
