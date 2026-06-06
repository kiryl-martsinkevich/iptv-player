# Phase 2 — Core Parsers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement fully-tested M3U, XMLTV, and Xtream Codes parsers in `packages/core` with no platform imports.

**Architecture:** Three focused modules under `packages/core/src/parsers/`. M3U is pure TypeScript (no deps). XMLTV uses `fast-xml-parser` (cross-platform, handles CDATA/encoding edge cases). Xtream uses the global `fetch` API. All parsers accept plain strings/primitives — callers are responsible for HTTP fetching and gzip decompression.

**Tech Stack:** TypeScript 5.5 strict, `fast-xml-parser ^4.4.0`, global `fetch` (Node 18+, RN, browser)

---

## File Map

| Path | Role |
|------|------|
| `packages/core/src/parsers/m3u.ts` | `parseM3u(content: string): M3uChannel[]` |
| `packages/core/src/parsers/xmltv.ts` | `parseXmltv(content: string): XmltvResult` |
| `packages/core/src/parsers/xtream.ts` | `XtreamClient` class |
| `packages/core/tests/parsers/m3u.test.ts` | Unit tests for M3U parser |
| `packages/core/tests/parsers/xmltv.test.ts` | Unit tests for XMLTV parser |
| `packages/core/tests/parsers/xtream.test.ts` | Unit tests for Xtream client (fetch mocked) |
| `packages/core/src/index.ts` | Re-export all parser types and functions |
| `packages/core/package.json` | Add `fast-xml-parser` dependency |

---

### Task 1: M3U parser

**Files:**
- Create: `packages/core/src/parsers/m3u.ts`
- Create: `packages/core/tests/parsers/m3u.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/core/tests/parsers/m3u.test.ts`:

```ts
import { parseM3u, M3uChannel } from '../../src/parsers/m3u';

const MINIMAL = `#EXTM3U
#EXTINF:-1,Channel One
http://stream.example.com/1.m3u8`;

const FULL_ATTRS = `#EXTM3U
#EXTINF:-1 tvg-id="cnn.us" tvg-name="CNN" tvg-logo="http://logo.example.com/cnn.png" group-title="News",CNN International
http://stream.example.com/cnn.m3u8`;

const MULTI = `#EXTM3U
#EXTINF:-1 group-title="Sports",ESPN
http://stream.example.com/espn.m3u8
#EXTINF:-1 group-title="News",BBC World
http://stream.example.com/bbc.m3u8`;

const WITH_DIRECTIVES = `#EXTM3U
#EXTVLCOPT:no-video
#EXTINF:-1,Channel One
http://stream.example.com/1.m3u8
#EXTGRP:Sports`;

