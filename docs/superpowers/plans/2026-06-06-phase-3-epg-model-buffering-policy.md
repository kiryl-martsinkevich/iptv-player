# Phase 3 — EPG Model + Buffering Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the core domain types: EPG model with channel mapper and cache, `PlaybackController` interface, and the `BufferProfile → PlatformBufferParams` mapping function that is the heart of the resilient-playback feature.

**Architecture:** Five focused modules under `packages/core/src/epg/` and `packages/core/src/playback/`. `PlaybackController` is an interface only — no runtime code, just a compile-time contract platform packages implement. `toPlatformParams` is a pure function mapping a `BufferProfile` union to platform-specific parameter objects; it is the most critical testable unit in this phase.

**Tech Stack:** TypeScript 5.5 strict, no new dependencies

---

## File Map

| Path | Role |
|------|------|
| `packages/core/src/epg/types.ts` | `EpgChannel`, `EpgProgramme`, `EpgData`, `NowNext`, `getNowNext()` |
| `packages/core/src/epg/mapper.ts` | `buildEpgMapping()` — tvg-id exact + fuzzy Levenshtein fallback |
| `packages/core/src/epg/cache.ts` | `serializeEpg()`, `deserializeEpg()`, `EpgSnapshot` |
| `packages/core/src/playback/controller.ts` | `PlaybackController` interface, `PlaybackStatus` union |
| `packages/core/src/playback/bufferProfile.ts` | `BufferProfile`, platform param types, `toPlatformParams()` |
| `packages/core/src/index.ts` | Re-export all new types and functions |
| `packages/core/tests/epg/types.test.ts` | Tests for `getNowNext` |
| `packages/core/tests/epg/mapper.test.ts` | Tests for `buildEpgMapping` |
| `packages/core/tests/epg/cache.test.ts` | Round-trip tests for serialize/deserialize |
| `packages/core/tests/playback/bufferProfile.test.ts` | Tests for `toPlatformParams` — all profiles × all platforms |

---

### Task 1: EPG types + `getNowNext`

**Files:**
- Create: `packages/core/src/epg/types.ts`
- Create: `packages/core/tests/epg/types.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/core/tests/epg/types.test.ts`:

```ts
import { getNowNext, EpgProgramme } from '../../src/epg/types';

const PROGS: EpgProgramme[] = [
  { channelId: 'ch1', start: new Date('2024-06-01T10:00:00Z'), stop: new Date('2024-06-01T11:00:00Z'), title: 'Morning Show' },
  { channelId: 'ch1', start: new Date('2024-06-01T11:00:00Z'), stop: new Date('2024-06-01T12:00:00Z'), title: 'Midday News' },
  { channelId: 'ch1', start: new Date('2024-06-01T12:00:00Z'), stop: new Date('2024-06-01T13:00:00Z'), title: 'Afternoon Show' },
  { channelId: 'ch2', start: new Date('2024-06-01T10:00:00Z'), stop: new Date('2024-06-01T11:00:00Z'), title: 'Other Channel' },
];

describe('getNowNext', () => {
  it('returns current and next programme', () => {
    const { now, next } = getNowNext(PROGS, 'ch1', new Date('2024-06-01T10:30:00Z'));
    expect(now?.title).toBe('Morning Show');
    expect(next?.title).toBe('Midday News');
  });

  it('does not bleed programmes from other channels', () => {
    const { now } = getNowNext(PROGS, 'ch2', new Date('2024-06-01T10:30:00Z'));
    expect(now?.title).toBe('Other Channel');
  });

  it('returns undefined now when nothing is currently airing', () => {
    const { now } = getNowNext(PROGS, 'ch1', new Date('2024-06-01T09:00:00Z'));
    expect(now).toBeUndefined();
  });

  it('returns next programme even when nothing is currently airing', () => {
    const { next } = getNowNext(PROGS, 'ch1', new Date('2024-06-01T09:00:00Z'));
    expect(next?.title).toBe('Morning Show');
  });

  it('returns undefined next when the current programme is the last one', () => {
    const { next } = getNowNext(PROGS, 'ch1', new Date('2024-06-01T12:30:00Z'));
    expect(next).toBeUndefined();
  });

  it('returns empty NowNext for unknown channel', () => {
    const { now, next } = getNowNext(PROGS, 'unknown', new Date('2024-06-01T10:30:00Z'));
    expect(now).toBeUndefined();
    expect(next).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm test:core 2>&1 | grep -E 'FAIL|Cannot find' | head -3
```

