# Phase 4 — TV Platform Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold `packages/tv` as a typed react-native-tvos project with a `useRnVideoController` hook that implements `PlaybackController`, a `PlayerScreen`, and a `BufferHealthBadge` — all verified via `tsc --noEmit`.

**Architecture:** `useRnVideoController` owns state via `useReducer` and returns a stable `PlaybackController` object (via `useMemo(fn, [])` + a `useRef` for the current state) plus a `VideoComponent` element to render. `PlayerScreen` composes the two: renders `VideoComponent` and passes `controller.status` to `BufferHealthBadge`. The App root is minimal — real navigation wires in during Phase 6.

**Note on running the app:** Actual device/simulator runs require macOS (Xcode for tvOS) or a machine with Android SDK (Android TV). This phase delivers a type-clean TypeScript skeleton only. The `tsc --noEmit` check is the Phase 4 definition of done. Metro config and `index.js` are included so the project is ready to run when the environment allows.

**Tech Stack:** react-native-tvos (≈0.73.x, as "react-native" alias), react-native-video ^6.0.0, React 18, TypeScript 5.5 strict

---

## File Map

| Path | Role |
|------|------|
| `packages/tv/package.json` | Add react-native-tvos, react-native-video, react deps |
| `packages/tv/tsconfig.json` | Update: reference core, add JSX/RN settings |
| `packages/tv/metro.config.js` | Monorepo watchFolders + nodeModulesPaths |
| `packages/tv/app.json` | RN app name config |
| `packages/tv/index.js` | RN entry point (registers App) |
| `packages/tv/src/playback/RnVideoController.tsx` | `useRnVideoController` hook — implements `PlaybackController` |
| `packages/tv/src/ui/player/BufferHealthBadge.tsx` | Status overlay (buffering/loading/error) |
| `packages/tv/src/ui/player/PlayerScreen.tsx` | Full-screen player: video + badge |
| `packages/tv/src/App.tsx` | Root component |

---

### Task 1: Update package.json and install dependencies

**Files:**
- Modify: `packages/tv/package.json`

- [ ] **Step 1: Write the updated package.json**

Replace `packages/tv/package.json` with:

```json
{
  "name": "@iptv-player/tv",
  "version": "0.0.1",
  "private": true,
  "main": "index.js",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "start": "react-native start",
    "android": "react-native run-android",
    "ios": "react-native run-ios"
  },
  "dependencies": {
    "@iptv-player/core": "workspace:*",
    "react": "18.2.0",
    "react-native": "npm:react-native-tvos@^0.73.10-0",
    "react-native-video": "^6.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0"
  }
}
```

- [ ] **Step 2: Install**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm install 2>&1 | tail -10
```

Expected: `Done in Xs` — react-native-tvos, react-native-video, react, @types/react installed.

- [ ] **Step 3: Commit**

```bash
git add packages/tv/package.json pnpm-lock.yaml
git commit -m "chore(tv): add react-native-tvos and react-native-video dependencies"
```

---

### Task 2: TypeScript config

**Files:**
- Modify: `packages/tv/tsconfig.json`

- [ ] **Step 1: Write the updated tsconfig.json**

Replace `packages/tv/tsconfig.json` with:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "ES2020",
    "moduleResolution": "Bundler",
    "jsx": "react-native",
    "lib": ["ES2020"],
    "rootDir": "src",
    "noEmit": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "references": [{ "path": "../core" }]
}
```

- [ ] **Step 2: Confirm typecheck on stub passes**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm --filter @iptv-player/tv typecheck 2>&1
```

Expected: exits 0 (single placeholder file `src/index.ts` has no errors).

- [ ] **Step 3: Commit**

```bash
git add packages/tv/tsconfig.json
git commit -m "chore(tv): update tsconfig for React Native + core reference"
```

---

### Task 3: Metro config, app.json, index.js

**Files:**
- Create: `packages/tv/metro.config.js`
- Create: `packages/tv/app.json`
- Create: `packages/tv/index.js`

- [ ] **Step 1: Write metro.config.js**

Create `packages/tv/metro.config.js`:

```js
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

const workspaceRoot = path.resolve(__dirname, '../..');
const projectRoot = __dirname;

