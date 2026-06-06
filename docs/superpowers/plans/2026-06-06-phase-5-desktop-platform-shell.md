# Phase 5 — Desktop Platform Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold `packages/desktop` as a Vite + react-native-web app with a `useHlsJsController` hook implementing `PlaybackController` via hls.js (HLS) and mpegts.js (raw MPEG-TS), plus a basic player UI — all verified via `tsc --noEmit` and ESLint.

**Architecture:** `useHlsJsController` manages an `HTMLVideoElement` ref. It initialises an `Hls` or `mpegts.Player` instance when `load()` is called (via a `useEffect` on `state.url`), attaches native DOM event listeners once on mount for status transitions, and returns a stable `PlaybackController` (same `useMemo(fn, [])` + `useRef(state)` pattern as Phase 4) plus a `VideoComponent` element to render. The stream type is detected from the URL (`.ts` / `mpegts` → mpegts.js; everything else → hls.js). `toPlatformParams(profile, 'web')` drives both hls.js config and mpegts.js lazyLoadMaxDuration. React-native-web is aliased as `react-native` in Vite so desktop UI components are authored with RN primitives (View, Text, etc.) and render as HTML.

**Note on Tauri:** The Tauri native shell (`src-tauri/`) requires a Rust toolchain and `cargo tauri init`. That is deferred — this phase delivers the Vite web layer (which runs standalone as a normal browser app and inside Tauri's webview equally). Add `@tauri-apps/api` dep so Tauri JS calls can be added later without a dep bump.

**Tech stack:** React 18, react-native-web 0.19, hls.js ^1.5, mpegts.js ^1.7, Vite 5, @vitejs/plugin-react, TypeScript 5.5 strict

---

## File Map

| Path | Role |
|------|------|
| `packages/desktop/package.json` | Add hls.js, mpegts.js, react, react-dom, react-native-web, vite, @tauri-apps/api |
| `packages/desktop/tsconfig.json` | Add core reference, noEmit; keep DOM lib |
| `packages/desktop/vite.config.ts` | @vitejs/plugin-react + alias react-native → react-native-web |
| `packages/desktop/index.html` | Vite entry HTML |
| `packages/desktop/src/main.tsx` | React DOM root render |
| `packages/desktop/src/App.tsx` | App root (replaces stub) |
| `packages/desktop/src/playback/HlsJsController.tsx` | `useHlsJsController` hook — PlaybackController over hls.js + mpegts.js |
| `packages/desktop/src/ui/player/BufferHealthBadge.tsx` | Status overlay (react-native-web View/Text) |
| `packages/desktop/src/ui/player/PlayerPage.tsx` | Full-screen player: video element + badge |

---

### Task 1: Update package.json and install

**Files:**
- Modify: `packages/desktop/package.json`

- [ ] **Step 1: Write the updated package.json**

Replace `packages/desktop/package.json` with:

```json
{
  "name": "@iptv-player/desktop",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@iptv-player/core": "workspace:*",
    "@tauri-apps/api": "^2.0.0",
    "hls.js": "^1.5.0",
    "mpegts.js": "^1.7.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-native-web": "^0.19.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^5.4.0"
  }
}
```

- [ ] **Step 2: Install**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm install 2>&1 | tail -5
```

Expected: `Done in Xs` with hls.js, mpegts.js, react-native-web installed.

- [ ] **Step 3: Verify hls.js and mpegts.js types are available**

```bash
find /home/kiryl/workspace/claude/code/xplatform/iptv-player/node_modules/.pnpm -path "*/hls.js/dist/*.d.ts" | head -3
find /home/kiryl/workspace/claude/code/xplatform/iptv-player/node_modules/.pnpm -path "*/mpegts.js/d.ts/*.d.ts" | head -3
```

Expected: `.d.ts` files visible for both packages.

---

### Task 2: TypeScript config

**Files:**
- Modify: `packages/desktop/tsconfig.json`

- [ ] **Step 1: Write the updated tsconfig.json**

Replace `packages/desktop/tsconfig.json` with:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "rootDir": "src",
    "noEmit": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*", "vite.config.ts"],
  "references": [{ "path": "../core" }]
}
```

- [ ] **Step 2: Confirm typecheck on stub still passes**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm --filter @iptv-player/desktop typecheck 2>&1
```

Expected: exits 0.

---

### Task 3: Vite config and HTML entry

**Files:**
- Create: `packages/desktop/vite.config.ts`
- Create: `packages/desktop/index.html`

- [ ] **Step 1: Write vite.config.ts**

Create `packages/desktop/vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Allow desktop UI components to import from 'react-native' — they render as HTML via react-native-web.
      'react-native': 'react-native-web',
    },
  },
});
```

- [ ] **Step 2: Write index.html**

Create `packages/desktop/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>IPTV Player</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      html, body, #root { width: 100%; height: 100%; background: #111; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Confirm vite.config.ts typechecks (it's in the include)**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm --filter @iptv-player/desktop typecheck 2>&1
```

Expected: exits 0.

---

### Task 4: HlsJsController hook

**Files:**
- Create: `packages/desktop/src/playback/HlsJsController.tsx`

This is the main Phase 5 deliverable. The hook:
- Detects stream type (hls vs mpegts) from the URL
- Initialises the correct player when `state.url` changes
- Attaches HTML video element event listeners on mount for status transitions
- Returns a stable `PlaybackController` object plus a `<video>` element to render

- [ ] **Step 1: Check hls.js type exports**

```bash
grep -n "^export\|Hls.Events\|Events =" \
  /home/kiryl/workspace/claude/code/xplatform/iptv-player/node_modules/.pnpm/hls.js*/node_modules/hls.js/dist/hls.d.ts \
  2>/dev/null | head -30