Expected: `Cannot find module '../../src/epg/types'`

- [ ] **Step 3: Write `epg/types.ts`**

Create `packages/core/src/epg/types.ts`:

```ts
export interface EpgChannel {
  id: string;
  displayName: string;
  iconUrl?: string;
}

export interface EpgProgramme {
  channelId: string;
  start: Date;
  stop: Date;
  title: string;
  description?: string;
}

export interface EpgData {
  channels: EpgChannel[];
  programmes: EpgProgramme[];
}

export interface NowNext {
  now?: EpgProgramme;
  next?: EpgProgramme;
}

export function getNowNext(
  programmes: ReadonlyArray<EpgProgramme>,
  channelId: string,
  now = new Date(),
): NowNext {
  const sorted = programmes
    .filter((p) => p.channelId === channelId)
    .slice()
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const nowProg = sorted.find((p) => p.start <= now && p.stop > now);
  const nextProg = nowProg
    ? sorted.find((p) => p.start >= nowProg.stop)
    : sorted.find((p) => p.start > now);

  return { now: nowProg, next: nextProg };
}
```

- [ ] **Step 4: Run tests — expect all passing**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm test:core 2>&1 | tail -6
```

Expected: all `getNowNext` tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/epg/types.ts packages/core/tests/epg/types.test.ts
git commit -m "feat(core): add EPG domain types and getNowNext utility"
```

---

### Task 2: EPG channel mapper

**Files:**
- Create: `packages/core/src/epg/mapper.ts`
- Create: `packages/core/tests/epg/mapper.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/core/tests/epg/mapper.test.ts`:

```ts
import { buildEpgMapping } from '../../src/epg/mapper';

const EPG_CHANNELS = [
  { id: 'cnn.us', displayName: 'CNN International' },
  { id: 'bbc.uk', displayName: 'BBC World News' },
  { id: 'espn.us', displayName: 'ESPN' },
];

describe('buildEpgMapping', () => {
  it('maps by exact tvg-id', () => {
    const channels = [{ url: 'http://s.com/cnn.m3u8', tvgId: 'cnn.us', name: 'Something Else' }];
    const m = buildEpgMapping(channels, EPG_CHANNELS);
    expect(m.get('http://s.com/cnn.m3u8')).toBe('cnn.us');
  });

  it('falls back to normalized name exact match when tvg-id is absent', () => {
    const channels = [{ url: 'http://s.com/espn.m3u8', name: 'ESPN' }];
    const m = buildEpgMapping(channels, EPG_CHANNELS);
    expect(m.get('http://s.com/espn.m3u8')).toBe('espn.us');
  });

  it('falls back to name match when tvg-id does not match any EPG channel', () => {
    const channels = [{ url: 'http://s.com/bbc.m3u8', tvgId: 'nope', name: 'BBC World News' }];
    const m = buildEpgMapping(channels, EPG_CHANNELS);
    expect(m.get('http://s.com/bbc.m3u8')).toBe('bbc.uk');
  });

  it('matches despite different casing', () => {
    const channels = [{ url: 'http://s.com/espn.m3u8', name: 'espn' }];
    const m = buildEpgMapping(channels, EPG_CHANNELS);
    expect(m.get('http://s.com/espn.m3u8')).toBe('espn.us');
  });

  it('fuzzy-matches a channel name with one typo (Levenshtein = 1)', () => {
    // "CNN Internationl" vs "CNN International" — one missing 'a'
    const channels = [{ url: 'http://s.com/cnn.m3u8', name: 'CNN Internationl' }];
    const m = buildEpgMapping(channels, EPG_CHANNELS);
    expect(m.get('http://s.com/cnn.m3u8')).toBe('cnn.us');
  });

  it('does not match when edit distance > 2', () => {
    const channels = [{ url: 'http://s.com/xyz.m3u8', name: 'XYZ Channel Unique' }];
    const m = buildEpgMapping(channels, EPG_CHANNELS);
    expect(m.has('http://s.com/xyz.m3u8')).toBe(false);
  });

  it('returns empty map when channels array is empty', () => {
    expect(buildEpgMapping([], EPG_CHANNELS).size).toBe(0);
  });

  it('returns empty map when EPG channels array is empty', () => {
    const channels = [{ url: 'http://s.com/1.m3u8', name: 'CNN' }];
    expect(buildEpgMapping(channels, []).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm test:core 2>&1 | grep -E 'FAIL|Cannot find' | head -3
```