/** @type {import('@react-native/metro-config').MetroConfig} */
const config = {
  watchFolders: [workspaceRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(workspaceRoot, 'node_modules'),
    ],
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
```

- [ ] **Step 2: Write app.json**

Create `packages/tv/app.json`:

```json
{
  "name": "IPTVPlayer",
  "displayName": "IPTV Player"
}
```

- [ ] **Step 3: Write index.js**

Create `packages/tv/index.js`:

```js
import { AppRegistry } from 'react-native';
import { App } from './src/App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
```

- [ ] **Step 4: Commit**

```bash
git add packages/tv/metro.config.js packages/tv/app.json packages/tv/index.js
git commit -m "chore(tv): add Metro config, app.json, and entry point"
```

---

### Task 4: RnVideoController hook

**Files:**
- Create: `packages/tv/src/playback/RnVideoController.tsx`

- [ ] **Step 1: Write RnVideoController.tsx**

Create `packages/tv/src/playback/RnVideoController.tsx`:

```tsx
import React, { useCallback, useMemo, useReducer, useRef } from 'react';
import Video, {
  VideoRef,
  OnBufferData,
  OnLoadData,
  OnProgressData,
  OnVideoError,
} from 'react-native-video';
import {
  toPlatformParams,
  type BufferProfile,
  type PlaybackController,
  type PlaybackStatus,
} from '@iptv-player/core';

interface ControllerState {
  url: string | null;
  paused: boolean;
  bufferProfile: BufferProfile;
  status: PlaybackStatus;
}

type Action =
  | { type: 'LOAD'; url: string; bufferProfile: BufferProfile }
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'DISPOSE' }
  | { type: 'SET_STATUS'; status: PlaybackStatus };

const INITIAL: ControllerState = {
  url: null,
  paused: true,
  bufferProfile: { kind: 'balanced' },
  status: { kind: 'idle' },
};

function reducer(state: ControllerState, action: Action): ControllerState {
  switch (action.type) {
    case 'LOAD':
      return { ...state, url: action.url, bufferProfile: action.bufferProfile, paused: false, status: { kind: 'loading' } };
    case 'PLAY':
      return { ...state, paused: false };
    case 'PAUSE':
      return {
        ...state,
        paused: true,
        status:
          state.status.kind === 'playing'
            ? { kind: 'paused', positionMs: state.status.positionMs }
            : state.status,
      };
    case 'DISPOSE':
      return INITIAL;
    case 'SET_STATUS':
      return { ...state, status: action.status };
  }
}

export function useRnVideoController(): {
  controller: PlaybackController;
  VideoComponent: React.ReactElement | null;
} {
  const videoRef = useRef<VideoRef>(null);
  const [state, dispatch] = useReducer(reducer, INITIAL);

  // Ref holds the latest state so the stable controller object can read current status.
  const stateRef = useRef(state);
  stateRef.current = state;

  const controller = useMemo<PlaybackController>(
    () => ({
      load: (url: string, bufferProfile: BufferProfile) =>
        dispatch({ type: 'LOAD', url, bufferProfile }),
      play: () => dispatch({ type: 'PLAY' }),
      pause: () => dispatch({ type: 'PAUSE' }),
      seek: (positionMs: number) => videoRef.current?.seek(positionMs / 1000),
      dispose: () => dispatch({ type: 'DISPOSE' }),
      get status(): PlaybackStatus {
        return stateRef.current.status;
      },
    }),
    // stateRef is intentionally excluded: it's a ref (always current), not reactive state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const onBuffer = useCallback((data: OnBufferData) => {
    dispatch({
      type: 'SET_STATUS',
      status: data.isBuffering
        ? { kind: 'buffering', bufferPercent: 0 }
        : { kind: 'playing', positionMs: 0, durationMs: null },
    });
  }, []);

  const onProgress = useCallback((data: OnProgressData) => {
    dispatch({
      type: 'SET_STATUS',
      status: {
        kind: 'playing',
        positionMs: data.currentTime * 1000,
        durationMs: data.seekableDuration > 0 ? data.seekableDuration * 1000 : null,
      },
    });
  }, []);

  const onLoad = useCallback((_data: OnLoadData) => {
    if (!stateRef.current.paused) {
      dispatch({ type: 'SET_STATUS', status: { kind: 'playing', positionMs: 0, durationMs: null } });
    }
  }, []);

  const onError = useCallback((data: OnVideoError) => {
    const message =
      data.error.localizedDescription ??
      data.error.errorString ??
      'Playback error';
    dispatch({ type: 'SET_STATUS', status: { kind: 'error', message } });
  }, []);

  const exoParams = toPlatformParams(state.bufferProfile, 'android');
  const avParams = toPlatformParams(state.bufferProfile, 'tvos');

  const VideoComponent = state.url ? (
    <Video
      ref={videoRef}
      source={{ uri: state.url }}
      paused={state.paused}
      style={{ width: '100%', height: '100%' }}
      resizeMode="contain"
      bufferConfig={exoParams}
      preferredForwardBufferDuration={avParams.preferredForwardBufferDuration}
      onBuffer={onBuffer}
      onProgress={onProgress}
      onLoad={onLoad}
      onError={onError}
    />
  ) : null;

  return { controller, VideoComponent };
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/tv/src/playback/RnVideoController.tsx
git commit -m "feat(tv): add useRnVideoController hook implementing PlaybackController"
```

---

### Task 5: BufferHealthBadge

**Files:**
- Create: `packages/tv/src/ui/player/BufferHealthBadge.tsx`

- [ ] **Step 1: Write BufferHealthBadge.tsx**

Create `packages/tv/src/ui/player/BufferHealthBadge.tsx`:

```tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
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
    bottom: 48,
    left: 0,
    right: 0,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.72)',
    paddingVertical: 14,
  },
  // Large text for 10-foot TV viewing distance
  text: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add packages/tv/src/ui/player/BufferHealthBadge.tsx