```

Use this to confirm correct import shape (`import Hls from 'hls.js'`).

- [ ] **Step 2: Check mpegts.js type exports**

```bash
find /home/kiryl/workspace/claude/code/xplatform/iptv-player/node_modules/.pnpm -name "*.d.ts" -path "*/mpegts.js/*" 2>/dev/null | head -5
```

Confirm the createPlayer / Player types.

- [ ] **Step 3: Write HlsJsController.tsx**

Create `packages/desktop/src/playback/HlsJsController.tsx` with contents that match the exact types confirmed in Steps 1 and 2. Template (adjust imports/types per findings):

```tsx
import React, { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import Hls from 'hls.js';
import mpegts from 'mpegts.js';
import {
  toPlatformParams,
  type BufferProfile,
  type PlaybackController,
  type PlaybackStatus,
} from '@iptv-player/core';

// Detect whether a URL is raw MPEG-TS (mpegts.js) or HLS/other (hls.js).
function isMpegTs(url: string): boolean {
  const q = url.split('?')[0].toLowerCase();
  return q.endsWith('.ts') || q.includes('mpegts') || q.includes('mpeg-ts');
}

interface ControllerState {
  url: string | null;
  bufferProfile: BufferProfile;
  status: PlaybackStatus;
}

type Action =
  | { type: 'LOAD'; url: string; bufferProfile: BufferProfile }
  | { type: 'DISPOSE' }
  | { type: 'SET_STATUS'; status: PlaybackStatus };

const INITIAL: ControllerState = {
  url: null,
  bufferProfile: { kind: 'balanced' },
  status: { kind: 'idle' },
};

function reducer(state: ControllerState, action: Action): ControllerState {
  switch (action.type) {
    case 'LOAD':
      return { ...state, url: action.url, bufferProfile: action.bufferProfile, status: { kind: 'loading' } };
    case 'DISPOSE':
      return INITIAL;
    case 'SET_STATUS':
      return { ...state, status: action.status };
  }
}

export function useHlsJsController(): {
  controller: PlaybackController;
  VideoComponent: React.ReactElement;
} {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const mpegtsRef = useRef<mpegts.Player | null>(null);
  const [state, dispatch] = useReducer(reducer, INITIAL);

  // Ref holds latest state so the stable controller object always reads current status.
  const stateRef = useRef(state);
  stateRef.current = state;

  // --- Stable controller object ---
  const controller = useMemo<PlaybackController>(() => ({
    load: (url: string, bufferProfile: BufferProfile) =>
      dispatch({ type: 'LOAD', url, bufferProfile }),
    play: () => { videoRef.current?.play(); },
    pause: () => {
      videoRef.current?.pause();
      const pos = videoRef.current ? videoRef.current.currentTime * 1000 : 0;
      dispatch({ type: 'SET_STATUS', status: { kind: 'paused', positionMs: pos } });
    },
    seek: (positionMs: number) => {
      if (videoRef.current) videoRef.current.currentTime = positionMs / 1000;
    },
    dispose: () => dispatch({ type: 'DISPOSE' }),
    get status(): PlaybackStatus {
      return stateRef.current.status;
    },
  }), []);

  // --- DOM event listeners (mount once; video element is stable) ---
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onWaiting = () =>
      dispatch({ type: 'SET_STATUS', status: { kind: 'buffering', bufferPercent: 0 } });

    const onPlaying = () =>
      dispatch({
        type: 'SET_STATUS',
        status: {
          kind: 'playing',
          positionMs: video.currentTime * 1000,
          durationMs: isFinite(video.duration) ? video.duration * 1000 : null,
        },
      });

    const onTimeUpdate = () => {
      if (!video.paused && !video.seeking) {
        dispatch({
          type: 'SET_STATUS',
          status: {
            kind: 'playing',
            positionMs: video.currentTime * 1000,
            durationMs: isFinite(video.duration) ? video.duration * 1000 : null,
          },
        });
      }
    };

    const onError = () => {
      const msg = video.error?.message ?? 'Playback error';
      dispatch({ type: 'SET_STATUS', status: { kind: 'error', message: msg } });
    };

    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('error', onError);

    return () => {
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('error', onError);
    };
  }, []);

  // --- Player initialisation / teardown on URL change ---
  useEffect(() => {
    const video = videoRef.current;

    // Tear down previous player
    hlsRef.current?.destroy();
    hlsRef.current = null;
    if (mpegtsRef.current) {
      mpegtsRef.current.destroy();
      mpegtsRef.current = null;
    }

    if (!state.url || !video) return;

    const hlsParams = toPlatformParams(state.bufferProfile, 'web');

    if (isMpegTs(state.url)) {
      const player = mpegts.createPlayer(
        { type: 'mpegts', url: state.url, isLive: true },
        {
          enableWorker: true,
          lazyLoadMaxDuration: hlsParams.maxBufferLength,
          seekType: 'range',
        },
      );
      player.attachMediaElement(video);
      player.load();
      player.play();
      mpegtsRef.current = player;
    } else if (Hls.isSupported()) {
      const hls = new Hls({
        maxBufferLength: hlsParams.maxBufferLength,
        maxMaxBufferLength: hlsParams.maxMaxBufferLength,
        backBufferLength: hlsParams.backBufferLength,
        maxBufferSize: hlsParams.maxBufferSize,
        liveSyncDuration: hlsParams.liveSyncDuration,
        liveMaxLatencyDuration: hlsParams.liveMaxLatencyDuration,
      });
      hls.loadSource(state.url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => { video.play(); });
      hlsRef.current = hls;
    } else {
      // Safari: native HLS
      video.src = state.url;
      video.play();
    }

    return () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
      if (mpegtsRef.current) {
        mpegtsRef.current.destroy();
        mpegtsRef.current = null;
      }
      video.removeAttribute('src');
      video.load();
    };
  }, [state.url, state.bufferProfile]);

  // VideoComponent: always rendered so videoRef is always populated.
  const VideoComponent = (
    <div style={{ width: '100%', height: '100%', backgroundColor: '#000' }}>
      <video
        ref={videoRef}
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        playsInline
      />
    </div>
  );

  return { controller, VideoComponent };
}
```

- [ ] **Step 4: Adjust the template if hls.js or mpegts.js type imports differ from above**

Common pitfalls:
- hls.js may export `Hls` as a named export: `import { Hls } from 'hls.js'`
- mpegts.js may need `import * as mpegts from 'mpegts.js'`
- `Hls.Config` fields (`maxBufferLength`, etc.) — confirm they exist as properties (not nested)

- [ ] **Step 5: Typecheck**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm --filter @iptv-player/desktop typecheck 2>&1
```

