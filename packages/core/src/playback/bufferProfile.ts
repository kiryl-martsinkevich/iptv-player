export interface ExoBufferParams {
  minBufferMs: number;
  maxBufferMs: number;
  /** Keep small for fast channel zapping. */
  bufferForPlaybackMs: number;
  /** Higher than bufferForPlaybackMs — gives stalled streams more runway to recover. */
  bufferForPlaybackAfterRebufferMs: number;
}

export interface AvPlayerBufferParams {
  /**
   * Maps to AVPlayerItem.preferredForwardBufferDuration (seconds).
   * AVPlayer has no minBuffer/playback-start equivalent — this is the only tunable lever.
   * See CLAUDE.md: "AVPlayer is far less granular than ExoPlayer".
   */
  preferredForwardBufferDuration: number;
}

export interface HlsBufferParams {
  maxBufferLength: number;        // seconds ahead to buffer
  maxMaxBufferLength: number;     // absolute ceiling
  backBufferLength: number;       // seconds to retain behind playhead
  maxBufferSize: number;          // bytes
  liveSyncDuration: number;       // seconds behind live edge to target
  liveMaxLatencyDuration: number; // seek to edge if latency exceeds this
}

export interface CustomBufferParams {
  exo?: Partial<ExoBufferParams>;
  avplayer?: Partial<AvPlayerBufferParams>;
  hls?: Partial<HlsBufferParams>;
}

export type BufferProfile =
  | { kind: 'conservative' }
  | { kind: 'balanced' }
  | { kind: 'aggressive' }
  | { kind: 'custom'; params: CustomBufferParams };

export type Platform = 'android' | 'tvos' | 'web';

const PRESETS: Record<
  'conservative' | 'balanced' | 'aggressive',
  { exo: ExoBufferParams; avplayer: AvPlayerBufferParams; hls: HlsBufferParams }
> = {
  conservative: {
    exo: { minBufferMs: 15_000, maxBufferMs: 30_000, bufferForPlaybackMs: 2_500, bufferForPlaybackAfterRebufferMs: 5_000 },
    avplayer: { preferredForwardBufferDuration: 30 },
    hls: { maxBufferLength: 30, maxMaxBufferLength: 60, backBufferLength: 10, maxBufferSize: 50_000_000, liveSyncDuration: 5, liveMaxLatencyDuration: 20 },
  },
  balanced: {
    exo: { minBufferMs: 30_000, maxBufferMs: 60_000, bufferForPlaybackMs: 2_500, bufferForPlaybackAfterRebufferMs: 5_000 },
    avplayer: { preferredForwardBufferDuration: 60 },
    hls: { maxBufferLength: 60, maxMaxBufferLength: 120, backBufferLength: 20, maxBufferSize: 100_000_000, liveSyncDuration: 3, liveMaxLatencyDuration: 15 },
  },
  aggressive: {
    exo: { minBufferMs: 50_000, maxBufferMs: 120_000, bufferForPlaybackMs: 2_500, bufferForPlaybackAfterRebufferMs: 5_000 },
    avplayer: { preferredForwardBufferDuration: 120 },
    hls: { maxBufferLength: 120, maxMaxBufferLength: 600, backBufferLength: 30, maxBufferSize: 200_000_000, liveSyncDuration: 3, liveMaxLatencyDuration: 10 },
  },
};

export function toPlatformParams(profile: BufferProfile, platform: 'android'): ExoBufferParams;
export function toPlatformParams(profile: BufferProfile, platform: 'tvos'): AvPlayerBufferParams;
export function toPlatformParams(profile: BufferProfile, platform: 'web'): HlsBufferParams;
export function toPlatformParams(
  profile: BufferProfile,
  platform: Platform,
): ExoBufferParams | AvPlayerBufferParams | HlsBufferParams {
  const preset = profile.kind === 'custom' ? PRESETS.balanced : PRESETS[profile.kind];
  const custom: CustomBufferParams = profile.kind === 'custom' ? profile.params : {};

  switch (platform) {
    case 'android':
      // Preset supplies all required fields; custom only overrides individual values.
      return { ...preset.exo, ...(custom.exo ?? {}) } as ExoBufferParams;
    case 'tvos':
      return { ...preset.avplayer, ...(custom.avplayer ?? {}) } as AvPlayerBufferParams;
    case 'web':
      return { ...preset.hls, ...(custom.hls ?? {}) } as HlsBufferParams;
  }
}
