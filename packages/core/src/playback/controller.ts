import type { BufferProfile } from './bufferProfile';

export type PlaybackStatus =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'buffering'; bufferPercent: number }
  | { kind: 'playing'; positionMs: number; durationMs: number | null }
  | { kind: 'paused'; positionMs: number }
  | { kind: 'error'; message: string };

/**
 * Platform-agnostic playback contract.
 *   packages/tv      → RnVideoController  (react-native-video: ExoPlayer on Android, AVPlayer on tvOS)
 *   packages/desktop → HlsJsController    (hls.js + mpegts.js)
 */
export interface PlaybackController {
  load(url: string, bufferProfile: BufferProfile): void;
  play(): void;
  pause(): void;
  seek(positionMs: number): void;
  dispose(): void;
  readonly status: PlaybackStatus;
}