Expected: `Cannot find module '../../src/epg/mapper'`

- [ ] **Step 3: Write `epg/mapper.ts`**

Create `packages/core/src/epg/mapper.ts`:

```ts
interface MappableChannel {
  url: string;
  tvgId?: string;
  name: string;
}

interface MappableEpgChannel {
  id: string;
  displayName: string;
}

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Single-row DP, O(min(|a|,|b|)) space
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const val =
        a[i - 1] === b[j - 1]
          ? dp[j - 1]
          : 1 + Math.min(dp[j - 1], dp[j], prev);
      dp[j - 1] = prev;
      prev = val;
    }
    dp[b.length] = prev;
  }

  return dp[b.length];
}

/**
 * Returns a Map<channelUrl, epgChannelId> using:
 *   1. Exact tvg-id match
 *   2. Normalized display-name exact match
 *   3. Levenshtein distance ≤ 2 fuzzy fallback
 */
export function buildEpgMapping(
  channels: ReadonlyArray<MappableChannel>,
  epgChannels: ReadonlyArray<MappableEpgChannel>,
): Map<string, string> {
  const mapping = new Map<string, string>();
  if (epgChannels.length === 0) return mapping;

  const epgById = new Map(epgChannels.map((e) => [e.id, e]));
  const epgByNorm = new Map(epgChannels.map((e) => [normalizeName(e.displayName), e.id]));

  for (const ch of channels) {
    // 1. Exact tvg-id
    if (ch.tvgId && epgById.has(ch.tvgId)) {
      mapping.set(ch.url, ch.tvgId);
      continue;
    }

    // 2. Normalized name exact
    const norm = normalizeName(ch.name);
    const exactId = epgByNorm.get(norm);
    if (exactId !== undefined) {
      mapping.set(ch.url, exactId);
      continue;
    }

    // 3. Fuzzy — Levenshtein ≤ 2, pick closest
    let best: { id: string; dist: number } | null = null;
    for (const [epgNorm, epgId] of epgByNorm) {
      const dist = levenshtein(norm, epgNorm);
      if (dist <= 2 && (best === null || dist < best.dist)) {
        best = { id: epgId, dist };
      }
    }
    if (best !== null) {
      mapping.set(ch.url, best.id);
    }
  }

  return mapping;
}
```

- [ ] **Step 4: Run tests — expect all passing**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm test:core 2>&1 | tail -6
```

Expected: all mapper tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/epg/mapper.ts packages/core/tests/epg/mapper.test.ts
git commit -m "feat(core): add EPG channel mapper with tvg-id and fuzzy name matching"
```

---

### Task 3: EPG cache

**Files:**
- Create: `packages/core/src/epg/cache.ts`
- Create: `packages/core/tests/epg/cache.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/core/tests/epg/cache.test.ts`:

