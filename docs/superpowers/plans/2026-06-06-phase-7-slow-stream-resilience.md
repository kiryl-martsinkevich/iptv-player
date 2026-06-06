# Phase 7 — Slow-Stream Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ABR capping, bitrate lock, stall watchdog, retry-with-backoff, and bandwidth-aware prefetch to both platform controllers so streams stay alive on slow or flaky connections.

**Architecture:**
A new `ResilienceConfig` type in core carries all five knobs (`abrCapBps`, `bitrateLock`, `stallTimeoutSec`, `retryMaxDelayMs`, `prefetchEnabled`/`prefetchMinBandwidthMbps`). `PlaybackController.load()` gains an optional third argument for it. Both platform controllers read `ResilienceConfig` from state and apply it to the underlying player: hls.js `maxBitrate`/`currentLevel`, react-native-video `maxBitRate`/`selectedVideoTrack`; both get a `setInterval` stall watchdog and an ERROR-event backoff retry. Desktop also gets a `usePrefetch` hook that fires `fetch()` on channel hover to prime the browser HTTP cache.

**Tech stack:** TypeScript strict, jest (core tests), hls.js 1.x events API (`Hls.Events.ERROR`, `MANIFEST_PARSED`, `LEVEL_SWITCHING`), react-native-video `maxBitRate` + `selectedVideoTrack` props, Web Navigation Information API (`navigator.connection`), `fetch` cache priming.

---

## File Map

| Path | Role |
|------|------|
| `packages/core/src/playback/resilienceConfig.ts` | `ResilienceConfig` interface + `getRetryDelay()` pure function |
| `packages/core/tests/playback/resilienceConfig.test.ts` | Unit tests for `getRetryDelay` |
| `packages/core/src/playback/controller.ts` | Extend `load()` signature to accept optional `ResilienceConfig` |
| `packages/core/src/index.ts` | Re-export `ResilienceConfig`, `getRetryDelay` |
| `packages/desktop/src/playback/HlsJsController.tsx` | ABR cap + bitrate lock + stall watchdog + retry backoff |
| `packages/tv/src/playback/RnVideoController.tsx` | ABR cap + bitrate lock + stall watchdog + retry backoff |
| `packages/desktop/src/epg/usePrefetch.ts` | Bandwidth check + fire-and-forget manifest fetch on hover |
| `packages/desktop/src/epg/components/ChannelRow.tsx` | Add `onMouseEnter?: () => void` prop |
| `packages/desktop/src/epg/components/ChannelList.tsx` | Thread `onFocus` through to ChannelRow |
| `packages/desktop/src/epg/EpgPage.tsx` | Wire `usePrefetch` + pass resilience config to controller |
| `CLAUDE.md` | Phase 7 → ✅ complete |

---

### Task 1: Core — `ResilienceConfig` + `getRetryDelay` + tests

**Files:**
- Create: `packages/core/src/playback/resilienceConfig.ts`
- Create: `packages/core/tests/playback/resilienceConfig.test.ts`
- Modify: `packages/core/src/playback/controller.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/tests/playback/resilienceConfig.test.ts
import { getRetryDelay } from '../../src/playback/resilienceConfig';

describe('getRetryDelay', () => {
  it('returns 1 s on first retry', () => {
    expect(getRetryDelay(0)).toBe(1_000);
  });

  it('doubles on each retry', () => {
    expect(getRetryDelay(1)).toBe(2_000);
    expect(getRetryDelay(2)).toBe(4_000);
    expect(getRetryDelay(3)).toBe(8_000);
  });

  it('caps at 30 s by default', () => {
    expect(getRetryDelay(5)).toBe(30_000);
    expect(getRetryDelay(10)).toBe(30_000);
    expect(getRetryDelay(100)).toBe(30_000);
  });

  it('respects a custom cap', () => {
    expect(getRetryDelay(2, 3_000)).toBe(3_000); // 4000 clamped to 3000
    expect(getRetryDelay(0, 500)).toBe(500);      // 1000 clamped to 500
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm test:core --testPathPattern=resilienceConfig 2>&1
```

Expected: FAIL — `Cannot find module '../../src/playback/resilienceConfig'`

- [ ] **Step 3: Write `resilienceConfig.ts`**

