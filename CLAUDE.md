# IPTV Player — CLAUDE.md

Reference document for AI assistants working in this repo. Update at the end of every phase.

---

## Project overview

Cross-platform IPTV player with a strong EPG and exceptional playback resilience on slow/unreliable streams via aggressive, configurable prebuffering. Resilient playback is the headline feature.

Targets: Apple TV (tvOS), Android TV, Linux (Tauri desktop), macOS (Tauri desktop).

---

## Locked decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Language | TypeScript strict (`"strict": true`) | Type safety across the monorepo |
| Framework | react-native-tvos fork | One codebase for tvOS + Android TV, TV focus engine built in |
| Desktop shell | Tauri + RN-Web | Single Linux/macOS desktop codebase; `react-native-macos` is an alternative if native AVPlayer buffer control becomes critical |
| Package manager | pnpm 9 | Workspace linking, disk efficiency |
| TV player library | react-native-video (ExoPlayer/Media3 + AVPlayer) | Best programmatic ExoPlayer buffer control; first-class RN/TV support; critical for buffering headline feature |
| Web/desktop player | hls.js (HLS) + mpegts.js (raw TS) | Standard, well-maintained, tunable buffer API |
| DRM | Not in v1 | Mark where FairPlay/Widevine slots in when needed |

**No `any` without a justifying comment.** The ESLint rule `@typescript-eslint/no-explicit-any` is set to `error`.

---

## Monorepo structure

```
iptv-player/
├── packages/
│   ├── core/       # platform-agnostic TypeScript — parsers, EPG, state, PlaybackController interface
│   ├── tv/         # react-native-tvos (tvOS + Android TV)
│   └── desktop/    # RN-Web + Tauri (Linux + macOS)
├── tsconfig.base.json
├── .eslintrc.js
└── jest.config.js
```

### packages/core — platform import boundary

**`packages/core` must never import from `react-native`, `react-native-*`, `@react-native/*`, DOM APIs, or Tauri APIs.** This is enforced by `packages/core/.eslintrc.js` with `no-restricted-imports`. Violations fail CI lint.

Platform-specific behaviour is injected through interfaces (primarily `PlaybackController`). Core defines the interface; platform packages provide the implementation.

### packages/tv

react-native-tvos app. Built with Metro. Implements `PlaybackController` via `react-native-video` (`RnVideoController`). Scaffolded fully in Phase 4.

### packages/desktop

RN-Web app wrapped in a Tauri 2 shell. Built with Vite. Implements `PlaybackController` via hls.js + mpegts.js (`HlsJsController`). Scaffolded fully in Phase 5.

---

## Per-platform playback notes

### Android TV — ExoPlayer (via react-native-video / Media3)

react-native-video exposes a `bufferConfig` prop that maps to ExoPlayer's `DefaultLoadControl`. Key fields for the aggressive profile:

```ts
bufferConfig: {
  minBufferMs: 50_000,          // keep 50 s minimum buffered
  maxBufferMs: 120_000,         // allow up to 120 s buffered
  bufferForPlaybackMs: 2_500,   // start playback after 2.5 s (fast zap)
  bufferForPlaybackAfterRebufferMs: 5_000,  // 5 s after a stall
}
```

Disk cache: `cachingEnabled: true` in `bufferConfig` where the react-native-video version supports it.

ABR: ExoPlayer's adaptive track selection can be configured via `selectedVideoTrack` / `maxBitRate` props and the `minLoadRetryCount` field.

### Apple TV (tvOS) — AVPlayer

AVPlayer has **far less granular buffer control** than ExoPlayer. The only meaningful lever is:

```swift
player.currentItem?.preferredForwardBufferDuration = 120  // seconds
player.automaticallyWaitsToMinimizeStalling = true
```

There is no equivalent to ExoPlayer's `minBufferMs` / `bufferForPlaybackMs` — AVPlayer decides internally when it has enough data. Document this limitation to users: on tvOS the aggressive profile increases the maximum pre-buffered duration but cannot enforce a minimum.

react-native-video exposes `preferredForwardBufferDuration` as a prop.

### Linux / macOS (desktop) — hls.js + mpegts.js

