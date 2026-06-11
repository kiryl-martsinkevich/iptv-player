# Correctness & Security Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all correctness and security issues found in the 2026-06-10 full-codebase review against the Phase 1–9 plans, the channel-navigation spec, and CLAUDE.md.

**Architecture:** No new subsystems. Fixes touch core (parsers, favourites helper, gzip helper), the desktop shell (Vite dev proxy, HlsJsController, useEpgData, settings threading), and the TV shell (typecheck regression, RnVideoController retry, settings threading, EPG index). Tasks are ordered: build-breaking regression first, then security, then high-impact correctness, then lower-impact fixes, then docs.

**Tech Stack:** TypeScript 5.5 strict, Jest + ts-jest (core), fast-xml-parser 4.5.6, hls.js 1.6.x, mpegts.js 1.7.x, react-native-video 6.19.x, pako (new dep, pure JS).

---

## Findings being fixed (review summary)

| ID | Severity | Issue |
|----|----------|-------|
| C1 | High | `packages/tv` fails `tsc --noEmit` (EpgScreen.tsx:32,35 — `clearTimeout(number \| undefined)`); CLAUDE.md falsely claims "typechecks clean" |
| S1 | Medium | Vite dev CORS proxy (`/__proxy__/`) forwards **any** URL for **any** origin with `Access-Control-Allow-Origin: *` — drive-by SSRF pinhole into localhost/LAN during dev |
| S2 | Medium | `parseXmltv` sets `maxTotalExpansions: Number.MAX_SAFE_INTEGER`, disabling fast-xml-parser's entity-expansion DoS guard; a hostile EPG feed can run a billion-laughs-style CPU/memory attack |
| C2 | High | `useSettings()` instantiated independently in App **and** EpgPage/EpgScreen on both platforms — two divergent settings states; saving SettingsPanel/SettingsModal clobbers favourites toggled in the same session |
| C3 | High | TV retry-with-backoff never actually retries: `RETRY` increments `retryTick` but nothing remounts/reloads the `<Video>` element |
| C4 | Medium | Removing a name-matched favourite is broken on both platforms: `toggleFavourite` looks up the *current* URL in `favouriteUrls`, misses, and **adds a duplicate** instead of removing |
| C5 | Medium | hls.js "ABR cap" is implemented by pinning `hls.currentLevel`, which disables ABR entirely; spec (CLAUDE.md Phase 7) calls for a ladder *cap* with ABR still adaptive below it |
| C6 | Medium | Desktop `enrichEntry` builds a `programmesById` index for `programs` but still calls `getNowNext(epgData.programmes, …)` — a full programme-list scan per visible channel per render (the freeze the index was meant to fix) |
| C7 | Medium | TV `enrichEntry` has no index at all — O(total programmes) filter+sort per visible channel on every recompute |
| C8 | Medium | Desktop reload with a warm cache: fetch errors are swallowed and `status` stays `'loading'` forever (`if (!cached)` guard is wrong on `tick > 0`) |
| C9 | Medium | HlsJsController stale-retry race: shared `cancelledRef` is reset to `false` by the next effect run, so a pending retry timer from a previous stream can fire `RETRY` against the new stream; retry timer is never cleared on teardown |
| C10 | Low | `state.resilienceConfig` is read inside the desktop player-init effect but missing from its dependency array |
| C11 | Low | Retry budget (`retryTick`) never resets after successful playback — transient errors over a long session permanently exhaust `MAX_RETRIES` and inflate delays |
| C12 | Low | mpegts.js and Safari-native playback paths have no retry-with-backoff (Phase 7 says both controllers retry on stream error) |
| C13 | Low | Desktop category collapse state resets on every EPG refresh: effect depends on `categories` Map identity instead of the computed `categoriesKey` |
| S3 | Low | `XtreamClient` does not URL-encode `username`/`password` in the stream path nor `categoryId` in the query — credential characters like `/`, `?`, `&`, `#` break/alter URLs |
| C14 | Low | Gzipped M3U/XMLTV unsupported end-to-end. Phase 2 spec: "Both gzipped and plain — caller handles gzip"; no caller does |
| D1 | Doc | CLAUDE.md stale: claims TV typechecks clean, test count 74 (now 95); no note that stored Xtream-style URLs embed credentials in plaintext storage |

Not fixed (reviewed, deliberate): Phase 3 plan's hls.js buffer values (120 s / liveSync 3) were superseded by CLAUDE.md's values (240 s / liveSync 90) — the implementation follows CLAUDE.md, which is correct precedence. `mergeSettings` shallow-merge semantics match the spec ("arrays replace").

---

## File Map

| Path | Change |
|------|--------|
| `packages/tv/src/epg/EpgScreen.tsx` | C1 (typecheck), C2 (settings props), C4, C7 |
| `packages/desktop/vite.config.ts` | S1 — proxy hardening |
| `packages/core/src/parsers/xmltv.ts` | S2 — finite expansion cap |
| `packages/core/tests/parsers/xmltv.test.ts` | S2 tests |
| `packages/core/src/parsers/xtream.ts` | S3 — URL encoding |
| `packages/core/tests/parsers/xtream.test.ts` | S3 tests |
| `packages/core/src/epg/favouriteMatcher.ts` | C4 — `findFavouriteIndex` |
| `packages/core/tests/epg/favouriteMatcher.test.ts` | C4 tests |
| `packages/core/src/index.ts` | export `findFavouriteIndex`, gzip helpers |
| `packages/desktop/src/App.tsx` | C2 — single settings instance |
| `packages/desktop/src/epg/EpgPage.tsx` | C2, C4, C13 |
| `packages/tv/src/App.tsx` | C2 |
| `packages/tv/src/playback/RnVideoController.tsx` | C3, C11 |
| `packages/desktop/src/playback/HlsJsController.tsx` | C5, C9, C10, C11, C12 |
| `packages/desktop/src/epg/useEpgData.ts` | C6, C8, C14 |
| `packages/tv/src/epg/useEpgData.ts` | C7, C14 |
| `packages/core/src/parsers/gzip.ts` | C14 — gzip detect/decode helper (new) |
| `packages/core/tests/parsers/gzip.test.ts` | C14 tests (new) |
| `packages/core/package.json` | add `pako`, `@types/pako` |
| `CLAUDE.md` | D1 |