```ts
import { serializeEpg, deserializeEpg, EpgSnapshot } from '../../src/epg/cache';
import type { EpgData } from '../../src/epg/types';

const DATA: EpgData = {
  channels: [
    { id: 'cnn.us', displayName: 'CNN', iconUrl: 'http://logo.example.com/cnn.png' },
    { id: 'bbc.uk', displayName: 'BBC' },
  ],
  programmes: [
    {
      channelId: 'cnn.us',
      start: new Date('2024-06-01T12:00:00Z'),
      stop: new Date('2024-06-01T13:00:00Z'),
      title: 'News Hour',
      description: 'World news.',
    },
    {
      channelId: 'bbc.uk',
      start: new Date('2024-06-01T14:00:00Z'),
      stop: new Date('2024-06-01T15:00:00Z'),
      title: 'BBC Report',
    },
  ],
};

describe('EPG cache round-trip', () => {
  it('serializes to a plain object (JSON-safe)', () => {
    const snap = serializeEpg(DATA);
    const json = JSON.stringify(snap);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('restores channels exactly', () => {
    const snap = serializeEpg(DATA);
    const { result } = deserializeEpg(snap);
    expect(result.channels).toEqual(DATA.channels);
  });

  it('restores programme Dates as Date objects', () => {
    const snap = serializeEpg(DATA);
    const { result } = deserializeEpg(snap);
    expect(result.programmes[0].start).toBeInstanceOf(Date);
    expect(result.programmes[0].start).toEqual(DATA.programmes[0].start);
    expect(result.programmes[0].stop).toEqual(DATA.programmes[0].stop);
  });

  it('preserves optional description', () => {
    const snap = serializeEpg(DATA);
    const { result } = deserializeEpg(snap);
    expect(result.programmes[0].description).toBe('World news.');
    expect(result.programmes[1].description).toBeUndefined();
  });

  it('fetchedAt is a Date close to now', () => {
    const before = Date.now();
    const snap = serializeEpg(DATA);
    const { fetchedAt } = deserializeEpg(snap);
    expect(fetchedAt).toBeInstanceOf(Date);
    expect(fetchedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(fetchedAt.getTime()).toBeLessThanOrEqual(Date.now() + 100);
  });

  it('snapshot programmes store start/stop as ISO strings, not Date objects', () => {
    const snap = serializeEpg(DATA);
    expect(typeof snap.programmes[0].start).toBe('string');
    expect(typeof snap.programmes[0].stop).toBe('string');
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm test:core 2>&1 | grep -E 'FAIL|Cannot find' | head -3
```

Expected: `Cannot find module '../../src/epg/cache'`

- [ ] **Step 3: Write `epg/cache.ts`**

Create `packages/core/src/epg/cache.ts`:

```ts
import type { EpgChannel, EpgProgramme, EpgData } from './types';

export interface EpgSnapshot {
  fetchedAt: string;
  channels: EpgChannel[];
  programmes: SerializedProgramme[];
}

export interface SerializedProgramme {
  channelId: string;
  start: string;
  stop: string;
  title: string;
  description?: string;
}

export function serializeEpg(data: EpgData, fetchedAt = new Date()): EpgSnapshot {
  return {
    fetchedAt: fetchedAt.toISOString(),
    channels: data.channels,
    programmes: data.programmes.map((p) => ({
      channelId: p.channelId,
      start: p.start.toISOString(),
      stop: p.stop.toISOString(),
      title: p.title,
      description: p.description,
    })),
  };
}

export function deserializeEpg(snapshot: EpgSnapshot): { result: EpgData; fetchedAt: Date } {
  const programmes: EpgProgramme[] = snapshot.programmes.map((p) => ({
    channelId: p.channelId,
    start: new Date(p.start),
    stop: new Date(p.stop),
    title: p.title,
    description: p.description,
  }));
  return {
    result: { channels: snapshot.channels, programmes },
    fetchedAt: new Date(snapshot.fetchedAt),
  };
}
```

- [ ] **Step 4: Run tests — expect all passing**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm test:core 2>&1 | tail -6
```

Expected: all cache tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/epg/cache.ts packages/core/tests/epg/cache.test.ts
git commit -m "feat(core): add EPG cache serialization"
```

---

### Task 4: PlaybackController interface

**Files:**
- Create: `packages/core/src/playback/controller.ts`