hls.js tuning (HLS streams):

```ts
// Aggressive profile
{
  maxBufferLength: 240,              // s target buffer ahead (4 min)
  maxMaxBufferLength: 600,           // s absolute cap
  backBufferLength: 30,              // s to keep behind playhead
  maxBufferSize: 400 * 1000 * 1000,  // 400 MB
  liveSyncDuration: 90,              // s target latency behind live edge (must match buffer intent)
  liveMaxLatencyDuration: 300,       // s max latency before seeking
  maxBufferHole: 1,                  // s gap tolerated without stalling
  maxFragLookUpTolerance: 0.5,       // 50% fragment variance tolerance
  appendErrorMaxRetry: 3,            // retry append errors
  highBufferWatchdogPeriod: 3,       // slow the high-buffer check
}
```

mpegts.js tuning (raw MPEG-TS streams):

```ts
{
  enableWorker: true,
  lazyLoadMaxDuration: 120,
  seekType: 'range',
}
```

---

## PlaybackController interface (Phase 3)

Defined in `packages/core/src/playback/controller.ts`. Platform packages implement it; UI code imports only the interface.

```ts
interface PlaybackController {
  load(url: string, bufferProfile: BufferProfile): void;
  play(): void;
  pause(): void;
  seek(positionMs: number): void;
  dispose(): void;
  readonly status: PlaybackStatus;       // observable
}
```

---

## BufferProfile (Phase 3)

Defined in `packages/core/src/playback/bufferProfile.ts`.

```ts
type BufferProfile =
  | { kind: 'conservative' }
  | { kind: 'balanced' }
  | { kind: 'aggressive' }
  | { kind: 'custom'; params: CustomBufferParams };
```

`toPlatformParams(profile, platform)` maps a `BufferProfile` to the platform-specific param shape. This mapping is unit-tested in `packages/core`.

---

## Slow-stream resilience (Phase 7)

- **ABR cap**: `maxBitRate` (ExoPlayer) / `capLevelToPlayerSize` + `maxBitrate` (hls.js) — cap the ladder for slow links.
- **Bitrate lock**: option to pin the lowest rung to stop oscillation.
- **Stall watchdog**: if `currentTime` hasn't advanced in N seconds, force a seek to rebuffer.
- **Retry with backoff**: on stream error, retry with exponential backoff (1 s → 2 s → 4 s … capped at 30 s).
- **Prefetch** (behind a setting): pre-fetch the next channel's manifest + initial segments on EPG cell focus. Bandwidth-aware — disabled below a threshold.

---

## EPG (Phase 2–3, UI Phase 6)

- Parse XMLTV off the UI thread (Worker on web; a background queue on RN).
- Map EPG channels to M3U channels: exact `tvg-id` match first, fuzzy name match (normalised, case-insensitive, edit-distance ≤ 2) as fallback.
- Cache EPG snapshots to disk; stale-while-revalidate on next app launch.

---

## Tooling quick reference

| Command | What it does |
|---------|-------------|
| `pnpm typecheck` | `tsc -b packages/core` — composite build check |
| `pnpm lint` | ESLint across all package `src/` trees |
| `pnpm test` | Jest (core smoke + unit tests) |
| `pnpm test:core` | Jest filtered to the core project |

pnpm is installed at `~/.local/share/pnpm/bin/pnpm`. Add `export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"` to your shell profile if it isn't already active (the installer appended this to `~/.bashrc`).

---

## Phase progress

