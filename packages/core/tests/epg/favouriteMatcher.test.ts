import { matchFavouriteUrls } from '../../src/epg/favouriteMatcher';
import type { M3uChannel } from '../../src/parsers/m3u';

const CHANNELS: M3uChannel[] = [
  { url: 'http://example.com/espn.m3u8', name: 'ESPN', groupTitle: 'Sports' },
  { url: 'http://example.com/cnn.m3u8', name: 'CNN', groupTitle: 'News' },
  { url: 'http://example.com/hbo.m3u8', name: 'HBO', groupTitle: 'Entertainment' },
  { url: 'http://example.com/bbc.m3u8', name: 'BBC World', groupTitle: 'News' },
];

describe('matchFavouriteUrls', () => {
  it('matches by exact URL', () => {
    const result = matchFavouriteUrls(
      ['http://example.com/espn.m3u8'],
      ['ESPN'],
      CHANNELS,
    );
    expect(result.has('http://example.com/espn.m3u8')).toBe(true);
  });

  it('matches multiple exact URLs', () => {
    const result = matchFavouriteUrls(
      ['http://example.com/espn.m3u8', 'http://example.com/cnn.m3u8'],
      ['ESPN', 'CNN'],
      CHANNELS,
    );
    expect(result.size).toBe(2);
    expect(result.has('http://example.com/espn.m3u8')).toBe(true);
    expect(result.has('http://example.com/cnn.m3u8')).toBe(true);
  });

  it('returns empty set when no URLs or channels match', () => {
    const result = matchFavouriteUrls(
      ['http://old.example.com/stream.m3u8'],
      ['Old Stream'],
      CHANNELS,
    );
    expect(result.size).toBe(0);
  });

  it('returns empty set for empty favourites', () => {
    const result = matchFavouriteUrls([], [], CHANNELS);
    expect(result.size).toBe(0);
  });

  it('returns empty set when M3U channels are empty', () => {
    const result = matchFavouriteUrls(
      ['http://example.com/espn.m3u8'],
      ['ESPN'],
      [],
    );
    expect(result.size).toBe(0);
  });

  it('falls back to case-insensitive name match when URL changed', () => {
    // URL rotated but channel name is the same
    const result = matchFavouriteUrls(
      ['http://old.example.com/espn-old.m3u8'],
      ['ESPN'],
      CHANNELS,
    );
    // Should match the current ESPN URL via name fallback
    expect(result.has('http://example.com/espn.m3u8')).toBe(true);
  });

  it('name match is case-insensitive', () => {
    const result = matchFavouriteUrls(
      ['http://old.example.com/espn.m3u8'],
      ['espn'], // lowercase
      CHANNELS,
    );
    expect(result.has('http://example.com/espn.m3u8')).toBe(true);
  });

  it('name match trims whitespace', () => {
    const result = matchFavouriteUrls(
      ['http://old.example.com/espn.m3u8'],
      ['  ESPN  '],
      CHANNELS,
    );
    expect(result.has('http://example.com/espn.m3u8')).toBe(true);
  });

  it('URL match takes precedence over name match (exact URL always correct)', () => {
    // Same name "ESPN" but URL still exists — should match by URL
    const result = matchFavouriteUrls(
      ['http://example.com/espn.m3u8'],
      ['ESPN'],
      CHANNELS,
    );
    expect(result.has('http://example.com/espn.m3u8')).toBe(true);
    expect(result.size).toBe(1);
  });

  it('handles parallel arrays of different lengths gracefully', () => {
    const result = matchFavouriteUrls(
      ['http://example.com/espn.m3u8', 'http://example.com/cnn.m3u8'],
      ['ESPN'], // shorter than urls
      CHANNELS,
    );
    expect(result.has('http://example.com/espn.m3u8')).toBe(true);
  });

  it('handles duplicate names by picking the first channel match', () => {
    const dupChannels: M3uChannel[] = [
      { url: 'http://example.com/espn-hd.m3u8', name: 'ESPN' },
      { url: 'http://example.com/espn-sd.m3u8', name: 'ESPN' },
    ];
    const result = matchFavouriteUrls(
      ['http://old.example.com/espn.m3u8'],
      ['ESPN'],
      dupChannels,
    );
    // Should match the first one
    expect(result.has('http://example.com/espn-hd.m3u8')).toBe(true);
    expect(result.size).toBe(1);
  });
});
