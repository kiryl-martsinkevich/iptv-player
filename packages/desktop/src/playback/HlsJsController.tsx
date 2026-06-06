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

  const cancelledRef = useRef(false);

  const controller = useMemo<PlaybackController>(
    () => ({
      load: (url: string, bufferProfile: BufferProfile, resilienceConfig: ResilienceConfig = {}) =>
        dispatch({ type: 'LOAD', url, bufferProfile, resilienceConfig }),
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

    const onPlaying = () =>
      dispatch({
        type: 'SET_STATUS',
        status: {
          kind: 'playing',
          positionMs: video.currentTime * 1000,
          durationMs: isFinite(video.duration) ? video.duration * 1000 : null,
        },
      });

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

  // --- Player init / teardown (re-runs on new URL, profile, or retry tick) ---
  useEffect(() => {
    const video = videoRef.current;

    cancelledRef.current = false;

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

    if (isMpegTs(state.url)) {
      const player = Mpegts.createPlayer(
        { type: 'mpegts', url: state.url, isLive: true },
        {
          enableWorker: true,
          lazyLoadMaxDuration: hlsParams.maxBufferLength,
          seekType: 'range',
        },
      );
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
      });

      hls.loadSource(state.url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (resilienceConfig.abrCapBps) {
          // Cap to highest level below the cap
          const maxLevel = hls.levels.reduce((max, level, idx) => {
            return level.maxBitrate <= resilienceConfig.abrCapBps! ? idx : max;
          }, 0);
          hls.currentLevel = maxLevel;
        }
        if (resilienceConfig.bitrateLock) {
          // Level 0 = lowest bitrate (hls.js sorts ascending)
          hls.currentLevel = 0;
        }
        video.play().catch(() => {});
      });

      if (resilienceConfig.bitrateLock || resilienceConfig.abrCapBps) {
        // Re-pin if something tries to switch up
        hls.on(Hls.Events.LEVEL_SWITCHING, () => {
          if (resilienceConfig.bitrateLock) {
            if (hls.currentLevel !== 0) hls.currentLevel = 0;
          } else if (resilienceConfig.abrCapBps) {
            const maxLevel = hls.levels.reduce((max, level, idx) => {
              return level.maxBitrate <= resilienceConfig.abrCapBps! ? idx : max;
            }, 0);
            if (hls.currentLevel > maxLevel) hls.currentLevel = maxLevel;
          }
        });
      }

      // Retry with backoff on fatal errors
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return;
        const maxDelayMs = stateRef.current.resilienceConfig.retryMaxDelayMs ?? 30_000;
        const delay = getRetryDelay(stateRef.current.retryTick, maxDelayMs);
        setTimeout(() => {
          if (!cancelledRef.current) dispatch({ type: 'RETRY' });
        }, delay);
      });

      hlsRef.current = hls;
    } else {
      // Safari native HLS
      video.src = state.url;
      video.play().catch(() => {});
    }

    return () => {
      cancelledRef.current = true;
      clearInterval(stallTimer);
      hlsRef.current?.destroy();
      hlsRef.current = null;
      if (mpegtsRef.current) {
        mpegtsRef.current.destroy();
        mpegtsRef.current = null;
      }
      video.removeAttribute('src');
      video.load();
    };
  }, [state.url, state.bufferProfile, state.retryTick]);

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
