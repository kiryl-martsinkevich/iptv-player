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