No runtime tests — correctness verified by TypeScript compilation and by platform packages implementing the interface.

- [ ] **Step 1: Write `playback/controller.ts`**

Create `packages/core/src/playback/controller.ts`:

```ts
import type { BufferProfile } from './bufferProfile';

export type PlaybackStatus =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'buffering'; bufferPercent: number }
  | { kind: 'playing'; positionMs: number; durationMs: number | null }
  | { kind: 'paused'; positionMs: number }
  | { kind: 'error'; message: string };

/**
 * Platform-agnostic playback contract. Implemented once per platform:
 *   packages/tv  → RnVideoController   (react-native-video / ExoPlayer + AVPlayer)
 *   packages/desktop → HlsJsController (hls.js + mpegts.js)
 */
export interface PlaybackController {
  load(url: string, bufferProfile: BufferProfile): void;
  play(): void;
  pause(): void;
  seek(positionMs: number): void;
  dispose(): void;
  readonly status: PlaybackStatus;
}
```

- [ ] **Step 2: Confirm typecheck passes**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm typecheck
```

Expected: exits 0. (Note: `bufferProfile.ts` does not exist yet — this step will fail until Task 5 is done. Do Task 5 first if running typechecks between tasks.)

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/playback/controller.ts
git commit -m "feat(core): add PlaybackController interface"
```

---

### Task 5: BufferProfile + `toPlatformParams`

**Files:**
- Create: `packages/core/src/playback/bufferProfile.ts`
- Create: `packages/core/tests/playback/bufferProfile.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/core/tests/playback/bufferProfile.test.ts`:

```ts
import {
  toPlatformParams,
  ExoBufferParams,
  AvPlayerBufferParams,
  HlsBufferParams,
} from '../../src/playback/bufferProfile';

describe('toPlatformParams — aggressive profile', () => {
  it('Android: large ExoPlayer buffer windows', () => {
    const p = toPlatformParams({ kind: 'aggressive' }, 'android');
    expect(p).toEqual<ExoBufferParams>({
      minBufferMs: 50_000,
      maxBufferMs: 120_000,
      bufferForPlaybackMs: 2_500,
      bufferForPlaybackAfterRebufferMs: 5_000,
    });
  });

  it('tvOS: large preferredForwardBufferDuration', () => {
    const p = toPlatformParams({ kind: 'aggressive' }, 'tvos');
    expect(p).toEqual<AvPlayerBufferParams>({ preferredForwardBufferDuration: 120 });
  });

  it('web: large hls.js buffer params', () => {
    const p = toPlatformParams({ kind: 'aggressive' }, 'web');
    expect(p).toEqual<HlsBufferParams>({
      maxBufferLength: 120,
      maxMaxBufferLength: 600,
      backBufferLength: 30,
      maxBufferSize: 200 * 1_000_000,
      liveSyncDuration: 3,
      liveMaxLatencyDuration: 10,
    });
  });
});

describe('toPlatformParams — conservative profile', () => {
  it('Android: smaller buffer windows', () => {
    const p = toPlatformParams({ kind: 'conservative' }, 'android');
    expect(p.minBufferMs).toBe(15_000);
    expect(p.maxBufferMs).toBe(30_000);
  });

  it('tvOS: smaller preferredForwardBufferDuration', () => {
    const p = toPlatformParams({ kind: 'conservative' }, 'tvos');
    expect(p.preferredForwardBufferDuration).toBe(30);
  });

  it('web: smaller maxBufferLength', () => {
    const p = toPlatformParams({ kind: 'conservative' }, 'web');
    expect(p.maxBufferLength).toBe(30);
    expect(p.liveMaxLatencyDuration).toBe(20);
  });
});

describe('toPlatformParams — balanced profile', () => {
  it('Android: intermediate buffer windows', () => {
    const p = toPlatformParams({ kind: 'balanced' }, 'android');
    expect(p.minBufferMs).toBe(30_000);
    expect(p.maxBufferMs).toBe(60_000);
  });

  it('tvOS: intermediate preferredForwardBufferDuration', () => {
    const p = toPlatformParams({ kind: 'balanced' }, 'tvos');
    expect(p.preferredForwardBufferDuration).toBe(60);
  });
});

describe('toPlatformParams — custom profile', () => {
  it('Android: starts from balanced and applies ExoPlayer overrides', () => {
    const p = toPlatformParams(
      { kind: 'custom', params: { exo: { minBufferMs: 99_000 } } },
      'android',
    );
    expect(p.minBufferMs).toBe(99_000);
    expect(p.maxBufferMs).toBe(60_000);   // balanced default untouched
    expect(p.bufferForPlaybackMs).toBe(2_500);
  });

  it('web: starts from balanced and applies hls.js overrides', () => {
    const p = toPlatformParams(
      { kind: 'custom', params: { hls: { maxBufferLength: 200 } } },
      'web',
    );
    expect(p.maxBufferLength).toBe(200);
    expect(p.maxMaxBufferLength).toBe(120);  // balanced default
  });

  it('tvOS: uses balanced defaults when no avplayer override given', () => {
    const p = toPlatformParams({ kind: 'custom', params: {} }, 'tvos');
    expect(p.preferredForwardBufferDuration).toBe(60);
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm test:core 2>&1 | grep -E 'FAIL|Cannot find' | head -3
```

