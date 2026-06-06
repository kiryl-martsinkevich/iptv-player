# Phase 8 — Settings UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent settings system with a buffer-profile selector, prefetch toggle, and source management — so users never have to re-enter URLs and can tune buffering per their connection.

**Architecture:** A `AppSettings` type + `mergeSettings` helper live in core. Each platform has its own `useSettings` hook backed by `localStorage` (desktop) or `AsyncStorage` (TV) and a settings UI component (panel/modal). Both `EpgPage` (desktop) and `EpgScreen` (TV) accept `bufferProfile` as a prop rather than hardcoding it. The gear button floats over the player screen and opens the settings overlay.

**Tech Stack:** TypeScript strict, React hooks, `localStorage` (desktop), `@react-native-async-storage/async-storage` (TV), React Native Modal, React Native StyleSheet.

---

## File Map

| Path | Role |
|------|------|
| `packages/core/src/settings/appSettings.ts` | `AppSettings` interface, `DEFAULT_SETTINGS`, `mergeSettings` helper |
| `packages/core/tests/settings/appSettings.test.ts` | Unit tests for `mergeSettings` and `DEFAULT_SETTINGS` |
| `packages/core/src/index.ts` | Re-export `AppSettings`, `DEFAULT_SETTINGS`, `mergeSettings` |
| `packages/desktop/src/settings/useSettings.ts` | `localStorage`-backed settings hook |
| `packages/desktop/src/settings/SettingsPanel.tsx` | Modal overlay: buffer profile selector + prefetch toggle + source edit |
| `packages/desktop/src/App.tsx` | Wire `useSettings` + `SettingsPanel` + pass settings to EpgPage |
| `packages/desktop/src/epg/EpgPage.tsx` | Accept `bufferProfile` + `prefetchEnabled` props (stop hardcoding) |
| `packages/tv/src/settings/useSettings.ts` | `AsyncStorage`-backed settings hook |
| `packages/tv/src/settings/SettingsModal.tsx` | RN Modal: buffer profile selector + source edit |
| `packages/tv/src/App.tsx` | Wire `useSettings` + `SettingsModal` + pass settings to EpgScreen |
| `packages/tv/src/epg/EpgScreen.tsx` | Accept `bufferProfile` prop + pass to `PlayerScreen` |
| `CLAUDE.md` | Phase 8 → ✅ complete |

---

### Task 1: Core `AppSettings` type + `mergeSettings` + tests

**Files:**
- Create: `packages/core/src/settings/appSettings.ts`
- Create: `packages/core/tests/settings/appSettings.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/core/tests/settings/appSettings.test.ts
import { DEFAULT_SETTINGS, mergeSettings } from '../../src/settings/appSettings';
import { toPlatformParams } from '../../src/playback/bufferProfile';

describe('DEFAULT_SETTINGS', () => {
  it('has a valid bufferProfile', () => {
    expect(() => toPlatformParams(DEFAULT_SETTINGS.bufferProfile, 'web')).not.toThrow();
  });

  it('has prefetchEnabled false', () => {
    expect(DEFAULT_SETTINGS.prefetchEnabled).toBe(false);
  });

  it('has empty source URLs', () => {
    expect(DEFAULT_SETTINGS.m3uUrl).toBe('');
    expect(DEFAULT_SETTINGS.xmltvUrl).toBe('');
  });
});

describe('mergeSettings', () => {
  it('returns defaults for empty partial', () => {
    expect(mergeSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it('overrides m3uUrl while preserving other defaults', () => {
    const result = mergeSettings({ m3uUrl: 'https://example.com/playlist.m3u' });
    expect(result.m3uUrl).toBe('https://example.com/playlist.m3u');
    expect(result.xmltvUrl).toBe('');
    expect(result.bufferProfile).toEqual({ kind: 'aggressive' });
    expect(result.prefetchEnabled).toBe(false);
  });

  it('overrides bufferProfile', () => {
    const result = mergeSettings({ bufferProfile: { kind: 'conservative' } });
    expect(result.bufferProfile).toEqual({ kind: 'conservative' });
    expect(result.m3uUrl).toBe('');
  });

  it('enables prefetch when specified', () => {
    const result = mergeSettings({ prefetchEnabled: true });
    expect(result.prefetchEnabled).toBe(true);
    expect(result.bufferProfile).toEqual({ kind: 'aggressive' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm test:core --testPathPattern=appSettings 2>&1
```