Verification commands used throughout (run from repo root):

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm typecheck          # core
pnpm --filter @iptv-player/tv typecheck
pnpm --filter @iptv-player/desktop typecheck
pnpm lint
pnpm test
```

---

### Task 1: Fix TV typecheck regression (C1)

**Files:**
- Modify: `packages/tv/src/epg/EpgScreen.tsx:29-35`

- [ ] **Step 1: Reproduce the failure**

```bash
pnpm --filter @iptv-player/tv typecheck
```

Expected: 2 errors — `EpgScreen.tsx(32)` and `EpgScreen.tsx(35)`: `Argument of type 'number | undefined' is not assignable to parameter of type 'number'`.

- [ ] **Step 2: Guard the clearTimeout calls**

In `packages/tv/src/epg/EpgScreen.tsx`, replace:

```tsx
  const onSearchChange = (value: string) => {
    setSearchInput(value);
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setSearchQuery(value), 200);
  };
  useEffect(() => () => clearTimeout(searchTimerRef.current), []);
```

with:

```tsx
  const onSearchChange = (value: string) => {
    setSearchInput(value);
    if (searchTimerRef.current !== undefined) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setSearchQuery(value), 200);
  };
  useEffect(
    () => () => {
      if (searchTimerRef.current !== undefined) clearTimeout(searchTimerRef.current);
    },
    [],
  );
```

(React Native's `clearTimeout` typing requires a defined handle; the DOM lib used by desktop accepts `undefined`, which is why only TV broke.)

- [ ] **Step 3: Verify typecheck passes**

```bash
pnpm --filter @iptv-player/tv typecheck
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add packages/tv/src/epg/EpgScreen.tsx
git commit -m "fix(tv): guard clearTimeout against undefined handle — restores clean typecheck"
```

---

### Task 2: Harden the Vite dev CORS proxy (S1)

**Files:**
- Modify: `packages/desktop/vite.config.ts`

The current middleware forwards any URL for any caller and answers with `Access-Control-Allow-Origin: *`. Any web page open in the developer's browser can use it as a pivot into localhost/LAN (`http://localhost:5173/__proxy__/http://192.168.1.1/…`). Fixes: (a) reject cross-origin callers — same-origin GET `fetch()` sends no `Origin` header, drive-by cross-origin fetches always do; (b) reject non-localhost `Host` headers (DNS-rebinding guard); (c) allow only `http:`/`https:` targets; (d) drop the `Access-Control-Allow-Origin: *` header — same-origin callers don't need it.

- [ ] **Step 1: Replace `corsProxyPlugin` in `packages/desktop/vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'node:http';

// Dev-only CORS proxy: GET /__proxy__/<url> → forwards to <url>.
// Tauri's native shell bypasses CORS entirely; this proxy exists only for plain-browser dev.
//
// Hardening (this dev server is reachable by every page open in the browser):
//  - Reject requests carrying an Origin header: the app itself calls the proxy
//    same-origin via GET, which sends no Origin; any cross-origin (drive-by) fetch does.
//  - Reject non-localhost Host headers (DNS-rebinding guard).
//  - Forward only http:/https: targets.
function corsProxyPlugin() {
  return {
    name: 'cors-proxy',
    configureServer(server: { middlewares: { use: (path: string, fn: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void } }) {
      server.middlewares.use('/__proxy__', async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const target = req.url?.slice(1); // strip leading /
        if (!target) return next();

        if (req.headers.origin) {
          res.statusCode = 403;
          return res.end('Cross-origin use of the dev proxy is not allowed');
        }
        const host = req.headers.host ?? '';
        if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) {
          res.statusCode = 403;
          return res.end('Dev proxy is localhost-only');
        }

        let parsed: URL;
        try {
          parsed = new URL(target);
        } catch {
          res.statusCode = 400;
          return res.end('Invalid target URL');
        }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          res.statusCode = 400;
          return res.end('Only http(s) targets are allowed');
        }

        try {
          const upstream = await fetch(parsed, { headers: { 'User-Agent': 'iptv-player-dev' } });
          res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'text/plain');
          res.statusCode = upstream.status;
          const buf = await upstream.arrayBuffer();
          res.end(Buffer.from(buf));
        } catch {
          res.statusCode = 502;
          res.end('Proxy error');
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), corsProxyPlugin()],
  resolve: {
    alias: {
      // Desktop UI components can import from 'react-native'; they render as HTML via react-native-web.
      'react-native': 'react-native-web',
    },
  },
});
```

- [ ] **Step 2: Typecheck desktop (vite.config.ts is in its tsconfig include)**

```bash
pnpm --filter @iptv-player/desktop typecheck
```

Expected: exits 0.

- [ ] **Step 3: Manual smoke check (optional but recommended)**

```bash
pnpm --filter @iptv-player/desktop dev &
sleep 3
# Same-origin style request (no Origin header) → should proxy (502/200 depending on target reachability)
curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:5173/__proxy__/https://example.com/'
# Drive-by style request (Origin header) → 403
curl -s -o /dev/null -w '%{http_code}\n' -H 'Origin: https://evil.example' 'http://localhost:5173/__proxy__/https://example.com/'
# Non-http scheme → 400
curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:5173/__proxy__/file:///etc/passwd'
kill %1
```

Expected: `200` (or `502` if offline), then `403`, then `400`.

- [ ] **Step 4: Commit**

```bash
git add packages/desktop/vite.config.ts
git commit -m "fix(desktop): harden dev CORS proxy — block cross-origin callers, non-localhost hosts, non-http schemes"
```

---

### Task 3: Restore a finite XMLTV entity-expansion cap (S2)

**Files:**
- Modify: `packages/core/src/parsers/xmltv.ts`
- Modify: `packages/core/tests/parsers/xmltv.test.ts`