Expected: `Cannot find module '../../src/playback/bufferProfile'`

- [ ] **Step 3: Write `playback/bufferProfile.ts`**

Create `packages/core/src/playback/bufferProfile.ts`:

```ts
export interface ExoBufferParams {
  minBufferMs: number;
  maxBufferMs: number;
  /** How much to buffer before starting playback from cold start. Keep small for fast zapping. */
  bufferForPlaybackMs: number;
  /** How much to buffer before resuming after a stall. Higher than bufferForPlaybackMs. */
  bufferForPlaybackAfterRebufferMs: number;
}

export interface AvPlayerBufferParams {
  /**
   * Maps to AVPlayerItem.preferredForwardBufferDuration (seconds).
   * AVPlayer has no minBuffer/playbackStart equivalent — this is the only lever.
   * See CLAUDE.md: "AVPlayer is far less granular than ExoPlayer".
   */
  preferredForwardBufferDuration: number;
}

export interface HlsBufferParams {
  maxBufferLength: number;        // seconds of video to buffer ahead
  maxMaxBufferLength: number;     // absolute cap on buffer
  backBufferLength: number;       // seconds to keep behind playhead
  maxBufferSize: number;          // bytes
  liveSyncDuration: number;       // seconds behind live edge to target
  liveMaxLatencyDuration: number; // seconds of latency before seeking to edge
}

export interface CustomBufferParams {
  exo?: Partial<ExoBufferParams>;
  avplayer?: Partial<AvPlayerBufferParams>;
  hls?: Partial<HlsBufferParams>;
}

export type BufferProfile =
  | { kind: 'conservative' }
  | { kind: 'balanced' }
  | { kind: 'aggressive' }
  | { kind: 'custom'; params: CustomBufferParams };

export type Platform = 'android' | 'tvos' | 'web';

const PRESETS: Record<
  'conservative' | 'balanced' | 'aggressive',
  { exo: ExoBufferParams; avplayer: AvPlayerBufferParams; hls: HlsBufferParams }
> = {
  conservative: {
    exo: { minBufferMs: 15_000, maxBufferMs: 30_000, bufferForPlaybackMs: 2_500, bufferForPlaybackAfterRebufferMs: 5_000 },
    avplayer: { preferredForwardBufferDuration: 30 },
    hls: { maxBufferLength: 30, maxMaxBufferLength: 60, backBufferLength: 10, maxBufferSize: 50_000_000, liveSyncDuration: 5, liveMaxLatencyDuration: 20 },
  },
  balanced: {
    exo: { minBufferMs: 30_000, maxBufferMs: 60_000, bufferForPlaybackMs: 2_500, bufferForPlaybackAfterRebufferMs: 5_000 },
    avplayer: { preferredForwardBufferDuration: 60 },
    hls: { maxBufferLength: 60, maxMaxBufferLength: 120, backBufferLength: 20, maxBufferSize: 100_000_000, liveSyncDuration: 3, liveMaxLatencyDuration: 15 },
  },
  aggressive: {
    exo: { minBufferMs: 50_000, maxBufferMs: 120_000, bufferForPlaybackMs: 2_500, bufferForPlaybackAfterRebufferMs: 5_000 },
    avplayer: { preferredForwardBufferDuration: 120 },
    hls: { maxBufferLength: 120, maxMaxBufferLength: 600, backBufferLength: 30, maxBufferSize: 200_000_000, liveSyncDuration: 3, liveMaxLatencyDuration: 10 },
  },
};

export function toPlatformParams(profile: BufferProfile, platform: 'android'): ExoBufferParams;
export function toPlatformParams(profile: BufferProfile, platform: 'tvos'): AvPlayerBufferParams;
export function toPlatformParams(profile: BufferProfile, platform: 'web'): HlsBufferParams;
export function toPlatformParams(
  profile: BufferProfile,
  platform: Platform,
): ExoBufferParams | AvPlayerBufferParams | HlsBufferParams {
  const preset = profile.kind === 'custom' ? PRESETS.balanced : PRESETS[profile.kind];
  const custom: CustomBufferParams = profile.kind === 'custom' ? profile.params : {};

  switch (platform) {
    case 'android':
      // Spread is safe: preset supplies all required fields; custom only overrides.
      return { ...preset.exo, ...(custom.exo ?? {}) } as ExoBufferParams;
    case 'tvos':
      return { ...preset.avplayer, ...(custom.avplayer ?? {}) } as AvPlayerBufferParams;
    case 'web':
      return { ...preset.hls, ...(custom.hls ?? {}) } as HlsBufferParams;
  }
}
```