git commit -m "feat(tv): add BufferHealthBadge status overlay"
```

---

### Task 6: PlayerScreen

**Files:**
- Create: `packages/tv/src/ui/player/PlayerScreen.tsx`

- [ ] **Step 1: Write PlayerScreen.tsx**

Create `packages/tv/src/ui/player/PlayerScreen.tsx`:

```tsx
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import type { BufferProfile } from '@iptv-player/core';
import { useRnVideoController } from '../../playback/RnVideoController';
import { BufferHealthBadge } from './BufferHealthBadge';

interface Props {
  streamUrl: string;
  bufferProfile?: BufferProfile;
}

export function PlayerScreen({
  streamUrl,
  bufferProfile = { kind: 'aggressive' },
}: Props): React.ReactElement {
  const { controller, VideoComponent } = useRnVideoController();

  useEffect(() => {
    controller.load(streamUrl, bufferProfile);
    return () => {
      controller.dispose();
    };
    // Re-load when the URL or profile changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

- [ ] **Step 2: Commit**

```bash
git add packages/tv/src/ui/player/PlayerScreen.tsx
git commit -m "feat(tv): add PlayerScreen with video and buffer status badge"
```

---

### Task 7: App root

**Files:**
- Modify: `packages/tv/src/index.ts` → replace with `packages/tv/src/App.tsx`

- [ ] **Step 1: Delete the stub and write App.tsx**

Delete `packages/tv/src/index.ts` and create `packages/tv/src/App.tsx`:

```tsx
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { PlayerScreen } from './ui/player/PlayerScreen';

// Demo stream — replace with a real channel URL from user's M3U source.
const DEMO_URL = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';

export function App(): React.ReactElement {
  const [started, setStarted] = useState(false);

  if (started) {
    return <PlayerScreen streamUrl={DEMO_URL} />;
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
    fontSize: 52,
    fontWeight: '700',
    letterSpacing: 1,
  },
  button: {
    backgroundColor: '#e50914',
    paddingHorizontal: 48,
    paddingVertical: 18,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '600',
  },
});
```

- [ ] **Step 2: Update index.js to remove .ts extension ambiguity**

The `packages/tv/index.js` imports `./src/App` — Metro resolves `.tsx` automatically. No change needed.

- [ ] **Step 3: Commit**

```bash
git rm packages/tv/src/index.ts
git add packages/tv/src/App.tsx
git commit -m "feat(tv): add App root with demo player launch"
```

---

### Task 8: Full typecheck + lint + final verification

- [ ] **Step 1: Typecheck the TV package**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm --filter @iptv-player/tv typecheck 2>&1
```

Expected: exits 0, no errors.

- [ ] **Step 2: Run lint**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm lint 2>&1
```

Expected: exits 0.

- [ ] **Step 3: Run core tests (must stay green)**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm test 2>&1 | tail -6
```

Expected: 58 tests pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(tv): Phase 4 complete — TV shell typechecks clean"
```

---

## Self-Review

**Spec coverage:**
- ✅ react-native-tvos (tvOS + Android TV target) — Task 1
- ✅ react-native-video with ExoPlayer bufferConfig + AVPlayer preferredForwardBufferDuration — Task 4
- ✅ PlaybackController implemented (RnVideoController) — Task 4
- ✅ BufferProfile → ExoBufferParams + AvPlayerBufferParams wired — Task 4
- ✅ Basic player screen with buffer health affordance — Tasks 5, 6
- ✅ Metro config for monorepo watchFolders — Task 3
- ✅ `tsc --noEmit` clean — Task 8

**What defers to later phases:**
- D-pad/remote focus engine (react-native-tvos focus model) — Phase 6 EPG UI
- Channel list, settings, EPG grid — Phases 6, 8
- Full navigation — Phase 6

**Placeholder scan:** none.

**Type consistency:** `PlaybackController`, `BufferProfile`, `PlaybackStatus`, `toPlatformParams` all imported from `@iptv-player/core`; same names as Phase 3 definitions ✅