```ts
// packages/core/src/playback/resilienceConfig.ts
export interface ResilienceConfig {
  /** Cap ABR quality ladder at this bitrate (bps). Prevents jumping to HD on slow links. */
  abrCapBps?: number;
  /** Pin playback to the lowest available quality rung. Stops oscillation entirely. */
  bitrateLock?: boolean;
  /** Stall watchdog: seconds without position advance before forcing a rebuffer. Default: 8. */
  stallTimeoutSec?: number;
  /** Retry backoff: upper bound on retry delay (ms). Default: 30 000. */
  retryMaxDelayMs?: number;
  /** Enable manifest pre-fetching on channel hover. Default: false. */
  prefetchEnabled?: boolean;
  /** Prefetch is skipped when estimated bandwidth is below this threshold (Mbps). Default: 2. */
  prefetchMinBandwidthMbps?: number;
}

/** Exponential backoff: 1 s, 2 s, 4 s … capped at maxDelayMs (default 30 s). */
export function getRetryDelay(retryCount: number, maxDelayMs = 30_000): number {
  return Math.min(1_000 * Math.pow(2, retryCount), maxDelayMs);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm test:core --testPathPattern=resilienceConfig 2>&1
```

Expected: `Tests: 5 passed`

- [ ] **Step 5: Extend `PlaybackController.load()` to accept optional `ResilienceConfig`**

Replace `packages/core/src/playback/controller.ts`:

```ts
import type { BufferProfile } from './bufferProfile';
import type { ResilienceConfig } from './resilienceConfig';

export type PlaybackStatus =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'buffering'; bufferPercent: number }
  | { kind: 'playing'; positionMs: number; durationMs: number | null }
  | { kind: 'paused'; positionMs: number }
  | { kind: 'error'; message: string };

/**
 * Platform-agnostic playback contract.
 *   packages/tv      → RnVideoController  (react-native-video: ExoPlayer on Android, AVPlayer on tvOS)
 *   packages/desktop → HlsJsController    (hls.js + mpegts.js)
 */
export interface PlaybackController {
  load(url: string, bufferProfile: BufferProfile, resilienceConfig?: ResilienceConfig): void;
  play(): void;
  pause(): void;
  seek(positionMs: number): void;
  dispose(): void;
  readonly status: PlaybackStatus;
}
```

- [ ] **Step 6: Export from core index**

Add to `packages/core/src/index.ts` (append after the existing playback exports):

```ts
export type { ResilienceConfig } from './playback/resilienceConfig';
export { getRetryDelay } from './playback/resilienceConfig';
```

- [ ] **Step 7: Typecheck core**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm typecheck 2>&1
```

Expected: exits 0. (TV and desktop still compile because `resilienceConfig` is optional.)

- [ ] **Step 8: Run all tests**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm test 2>&1 | tail -6
```

Expected: `Tests: 63 passed` (58 existing + 5 new)

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/playback/resilienceConfig.ts \
        packages/core/tests/playback/resilienceConfig.test.ts \
        packages/core/src/playback/controller.ts \
        packages/core/src/index.ts
