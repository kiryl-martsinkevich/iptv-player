import React, { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import Hls from 'hls.js';
import Mpegts from 'mpegts.js';
import {
  getRetryDelay,
  toPlatformParams,
  type BufferProfile,
  type PlaybackController,
  type PlaybackStatus,
  type ResilienceConfig,
} from '@iptv-player/core';

function isMpegTs(url: string): boolean {
  const path = url.split('?')[0].toLowerCase();
  return path.endsWith('.ts') || path.includes('mpegts') || path.includes('mpeg-ts');
}

const MAX_RETRIES = 10;

interface ControllerState {
  url: string | null;
  bufferProfile: BufferProfile;
  resilienceConfig: ResilienceConfig;
  retryTick: number;
  status: PlaybackStatus;
}

type Action =
  | { type: 'LOAD'; url: string; bufferProfile: BufferProfile; resilienceConfig: ResilienceConfig }
  | { type: 'DISPOSE' }
  | { type: 'SET_STATUS'; status: PlaybackStatus }
  | { type: 'RETRY' };

const INITIAL: ControllerState = {
  url: null,
  bufferProfile: { kind: 'balanced' },
  resilienceConfig: {},
  retryTick: 0,
  status: { kind: 'idle' },
};

function reducer(state: ControllerState, action: Action): ControllerState {
  switch (action.type) {
    case 'LOAD':
      return {
        ...state,
        url: action.url,
        bufferProfile: action.bufferProfile,
        resilienceConfig: action.resilienceConfig,
        retryTick: 0,
        status: { kind: 'loading' },
      };
    case 'DISPOSE':
      return INITIAL;
    case 'SET_STATUS':
      return { ...state, status: action.status };
    case 'RETRY':
      return { ...state, retryTick: state.retryTick + 1, status: { kind: 'loading' } };
  }
}

export function useHlsJsController(): {
  controller: PlaybackController;
  VideoComponent: React.ReactElement;
} {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const mpegtsRef = useRef<Mpegts.Player | null>(null);
  const [state, dispatch] = useReducer(reducer, INITIAL);

  const stateRef = useRef(state);
  stateRef.current = state;

  // Backoff attempt counter — resets when playback recovers (see onPlaying)
  // or a new load starts. state.retryTick stays a grow-only re-init key.
  const retryCountRef = useRef(0);

  const controller = useMemo<PlaybackController>(
    () => ({
      load: (url: string, bufferProfile: BufferProfile, resilienceConfig: ResilienceConfig = {}) => {
        retryCountRef.current = 0;
        dispatch({ type: 'LOAD', url, bufferProfile, resilienceConfig });
      },
      play: () => {
        videoRef.current?.play().catch(() => {});
      },
      pause: () => {
        videoRef.current?.pause();
        const posMs = videoRef.current ? videoRef.current.currentTime * 1000 : 0;
        dispatch({ type: 'SET_STATUS', status: { kind: 'paused', positionMs: posMs } });
      },
      seek: (positionMs: number) => {
        if (videoRef.current) videoRef.current.currentTime = positionMs / 1000;
      },
      setVolume: (level: number) => {
        if (videoRef.current) videoRef.current.volume = Math.max(0, Math.min(1, level));
      },
      dispose: () => {
        videoRef.current?.pause();
        dispatch({ type: 'DISPOSE' });
      },
      get status(): PlaybackStatus {
        return stateRef.current.status;
      },
    }),
    [],
  );

  // --- DOM event listeners (attached once) ---
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onWaiting = () =>
      dispatch({ type: 'SET_STATUS', status: { kind: 'buffering', bufferPercent: 0 } });

    const onPlaying = () => {
      retryCountRef.current = 0;
      dispatch({
        type: 'SET_STATUS',
        status: {
          kind: 'playing',
          positionMs: video.currentTime * 1000,
          durationMs: isFinite(video.duration) ? video.duration * 1000 : null,
        },
      });
    };

    const onTimeUpdate = () => {
      if (!video.paused && !video.seeking) {
        dispatch({
          type: 'SET_STATUS',
          status: {
            kind: 'playing',
            positionMs: video.currentTime * 1000,
            durationMs: isFinite(video.duration) ? video.duration * 1000 : null,
          },
        });
      }
    };

    const onError = () => {
      const msg = video.error?.message ?? 'Playback error';
      dispatch({ type: 'SET_STATUS', status: { kind: 'error', message: msg } });
    };

    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('error', onError);

    return () => {
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('error', onError);
    };
  }, []);

  // --- Player init / teardown (re-runs on new URL, profile, config, or retry tick) ---
  useEffect(() => {
    const video = videoRef.current;

    // Per-run cancellation: a stale retry timer from a previous run must never
    // dispatch RETRY against the player created by a later run.
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    hlsRef.current?.destroy();
    hlsRef.current = null;
    if (mpegtsRef.current) {
      mpegtsRef.current.destroy();
      mpegtsRef.current = null;
    }

    if (!state.url || !video) return;

    const { resilienceConfig } = state;
    const hlsParams = toPlatformParams(state.bufferProfile, 'web');
    const stallTimeoutSec = resilienceConfig.stallTimeoutSec ?? 8;
    const TICK_MS = 2_000;

    const scheduleRetry = () => {
      if (cancelled || retryCountRef.current >= MAX_RETRIES) return;
      const maxDelayMs = stateRef.current.resilienceConfig.retryMaxDelayMs ?? 30_000;
      const delay = getRetryDelay(retryCountRef.current, maxDelayMs);
      retryCountRef.current += 1;
      retryTimer = setTimeout(() => {
        if (!cancelled) dispatch({ type: 'RETRY' });
      }, delay);
    };

    // --- Stall watchdog ---
    let lastCurrentTime = video.currentTime;
    let stallTicks = 0;
    const stallTimer = setInterval(() => {
      if (video.paused || stateRef.current.status.kind !== 'playing') {
        stallTicks = 0;
        return;
      }
      const ct = video.currentTime;
      if (ct === lastCurrentTime) {
        stallTicks++;
        if (stallTicks * TICK_MS >= stallTimeoutSec * 1_000) {
          video.currentTime = ct + 0.1;
          dispatch({ type: 'SET_STATUS', status: { kind: 'buffering', bufferPercent: 0 } });
          stallTicks = 0;
        }
      } else {
        stallTicks = 0;
      }
      lastCurrentTime = ct;
    }, TICK_MS);

    // Native Safari <video> error → schedule a backoff retry. (Distinct from the
    // always-on `onError` DOM listener above, which only reflects error state in
    // the UI; this one drives the retry.)
    const onNativeError = () => scheduleRetry();

    if (isMpegTs(state.url)) {
      const player = Mpegts.createPlayer(
        { type: 'mpegts', url: state.url, isLive: true },
        {
          enableWorker: true,
          lazyLoadMaxDuration: hlsParams.maxBufferLength,
          seekType: 'range',
        },
      );
      player.on(Mpegts.Events.ERROR, (errorType: string) => {
        dispatch({ type: 'SET_STATUS', status: { kind: 'error', message: errorType || 'Stream error' } });
        scheduleRetry();
      });
      player.attachMediaElement(video);
      player.load();
      player.play()?.catch(() => {});
      mpegtsRef.current = player;
    } else if (Hls.isSupported()) {
      const hls = new Hls({
        maxBufferLength: hlsParams.maxBufferLength,
        maxMaxBufferLength: hlsParams.maxMaxBufferLength,
        backBufferLength: hlsParams.backBufferLength,
        maxBufferSize: hlsParams.maxBufferSize,
        liveSyncDuration: hlsParams.liveSyncDuration,
        liveMaxLatencyDuration: hlsParams.liveMaxLatencyDuration,
        // Buffer stability: skip gaps up to 1s without stalling
        maxBufferHole: 1,
        // Allow 50% fragment duration variance when scanning the buffer
        maxFragLookUpTolerance: 0.5,
        // Retry on segment append errors before giving up
        appendErrorMaxRetry: 3,
        // Check high-buffer watermark less aggressively (reduces nudging)
        highBufferWatchdogPeriod: 3,
      });

      hls.loadSource(state.url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (resilienceConfig.bitrateLock) {
          // Hard lock: pin the lowest rung. Level 0 = lowest (hls.js sorts ascending).
          hls.currentLevel = 0;
        } else if (resilienceConfig.abrCapBps) {
          // Soft cap: highest level whose bitrate fits under the cap; ABR keeps
          // adapting among the levels at or below it (autoLevelCapping), unlike
          // currentLevel which would disable ABR entirely.
          const capLevel = hls.levels.reduce(
            (max, level, idx) => (level.bitrate <= resilienceConfig.abrCapBps! ? idx : max),
            0,
          );
          hls.autoLevelCapping = capLevel;
        }
        video.play().catch(() => {});
      });

      if (resilienceConfig.bitrateLock) {
        // Re-pin if something tries to switch up
        hls.on(Hls.Events.LEVEL_SWITCHING, () => {
          if (hls.currentLevel !== 0) hls.currentLevel = 0;
        });
      }

      // Retry with backoff on fatal errors
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return;
        // Show error state during the backoff window so the UI has feedback
        dispatch({ type: 'SET_STATUS', status: { kind: 'error', message: data.type } });
        scheduleRetry();
      });

      hlsRef.current = hls;
    } else {
      // Safari native HLS
      video.addEventListener('error', onNativeError);
      video.src = state.url;
      video.play().catch(() => {});
    }

    return () => {
      cancelled = true;
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      clearInterval(stallTimer);
      video.removeEventListener('error', onNativeError);
      hlsRef.current?.destroy();
      hlsRef.current = null;
      if (mpegtsRef.current) {
        mpegtsRef.current.destroy();
        mpegtsRef.current = null;
      }
      video.removeAttribute('src');
      video.load();
    };
  }, [state.url, state.bufferProfile, state.resilienceConfig, state.retryTick]);

  const VideoComponent = useCallback(
    () => (
      <div style={{ width: '100%', height: '100%', backgroundColor: '#000' }}>
        <video
          ref={videoRef}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          playsInline
        />
      </div>
    ),
    [],
  );

  return { controller, VideoComponent: <VideoComponent /> };
}
