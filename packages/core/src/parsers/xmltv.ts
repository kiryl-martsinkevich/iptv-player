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
// structure expected after parsing with attributeNamePrefix '@_'.
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
    // The XMLTV URL points at a third-party server — treat the document as
    // untrusted. This caps *custom DOCTYPE entity* expansions (predefined
    // entities like &amp; use a separate path and do not count), keeping it
    // generous enough for any real EPG while bounding entity-volume DoS:
    // fast-xml-parser already drops chained entities (so classic billion-laughs
    // can't expand), and its separate maxExpandedLength guard (100 kB) stays
    // at its default. Number.MAX_SAFE_INTEGER had removed this bound entirely.
    processEntities: { maxTotalExpansions: 1_000_000 },
  });

  // XMLParser.parse returns unknown; the shape depends entirely on the input document.
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