git commit -m "feat(core): add ResilienceConfig type and getRetryDelay helper"
```

---

### Task 2: Desktop controller resilience

**Files:**
- Modify: `packages/desktop/src/playback/HlsJsController.tsx`

Add four capabilities to `HlsJsController`: ABR cap (`maxBitrate` Hls config), bitrate lock (pin level 0 on `MANIFEST_PARSED` + re-pin on `LEVEL_SWITCHING`), stall watchdog (2 s interval, seeks +0.1 s when playhead freezes), and retry backoff (`Hls.Events.ERROR` fatal → dispatch `RETRY` after exponential delay).

- [ ] **Step 1: Write the new `HlsJsController.tsx`**

```tsx
// packages/desktop/src/playback/HlsJsController.tsx
import React, { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import Hls from 'hls.js';
import Mpegts from 'mpegts.js';
import {
  getRetryDelay,
  toPlatformParams,
  type BufferProfile,
  type PlaybackController,
  type PlaybackStatus,
  type ResilienceConfig,
} from '@iptv-player/core';

function isMpegTs(url: string): boolean {
  const path = url.split('?')[0].toLowerCase();
  return path.endsWith('.ts') || path.includes('mpegts') || path.includes('mpeg-ts');
}

interface ControllerState {
  url: string | null;
  bufferProfile: BufferProfile;
  resilienceConfig: ResilienceConfig;
  retryTick: number;
  status: PlaybackStatus;
}

type Action =
  | { type: 'LOAD'; url: string; bufferProfile: BufferProfile; resilienceConfig: ResilienceConfig }
  | { type: 'DISPOSE' }
  | { type: 'SET_STATUS'; status: PlaybackStatus }
  | { type: 'RETRY' };

const INITIAL: ControllerState = {
  url: null,
  bufferProfile: { kind: 'balanced' },
  resilienceConfig: {},
  retryTick: 0,
  status: { kind: 'idle' },
};

function reducer(state: ControllerState, action: Action): ControllerState {
  switch (action.type) {
    case 'LOAD':
      return {
        ...state,
        url: action.url,
        bufferProfile: action.bufferProfile,
        resilienceConfig: action.resilienceConfig,
        retryTick: 0,
        status: { kind: 'loading' },
      };
    case 'DISPOSE':
      return INITIAL;
    case 'SET_STATUS':
      return { ...state, status: action.status };
    case 'RETRY':
      return { ...state, retryTick: state.retryTick + 1, status: { kind: 'loading' } };
  }
}

export function useHlsJsController(): {
  controller: PlaybackController;
  VideoComponent: React.ReactElement;
} {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const mpegtsRef = useRef<Mpegts.Player | null>(null);
  const [state, dispatch] = useReducer(reducer, INITIAL);

  const stateRef = useRef(state);
  stateRef.current = state;

  const cancelledRef = useRef(false);

  const controller = useMemo<PlaybackController>(
    () => ({
      load: (url: string, bufferProfile: BufferProfile, resilienceConfig: ResilienceConfig = {}) =>
        dispatch({ type: 'LOAD', url, bufferProfile, resilienceConfig }),
      play: () => {
        videoRef.current?.play().catch(() => {});
      },
      pause: () => {
        videoRef.current?.pause();
        const posMs = videoRef.current ? videoRef.current.currentTime * 1000 : 0;
        dispatch({ type: 'SET_STATUS', status: { kind: 'paused', positionMs: posMs } });
      },
      seek: (positionMs: number) => {
        if (videoRef.current) videoRef.current.currentTime = positionMs / 1000;
      },
      dispose: () => {
        videoRef.current?.pause();
        dispatch({ type: 'DISPOSE' });
      },
      get status(): PlaybackStatus {
        return stateRef.current.status;
      },
    }),
    [],
  );

  // --- DOM event listeners (attached once) ---
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

  // --- Player init / teardown (re-runs on new URL, profile, or retry tick) ---
  useEffect(() => {
    const video = videoRef.current;

    cancelledRef.current = false;

    hlsRef.current?.destroy();
    hlsRef.current = null;
    if (mpegtsRef.current) {
      mpegtsRef.current.destroy();
      mpegtsRef.current = null;
    }

    if (!state.url || !video) return;

    const { resilienceConfig } = state;
    const hlsParams = toPlatformParams(state.bufferProfile, 'web');
    const stallTimeoutSec = resilienceConfig.stallTimeoutSec ?? 8;
    const TICK_MS = 2_000;

    // --- Stall watchdog ---
    let lastCurrentTime = video.currentTime;
    let stallTicks = 0;
    const stallTimer = setInterval(() => {
      if (video.paused || stateRef.current.status.kind !== 'playing') {
        stallTicks = 0;
        return;
      }
      const ct = video.currentTime;
      if (ct === lastCurrentTime) {
        stallTicks++;
        if (stallTicks * TICK_MS >= stallTimeoutSec * 1_000) {
          video.currentTime = ct + 0.1;
          dispatch({ type: 'SET_STATUS', status: { kind: 'buffering', bufferPercent: 0 } });
          stallTicks = 0;
        }
      } else {
        stallTicks = 0;
      }
      lastCurrentTime = ct;
    }, TICK_MS);

    if (isMpegTs(state.url)) {
      const player = Mpegts.createPlayer(
        { type: 'mpegts', url: state.url, isLive: true },
        {
          enableWorker: true,
          lazyLoadMaxDuration: hlsParams.maxBufferLength,
          seekType: 'range',
        },
      );
      player.attachMediaElement(video);
      player.load();
      player.play()?.catch(() => {});
      mpegtsRef.current = player;
    } else if (Hls.isSupported()) {
      const hls = new Hls({
        maxBufferLength: hlsParams.maxBufferLength,
        maxMaxBufferLength: hlsParams.maxMaxBufferLength,
        backBufferLength: hlsParams.backBufferLength,
        maxBufferSize: hlsParams.maxBufferSize,
        liveSyncDuration: hlsParams.liveSyncDuration,
        liveMaxLatencyDuration: hlsParams.liveMaxLatencyDuration,
        // ABR cap: 0 means no cap (hls.js default)
        maxBitrate: resilienceConfig.abrCapBps ?? 0,
      });

      hls.loadSource(state.url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (resilienceConfig.bitrateLock) {
          // Level 0 = lowest bitrate (hls.js sorts ascending)
          hls.currentLevel = 0;
        }
        video.play().catch(() => {});
      });

      if (resilienceConfig.bitrateLock) {
        // Re-pin if something tries to switch up
        hls.on(Hls.Events.LEVEL_SWITCHING, () => {
          if (hls.currentLevel !== 0) hls.currentLevel = 0;
        });
      }

      // Retry with backoff on fatal errors
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return;
        const maxDelayMs = stateRef.current.resilienceConfig.retryMaxDelayMs ?? 30_000;
        const delay = getRetryDelay(stateRef.current.retryTick, maxDelayMs);
        setTimeout(() => {
          if (!cancelledRef.current) dispatch({ type: 'RETRY' });
        }, delay);
      });

      hlsRef.current = hls;
    } else {
      // Safari native HLS
      video.src = state.url;
      video.play().catch(() => {});
    }

    return () => {
      cancelledRef.current = true;
      clearInterval(stallTimer);
      hlsRef.current?.destroy();
      hlsRef.current = null;
      if (mpegtsRef.current) {
        mpegtsRef.current.destroy();
        mpegtsRef.current = null;
      }
      video.removeAttribute('src');
      video.load();
    };
  }, [state.url, state.bufferProfile, state.retryTick]);

  const VideoComponent = useCallback(
    () => (
      <div style={{ width: '100%', height: '100%', backgroundColor: '#000' }}>
        <video
          ref={videoRef}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          playsInline
        />
      </div>
    ),
    [],
  );

  return { controller, VideoComponent: <VideoComponent /> };
}
```

- [ ] **Step 2: Typecheck desktop**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm --filter @iptv-player/desktop typecheck 2>&1
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add packages/desktop/src/playback/HlsJsController.tsx
git commit -m "feat(desktop): ABR cap, bitrate lock, stall watchdog, retry backoff in HlsJsController"
```