- [ ] **Step 4: Run tests — expect all passing**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm test:core 2>&1 | tail -6
```

Expected: all `toPlatformParams` tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/playback/bufferProfile.ts packages/core/tests/playback/bufferProfile.test.ts
git commit -m "feat(core): add BufferProfile and toPlatformParams"
```

---

### Task 6: Export everything + full verification

**Files:**
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Update `packages/core/src/index.ts`**

Replace with:

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
```

- [ ] **Step 2: Run full typecheck**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm typecheck
```

Expected: exits 0.

- [ ] **Step 3: Run full lint**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm lint
```

Expected: exits 0.

- [ ] **Step 4: Run full test suite**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm test 2>&1
```

Expected: all test suites pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "feat(core): export EPG model and playback types from public API"
```

---

## Self-Review

**Spec coverage:**
- ✅ EPG model (channel, programme types) — Task 1
- ✅ XMLTV channel → M3U channel mapping: tvg-id exact + fuzzy name fallback — Task 2
- ✅ EPG cache (serialize/deserialize for disk persistence) — Task 3
- ✅ `PlaybackController` interface — Task 4
- ✅ `BufferProfile` (conservative/balanced/aggressive/custom) — Task 5
- ✅ `toPlatformParams` mapping for Android/ExoPlayer, tvOS/AVPlayer, web/hls.js — Task 5
- ✅ Unit tests for buffer-profile → platform-param mapping (spec explicitly calls this out) — Task 5
- ✅ AVPlayer limitation documented in `bufferProfile.ts` comment (references CLAUDE.md) — Task 5

**Placeholder scan:** none.

**Type consistency:**
- `EpgData` used in `cache.ts` Tasks 3, defined in `types.ts` Task 1 ✅
- `BufferProfile` used in `controller.ts` Task 4, defined in `bufferProfile.ts` Task 5 — import order matters; `controller.ts` must be committed after `bufferProfile.ts` exists for `tsc -b` to resolve. The plan handles this: `controller.ts` is committed in Task 4 but full typecheck is only run at Task 6 after all files exist ✅
- All types exported in Task 6 index match their definition files ✅
