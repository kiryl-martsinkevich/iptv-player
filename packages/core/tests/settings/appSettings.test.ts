import { DEFAULT_SETTINGS, mergeSettings } from '../../src/settings/appSettings';
import { toPlatformParams } from '../../src/playback/bufferProfile';

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
});
