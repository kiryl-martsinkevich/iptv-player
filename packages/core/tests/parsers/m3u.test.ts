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