Expected: FAIL — `Cannot find module '../../src/settings/appSettings'`

- [ ] **Step 3: Write `appSettings.ts`**

```ts
// packages/core/src/settings/appSettings.ts
import type { BufferProfile } from '../playback/bufferProfile';

export interface AppSettings {
  m3uUrl: string;
  xmltvUrl: string;
  bufferProfile: BufferProfile;
  prefetchEnabled: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  m3uUrl: '',
  xmltvUrl: '',
  bufferProfile: { kind: 'aggressive' },
  prefetchEnabled: false,
};

export function mergeSettings(partial: Partial<AppSettings>): AppSettings {
  return { ...DEFAULT_SETTINGS, ...partial };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm test:core --testPathPattern=appSettings 2>&1
```

Expected: `Tests: 7 passed`

- [ ] **Step 5: Export from core index**

Add to `packages/core/src/index.ts` (append after the resilience exports at the end):

```ts
export type { AppSettings } from './settings/appSettings';
export { DEFAULT_SETTINGS, mergeSettings } from './settings/appSettings';
```

Full final `packages/core/src/index.ts`:

```ts
// Parsers
export type { M3uChannel } from './parsers/m3u';
export { parseM3u } from './parsers/m3u';

export type { XmltvChannel, XmltvProgramme, XmltvResult } from './parsers/xmltv';
export { parseXmltv } from './parsers/xmltv';

export type { XtreamCredentials, XtreamCategory, XtreamStream, XtreamEpgEntry } from './parsers/xtream';
export { XtreamClient } from './parsers/xtream';

// EPG
export type { EpgChannel, EpgProgramme, EpgData, NowNext } from './epg/types';
export { getNowNext } from './epg/types';

export { buildEpgMapping } from './epg/mapper';

export type { EpgSnapshot, SerializedProgramme } from './epg/cache';
export { serializeEpg, deserializeEpg } from './epg/cache';

// Playback
export type { PlaybackStatus, PlaybackController } from './playback/controller';

export type {
  ExoBufferParams,
  AvPlayerBufferParams,
  HlsBufferParams,
  CustomBufferParams,
  BufferProfile,
  Platform,
} from './playback/bufferProfile';
export { toPlatformParams } from './playback/bufferProfile';

export type { ResilienceConfig } from './playback/resilienceConfig';
export { getRetryDelay } from './playback/resilienceConfig';

// Settings
export type { AppSettings } from './settings/appSettings';
export { DEFAULT_SETTINGS, mergeSettings } from './settings/appSettings';
```

- [ ] **Step 6: Typecheck core**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm typecheck 2>&1
```

Expected: exits 0.

- [ ] **Step 7: Run all tests**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm test 2>&1 | tail -6
```

Expected: `Tests: 69 passed` (62 existing + 7 new).

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/settings/appSettings.ts \
        packages/core/tests/settings/appSettings.test.ts \
        packages/core/src/index.ts
git commit -m "feat(core): AppSettings type, DEFAULT_SETTINGS, mergeSettings"
```

---

### Task 2: Desktop settings hook + panel + App.tsx + EpgPage wiring

**Files:**
- Create: `packages/desktop/src/settings/useSettings.ts`
- Create: `packages/desktop/src/settings/SettingsPanel.tsx`
- Modify: `packages/desktop/src/App.tsx`
- Modify: `packages/desktop/src/epg/EpgPage.tsx`

- [ ] **Step 1: Write `useSettings.ts`**

```ts
// packages/desktop/src/settings/useSettings.ts
import { useState, useCallback } from 'react';
import { type AppSettings, DEFAULT_SETTINGS, mergeSettings } from '@iptv-player/core';

const STORAGE_KEY = 'iptv-player-settings';