| Phase | Status | Summary |
|-------|--------|---------|
| 1 — Monorepo scaffolding | ✅ complete | pnpm workspace, TypeScript strict, ESLint platform boundary, Jest, CLAUDE.md |
| 2 — Core parsers | ✅ complete | M3U parser, XMLTV parser (fast-xml-parser), Xtream Codes client — 27 tests |
| 3 — Core EPG + buffering policy | ✅ complete | EpgData types, getNowNext, channel mapper (fuzzy Levenshtein), EPG cache, PlaybackController interface, BufferProfile + toPlatformParams — 58 tests total |
| 4 — TV platform shell | ✅ complete | react-native-tvos 0.74.5-0 + react-native-video 6.19.2; useRnVideoController hook (useReducer + stateRef), ExoPlayer bufferConfig via source prop, AVPlayer preferredForwardBufferDuration, PlayerScreen, BufferHealthBadge — typechecks clean |
| 5 — Desktop platform shell | ✅ complete | Vite 5 + @tauri-apps/api (Tauri native shell deferred to Rust setup); hls.js 1.6.16 (HLS) + mpegts.js 1.7.3 (raw TS); useHlsJsController hook, URL-based stream detection, HlsBufferParams → hls.js config, PlayerPage, BufferHealthBadge — typechecks clean |
| 6 — EPG UI | ✅ complete | useEpgData hook (TV: InteractionManager defer; Desktop: Vite module Worker), ChannelList + ChannelRow (Now/Next), EpgGrid (2-h window, 8 px/min, absolute cells), ProgramDetail modal/overlay, EpgScreen (TV) + EpgPage (Desktop), source input App.tsx on both platforms — typechecks + lint + 58 tests clean |
| 7 — Slow-stream resilience | ✅ complete | ResilienceConfig (abrCapBps, bitrateLock, stallTimeoutSec, retryMaxDelayMs, prefetchEnabled); hls.js: ABR cap + level lock + stall watchdog + backoff retry; react-native-video: maxBitRate + selectedVideoTrack + stall watchdog + backoff retry; usePrefetch desktop hook (bandwidth-aware, AbortController body cancel, disabled by default) — 62 tests, typechecks + lint clean |
| 8 — Settings UI | ✅ complete | AppSettings (m3uUrl, xmltvUrl, bufferProfile, prefetchEnabled) + mergeSettings in core; desktop: localStorage useSettings + SettingsPanel (profile selector, prefetch toggle, source edit) + gear button; TV: AsyncStorage useSettings + SettingsModal (profile selector, source edit) + gear button; EpgPage/EpgScreen accept bufferProfile prop — 71 tests, typechecks + lint clean |
| 9 — Channel navigation | ✅ complete | Favourites/Categories tabs, persistent search bar, right-click/long-press context menu (Play, ☆/★), favouriteUrls persistence in AppSettings, lazy EPG Now/Next via enrichEntry, collapsed categories on desktop — 74 tests, typechecks + lint clean |
| 10 — Review fixes | ✅ complete | Security: dev-proxy hardening (origin/host/scheme checks, no-redirect), finite XMLTV entity cap (1M), Xtream URL encoding. Correctness: TV typecheck regression, single settings instance per app, TV retry remount, name-fallback favourite removal (findFavouriteIndex), hls.js autoLevelCapping ABR cap, indexed Now/Next on both platforms, retry-race + retry-budget fixes, mpegts/native retry, reload error surfacing, stable category collapse, gzip (.gz) source support — 107 tests, typechecks + lint clean |
| 11 — Fullscreen mode | ✅ complete | Desktop: `useFullscreen` hook (Fullscreen API) on the EpgPage player — ⤢ button + double-click + F key (ignored while search focused), Esc exits. TV: `useAutoHideControls` (useTVEventHandler) hides the volume bar after 3s idle, any remote press reveals it; buffer/error badge unaffected. No core changes, no new deps — typechecks + lint clean, 107 tests. |

---

## Security notes

- **Untrusted inputs:** M3U playlists, XMLTV feeds, and Xtream responses come from third-party servers and must be treated as hostile (entity-expansion cap in `parseXmltv`, URL encoding in `XtreamClient`).
- **Credentials in URLs:** Xtream-style source URLs embed `username`/`password`. They are persisted in plaintext (`localStorage` on desktop, `AsyncStorage` on TV) and appear in the desktop EPG cache key. Do not add logging of source URLs. A move to OS keychain / Tauri secure storage is open work.
- **Dev CORS proxy:** `/__proxy__/` in the desktop Vite config is dev-only and hardened (same-origin callers, localhost host header, http/https targets only, redirects not followed). Never ship it in a production bundle.

---

## Content policy

The app is a neutral player. Do not bundle, reference, or hardcode any stream content or provider details. All sources are user-supplied.
