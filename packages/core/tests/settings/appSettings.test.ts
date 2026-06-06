import { DEFAULT_SETTINGS, mergeSettings } from '../../src/settings/appSettings';
import { toPlatformParams } from '../../src/playback/bufferProfile';
import type { BufferProfile } from '../../src/playback/bufferProfile';

describe('DEFAULT_SETTINGS', () => {
  it('has a valid bufferProfile', () => {
    expect(() => toPlatformParams(DEFAULT_SETTINGS.bufferProfile, 'web')).not.toThrow();
  });

  it('has prefetchEnabled false', () => {
    expect(DEFAULT_SETTINGS.prefetchEnabled).toBe(false);
  });

  it('has empty source URLs', () => {
    expect(DEFAULT_SETTINGS.m3uUrl).toBe('');
    expect(DEFAULT_SETTINGS.xmltvUrl).toBe('');
  });

  it('has empty favouriteUrls', () => {
    expect(DEFAULT_SETTINGS.favouriteUrls).toEqual([]);
  });
});

describe('mergeSettings', () => {
  it('returns defaults for empty partial', () => {
    expect(mergeSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it('overrides m3uUrl while preserving other defaults', () => {
    const result = mergeSettings({ m3uUrl: 'https://example.com/playlist.m3u' });
    expect(result.m3uUrl).toBe('https://example.com/playlist.m3u');
    expect(result.xmltvUrl).toBe('');
    expect(result.bufferProfile).toEqual({ kind: 'aggressive' });
    expect(result.prefetchEnabled).toBe(false);
  });

  it('overrides bufferProfile', () => {
    const result = mergeSettings({ bufferProfile: { kind: 'conservative' } });
    expect(result.bufferProfile).toEqual({ kind: 'conservative' });
    expect(result.m3uUrl).toBe('');
  });

  it('enables prefetch when specified', () => {
    const result = mergeSettings({ prefetchEnabled: true });
    expect(result.prefetchEnabled).toBe(true);
    expect(result.bufferProfile).toEqual({ kind: 'aggressive' });
  });

  it('produces valid platform params after bufferProfile override', () => {
    const result = mergeSettings({ bufferProfile: { kind: 'conservative' } });
    expect(() => toPlatformParams(result.bufferProfile, 'web')).not.toThrow();
    expect(() => toPlatformParams(result.bufferProfile, 'android')).not.toThrow();
  });

  it('merges custom bufferProfile', () => {
    const customProfile: BufferProfile = { kind: 'custom', params: { hls: { maxBufferLength: 90 } } };
    const result = mergeSettings({ bufferProfile: customProfile });
    expect(result.bufferProfile).toEqual(customProfile);
    expect(() => toPlatformParams(result.bufferProfile, 'web')).not.toThrow();
  });

  it('merges favouriteUrls', () => {
    const result = mergeSettings({ favouriteUrls: ['http://a.com/stream'] });
    expect(result.favouriteUrls).toEqual(['http://a.com/stream']);
  });

  it('favouriteUrls defaults to empty array', () => {
    const result = mergeSettings({});
    expect(result.favouriteUrls).toEqual([]);
  });
});