---

### Task 3: TV controller resilience

**Files:**
- Modify: `packages/tv/src/playback/RnVideoController.tsx`

Add `ResilienceConfig` to state, wire `maxBitRate` prop (ABR cap / bitrate lock), stall watchdog via wall-clock tracking of `onProgress` calls, and retry backoff in `onError`.

- [ ] **Step 1: Write the new `RnVideoController.tsx`**

```tsx
// packages/tv/src/playback/RnVideoController.tsx
import React, { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import Video, {
  type OnBufferData,
  type OnProgressData,
  type OnVideoErrorData,
  type VideoRef,
  ResizeMode,
  SelectedVideoTrackType,
} from 'react-native-video';
import {
  getRetryDelay,
  toPlatformParams,
  type BufferProfile,
  type PlaybackController,
  type PlaybackStatus,
  type ResilienceConfig,
} from '@iptv-player/core';

interface ControllerState {
  url: string | null;
  paused: boolean;
  bufferProfile: BufferProfile;
  resilienceConfig: ResilienceConfig;
  retryTick: number;
  status: PlaybackStatus;
}

type Action =
  | { type: 'LOAD'; url: string; bufferProfile: BufferProfile; resilienceConfig: ResilienceConfig }
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'DISPOSE' }
  | { type: 'SET_STATUS'; status: PlaybackStatus }
  | { type: 'RETRY' };

const INITIAL: ControllerState = {
  url: null,
  paused: true,
  bufferProfile: { kind: 'balanced' },
  resilienceConfig: {},
  retryTick: 0,
  status: { kind: 'idle' },
};

function reducer(state: ControllerState, action: Action): ControllerState {
  switch (action.type) {
    case 'LOAD':
      return {
        ...state,
        url: action.url,
        bufferProfile: action.bufferProfile,
        resilienceConfig: action.resilienceConfig,
        retryTick: 0,
        paused: false,
        status: { kind: 'loading' },
      };
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
    case 'RETRY':
      return { ...state, retryTick: state.retryTick + 1, status: { kind: 'loading' } };
  }
}

export function useRnVideoController(): {
  controller: PlaybackController;
  VideoComponent: React.ReactElement | null;
} {
  const videoRef = useRef<VideoRef>(null);
  const [state, dispatch] = useReducer(reducer, INITIAL);

  const stateRef = useRef(state);
  stateRef.current = state;

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Wall-clock timestamp of last onProgress call — used by stall watchdog.
  const lastProgressWallRef = useRef<number>(Date.now());
  const lastProgressPosRef = useRef<number>(0);

  const controller = useMemo<PlaybackController>(
    () => ({
      load: (url: string, bufferProfile: BufferProfile, resilienceConfig: ResilienceConfig = {}) =>
        dispatch({ type: 'LOAD', url, bufferProfile, resilienceConfig }),
      play: () => dispatch({ type: 'PLAY' }),
      pause: () => dispatch({ type: 'PAUSE' }),
      seek: (positionMs: number) => videoRef.current?.seek(positionMs / 1000),
      dispose: () => dispatch({ type: 'DISPOSE' }),
      get status(): PlaybackStatus {
        return stateRef.current.status;
      },
    }),
    [],
  );

  // --- Stall watchdog ---
  useEffect(() => {
    if (!state.url) return;
    const stallTimeoutSec = state.resilienceConfig.stallTimeoutSec ?? 8;
    lastProgressWallRef.current = Date.now();

    const timer = setInterval(() => {
      if (stateRef.current.status.kind !== 'playing') return;
      const elapsedSec = (Date.now() - lastProgressWallRef.current) / 1_000;
      if (elapsedSec > stallTimeoutSec) {
        videoRef.current?.seek(lastProgressPosRef.current / 1_000 + 0.1);
        lastProgressWallRef.current = Date.now(); // reset to avoid repeated seeks
      }
    }, 2_000);

    return () => clearInterval(timer);
  }, [state.url, state.resilienceConfig]);

  const onBuffer = useCallback((data: OnBufferData) => {
    dispatch({
      type: 'SET_STATUS',
      status: data.isBuffering
        ? { kind: 'buffering', bufferPercent: 0 }
        : { kind: 'playing', positionMs: 0, durationMs: null },
    });
  }, []);

  const onProgress = useCallback((data: OnProgressData) => {
    lastProgressWallRef.current = Date.now();
    lastProgressPosRef.current = data.currentTime * 1_000;
    dispatch({
      type: 'SET_STATUS',
      status: {
        kind: 'playing',
        positionMs: data.currentTime * 1_000,
        durationMs: data.seekableDuration > 0 ? data.seekableDuration * 1_000 : null,
      },
    });
  }, []);

  const onLoad = useCallback(() => {
    if (!stateRef.current.paused) {
      dispatch({
        type: 'SET_STATUS',
        status: { kind: 'playing', positionMs: 0, durationMs: null },
      });
    }
  }, []);

  const onError = useCallback((data: OnVideoErrorData) => {
    const message =
      data.error.localizedDescription ??
      data.error.errorString ??
      'Playback error';
    dispatch({ type: 'SET_STATUS', status: { kind: 'error', message } });

    const { url, resilienceConfig, retryTick } = stateRef.current;
    if (!url) return;
    const maxDelayMs = resilienceConfig.retryMaxDelayMs ?? 30_000;
    const delay = getRetryDelay(retryTick, maxDelayMs);
    setTimeout(() => {
      if (mountedRef.current && stateRef.current.url === url) {
        dispatch({ type: 'RETRY' });
      }
    }, delay);
  }, []);

  const exoParams = toPlatformParams(state.bufferProfile, 'android');
  const avParams = toPlatformParams(state.bufferProfile, 'tvos');
  const { resilienceConfig } = state;

  // ABR cap: use abrCapBps; bitrate lock: set maxBitRate to 1 to force lowest quality
  const maxBitRate = resilienceConfig.bitrateLock
    ? 1
    : resilienceConfig.abrCapBps;

  // selectedVideoTrack: undefined lets ExoPlayer/AVPlayer handle ABR normally
  const selectedVideoTrack = resilienceConfig.bitrateLock
    ? { type: SelectedVideoTrackType.INDEX, value: 0 }
    : undefined;

  const VideoComponent = state.url ? (
    <Video
      ref={videoRef}
      source={{ uri: state.url, bufferConfig: exoParams }}
      paused={state.paused}
      style={{ width: '100%', height: '100%' }}
      resizeMode={ResizeMode.CONTAIN}
      preferredForwardBufferDuration={avParams.preferredForwardBufferDuration}
      maxBitRate={maxBitRate}
      selectedVideoTrack={selectedVideoTrack}
      onBuffer={onBuffer}
      onProgress={onProgress}
      onLoad={onLoad}
      onError={onError}
    />
  ) : null;

  return { controller, VideoComponent };
}
```