Expected: exits 0.

---

### Task 5: BufferHealthBadge

**Files:**
- Create: `packages/desktop/src/ui/player/BufferHealthBadge.tsx`

Uses `View` and `Text` from `react-native-web` (aliased as `react-native` in Vite, but since TypeScript doesn't know about the alias, import directly from `react-native-web`).

- [ ] **Step 1: Write BufferHealthBadge.tsx**

Create `packages/desktop/src/ui/player/BufferHealthBadge.tsx`:

```tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native-web';
import type { PlaybackStatus } from '@iptv-player/core';

interface Props {
  status: PlaybackStatus;
}

export function BufferHealthBadge({ status }: Props): React.ReactElement | null {
  let label: string | null = null;

  if (status.kind === 'loading') label = 'Loading…';
  else if (status.kind === 'buffering') label = 'Buffering…';
  else if (status.kind === 'error') label = `⚠ ${status.message}`;

  if (label === null) return null;

  return (
    <View style={styles.overlay}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.72)',
    paddingVertical: 10,
  },
  text: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
```

- [ ] **Step 2: Typecheck**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm --filter @iptv-player/desktop typecheck 2>&1
```

Expected: exits 0.

---

### Task 6: PlayerPage

**Files:**
- Create: `packages/desktop/src/ui/player/PlayerPage.tsx`

- [ ] **Step 1: Write PlayerPage.tsx**

Create `packages/desktop/src/ui/player/PlayerPage.tsx`:

```tsx
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native-web';
import type { BufferProfile } from '@iptv-player/core';
import { useHlsJsController } from '../../playback/HlsJsController';
import { BufferHealthBadge } from './BufferHealthBadge';

interface Props {
  streamUrl: string;
  bufferProfile?: BufferProfile;
}

export function PlayerPage({
  streamUrl,
  bufferProfile = { kind: 'aggressive' },
}: Props): React.ReactElement {
  const { controller, VideoComponent } = useHlsJsController();

  useEffect(() => {
    controller.load(streamUrl, bufferProfile);
    return () => {
      controller.dispose();
    };
    // Re-load when the stream URL changes; bufferProfile intentionally excluded.
  }, [streamUrl]);

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

---

### Task 7: App root and main entry

**Files:**
- Create: `packages/desktop/src/main.tsx`
- Create/replace: `packages/desktop/src/App.tsx` (replaces the stub `src/index.ts`)

- [ ] **Step 1: Write App.tsx**

Create `packages/desktop/src/App.tsx`:

```tsx
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native-web';
import { PlayerPage } from './ui/player/PlayerPage';

// Demo HLS stream — replace with a real channel URL from the user's M3U source.
const DEMO_URL = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';

export function App(): React.ReactElement {
  const [started, setStarted] = useState(false);

  if (started) {
    return <PlayerPage streamUrl={DEMO_URL} />;
  }

  return (
    <View style={styles.splash}>
      <Text style={styles.title}>IPTV Player</Text>
      <TouchableOpacity style={styles.button} onPress={() => setStarted(true)}>
        <Text style={styles.buttonText}>Play Demo Stream</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
  },
  title: {
    color: '#fff',
    fontSize: 40,
    fontWeight: '700',
    letterSpacing: 1,
  },
  button: {
    backgroundColor: '#e50914',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 6,
    cursor: 'pointer',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
```

- [ ] **Step 2: Write main.tsx**

Create `packages/desktop/src/main.tsx`:

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const root = document.getElementById('root');
if (!root) throw new Error('#root element missing from index.html');
createRoot(root).render(<App />);
```

- [ ] **Step 3: Delete the placeholder stub**

```bash
rm packages/desktop/src/index.ts
```

---

### Task 8: Full verification

- [ ] **Step 1: Typecheck**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm --filter @iptv-player/desktop typecheck 2>&1
```

Expected: exits 0.

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

- [ ] **Step 4: Update CLAUDE.md phase progress**

Mark Phase 5 ✅ complete with exact library versions installed.

---

## Self-Review

**Spec coverage:**
- ✅ Vite + react-native-web shell (Tauri JS bindings added; native shell deferred to Rust setup) — Tasks 1–3
- ✅ react-native-web aliased as `react-native` in Vite config — Task 3
- ✅ HlsJsController implementing PlaybackController — Task 4
- ✅ hls.js config driven by `toPlatformParams(profile, 'web')` — Task 4
- ✅ mpegts.js for raw MPEG-TS with lazyLoadMaxDuration from buffer profile — Task 4
- ✅ Stream type detection (URL-based) — Task 4
- ✅ Basic player UI (BufferHealthBadge, PlayerPage) using react-native-web primitives — Tasks 5–6
- ✅ App root + React DOM entry point — Task 7

**What defers:**
- Tauri `src-tauri/` Rust scaffolding — requires `cargo tauri init`
- Shared UI components between TV + desktop — Phase 6 EPG UI
- mpegts.js `seekType: 'range'` — type may need cast if not in d.ts; handle in Task 4 Step 4

**Placeholder scan:** none — all code is complete.

**Type consistency:** `PlaybackController`, `BufferProfile`, `PlaybackStatus`, `toPlatformParams` imported from `@iptv-player/core`; same names as Phases 3–4 ✅. `HlsBufferParams` fields match hls.js `Hls.Config` field names ✅.