describe('parseM3u', () => {
  it('parses a minimal playlist entry', () => {
    const channels = parseM3u(MINIMAL);
    expect(channels).toHaveLength(1);
    expect(channels[0]).toEqual<M3uChannel>({
      name: 'Channel One',
      url: 'http://stream.example.com/1.m3u8',
      tvgId: undefined,
      tvgName: undefined,
      tvgLogo: undefined,
      groupTitle: undefined,
    });
  });

  it('parses all EXTINF attributes', () => {
    const [ch] = parseM3u(FULL_ATTRS);
    expect(ch.tvgId).toBe('cnn.us');
    expect(ch.tvgName).toBe('CNN');
    expect(ch.tvgLogo).toBe('http://logo.example.com/cnn.png');
    expect(ch.groupTitle).toBe('News');
    expect(ch.name).toBe('CNN International');
    expect(ch.url).toBe('http://stream.example.com/cnn.m3u8');
  });

  it('parses multiple channels in order', () => {
    const channels = parseM3u(MULTI);
    expect(channels).toHaveLength(2);
    expect(channels[0].name).toBe('ESPN');
    expect(channels[1].name).toBe('BBC World');
  });

  it('skips non-EXTINF directives without dropping the next channel', () => {
    const channels = parseM3u(WITH_DIRECTIVES);
    expect(channels).toHaveLength(1);
    expect(channels[0].name).toBe('Channel One');
  });

  it('returns empty array for empty input', () => {
    expect(parseM3u('')).toHaveLength(0);
  });

  it('returns empty array for header-only input', () => {
    expect(parseM3u('#EXTM3U')).toHaveLength(0);
  });

  it('handles CRLF line endings', () => {
    const crlf = '#EXTM3U\r\n#EXTINF:-1,Chan\r\nhttp://url.com\r\n';
    expect(parseM3u(crlf)).toHaveLength(1);
    expect(parseM3u(crlf)[0].name).toBe('Chan');
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm test:core 2>&1 | grep -E 'FAIL|Cannot find|error'
```

Expected: `Cannot find module '../../src/parsers/m3u'`

- [ ] **Step 3: Write the M3U parser**

Create `packages/core/src/parsers/m3u.ts`:

```ts
export interface M3uChannel {
  name: string;
  url: string;
  tvgId?: string;
  tvgName?: string;
  tvgLogo?: string;
  groupTitle?: string;
}

export function parseM3u(content: string): M3uChannel[] {
  const channels: M3uChannel[] = [];
  const lines = content.split(/\r?\n/);
  let pending: Omit<M3uChannel, 'url'> | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#EXTM3U')) continue;

    if (trimmed.startsWith('#EXTINF:')) {
      const commaIdx = trimmed.indexOf(',');
      const name = commaIdx >= 0 ? trimmed.slice(commaIdx + 1).trim() : '';
      const attrStr = commaIdx >= 0 ? trimmed.slice(0, commaIdx) : trimmed;

      const attrs: Record<string, string> = {};
      const re = /(\S+?)="([^"]*)"/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(attrStr)) !== null) {
        attrs[m[1]] = m[2];
      }

      pending = {
        name,
        tvgId: attrs['tvg-id'] || undefined,
        tvgName: attrs['tvg-name'] || undefined,
        tvgLogo: attrs['tvg-logo'] || undefined,
        groupTitle: attrs['group-title'] || undefined,
      };
      continue;
    }

    if (trimmed.startsWith('#')) continue;

    if (pending !== null) {
      channels.push({ ...pending, url: trimmed });
      pending = null;
    }
  }

  return channels;
}
```

- [ ] **Step 4: Run tests — expect all passing**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm test:core 2>&1
```

Expected: `Tests: 7 passed` (6 M3U + 1 smoke)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/parsers/m3u.ts packages/core/tests/parsers/m3u.test.ts
git commit -m "feat(core): add M3U parser"
```

---

### Task 2: Add fast-xml-parser dependency

**Files:**
- Modify: `packages/core/package.json`

- [ ] **Step 1: Add the dependency**

Edit `packages/core/package.json` — add `"dependencies"` section:

```json
{
  "name": "@iptv-player/core",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "jest"
  },
  "dependencies": {
    "fast-xml-parser": "^4.4.0"
  },
  "devDependencies": {
    "@types/jest": "*",
    "@types/node": "^20.0.0"
  }
}
```

- [ ] **Step 2: Install**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm install
```

Expected: `Packages: +1` (fast-xml-parser and its deps)

- [ ] **Step 3: Commit**

```bash
git add packages/core/package.json pnpm-lock.yaml
git commit -m "chore(core): add fast-xml-parser dependency"
```

---

### Task 3: XMLTV parser

**Files:**
- Create: `packages/core/src/parsers/xmltv.ts`
- Create: `packages/core/tests/parsers/xmltv.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/core/tests/parsers/xmltv.test.ts`:

```ts
import { parseXmltv, XmltvChannel, XmltvProgramme } from '../../src/parsers/xmltv';

const FULL_XML = `<?xml version="1.0" encoding="UTF-8"?>
<tv>
  <channel id="cnn.us">
    <display-name>CNN</display-name>
    <icon src="http://logo.example.com/cnn.png" />
  </channel>
  <channel id="bbc.uk">
    <display-name>BBC World</display-name>
  </channel>
  <programme start="20240601120000 +0000" stop="20240601130000 +0000" channel="cnn.us">
    <title>News Hour</title>
    <desc>The latest world news.</desc>
  </programme>
  <programme start="20240601130000 +0000" stop="20240601140000 +0000" channel="cnn.us">
    <title>Business Today</title>
  </programme>