History: the default cap (1000) broke real EPG files because standard entities (`&amp;` etc.) count toward it; it was raised to 100 k, then removed entirely with a comment claiming "no XEE risk". That reasoning is wrong — the XMLTV URL points at a third-party server, which is untrusted input. A 1 M cap is far above anything a legitimate feed produces (it would need a million entity references) while keeping DOCTYPE entity bombs bounded.

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/tests/parsers/xmltv.test.ts`:

```ts
describe('parseXmltv — entity expansion limits', () => {
  it('parses documents with many standard entities (legit large EPG)', () => {
    // 2 000 &amp; references — above the old default cap of 1 000
    const desc = Array.from({ length: 2000 }, () => '&amp;').join(' ');
    const xml = `<tv>
      <channel id="x"><display-name>X</display-name></channel>
      <programme start="20240601120000" stop="20240601130000" channel="x">
        <title>T</title><desc>${desc}</desc>
      </programme>
    </tv>`;
    const { programmes } = parseXmltv(xml);
    expect(programmes[0].description).toContain('&');
  });

  it('rejects entity-expansion bombs instead of hanging', () => {
    // Classic billion-laughs: 8 levels × 10 refs = 10^8 expansions ≫ cap
    const bomb = `<?xml version="1.0"?>
    <!DOCTYPE tv [
      <!ENTITY l0 "ha">
      <!ENTITY l1 "&l0;&l0;&l0;&l0;&l0;&l0;&l0;&l0;&l0;&l0;">
      <!ENTITY l2 "&l1;&l1;&l1;&l1;&l1;&l1;&l1;&l1;&l1;&l1;">
      <!ENTITY l3 "&l2;&l2;&l2;&l2;&l2;&l2;&l2;&l2;&l2;&l2;">
      <!ENTITY l4 "&l3;&l3;&l3;&l3;&l3;&l3;&l3;&l3;&l3;&l3;">
      <!ENTITY l5 "&l4;&l4;&l4;&l4;&l4;&l4;&l4;&l4;&l4;&l4;">
      <!ENTITY l6 "&l5;&l5;&l5;&l5;&l5;&l5;&l5;&l5;&l5;&l5;">
      <!ENTITY l7 "&l6;&l6;&l6;&l6;&l6;&l6;&l6;&l6;&l6;&l6;">
      <!ENTITY l8 "&l7;&l7;&l7;&l7;&l7;&l7;&l7;&l7;&l7;&l7;">
    ]>
    <tv>
      <channel id="x"><display-name>&l8;</display-name></channel>
    </tv>`;
    expect(() => parseXmltv(bomb)).toThrow();
  });
});
```

- [ ] **Step 2: Run to confirm the bomb test fails (it currently parses or hangs)**

```bash
pnpm test:core --testPathPattern=xmltv 2>&1 | tail -8
```

Expected: the new bomb test FAILS (no throw) — or visibly hangs, which proves the point; Ctrl-C if needed.

- [ ] **Step 3: Set a finite cap in `parseXmltv`**

In `packages/core/src/parsers/xmltv.ts`, replace:

```ts
    // XMLTV sources are user-supplied; no XEE risk. Remove the expansion cap.
    processEntities: { maxTotalExpansions: Number.MAX_SAFE_INTEGER },
```

with:

```ts
    // The XMLTV URL points at a third-party server — treat the document as
    // untrusted. Standard entities (&amp; …) count toward this cap, so it must
    // be generous for big real-world EPGs, but it must stay finite to bound
    // DOCTYPE entity bombs (billion laughs). fast-xml-parser's separate
    // maxExpandedLength guard (100 kB) stays at its default.
    processEntities: { maxTotalExpansions: 1_000_000 },
```

- [ ] **Step 4: Run the xmltv suite — expect all passing**

```bash
pnpm test:core --testPathPattern=xmltv 2>&1 | tail -5
```

Expected: all tests pass, including both new ones.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/parsers/xmltv.ts packages/core/tests/parsers/xmltv.test.ts
git commit -m "fix(core): restore finite XMLTV entity-expansion cap (1M) — blocks billion-laughs DoS"
```

---

### Task 4: URL-encode Xtream credentials and category id (S3)

**Files:**
- Modify: `packages/core/src/parsers/xtream.ts`
- Modify: `packages/core/tests/parsers/xtream.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/tests/parsers/xtream.test.ts` (inside the top-level `describe('XtreamClient')`):

```ts
  describe('URL encoding', () => {
    const SPECIAL_CREDS = {
      host: 'http://provider.test:8080',
      username: 'user/name',
      password: 'p&ss?word#1',
    };

    it('encodes credentials in the stream URL path', async () => {
      mockFetch.mockResolvedValueOnce(mockJson([
        { num: 1, name: 'A', stream_id: 7, stream_icon: '', category_id: '1' },
      ]));
      const client = new XtreamClient(SPECIAL_CREDS);
      const [stream] = await client.getLiveStreams();
      expect(stream.streamUrl).toBe(
        'http://provider.test:8080/live/user%2Fname/p%26ss%3Fword%231/7.m3u8',
      );
    });

    it('encodes categoryId in the query string', async () => {
      mockFetch.mockResolvedValueOnce(mockJson([]));
      const client = new XtreamClient(SPECIAL_CREDS);
      await client.getLiveStreams('4&action=server_info');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('category_id=4%26action%3Dserver_info'),
      );
    });
  });
```

- [ ] **Step 2: Run to confirm they fail**

```bash
pnpm test:core --testPathPattern=xtream 2>&1 | tail -8
```

Expected: 2 new tests FAIL (unencoded values in URLs).

- [ ] **Step 3: Encode in `XtreamClient`**

In `packages/core/src/parsers/xtream.ts`, replace the constructor line:

```ts
    this.streamBase = `${host}/live/${creds.username}/${creds.password}`;
```

with:

```ts
    this.streamBase = `${host}/live/${encodeURIComponent(creds.username)}/${encodeURIComponent(creds.password)}`;
```

and in `getLiveStreams`, replace:

```ts
    const action = categoryId
      ? `action=get_live_streams&category_id=${categoryId}`
      : 'action=get_live_streams';
```

with:

```ts
    const action = categoryId
      ? `action=get_live_streams&category_id=${encodeURIComponent(categoryId)}`
      : 'action=get_live_streams';
```

- [ ] **Step 4: Run the xtream suite — expect all passing**

```bash
pnpm test:core --testPathPattern=xtream 2>&1 | tail -5
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/parsers/xtream.ts packages/core/tests/parsers/xtream.test.ts
git commit -m "fix(core): URL-encode Xtream credentials and category id"
```

---

### Task 5: Core helper for favourite lookup with name fallback (C4, part 1)

**Files:**
- Modify: `packages/core/src/epg/favouriteMatcher.ts`
- Modify: `packages/core/tests/epg/favouriteMatcher.test.ts`
- Modify: `packages/core/src/index.ts`

Bug being fixed: when a favourite was matched by *name* (its stored URL rotated), the channel's current URL is not in `favouriteUrls`, so `toggleFavourite`'s `indexOf(url)` returns −1 and "Remove from Favourites" **adds a duplicate** instead of removing.

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/tests/epg/favouriteMatcher.test.ts`:

```ts
import { findFavouriteIndex } from '../../src/epg/favouriteMatcher';