- [ ] **Step 2: Typecheck TV**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm --filter @iptv-player/tv typecheck 2>&1
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add packages/tv/src/playback/RnVideoController.tsx
git commit -m "feat(tv): ABR cap, bitrate lock, stall watchdog, retry backoff in RnVideoController"
```

---

### Task 4: Desktop prefetch hook + EpgPage wiring

**Files:**
- Create: `packages/desktop/src/epg/usePrefetch.ts`
- Modify: `packages/desktop/src/epg/components/ChannelRow.tsx`
- Modify: `packages/desktop/src/epg/components/ChannelList.tsx`
- Modify: `packages/desktop/src/epg/EpgPage.tsx`

- [ ] **Step 1: Write `usePrefetch.ts`**

```ts
// packages/desktop/src/epg/usePrefetch.ts
import { useCallback, useRef } from 'react';

function bandwidthMbps(): number {
  const nav = navigator as Navigator & { connection?: { downlink?: number } };
  return nav.connection?.downlink ?? Infinity; // Infinity = assume sufficient when API unavailable
}

export function usePrefetch(enabled: boolean, minBandwidthMbps: number): {
  prefetch: (url: string) => void;
} {
  const prefetched = useRef(new Set<string>());

  const prefetch = useCallback(
    (url: string) => {
      if (!enabled) return;
      if (prefetched.current.has(url)) return;
      if (bandwidthMbps() < minBandwidthMbps) return;
      prefetched.current.add(url);
      // Fire-and-forget: primes the browser HTTP cache for subsequent hls.js manifest fetch
      fetch(url, { method: 'GET' }).catch(() => {});
    },
    [enabled, minBandwidthMbps],
  );

  return { prefetch };
}
```

- [ ] **Step 2: Add `onMouseEnter` to `ChannelRow.tsx`**

Replace `packages/desktop/src/epg/components/ChannelRow.tsx`:

```tsx
import React from 'react';
import type { ChannelEntry } from '../types';

