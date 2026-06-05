import {
  toPlatformParams,
  ExoBufferParams,
  AvPlayerBufferParams,
  HlsBufferParams,
} from '../../src/playback/bufferProfile';

describe('toPlatformParams — aggressive profile', () => {
  it('Android: exact ExoPlayer buffer params', () => {
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

  it('web: exact hls.js buffer params', () => {
    const p = toPlatformParams({ kind: 'aggressive' }, 'web');
    expect(p).toEqual<HlsBufferParams>({
      maxBufferLength: 120,
      maxMaxBufferLength: 600,
      backBufferLength: 30,
      maxBufferSize: 200_000_000,
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

  it('web: smaller maxBufferLength and higher liveMaxLatencyDuration', () => {
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
    expect(p.maxBufferMs).toBe(60_000);        // balanced default untouched
    expect(p.bufferForPlaybackMs).toBe(2_500); // balanced default untouched
  });

  it('web: starts from balanced and applies hls.js overrides', () => {
    const p = toPlatformParams(
      { kind: 'custom', params: { hls: { maxBufferLength: 200 } } },
      'web',
    );
    expect(p.maxBufferLength).toBe(200);
    expect(p.maxMaxBufferLength).toBe(120); // balanced default
  });

  it('tvOS: uses balanced defaults when no avplayer override given', () => {
    const p = toPlatformParams({ kind: 'custom', params: {} }, 'tvos');
    expect(p.preferredForwardBufferDuration).toBe(60);
  });
});
