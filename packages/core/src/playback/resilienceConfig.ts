export interface ResilienceConfig {
  /** Cap ABR quality ladder at this bitrate (bps). Prevents jumping to HD on slow links. */
  abrCapBps?: number;
  /** Pin playback to the lowest available quality rung. Stops oscillation entirely. */
  bitrateLock?: boolean;
  /** Stall watchdog: seconds without position advance before forcing a rebuffer. Default: 8. */
  stallTimeoutSec?: number;
  /** Retry backoff: upper bound on retry delay (ms). Default: 30 000. */
  retryMaxDelayMs?: number;
  /** Enable manifest pre-fetching on channel hover. Default: false. */
  prefetchEnabled?: boolean;
  /** Prefetch is skipped when estimated bandwidth is below this threshold (Mbps). Default: 2. */
  prefetchMinBandwidthMbps?: number;
}

/** Exponential backoff: 1 s, 2 s, 4 s … capped at maxDelayMs (default 30 s). */
export function getRetryDelay(retryCount: number, maxDelayMs = 30_000): number {
  return Math.min(1_000 * Math.pow(2, retryCount), maxDelayMs);
}