interface Props {
  entry: ChannelEntry;
  isActive: boolean;
  onClick: () => void;
  onMouseEnter?: () => void;
}

export function ChannelRow({ entry, isActive, onClick, onMouseEnter }: Props): React.ReactElement {
  const { m3uChannel, nowNext } = entry;
  return (
    <div
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      style={{
        padding: '10px 14px',
        borderBottom: '1px solid #222',
        backgroundColor: isActive ? '#e50914' : '#1a1a1a',
        cursor: 'pointer',
      }}
    >
      <div style={{ color: '#fff', fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {m3uChannel.name}
      </div>
      {nowNext.now && (
        <div style={{ color: '#aaa', fontSize: 12, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          ▶ {nowNext.now.title}
        </div>
      )}
      {nowNext.next && (
        <div style={{ color: '#555', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          → {nowNext.next.title}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Thread `onFocus` through `ChannelList.tsx`**

Replace `packages/desktop/src/epg/components/ChannelList.tsx`:

```tsx
import React from 'react';
import type { ChannelEntry } from '../types';
import { ChannelRow } from './ChannelRow';

interface Props {
  entries: ChannelEntry[];
  activeUrl: string | null;
  onSelect: (entry: ChannelEntry) => void;
  onFocus?: (entry: ChannelEntry) => void;
}

export function ChannelList({ entries, activeUrl, onSelect, onFocus }: Props): React.ReactElement {
  return (
    <div style={{ width: 220, overflowY: 'auto', borderRight: '1px solid #222', flexShrink: 0 }}>
      {entries.map(entry => (
        <ChannelRow
          key={entry.m3uChannel.url}
          entry={entry}
          isActive={entry.m3uChannel.url === activeUrl}
          onClick={() => onSelect(entry)}
          onMouseEnter={onFocus ? () => onFocus(entry) : undefined}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Wire `usePrefetch` into `EpgPage.tsx`**

Replace `packages/desktop/src/epg/EpgPage.tsx`:

```tsx
import React, { useState } from 'react';
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
}

export function EpgPage({ m3uUrl, xmltvUrl }: Props): React.ReactElement {
  const { channels, status, error } = useEpgData(m3uUrl, xmltvUrl);
  const { controller, VideoComponent } = useHlsJsController();
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const { prefetch } = usePrefetch(true, 2);

  const handleSelect = (entry: ChannelEntry) => {
    setActiveUrl(entry.m3uChannel.url);
    controller.load(entry.m3uChannel.url, { kind: 'aggressive' }, {
      stallTimeoutSec: 8,
      retryMaxDelayMs: 30_000,
    });
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
        <ChannelList
          entries={channels}
          activeUrl={activeUrl}
          onSelect={handleSelect}
          onFocus={entry => prefetch(entry.m3uChannel.url)}
        />
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

- [ ] **Step 5: Typecheck desktop**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm --filter @iptv-player/desktop typecheck 2>&1
```

Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add packages/desktop/src/epg/usePrefetch.ts \
        packages/desktop/src/epg/components/ChannelRow.tsx \
        packages/desktop/src/epg/components/ChannelList.tsx \
        packages/desktop/src/epg/EpgPage.tsx
git commit -m "feat(desktop): bandwidth-aware prefetch on channel hover"
```

---

### Task 5: Full verification + CLAUDE.md update

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

Expected: `Tests: 63 passed` (58 original + 5 new resilience tests).

- [ ] **Step 4: Update CLAUDE.md**

In `CLAUDE.md`, replace the Phase 7 table row:

```
| 7 — Slow-stream resilience | pending | ABR, retry/backoff, stall watchdog, prefetch |
```

with:

```
| 7 — Slow-stream resilience | ✅ complete | ResilienceConfig (abrCapBps, bitrateLock, stallTimeoutSec, retryMaxDelayMs, prefetchEnabled); hls.js: maxBitrate + level lock + stall watchdog + backoff retry; react-native-video: maxBitRate + selectedVideoTrack + stall watchdog + backoff retry; usePrefetch desktop hook (bandwidth-aware, navigator.connection) — 63 tests, typechecks + lint clean |
```

- [ ] **Step 5: Final commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md — Phase 7 complete"
```

---

## Self-Review

**Spec coverage:**
- ✅ ABR cap — `abrCapBps` → `HlsConfig.maxBitrate` (desktop) + `maxBitRate` prop (TV)
- ✅ Bitrate lock — hls.js: pin `currentLevel = 0` on `MANIFEST_PARSED` + `LEVEL_SWITCHING`; TV: `maxBitRate = 1` + `selectedVideoTrack = INDEX/0`
- ✅ Stall watchdog — both controllers: 2 s interval, fires `seek(ct + 0.1)` when position frozen past `stallTimeoutSec`
- ✅ Retry with backoff — both controllers: 1 s → 2 s → 4 s … capped at `retryMaxDelayMs`; driven by `retryTick` state counter to trigger player re-init
- ✅ Prefetch behind a setting — `usePrefetch(enabled, minBandwidthMbps)`; `EpgPage` wires it to `onFocus`; bandwidth check via `navigator.connection.downlink`

**Placeholder scan:** none.

**Type consistency:**
- `ResilienceConfig` imported from `@iptv-player/core` in both controllers ✅
- `getRetryDelay(retryTick, maxDelayMs)` — `retryTick` is `number` from `ControllerState.retryTick` ✅
- `SelectedVideoTrackType` imported from `react-native-video` (TV only) ✅
- `onFocus?: (entry: ChannelEntry) => void` in `ChannelList` → `onMouseEnter?: () => void` in `ChannelRow` — thread-through is correct ✅
- `controller.load(url, profile, { stallTimeoutSec, retryMaxDelayMs })` in `EpgPage` matches extended `load()` signature ✅