function load(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return mergeSettings(JSON.parse(raw) as Partial<AppSettings>);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function save(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {}
}

export function useSettings(): {
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
} {
  const [settings, setSettings] = useState<AppSettings>(load);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      save(next);
      return next;
    });
  }, []);

  return { settings, updateSettings };
}
```

- [ ] **Step 2: Write `SettingsPanel.tsx`**

```tsx
// packages/desktop/src/settings/SettingsPanel.tsx
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
```

- [ ] **Step 3: Update `EpgPage.tsx` to accept `bufferProfile` + `prefetchEnabled` props**

Replace `packages/desktop/src/epg/EpgPage.tsx`:

```tsx
// packages/desktop/src/epg/EpgPage.tsx
import React, { useState } from 'react';
import { type BufferProfile } from '@iptv-player/core';
import { useHlsJsController } from '../playback/HlsJsController';
import { BufferHealthBadge } from '../ui/player/BufferHealthBadge';
import type { ChannelEntry } from './types';
import { ChannelList } from './components/ChannelList';
import { EpgGrid } from './components/EpgGrid';
import { useEpgData } from './useEpgData';
import { usePrefetch } from './usePrefetch';

interface Props {
  m3uUrl: string;
  xmltvUrl: string;
  bufferProfile: BufferProfile;
  prefetchEnabled: boolean;
}