describe('findFavouriteIndex', () => {
  const favUrls = ['http://old.example/espn', 'http://old.example/cnn'];
  const favNames = ['ESPN', 'CNN International'];

  it('finds by exact URL', () => {
    expect(
      findFavouriteIndex({ url: 'http://old.example/cnn', name: 'whatever' }, favUrls, favNames),
    ).toBe(1);
  });

  it('falls back to case-insensitive name when the URL rotated', () => {
    expect(
      findFavouriteIndex({ url: 'http://new.example/espn2', name: 'espn' }, favUrls, favNames),
    ).toBe(0);
  });

  it('returns -1 when neither URL nor name matches', () => {
    expect(
      findFavouriteIndex({ url: 'http://x.example/a', name: 'BBC' }, favUrls, favNames),
    ).toBe(-1);
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

```bash
pnpm test:core --testPathPattern=favouriteMatcher 2>&1 | tail -5
```

Expected: FAIL — `findFavouriteIndex` is not exported.

- [ ] **Step 3: Implement `findFavouriteIndex`**

Append to `packages/core/src/epg/favouriteMatcher.ts`:

```ts
/**
 * Locate a channel in the stored favourites by URL first, then by
 * case-insensitive name (covers playlists whose stream URLs rotate).
 * Returns the index into favouriteUrls/favouriteNames, or -1.
 */
export function findFavouriteIndex(
  channel: { url: string; name: string },
  favouriteUrls: readonly string[],
  favouriteNames: readonly string[],
): number {
  const byUrl = favouriteUrls.indexOf(channel.url);
  if (byUrl >= 0) return byUrl;

  const key = normalizeName(channel.name);
  if (!key) return -1;
  for (let i = 0; i < favouriteNames.length; i++) {
    if (normalizeName(favouriteNames[i]) === key) return i;
  }
  return -1;
}
```

(`normalizeName` already exists in this file.)

- [ ] **Step 4: Export from the core index**

In `packages/core/src/index.ts`, replace:

```ts
export { matchFavouriteUrls } from './epg/favouriteMatcher';
```

with:

```ts
export { matchFavouriteUrls, findFavouriteIndex } from './epg/favouriteMatcher';
```

- [ ] **Step 5: Run tests + typecheck — expect passing**

```bash
pnpm test:core --testPathPattern=favouriteMatcher 2>&1 | tail -5 && pnpm typecheck
```

Expected: all pass, typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/epg/favouriteMatcher.ts packages/core/tests/epg/favouriteMatcher.test.ts packages/core/src/index.ts
git commit -m "feat(core): findFavouriteIndex — URL-then-name favourite lookup"
```

---

### Task 6: Single settings instance + favourite-removal fix, desktop (C2, C4 part 2, C13)

**Files:**
- Modify: `packages/desktop/src/App.tsx`
- Modify: `packages/desktop/src/epg/EpgPage.tsx`

`EpgPage` currently calls `useSettings()` itself, creating a second, divergent copy of settings state. Favourites toggled in `EpgPage` never reach `App`'s copy, so the next SettingsPanel save persists `App`'s stale favourites — silent data loss. Fix: only `App` owns the hook; `EpgPage` receives `settings` + `updateSettings` as props (and derives `m3uUrl`/`xmltvUrl`/`bufferProfile`/`prefetchEnabled` from `settings`, removing four now-redundant props).

- [ ] **Step 1: Update `EpgPage` props and remove its `useSettings` call**

In `packages/desktop/src/epg/EpgPage.tsx`:

1. Change the imports: remove the `useSettings` import line and add `findFavouriteIndex` and `AppSettings` to the core import:

```tsx
import { findFavouriteIndex, matchFavouriteUrls, type AppSettings } from '@iptv-player/core';
```

(The `BufferProfile` type import is no longer needed; `useSettings` import line is deleted.)

2. Replace the `Props` interface and component signature:

```tsx
interface Props {
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
}

export function EpgPage({ settings, updateSettings }: Props): React.ReactElement {
  const { m3uUrl, xmltvUrl, bufferProfile, prefetchEnabled } = settings;
  const { channels, epgData, epgMapping, programmesById, status, error, refreshing } = useEpgData(m3uUrl, xmltvUrl);
  const { controller, VideoComponent } = useHlsJsController();
```

(Delete the old `const { settings, updateSettings } = useSettings();` line. Everything below that destructures `settings` keeps working unchanged.)

3. Replace `toggleFavourite` with the helper-based version:

```tsx
  const toggleFavourite = (entry: ChannelEntry) => {
    const { url, name } = entry.m3uChannel;
    const idx = findFavouriteIndex({ url, name }, settings.favouriteUrls, settings.favouriteNames);
    if (idx >= 0) {
      updateSettings({
        favouriteUrls: settings.favouriteUrls.filter((_, i) => i !== idx),
        favouriteNames: settings.favouriteNames.filter((_, i) => i !== idx),
      });
    } else {
      updateSettings({
        favouriteUrls: [...settings.favouriteUrls, url],
        favouriteNames: [...settings.favouriteNames, name],
      });
    }
  };
```

4. **(C13)** Fix the collapse-reset effect. Replace:

```tsx
  // Sync collapsed when category set changes (tab switch, search, reload)
  useEffect(() => {
    if (!categories) return;
    setCollapsed(new Set(categories.keys()));
  }, [categories, categoriesKey]);
```

with:

```tsx
  // Sync collapsed only when the set of category names actually changes
  // (tab switch, search, reload) — not on every Map identity change from
  // an EPG refresh re-render.
  useEffect(() => {
    if (!categoriesKey) return;
    setCollapsed(new Set(categoriesKey.split('|')));
  }, [categoriesKey]);
```

- [ ] **Step 2: Pass settings down from `App`**

In `packages/desktop/src/App.tsx`, replace:

```tsx
        <EpgPage
          m3uUrl={settings.m3uUrl}
          xmltvUrl={settings.xmltvUrl}
          bufferProfile={settings.bufferProfile}
          prefetchEnabled={settings.prefetchEnabled}
        />
```

with:

```tsx
        <EpgPage settings={settings} updateSettings={updateSettings} />
```

- [ ] **Step 3: Typecheck + lint**

```bash
pnpm --filter @iptv-player/desktop typecheck && pnpm lint
```

Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/desktop/src/App.tsx packages/desktop/src/epg/EpgPage.tsx
git commit -m "fix(desktop): single settings instance, name-fallback favourite removal, stable category collapse"
```

---

### Task 7: Single settings instance + favourite-removal fix, TV (C2, C4 part 2)

**Files:**
- Modify: `packages/tv/src/App.tsx`
- Modify: `packages/tv/src/epg/EpgScreen.tsx`

Same dual-instance bug as desktop, worse on TV: `EpgScreen`'s own `useSettings()` starts at `DEFAULT_SETTINGS` and re-reads AsyncStorage, so a favourite toggled before its async load completes is silently merged over stale state.

- [ ] **Step 1: Update `EpgScreen` props and remove its `useSettings` call**

In `packages/tv/src/epg/EpgScreen.tsx`:

1. Imports — remove the `useSettings` import line; change the core import to:

```tsx
import { findFavouriteIndex, matchFavouriteUrls, type AppSettings } from '@iptv-player/core';
```

2. Replace the `Props` interface and the top of the component:

```tsx
interface Props {
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
}

export function EpgScreen({ settings, updateSettings }: Props): React.ReactElement {
  const { m3uUrl, xmltvUrl, bufferProfile } = settings;
  const { channels, epgData, epgMapping, status, error } = useEpgData(m3uUrl, xmltvUrl);
```

(Delete the old `const { settings, updateSettings } = useSettings();` line.)

3. Replace `toggleFavourite` with the same helper-based version as desktop:

```tsx
  const toggleFavourite = (entry: ChannelEntry) => {
    const { url, name } = entry.m3uChannel;
    const idx = findFavouriteIndex({ url, name }, settings.favouriteUrls, settings.favouriteNames);
    if (idx >= 0) {
      updateSettings({
        favouriteUrls: settings.favouriteUrls.filter((_, i) => i !== idx),
        favouriteNames: settings.favouriteNames.filter((_, i) => i !== idx),
      });
    } else {
      updateSettings({
        favouriteUrls: [...settings.favouriteUrls, url],
        favouriteNames: [...settings.favouriteNames, name],
      });
    }
  };
```

- [ ] **Step 2: Pass settings down from TV `App`**

In `packages/tv/src/App.tsx`, replace:

```tsx
        <EpgScreen
          m3uUrl={settings.m3uUrl}
          xmltvUrl={settings.xmltvUrl}
          bufferProfile={settings.bufferProfile}
        />
```

with:

```tsx
        <EpgScreen settings={settings} updateSettings={updateSettings} />
```

- [ ] **Step 3: Typecheck + lint**

```bash
pnpm --filter @iptv-player/tv typecheck && pnpm lint
```

Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/tv/src/App.tsx packages/tv/src/epg/EpgScreen.tsx
git commit -m "fix(tv): single settings instance and name-fallback favourite removal"
```

---

### Task 8: Make TV retry actually reload the player; reset retry budget on recovery (C3, C11)

**Files:**
- Modify: `packages/tv/src/playback/RnVideoController.tsx`

Two changes: (a) `key={state.retryTick}` on `<Video>` so a `RETRY` dispatch remounts the player (today nothing changes, so the "retry" is a no-op); (b) track the backoff attempt count in a ref that resets on progress, so transient errors hours apart don't permanently consume the `MAX_RETRIES` budget — while `retryTick` stays a monotonically increasing remount key.

- [ ] **Step 1: Add the retry-count ref and reset points**

In `packages/tv/src/playback/RnVideoController.tsx`:

1. After the `lastProgressPosRef` declaration, add:

```tsx
  // Backoff attempt counter. Separate from state.retryTick (which is a remount
  // key that must only grow): this resets once playback recovers, restoring
  // the full retry budget for the next incident.
  const retryCountRef = useRef(0);
```

2. In the `controller` memo, reset the counter on a fresh load — replace the `load` entry with:

```tsx
      load: (url: string, bufferProfile: BufferProfile, resilienceConfig: ResilienceConfig = {}) => {
        retryCountRef.current = 0;
        dispatch({ type: 'LOAD', url, bufferProfile, resilienceConfig });
      },
```

3. In `onProgress`, reset the counter on real progress — add as the first line of the callback body:

```tsx
    retryCountRef.current = 0;
```

4. In `onError`, use the ref instead of `retryTick` for budget/delay — replace:

```tsx
    const { url, resilienceConfig, retryTick } = stateRef.current;
    if (!url || retryTick >= MAX_RETRIES) return;
    const maxDelayMs = resilienceConfig.retryMaxDelayMs ?? 30_000;
    const delay = getRetryDelay(retryTick, maxDelayMs);
```

with:

```tsx
    const { url, resilienceConfig } = stateRef.current;
    if (!url || retryCountRef.current >= MAX_RETRIES) return;
    const maxDelayMs = resilienceConfig.retryMaxDelayMs ?? 30_000;
    const delay = getRetryDelay(retryCountRef.current, maxDelayMs);
    retryCountRef.current += 1;
```

- [ ] **Step 2: Remount the Video element on retry**

In the `VideoComponent` JSX, add a `key` prop:

```tsx
  const VideoComponent = state.url ? (
    <Video
      key={state.retryTick}
      ref={videoRef}
      source={{ uri: state.url, bufferConfig: exoParams }}
```

(rest of the props unchanged).

- [ ] **Step 3: Typecheck + lint**

```bash
pnpm --filter @iptv-player/tv typecheck && pnpm lint
```

Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/tv/src/playback/RnVideoController.tsx
git commit -m "fix(tv): remount Video on retry so backoff actually reloads; reset retry budget on recovery"
```

---

### Task 9: HlsJsController — true ABR cap, retry races, retry budget, mpegts/native retry (C5, C9, C10, C11, C12)

**Files:**
- Modify: `packages/desktop/src/playback/HlsJsController.tsx`

Five fixes in one effect body (they interlock):
- **C5**: `abrCapBps` must use `hls.autoLevelCapping` (ladder cap, ABR stays adaptive below it), not pin `hls.currentLevel`. The `LEVEL_SWITCHING` re-pin for the cap goes away; the `bitrateLock` pin stays.
- **C9**: replace the shared `cancelledRef` with a per-effect-run `cancelled` flag, and clear the pending retry timer on teardown, so a stale timer can't fire `RETRY` against the next stream.
- **C10**: add `state.resilienceConfig` to the effect deps (it is read inside).
- **C11**: backoff attempt counter in a ref, reset on `playing`/`load`, mirroring Task 8.
- **C12**: schedule retries from mpegts.js `ERROR` events and from the native `<video>` `error` event in the Safari branch — today only the hls.js branch retries.

- [ ] **Step 1: Apply the changes**

In `packages/desktop/src/playback/HlsJsController.tsx`:

1. Delete the line `const cancelledRef = useRef(false);` and add after `stateRef`:

```tsx
  // Backoff attempt counter — resets when playback recovers (see onPlaying)
  // or a new load starts. state.retryTick stays a grow-only re-init key.
  const retryCountRef = useRef(0);
```

2. In the `controller` memo, reset the counter on load — replace the `load` entry with:

```tsx
      load: (url: string, bufferProfile: BufferProfile, resilienceConfig: ResilienceConfig = {}) => {
        retryCountRef.current = 0;
        dispatch({ type: 'LOAD', url, bufferProfile, resilienceConfig });
      },
```

3. In the DOM-listener effect, reset the counter on successful playback — add as the first line of the `onPlaying` handler body:

```tsx
      retryCountRef.current = 0;
```

4. Replace the **entire player init/teardown effect** with:

```tsx
  // --- Player init / teardown (re-runs on new URL, profile, config, or retry tick) ---
  useEffect(() => {
    const video = videoRef.current;

    // Per-run cancellation: a stale retry timer from a previous run must never
    // dispatch RETRY against the player created by a later run.
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

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

    const scheduleRetry = () => {
      if (cancelled || retryCountRef.current >= MAX_RETRIES) return;
      const maxDelayMs = stateRef.current.resilienceConfig.retryMaxDelayMs ?? 30_000;
      const delay = getRetryDelay(retryCountRef.current, maxDelayMs);
      retryCountRef.current += 1;
      retryTimer = setTimeout(() => {
        if (!cancelled) dispatch({ type: 'RETRY' });
      }, delay);
    };

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

    // Retry hook for the mpegts and native paths (hls.js has its own ERROR event).
    const onMediaError = () => scheduleRetry();

    if (isMpegTs(state.url)) {
      const player = Mpegts.createPlayer(
        { type: 'mpegts', url: state.url, isLive: true },
        {
          enableWorker: true,
          lazyLoadMaxDuration: hlsParams.maxBufferLength,
          seekType: 'range',
        },
      );
      player.on(Mpegts.Events.ERROR, () => {
        dispatch({ type: 'SET_STATUS', status: { kind: 'error', message: 'Stream error' } });
        scheduleRetry();
      });
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
        // Buffer stability: skip gaps up to 1s without stalling
        maxBufferHole: 1,
        // Allow 50% fragment duration variance when scanning the buffer
        maxFragLookUpTolerance: 0.5,
        // Retry on segment append errors before giving up
        appendErrorMaxRetry: 3,
        // Check high-buffer watermark less aggressively (reduces nudging)
        highBufferWatchdogPeriod: 3,
      });

      hls.loadSource(state.url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (resilienceConfig.bitrateLock) {
          // Hard lock: pin the lowest rung. Level 0 = lowest (hls.js sorts ascending).
          hls.currentLevel = 0;
        } else if (resilienceConfig.abrCapBps) {
          // Soft cap: highest level whose bitrate fits under the cap; ABR keeps
          // adapting among the levels at or below it (autoLevelCapping), unlike
          // currentLevel which would disable ABR entirely.
          const capLevel = hls.levels.reduce(
            (max, level, idx) => (level.bitrate <= resilienceConfig.abrCapBps! ? idx : max),
            0,
          );
          hls.autoLevelCapping = capLevel;
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
        // Show error state during the backoff window so the UI has feedback
        dispatch({ type: 'SET_STATUS', status: { kind: 'error', message: data.type } });
        scheduleRetry();
      });

      hlsRef.current = hls;
    } else {
      // Safari native HLS
      video.addEventListener('error', onMediaError);
      video.src = state.url;
      video.play().catch(() => {});
    }

    return () => {
      cancelled = true;
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      clearInterval(stallTimer);
      video.removeEventListener('error', onMediaError);
      hlsRef.current?.destroy();
      hlsRef.current = null;
      if (mpegtsRef.current) {
        mpegtsRef.current.destroy();
        mpegtsRef.current = null;
      }
      video.removeAttribute('src');
      video.load();
    };
  }, [state.url, state.bufferProfile, state.resilienceConfig, state.retryTick]);
```

Notes for the implementer:
- `Mpegts.Events.ERROR` exists on the default export (`Mpegts.Events.ERROR === 'error'`); if the `.d.ts` types the `on` callback loosely, no cast is needed because we ignore the arguments.
- Removing `cancelledRef` entirely: search the file for any remaining `cancelledRef` references and delete them.

- [ ] **Step 2: Typecheck + lint**

```bash
pnpm --filter @iptv-player/desktop typecheck && pnpm lint
```

Expected: both exit 0. If `hls.levels[i].bitrate` is flagged, check `node_modules/.pnpm/hls.js*/node_modules/hls.js/dist/hls.d.ts` for the `Level` class — `bitrate` is a readonly property; adjust only if the installed version differs.

- [ ] **Step 3: Commit**

```bash
git add packages/desktop/src/playback/HlsJsController.tsx
git commit -m "fix(desktop): true ABR cap via autoLevelCapping, per-run retry cancellation, retry budget reset, mpegts/native retry"
```

---

### Task 10: Desktop useEpgData — indexed Now/Next and reload error surfacing (C6, C8)

**Files:**
- Modify: `packages/desktop/src/epg/useEpgData.ts`

- [ ] **Step 1: Use the index for Now/Next in `enrichEntry`**

Replace the return statement of `enrichEntry`:

```ts
  return {
    ...entry,
    epgChannelId: epgId,
    nowNext: getNowNext(epgData.programmes, epgId, now),
    programs: progs,
  };
```

with:

```ts
  return {
    ...entry,
    epgChannelId: epgId,
    // progs is already this channel's sorted programme list — passing it
    // avoids getNowNext re-scanning the full programme array per channel.
    nowNext: getNowNext(progs, epgId, now),
    programs: progs,
  };
```

- [ ] **Step 2: Fix the reload error-suppression bug**

In the `useEffect`, replace:

```ts
    // Phase 0: try cache first for instant display
    const cached = loadFromCache(m3uUrl);
    if (cached && tick === 0) {
```

with:

```ts
    // Phase 0: try cache first for instant display.
    // Only on initial mount (tick === 0): an explicit reload must hit the
    // network and surface its errors, so it must not count as a cache hit.
    const cached = tick === 0 ? loadFromCache(m3uUrl) : null;
    if (cached) {
```

(All the later `if (cached)` / `if (!cached)` guards in the fetch/worker error paths now behave correctly on reload: errors set `status: 'error'` instead of leaving the UI on `'loading'` forever.)

- [ ] **Step 3: Typecheck + lint**

```bash
pnpm --filter @iptv-player/desktop typecheck && pnpm lint
```

Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/desktop/src/epg/useEpgData.ts
git commit -m "fix(desktop): indexed getNowNext in enrichEntry; surface reload errors instead of hanging on loading"
```

---

### Task 11: Port the programme index to TV useEpgData (C7)

**Files:**
- Modify: `packages/tv/src/epg/useEpgData.ts`
- Modify: `packages/tv/src/epg/EpgScreen.tsx`

TV's `enrichEntry` filters and sorts the full programme list per visible channel on every recompute. Port the desktop `programmesById` index.

- [ ] **Step 1: Update `packages/tv/src/epg/useEpgData.ts`**

1. Extend the result interface:

```ts
export interface UseEpgDataResult {
  channels: ChannelEntry[];
  epgData: EpgData | null;
  epgMapping: Map<string, string> | null;
  /** Pre-indexed programmes by EPG channel id — O(1) lookup in enrichEntry. */
  programmesById: Map<string, EpgProgramme[]> | null;
  status: Status;
  error: string | null;
  reload: () => void;
}
```

Add `EpgProgramme` to the core type imports:

```ts
import {
  buildEpgMapping,
  getNowNext,
  parseM3u,
  parseXmltv,
  type EpgData,
  type EpgProgramme,
} from '@iptv-player/core';
```

2. Replace `enrichEntry` with the indexed version:

```ts
/**
 * Compute Now/Next and programmes for a single entry from raw EPG data.
 * Uses the programmesById index when available; falls back to a full scan.
 */
export function enrichEntry(
  entry: ChannelEntry,
  epgData: EpgData | null,
  mapping: Map<string, string> | null,
  programmesById: Map<string, EpgProgramme[]> | null,
): ChannelEntry {
  if (!epgData || !mapping) return entry;
  const epgId = mapping.get(entry.m3uChannel.url);
  if (!epgId) return entry;
  const now = new Date();
  const progs = programmesById
    ? (programmesById.get(epgId) ?? [])
    : epgData.programmes
        .filter(p => p.channelId === epgId)
        .sort((a, b) => a.start.getTime() - b.start.getTime());
  return {
    ...entry,
    epgChannelId: epgId,
    nowNext: getNowNext(progs, epgId, now),
    programs: progs,
  };
}

/** Build a channelId → sorted programmes index for O(1) enrichEntry lookups. */
function indexProgrammes(programmes: EpgProgramme[]): Map<string, EpgProgramme[]> {
  const map = new Map<string, EpgProgramme[]>();
  for (const p of programmes) {
    const list = map.get(p.channelId);
    if (list) {
      list.push(p);
    } else {
      map.set(p.channelId, [p]);
    }
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.start.getTime() - b.start.getTime());
  }
  return map;
}
```

3. In the hook, add the ref next to `epgMappingRef`:

```ts
  const programmesByIdRef = useRef<Map<string, EpgProgramme[]> | null>(null);
```

populate it inside the `InteractionManager.runAfterInteractions` callback, right after `epgMappingRef.current = buildEpgMapping(...)`:

```ts
              programmesByIdRef.current = indexProgrammes(data.programmes);
```

and include it in the hook's return:

```ts
  return { channels, epgData, epgMapping: epgMappingRef.current, programmesById: programmesByIdRef.current, status, error, reload };
```

- [ ] **Step 2: Thread it through `EpgScreen`**

In `packages/tv/src/epg/EpgScreen.tsx`:

```tsx
  const { channels, epgData, epgMapping, programmesById, status, error } = useEpgData(m3uUrl, xmltvUrl);
```

and in the `displayChannels` memo, change the enrich call and deps:

```tsx
    return filtered.map(e => enrichEntry(e, epgData, epgMapping, programmesById));
  }, [channels, activeTab, searchQuery, favourites, epgData, epgMapping, programmesById]);
```

- [ ] **Step 3: Typecheck + lint**

```bash
pnpm --filter @iptv-player/tv typecheck && pnpm lint
```

Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/tv/src/epg/useEpgData.ts packages/tv/src/epg/EpgScreen.tsx
git commit -m "perf(tv): index programmes by channel id for O(1) EPG enrichment"
```

---

### Task 12: Gzip support for M3U/XMLTV fetches (C14)

**Files:**
- Create: `packages/core/src/parsers/gzip.ts`
- Create: `packages/core/tests/parsers/gzip.test.ts`
- Modify: `packages/core/package.json` (add `pako`, dev `@types/pako`)
- Modify: `packages/core/src/index.ts`
- Modify: `packages/desktop/src/epg/useEpgData.ts`
- Modify: `packages/tv/src/epg/useEpgData.ts`

Phase 2's spec line "Both gzipped and plain — caller handles gzip" was never honoured by any caller. Servers that send `Content-Encoding: gzip` are already handled transparently by `fetch`, but `.gz` *files* (`Content-Type: application/gzip`, no content-encoding) arrive compressed. `pako` is pure JS (works in browser, Node/Jest, and React Native/Hermes); the helper lives in core, which permits pure-JS deps.

- [ ] **Step 1: Add the dependency**

```bash
pnpm --filter @iptv-player/core add pako
pnpm --filter @iptv-player/core add -D @types/pako
```

Expected: both added to `packages/core/package.json`, lockfile updated.

- [ ] **Step 2: Write the failing tests**

Create `packages/core/tests/parsers/gzip.test.ts`:

```ts
import { gzipSync } from 'node:zlib';
import { bytesToText, isGzip } from '../../src/parsers/gzip';

describe('isGzip', () => {
  it('detects the gzip magic bytes', () => {
    expect(isGzip(new Uint8Array(gzipSync(Buffer.from('hello'))))).toBe(true);
  });

  it('rejects plain text', () => {
    expect(isGzip(new TextEncoder().encode('#EXTM3U'))).toBe(false);
  });

  it('rejects buffers shorter than the magic', () => {
    expect(isGzip(new Uint8Array([0x1f]))).toBe(false);
  });
});

describe('bytesToText', () => {
  it('decompresses gzipped UTF-8 content', () => {
    const original = '#EXTM3U\n#EXTINF:-1,Канал Один 📺\nhttp://example.com/1.m3u8';
    const gz = new Uint8Array(gzipSync(Buffer.from(original, 'utf8')));
    expect(bytesToText(gz)).toBe(original);
  });

  it('decodes plain UTF-8 content unchanged', () => {
    const original = '<tv><channel id="x"><display-name>Téle</display-name></channel></tv>';
    expect(bytesToText(new TextEncoder().encode(original))).toBe(original);
  });
});
```

- [ ] **Step 3: Run to confirm it fails**

```bash
pnpm test:core --testPathPattern=gzip 2>&1 | tail -5
```

Expected: FAIL — `Cannot find module '../../src/parsers/gzip'`.

- [ ] **Step 4: Implement `packages/core/src/parsers/gzip.ts`**

```ts
import { ungzip } from 'pako';

/** True when the buffer starts with the gzip magic bytes (0x1f 0x8b). */
export function isGzip(bytes: Uint8Array): boolean {
  return bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

/**
 * Decode a fetched body to text, transparently gunzipping `.gz` payloads.
 * (Bodies sent with Content-Encoding: gzip are already decompressed by fetch;
 * this handles gzip *files* served as application/gzip.)
 *
 * Uses pako (pure JS) so the same code path runs in the browser, Node/Jest,
 * and React Native — Hermes has no TextDecoder, so plain text falls back to a
 * small UTF-8 decoder when needed.
 */
export function bytesToText(bytes: Uint8Array): string {
  if (isGzip(bytes)) {
    return ungzip(bytes, { to: 'string' });
  }
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder('utf-8').decode(bytes);
  }
  return utf8Decode(bytes);
}

// Minimal UTF-8 decoder for environments without TextDecoder (Hermes).
function utf8Decode(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i++];
    let cp: number;
    if (b0 < 0x80) {
      cp = b0;
    } else if (b0 < 0xe0) {
      cp = ((b0 & 0x1f) << 6) | (bytes[i++] & 0x3f);
    } else if (b0 < 0xf0) {
      cp = ((b0 & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
    } else {
      cp =
        ((b0 & 0x07) << 18) |
        ((bytes[i++] & 0x3f) << 12) |
        ((bytes[i++] & 0x3f) << 6) |
        (bytes[i++] & 0x3f);
    }
    if (cp > 0xffff) {
      cp -= 0x10000;
      out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    } else {
      out += String.fromCharCode(cp);
    }
  }
  return out;
}
```

- [ ] **Step 5: Export from the core index**

Append to the Parsers section of `packages/core/src/index.ts`:

```ts
export { isGzip, bytesToText } from './parsers/gzip';
```

- [ ] **Step 6: Run tests — expect passing**

```bash
pnpm test:core --testPathPattern=gzip 2>&1 | tail -5 && pnpm typecheck
```

Expected: 5 tests pass; typecheck exits 0.

- [ ] **Step 7: Use it in the desktop fetch path**

In `packages/desktop/src/epg/useEpgData.ts`, add `bytesToText` to the core imports, then replace the two fetch lambdas:

```ts
        const [m3uText, xmltvText] = await Promise.all([
          fetch(proxyUrl(m3uUrl)).then(async r => {
            if (!r.ok) throw new Error(`M3U fetch failed: ${r.status}`);
            return bytesToText(new Uint8Array(await r.arrayBuffer()));
          }),
          xmltvUrl
            ? fetch(proxyUrl(xmltvUrl)).then(async r => {
                if (!r.ok) throw new Error(`XMLTV fetch failed: ${r.status}`);
                return bytesToText(new Uint8Array(await r.arrayBuffer()));
              })
            : Promise.resolve(null),
        ]);
```

- [ ] **Step 8: Use it in the TV fetch path**

Same replacement in `packages/tv/src/epg/useEpgData.ts` (without `proxyUrl`, which is desktop-only):

```ts
        const [m3uText, xmltvText] = await Promise.all([
          fetch(m3uUrl).then(async r => {
            if (!r.ok) throw new Error(`M3U fetch failed: ${r.status}`);
            return bytesToText(new Uint8Array(await r.arrayBuffer()));
          }),
          xmltvUrl
            ? fetch(xmltvUrl).then(async r => {
                if (!r.ok) throw new Error(`XMLTV fetch failed: ${r.status}`);
                return bytesToText(new Uint8Array(await r.arrayBuffer()));
              })
            : Promise.resolve(null),
        ]);
```

Add `bytesToText` to the `@iptv-player/core` import in that file.

- [ ] **Step 9: Full verification**

```bash
pnpm typecheck && pnpm --filter @iptv-player/tv typecheck && pnpm --filter @iptv-player/desktop typecheck && pnpm lint && pnpm test 2>&1 | tail -5
```

Expected: all clean; test count grows by 5.

- [ ] **Step 10: Commit**

```bash
git add packages/core/src/parsers/gzip.ts packages/core/tests/parsers/gzip.test.ts \
        packages/core/src/index.ts packages/core/package.json pnpm-lock.yaml \
        packages/desktop/src/epg/useEpgData.ts packages/tv/src/epg/useEpgData.ts
git commit -m "feat: gzip (.gz) support for M3U/XMLTV sources via core bytesToText helper"
```

---

### Task 13: Final verification + CLAUDE.md update (D1)

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Full suite**

```bash
pnpm typecheck && pnpm --filter @iptv-player/tv typecheck && pnpm --filter @iptv-player/desktop typecheck && pnpm lint && pnpm test 2>&1 | tail -5
```

Expected: every command exits 0. Note the final test count (95 before this plan + 2 xmltv + 2 xtream + 3 favouriteMatcher + 5 gzip = 107).

- [ ] **Step 2: Update CLAUDE.md**

1. Append a row to the Phase progress table:

```markdown
| 10 — Review fixes | ✅ complete | Security: dev-proxy hardening, finite XMLTV entity cap, Xtream URL encoding. Correctness: TV typecheck regression, single settings instance per app, TV retry remount, name-fallback favourite removal, hls.js autoLevelCapping ABR cap, indexed Now/Next on both platforms, retry-race + retry-budget fixes, mpegts/native retry, reload error surfacing, gzip source support — 107 tests, typechecks + lint clean |
```

2. Add a short security-notes section before "Content policy":

```markdown
## Security notes

- **Untrusted inputs:** M3U playlists, XMLTV feeds, and Xtream responses come from third-party servers and must be treated as hostile (entity-expansion caps in `parseXmltv`, URL encoding in `XtreamClient`).
- **Credentials in URLs:** Xtream-style source URLs embed `username`/`password`. They are persisted in plaintext (`localStorage` on desktop, `AsyncStorage` on TV) and appear in the desktop EPG cache key. Do not add logging of source URLs. A move to OS keychain/Tauri secure storage is open work.
- **Dev CORS proxy:** `/__proxy__/` in the desktop Vite config is dev-only and hardened (same-origin callers, localhost host header, http/https targets only). Never ship it in a production bundle.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md — review-fixes phase row and security notes"
```

---

## Self-Review

**Finding coverage:** C1→Task 1, S1→Task 2, S2→Task 3, S3→Task 4, C4→Tasks 5–7, C2→Tasks 6–7, C13→Task 6, C3+C11(TV)→Task 8, C5+C9+C10+C11+C12→Task 9, C6+C8→Task 10, C7→Task 11, C14→Task 12, D1→Task 13. No orphan findings.

**Placeholder scan:** none — every code step shows the exact code; every command has expected output.

**Type consistency:** `findFavouriteIndex({url, name}, urls, names)` signature identical in Task 5 (definition) and Tasks 6–7 (call sites). `enrichEntry(entry, epgData, mapping, programmesById)` 4-arg form matches between Task 11's definition and its `EpgScreen` call site (desktop already had the 4-arg form). `bytesToText(Uint8Array): string` matches Tasks 12 steps 4/7/8. `retryCountRef` pattern identical in Tasks 8 and 9. `scheduleRetry` is defined inside the same effect that uses it (Task 9).

**Order dependencies:** Task 5 (core helper) must land before Tasks 6–7 (call sites) — preserved. Task 12's hook edits are independent of Tasks 10–11 line-wise but touch the same files; execute in plan order to avoid conflicts.