</tv>`;

describe('parseXmltv — channels', () => {
  it('parses channel ids and display names', () => {
    const { channels } = parseXmltv(FULL_XML);
    expect(channels).toHaveLength(2);
    expect(channels[0]).toMatchObject<Partial<XmltvChannel>>({ id: 'cnn.us', displayName: 'CNN' });
    expect(channels[1]).toMatchObject<Partial<XmltvChannel>>({ id: 'bbc.uk', displayName: 'BBC World' });
  });

  it('parses channel icon URL', () => {
    const { channels } = parseXmltv(FULL_XML);
    expect(channels[0].iconUrl).toBe('http://logo.example.com/cnn.png');
  });

  it('leaves iconUrl undefined when icon element is absent', () => {
    const { channels } = parseXmltv(FULL_XML);
    expect(channels[1].iconUrl).toBeUndefined();
  });
});

describe('parseXmltv — programmes', () => {
  it('parses programme count and channel linkage', () => {
    const { programmes } = parseXmltv(FULL_XML);
    expect(programmes).toHaveLength(2);
    expect(programmes[0].channelId).toBe('cnn.us');
  });

  it('parses start and stop as UTC Dates', () => {
    const { programmes } = parseXmltv(FULL_XML);
    expect(programmes[0].start).toEqual(new Date('2024-06-01T12:00:00Z'));
    expect(programmes[0].stop).toEqual(new Date('2024-06-01T13:00:00Z'));
  });

  it('parses title and description', () => {
    const { programmes } = parseXmltv(FULL_XML);
    expect(programmes[0].title).toBe('News Hour');
    expect(programmes[0].description).toBe('The latest world news.');
  });

  it('leaves description undefined when desc element is absent', () => {
    const { programmes } = parseXmltv(FULL_XML);
    expect(programmes[1].description).toBeUndefined();
  });
});

describe('parseXmltv — date parsing', () => {
  function makeProg(start: string, stop: string): string {
    return `<tv>
      <channel id="x"><display-name>X</display-name></channel>
      <programme start="${start}" stop="${stop}" channel="x"><title>T</title></programme>
    </tv>`;
  }

  it('handles positive UTC offset', () => {
    const { programmes } = parseXmltv(makeProg('20240601120000 +0100', '20240601130000 +0100'));
    expect(programmes[0].start).toEqual(new Date('2024-06-01T11:00:00Z'));
  });

  it('handles negative UTC offset', () => {
    const { programmes } = parseXmltv(makeProg('20240601120000 -0500', '20240601130000 -0500'));
    expect(programmes[0].start).toEqual(new Date('2024-06-01T17:00:00Z'));
  });

  it('handles bare UTC timestamps without offset', () => {
    const { programmes } = parseXmltv(makeProg('20240601120000', '20240601130000'));
    expect(programmes[0].start).toEqual(new Date('2024-06-01T12:00:00Z'));
  });
});

describe('parseXmltv — edge cases', () => {
  it('returns empty results for empty tv element', () => {
    const { channels, programmes } = parseXmltv('<tv></tv>');
    expect(channels).toHaveLength(0);
    expect(programmes).toHaveLength(0);
  });

  it('handles a single channel without crashing (no array coercion issue)', () => {
    const xml = `<tv>
      <channel id="only"><display-name>Only</display-name></channel>
    </tv>`;
    const { channels } = parseXmltv(xml);
    expect(channels).toHaveLength(1);
    expect(channels[0].id).toBe('only');
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm test:core 2>&1 | grep -E 'FAIL|Cannot find|error'
```

Expected: `Cannot find module '../../src/parsers/xmltv'`

- [ ] **Step 3: Write the XMLTV parser**

Create `packages/core/src/parsers/xmltv.ts`:

```ts
import { XMLParser } from 'fast-xml-parser';

export interface XmltvChannel {
  id: string;
  displayName: string;
  iconUrl?: string;
}

export interface XmltvProgramme {
  channelId: string;
  start: Date;
  stop: Date;
  title: string;
  description?: string;
}

export interface XmltvResult {
  channels: XmltvChannel[];
  programmes: XmltvProgramme[];
}

function parseXmltvDate(s: string): Date {
  const withTz = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-])(\d{2})(\d{2})$/.exec(s.trim());
  if (withTz) {
    const [, y, mo, d, h, min, sec, sign, tzH, tzM] = withTz;
    return new Date(`${y}-${mo}-${d}T${h}:${min}:${sec}${sign}${tzH}:${tzM}`);
  }
  const bare = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(s.trim());
  if (bare) {
    const [, y, mo, d, h, min, sec] = bare;
    return new Date(`${y}-${mo}-${d}T${h}:${min}:${sec}Z`);
  }
  throw new Error(`Invalid XMLTV date: "${s}"`);
}

function textContent(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v != null && typeof v === 'object' && '#text' in (v as Record<string, unknown>)) {
    return String((v as Record<string, unknown>)['#text'] ?? '');
  }
  return '';
}

function asArray(v: unknown): unknown[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

// fast-xml-parser returns plain objects; these interfaces describe the XMLTV
// structure we expect after parsing with attributeNamePrefix '@_'.
interface RawChannel extends Record<string, unknown> {
  '@_id': string;
  'display-name': unknown;
  icon?: unknown;
}

interface RawProgramme extends Record<string, unknown> {
  '@_start': string;
  '@_stop': string;
  '@_channel': string;
  title: unknown;
  desc?: unknown;
}

interface RawTv {
  channel?: RawChannel[];
  programme?: RawProgramme[];
}

export function parseXmltv(content: string): XmltvResult {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: false,
    trimValues: true,
    isArray: (tagName) =>
      ['channel', 'programme', 'display-name', 'icon'].includes(tagName),
  });

  // XMLParser.parse returns unknown; the shape depends entirely on the input.
  const doc = parser.parse(content) as Record<string, unknown>;
  const tv = (doc['tv'] ?? {}) as RawTv;

  const channels: XmltvChannel[] = (tv.channel ?? []).map((ch) => {
    const names = asArray(ch['display-name']);
    const icons = asArray(ch.icon);
    const iconSrc = icons.length > 0
      ? (icons[0] as Record<string, unknown>)['@_src']
      : undefined;
    return {
      id: ch['@_id'],
      displayName: names.length > 0 ? textContent(names[0]) : '',
      iconUrl: typeof iconSrc === 'string' ? iconSrc : undefined,
    };
  });

  const programmes: XmltvProgramme[] = (tv.programme ?? []).map((prog) => {
    const rawDesc = prog.desc != null ? textContent(prog.desc) : undefined;
    return {
      channelId: prog['@_channel'],
      start: parseXmltvDate(prog['@_start']),
      stop: parseXmltvDate(prog['@_stop']),
      title: textContent(prog.title),
      description: rawDesc !== '' ? rawDesc : undefined,
    };
  });

  return { channels, programmes };
}
```

- [ ] **Step 4: Run tests — expect all passing**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm test:core 2>&1
```

Expected: all `parseXmltv` tests + prior tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/parsers/xmltv.ts packages/core/tests/parsers/xmltv.test.ts
git commit -m "feat(core): add XMLTV parser"
```

---

### Task 4: Xtream Codes client

**Files:**
- Create: `packages/core/src/parsers/xtream.ts`
- Create: `packages/core/tests/parsers/xtream.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/core/tests/parsers/xtream.test.ts`:

```ts
import { XtreamClient, XtreamCredentials, XtreamCategory, XtreamStream, XtreamEpgEntry } from '../../src/parsers/xtream';

const CREDS: XtreamCredentials = {
  host: 'http://provider.test:8080',
  username: 'testuser',
  password: 'testpass',
};

const mockFetch = jest.fn<Promise<Response>, [string]>();
global.fetch = mockFetch as unknown as typeof fetch;

function mockJson(data: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 401,
    json: async () => data,
  } as unknown as Response;
}

describe('XtreamClient', () => {
  beforeEach(() => mockFetch.mockClear());

  describe('getLiveCategories', () => {
    it('fetches the correct URL and maps category fields', async () => {
      mockFetch.mockResolvedValueOnce(mockJson([
        { category_id: '1', category_name: 'Sports', parent_id: 0 },
        { category_id: '2', category_name: 'News', parent_id: 0 },
      ]));

      const client = new XtreamClient(CREDS);
      const categories = await client.getLiveCategories();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://provider.test:8080/player_api.php?username=testuser&password=testpass&action=get_live_categories',
      );
      expect(categories).toHaveLength(2);
      expect(categories[0]).toEqual<XtreamCategory>({
        categoryId: '1',
        categoryName: 'Sports',
        parentId: 0,
      });
    });

    it('throws with the HTTP status on non-OK response', async () => {
      mockFetch.mockResolvedValueOnce(mockJson(null, false));
      const client = new XtreamClient(CREDS);
      await expect(client.getLiveCategories()).rejects.toThrow('401');
    });
  });

  describe('getLiveStreams', () => {
    it('fetches all streams and computes stream URLs', async () => {
      mockFetch.mockResolvedValueOnce(mockJson([
        {
          num: 1,
          name: 'ESPN',
          stream_id: 123,
          stream_icon: 'http://logo.png',
          epg_channel_id: 'espn.us',
          category_id: '1',
        },
      ]));

      const client = new XtreamClient(CREDS);
      const streams = await client.getLiveStreams();

      expect(streams).toHaveLength(1);
      expect(streams[0]).toEqual<XtreamStream>({
        num: 1,
        name: 'ESPN',
        streamId: 123,
        iconUrl: 'http://logo.png',
        epgChannelId: 'espn.us',
        categoryId: '1',
        streamUrl: 'http://provider.test:8080/live/testuser/testpass/123.m3u8',
      });
    });

    it('appends category_id to the URL when provided', async () => {
      mockFetch.mockResolvedValueOnce(mockJson([]));
      const client = new XtreamClient(CREDS);
      await client.getLiveStreams('42');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://provider.test:8080/player_api.php?username=testuser&password=testpass&action=get_live_streams&category_id=42',
      );
    });

    it('leaves epgChannelId undefined when stream has no epg_channel_id', async () => {
      mockFetch.mockResolvedValueOnce(mockJson([
        { num: 2, name: 'BBC', stream_id: 456, stream_icon: '', category_id: '2' },
      ]));
      const client = new XtreamClient(CREDS);
      const [stream] = await client.getLiveStreams();
      expect(stream.epgChannelId).toBeUndefined();
    });
  });

  describe('getShortEpg', () => {
    it('fetches EPG listings with correct URL and maps timestamps', async () => {
      mockFetch.mockResolvedValueOnce(mockJson({
        epg_listings: [
          {
            id: '999',
            epg_id: 'espn.us',
            title: 'SportsCenter',
            lang: 'en',
            start: '2024-06-01 12:00:00',
            end: '2024-06-01 13:00:00',
            description: 'Daily sports highlights.',
            channel_id: '123',
            start_timestamp: 1717243200,
            stop_timestamp: 1717246800,
          },
        ],
      }));

      const client = new XtreamClient(CREDS);
      const entries = await client.getShortEpg(123, 4);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://provider.test:8080/player_api.php?username=testuser&password=testpass&action=get_short_epg&stream_id=123&limit=4',
      );
      expect(entries).toHaveLength(1);
      expect(entries[0]).toEqual<XtreamEpgEntry>({
        id: '999',
        title: 'SportsCenter',
        start: new Date('2024-06-01T12:00:00Z'),
        stop: new Date('2024-06-01T13:00:00Z'),
        description: 'Daily sports highlights.',
        channelId: '123',
      });
    });

    it('uses limit=4 by default', async () => {
      mockFetch.mockResolvedValueOnce(mockJson({ epg_listings: [] }));
      const client = new XtreamClient(CREDS);
      await client.getShortEpg(123);
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('limit=4'));
    });
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm test:core 2>&1 | grep -E 'FAIL|Cannot find|error'
```

Expected: `Cannot find module '../../src/parsers/xtream'`

- [ ] **Step 3: Write the Xtream client**

Create `packages/core/src/parsers/xtream.ts`:

```ts
export interface XtreamCredentials {
  /** Base URL of the Xtream Codes server, e.g. "http://provider.example.com:8080" */
  host: string;
  username: string;
  password: string;
}

export interface XtreamCategory {
  categoryId: string;
  categoryName: string;
  parentId: number;
}

export interface XtreamStream {
  num: number;
  name: string;
  streamId: number;
  iconUrl: string;
  epgChannelId?: string;
  categoryId: string;
  /** HLS stream URL computed from host + credentials + stream ID. */
  streamUrl: string;
}

export interface XtreamEpgEntry {
  id: string;
  title: string;
  /** Note: some Xtream server forks base64-encode title/description; this client
   *  returns the raw value. Callers may need to attempt base64 decoding. */
  start: Date;
  stop: Date;
  description: string;
  channelId: string;
}

// Raw Xtream API response shapes — snake_case as returned by the server.
interface RawCategory {
  category_id: string;
  category_name: string;
  parent_id: number;
}

interface RawStream {
  num: number;
  name: string;
  stream_id: number;
  stream_icon: string;
  epg_channel_id?: string;
  category_id: string;
}

interface RawEpgEntry {
  id: string;
  title: string;
  start: string;  // "YYYY-MM-DD HH:mm:ss" (UTC)
  end: string;
  description: string;
  channel_id: string;
}

interface RawEpgResponse {
  epg_listings: RawEpgEntry[];
}

export class XtreamClient {
  private readonly apiBase: string;
  private readonly streamBase: string;

  constructor(creds: XtreamCredentials) {
    const host = creds.host.replace(/\/$/, '');
    this.apiBase = `${host}/player_api.php?username=${encodeURIComponent(creds.username)}&password=${encodeURIComponent(creds.password)}`;
    this.streamBase = `${host}/live/${creds.username}/${creds.password}`;
  }

  private async get<T>(action: string): Promise<T> {
    const res = await fetch(`${this.apiBase}&${action}`);
    if (!res.ok) throw new Error(`Xtream API error: ${res.status}`);
    return res.json() as Promise<T>;
  }

  async getLiveCategories(): Promise<XtreamCategory[]> {
    const raw = await this.get<RawCategory[]>('action=get_live_categories');
    return raw.map((c) => ({
      categoryId: String(c.category_id),
      categoryName: c.category_name,
      parentId: c.parent_id,
    }));
  }

  async getLiveStreams(categoryId?: string): Promise<XtreamStream[]> {
    const action = categoryId
      ? `action=get_live_streams&category_id=${categoryId}`
      : 'action=get_live_streams';
    const raw = await this.get<RawStream[]>(action);
    return raw.map((s) => ({
      num: s.num,
      name: s.name,
      streamId: s.stream_id,
      iconUrl: s.stream_icon,
      epgChannelId: s.epg_channel_id || undefined,
      categoryId: String(s.category_id),
      streamUrl: `${this.streamBase}/${s.stream_id}.m3u8`,
    }));
  }

  async getShortEpg(streamId: number, limit = 4): Promise<XtreamEpgEntry[]> {
    const raw = await this.get<RawEpgResponse>(
      `action=get_short_epg&stream_id=${streamId}&limit=${limit}`,
    );
    return raw.epg_listings.map((e) => ({
      id: String(e.id),
      title: e.title,
      start: new Date(`${e.start.replace(' ', 'T')}Z`),
      stop: new Date(`${e.end.replace(' ', 'T')}Z`),
      description: e.description,
      channelId: String(e.channel_id),
    }));
  }
}
```

- [ ] **Step 4: Run tests — expect all passing**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm test:core 2>&1
```

Expected: all Xtream tests + prior tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/parsers/xtream.ts packages/core/tests/parsers/xtream.test.ts
git commit -m "feat(core): add Xtream Codes API client"
```

---

### Task 5: Export parsers from core index + full verification

**Files:**
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Update the core index**

Replace `packages/core/src/index.ts` with:

```ts
export type { M3uChannel } from './parsers/m3u';
export { parseM3u } from './parsers/m3u';

export type { XmltvChannel, XmltvProgramme, XmltvResult } from './parsers/xmltv';
export { parseXmltv } from './parsers/xmltv';

export type { XtreamCredentials, XtreamCategory, XtreamStream, XtreamEpgEntry } from './parsers/xtream';
export { XtreamClient } from './parsers/xtream';
```

- [ ] **Step 2: Run full typecheck**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm typecheck
```

Expected: exits 0, no output.

- [ ] **Step 3: Run full lint**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm lint
```

Expected: exits 0, no output.

- [ ] **Step 4: Run full test suite**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm test 2>&1
```

Expected: all tests pass; count includes smoke + M3U + XMLTV + Xtream suites.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "feat(core): export parsers from public API surface"
```

---

## Self-Review

**Spec coverage check:**
- ✅ M3U/M3U8 (name, logo, group-title, tvg-id, stream URL) — Task 1
- ✅ Xtream Codes API (host/user/pass; live categories, live streams, short EPG) — Task 4
- ✅ XMLTV (channels + programmes: start/stop, title, desc) — Task 3
- ✅ Both gzipped and plain — note: parser accepts pre-decompressed strings; caller handles gzip (intentional — gzip is I/O, not parsing)
- ✅ Unit tests for all three — Tasks 1, 3, 4
- ✅ `tsc --noEmit` clean + lint clean — Task 5

**Placeholder scan:** none found — all steps have complete code.

**Type consistency:**
- `M3uChannel` defined in m3u.ts Task 1, referenced in test Task 1 ✅
- `XmltvChannel`, `XmltvProgramme`, `XmltvResult` defined in xmltv.ts Task 3, referenced in test Task 3 ✅
- `XtreamCredentials`, `XtreamCategory`, `XtreamStream`, `XtreamEpgEntry`, `XtreamClient` defined in xtream.ts Task 4, referenced in test Task 4 ✅
- All types re-exported from index in Task 5 ✅