export function EpgPage({ m3uUrl, xmltvUrl, bufferProfile, prefetchEnabled }: Props): React.ReactElement {
  const { channels, status, error } = useEpgData(m3uUrl, xmltvUrl);
  const { controller, VideoComponent } = useHlsJsController();
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const { prefetch } = usePrefetch(prefetchEnabled, 2);

  const handleSelect = (entry: ChannelEntry) => {
    setActiveUrl(entry.m3uChannel.url);
    controller.load(entry.m3uChannel.url, bufferProfile, { stallTimeoutSec: 8, retryMaxDelayMs: 30_000 });
  };

  return (
    <div style={{ display: 'flex', height: '100%', background: '#111', overflow: 'hidden' }}>
      {status === 'loading' ? (
        <div style={{ width: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: 13 }}>
          Loading…
        </div>
      ) : status === 'error' ? (
        <div style={{ width: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e50914', fontSize: 13, padding: 16 }}>
          {error}
        </div>
      ) : (
        <ChannelList entries={channels} activeUrl={activeUrl} onSelect={handleSelect} onFocus={entry => prefetch(entry.m3uChannel.url)} />
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ position: 'relative', height: '55%', flexShrink: 0, background: '#000' }}>
          {VideoComponent}
          <BufferHealthBadge status={controller.status} />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid #222' }}>
          <EpgGrid entries={channels} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Update `App.tsx` to wire settings + settings panel**

Replace `packages/desktop/src/App.tsx`:

```tsx
// packages/desktop/src/App.tsx
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
```

- [ ] **Step 5: Typecheck desktop**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm --filter @iptv-player/desktop typecheck 2>&1
```

Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add packages/desktop/src/settings/useSettings.ts \
        packages/desktop/src/settings/SettingsPanel.tsx \
        packages/desktop/src/App.tsx \
        packages/desktop/src/epg/EpgPage.tsx
git commit -m "feat(desktop): settings persistence, buffer profile selector, prefetch toggle"
```

---

### Task 3: TV settings persistence + modal + App.tsx + EpgScreen wiring

**Files:**
- Install: `@react-native-async-storage/async-storage` in `packages/tv`
- Create: `packages/tv/src/settings/useSettings.ts`
- Create: `packages/tv/src/settings/SettingsModal.tsx`
- Modify: `packages/tv/src/App.tsx`
- Modify: `packages/tv/src/epg/EpgScreen.tsx`

- [ ] **Step 1: Install AsyncStorage**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm --filter @iptv-player/tv add @react-native-async-storage/async-storage 2>&1
```

Expected: package added, `packages/tv/package.json` updated.

- [ ] **Step 2: Write `useSettings.ts`**

```ts
// packages/tv/src/settings/useSettings.ts
import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { type AppSettings, DEFAULT_SETTINGS, mergeSettings } from '@iptv-player/core';

const STORAGE_KEY = '@iptv-player/settings';

export function useSettings(): {
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
  loading: boolean;
} {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => {
        if (raw) setSettings(mergeSettings(JSON.parse(raw) as Partial<AppSettings>));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  return { settings, updateSettings, loading };
}
```

- [ ] **Step 3: Write `SettingsModal.tsx`**

```tsx
// packages/tv/src/settings/SettingsModal.tsx
import React, { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { type AppSettings, type BufferProfile } from '@iptv-player/core';

interface Props {
  visible: boolean;
  settings: AppSettings;
  onSave: (patch: Partial<AppSettings>) => void;
  onClose: () => void;
}

type NamedProfile = Exclude<BufferProfile['kind'], 'custom'>;

const PROFILES: { kind: NamedProfile; label: string; desc: string }[] = [
  { kind: 'conservative', label: 'Conservative', desc: '30 s — less memory, faster start' },
  { kind: 'balanced', label: 'Balanced', desc: '60 s — good for most connections' },
  { kind: 'aggressive', label: 'Aggressive', desc: '120 s — best for slow or unreliable streams' },
];

export function SettingsModal({ visible, settings, onSave, onClose }: Props): React.ReactElement {
  const [m3uUrl, setM3uUrl] = useState(settings.m3uUrl);
  const [xmltvUrl, setXmltvUrl] = useState(settings.xmltvUrl);
  const [bufferProfile, setBufferProfile] = useState<BufferProfile>(settings.bufferProfile);

  const handleSave = () => {
    onSave({ m3uUrl, xmltvUrl, bufferProfile });
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <ScrollView style={styles.panel} contentContainerStyle={styles.content}>
          <Text style={styles.heading}>Settings</Text>

          <Text style={styles.sectionTitle}>Sources</Text>
          <Text style={styles.label}>M3U URL</Text>
          <TextInput
            style={styles.input}
            value={m3uUrl}
            onChangeText={setM3uUrl}
            placeholder="https://example.com/playlist.m3u"
            placeholderTextColor="#555"
            autoCapitalize="none"
          />
          <Text style={styles.label}>XMLTV URL (optional)</Text>
          <TextInput
            style={styles.input}
            value={xmltvUrl}
            onChangeText={setXmltvUrl}
            placeholder="https://example.com/epg.xml"
            placeholderTextColor="#555"
            autoCapitalize="none"
          />

          <Text style={styles.sectionTitle}>Buffer Profile</Text>
          {PROFILES.map(p => (
            <TouchableOpacity
              key={p.kind}
              style={[styles.profileRow, bufferProfile.kind === p.kind && styles.profileRowActive]}
              onPress={() => setBufferProfile({ kind: p.kind })}
            >
              <Text style={styles.profileLabel}>{p.label}</Text>
              <Text style={styles.profileDesc}>{p.desc}</Text>
            </TouchableOpacity>
          ))}

          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center' },
  panel: { width: 600, maxHeight: '80%', backgroundColor: '#1a1a1a', borderRadius: 12, borderWidth: 1, borderColor: '#333' },
  content: { padding: 36 },
  heading: { color: '#fff', fontSize: 34, fontWeight: '700', marginBottom: 28 },
  sectionTitle: { color: '#aaa', fontSize: 16, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginTop: 20, marginBottom: 12 },
  label: { color: '#ccc', fontSize: 18, marginBottom: 8 },
  input: { backgroundColor: '#222', color: '#fff', fontSize: 18, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 16, borderWidth: 1, borderColor: '#333' },
  profileRow: { padding: 16, borderRadius: 8, borderWidth: 1, borderColor: '#333', marginBottom: 8 },
  profileRowActive: { borderColor: '#e50914', backgroundColor: 'rgba(229,9,20,0.1)' },
  profileLabel: { color: '#fff', fontSize: 20, fontWeight: '600' },
  profileDesc: { color: '#888', fontSize: 16, marginTop: 4 },
  btnRow: { flexDirection: 'row', gap: 12, marginTop: 28 },
  cancelBtn: { flex: 1, borderRadius: 8, borderWidth: 1, borderColor: '#555', paddingVertical: 16, alignItems: 'center' },
  cancelBtnText: { color: '#aaa', fontSize: 20, fontWeight: '600' },
  saveBtn: { flex: 1, backgroundColor: '#e50914', borderRadius: 8, paddingVertical: 16, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 20, fontWeight: '600' },
});
```

- [ ] **Step 4: Update `EpgScreen.tsx` to accept `bufferProfile` prop**

Replace `packages/tv/src/epg/EpgScreen.tsx`:

```tsx
// packages/tv/src/epg/EpgScreen.tsx
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { type BufferProfile } from '@iptv-player/core';
import { PlayerScreen } from '../ui/player/PlayerScreen';
import { ChannelList } from './components/ChannelList';
import { EpgGrid } from './components/EpgGrid';
import type { ChannelEntry } from './types';
import { useEpgData } from './useEpgData';

interface Props {
  m3uUrl: string;
  xmltvUrl: string;
  bufferProfile: BufferProfile;
}

export function EpgScreen({ m3uUrl, xmltvUrl, bufferProfile }: Props): React.ReactElement {
  const { channels, status, error } = useEpgData(m3uUrl, xmltvUrl);
  const [activeChannel, setActiveChannel] = useState<ChannelEntry | null>(null);

  if (activeChannel) {
    return (
      <PlayerScreen
        streamUrl={activeChannel.m3uChannel.url}
        bufferProfile={bufferProfile}
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

- [ ] **Step 5: Update `App.tsx` to wire settings, loading state, settings modal**

Replace `packages/tv/src/App.tsx`:

```tsx
// packages/tv/src/App.tsx
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { EpgScreen } from './epg/EpgScreen';
import { useSettings } from './settings/useSettings';
import { SettingsModal } from './settings/SettingsModal';

export function App(): React.ReactElement {
  const { settings, updateSettings, loading } = useSettings();
  const [showSettings, setShowSettings] = useState(false);
  const [m3uInput, setM3uInput] = useState('');
  const [xmltvInput, setXmltvInput] = useState('');

  // Pre-fill inputs once settings load from AsyncStorage
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!loading && !initializedRef.current) {
      initializedRef.current = true;
      setM3uInput(settings.m3uUrl);
      setXmltvInput(settings.xmltvUrl);
    }
  }, [loading, settings.m3uUrl, settings.xmltvUrl]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#e50914" />
      </View>
    );
  }

  if (settings.m3uUrl) {
    return (
      <View style={styles.fill}>
        <EpgScreen
          m3uUrl={settings.m3uUrl}
          xmltvUrl={settings.xmltvUrl}
          bufferProfile={settings.bufferProfile}
        />
        <TouchableOpacity style={styles.gearBtn} onPress={() => setShowSettings(true)}>
          <Text style={styles.gearText}>⚙</Text>
        </TouchableOpacity>
        <SettingsModal
          visible={showSettings}
          settings={settings}
          onSave={updateSettings}
          onClose={() => setShowSettings(false)}
        />
      </View>
    );
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
        onPress={() => m3uInput && updateSettings({ m3uUrl: m3uInput, xmltvUrl: xmltvInput })}
        disabled={!m3uInput}
      >
        <Text style={styles.btnText}>Load Channels</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111' },
  setup: { flex: 1, backgroundColor: '#111', justifyContent: 'center', paddingHorizontal: 80 },
  heading: { color: '#fff', fontSize: 48, fontWeight: '700', marginBottom: 40, textAlign: 'center' },
  label: { color: '#aaa', fontSize: 22, marginBottom: 8 },
  input: {
    backgroundColor: '#222', color: '#fff', fontSize: 20, borderRadius: 8,
    paddingHorizontal: 20, paddingVertical: 14, marginBottom: 24, borderWidth: 1, borderColor: '#333',
  },
  btn: { backgroundColor: '#e50914', borderRadius: 8, paddingVertical: 18, alignItems: 'center', marginTop: 8 },
  btnDisabled: { backgroundColor: '#555' },
  btnText: { color: '#fff', fontSize: 26, fontWeight: '700' },
  gearBtn: {
    position: 'absolute', bottom: 24, right: 24,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 22, width: 44, height: 44,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#444',
  },
  gearText: { color: '#fff', fontSize: 20 },
});
```

- [ ] **Step 6: Typecheck TV**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm --filter @iptv-player/tv typecheck 2>&1
```

Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add packages/tv/package.json \
        packages/tv/src/settings/useSettings.ts \
        packages/tv/src/settings/SettingsModal.tsx \
        packages/tv/src/App.tsx \
        packages/tv/src/epg/EpgScreen.tsx
git commit -m "feat(tv): AsyncStorage settings persistence, buffer profile selector, settings modal"
```

---

### Task 4: Full verification + CLAUDE.md update

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Full typecheck (both packages)**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm --filter @iptv-player/tv typecheck 2>&1 && echo "TV OK" && \
pnpm --filter @iptv-player/desktop typecheck 2>&1 && echo "Desktop OK"
```

Expected: `TV OK` then `Desktop OK`.

- [ ] **Step 2: Lint**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm lint 2>&1
```

Expected: exits 0.

- [ ] **Step 3: All tests**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm test 2>&1 | tail -6
```

Expected: `Tests: 69 passed` (62 existing + 7 new settings tests).

- [ ] **Step 4: Update CLAUDE.md**

In `CLAUDE.md`, replace the Phase 8 table row:

```
| 8 — Settings UI | pending | Buffer profile selector, source management |
```

with:

```
| 8 — Settings UI | ✅ complete | AppSettings (m3uUrl, xmltvUrl, bufferProfile, prefetchEnabled) + mergeSettings in core; desktop: localStorage useSettings + SettingsPanel (profile selector, prefetch toggle, source edit) + gear button; TV: AsyncStorage useSettings + SettingsModal + gear button; EpgPage/EpgScreen accept bufferProfile prop — 69 tests, typechecks + lint clean |
```

- [ ] **Step 5: Final commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md — Phase 8 complete"
```

---

## Self-Review

**Spec coverage:**
- ✅ Buffer profile selector — `SettingsPanel` (desktop) + `SettingsModal` (TV): conservative / balanced / aggressive; active profile highlighted; selection saved to storage
- ✅ Source management — M3U URL + XMLTV URL editable in settings panel, persisted to localStorage (desktop) / AsyncStorage (TV); auto-launch when URL already saved; re-entry via splash form on first launch
- ✅ Prefetch toggle — `SettingsPanel` has checkbox for `prefetchEnabled`; `EpgPage` passes it to `usePrefetch`; TV modal omits it (prefetch is desktop-only feature)
- ✅ Settings persistence — localStorage (desktop, synchronous), AsyncStorage (TV, async with loading spinner)
- ✅ bufferProfile threaded — `EpgPage` and `EpgScreen` accept `bufferProfile` prop instead of hardcoding `{ kind: 'aggressive' }`

**Placeholder scan:** none.

**Type consistency:**
- `AppSettings` imported from `@iptv-player/core` in all four settings files ✅
- `mergeSettings(JSON.parse(raw) as Partial<AppSettings>)` — matches `mergeSettings(partial: Partial<AppSettings>)` ✅
- `NamedProfile = Exclude<BufferProfile['kind'], 'custom'>` — consistent in both SettingsPanel and SettingsModal ✅
- `EpgPage` Props: `bufferProfile: BufferProfile` — matches `DEFAULT_SETTINGS.bufferProfile: BufferProfile` ✅
- `EpgScreen` Props: `bufferProfile: BufferProfile` — passes to `PlayerScreen` which accepts `bufferProfile?: BufferProfile` ✅
- TV `App.tsx` `useSettings` returns `{ settings, updateSettings, loading }` — all three are used ✅
- Desktop `App.tsx` `useSettings` returns `{ settings, updateSettings }` — no loading needed (localStorage is synchronous) ✅
