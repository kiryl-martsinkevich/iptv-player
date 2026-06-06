import React, { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import Hls from 'hls.js';
import Mpegts from 'mpegts.js';
import {
  toPlatformParams,
  type BufferProfile,
  type PlaybackController,
  type PlaybackStatus,
} from '@iptv-player/core';

// Detect raw MPEG-TS vs HLS by URL path (before query string).
function isMpegTs(url: string): boolean {
  const path = url.split('?')[0].toLowerCase();
  return path.endsWith('.ts') || path.includes('mpegts') || path.includes('mpeg-ts');
}

interface ControllerState {
  url: string | null;
  bufferProfile: BufferProfile;
  status: PlaybackStatus;
}

type Action =
  | { type: 'LOAD'; url: string; bufferProfile: BufferProfile }
  | { type: 'DISPOSE' }
  | { type: 'SET_STATUS'; status: PlaybackStatus };

const INITIAL: ControllerState = {
  url: null,
  bufferProfile: { kind: 'balanced' },
  status: { kind: 'idle' },
};

function reducer(state: ControllerState, action: Action): ControllerState {
  switch (action.type) {
    case 'LOAD':
      return {
        ...state,
        url: action.url,
        bufferProfile: action.bufferProfile,
        status: { kind: 'loading' },
      };
    case 'DISPOSE':
      return INITIAL;
    case 'SET_STATUS':
      return { ...state, status: action.status };
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

  // Ref holds latest state so the stable controller object always reads current status.
  const stateRef = useRef(state);
  stateRef.current = state;

  // --- Stable controller object ---
  const controller = useMemo<PlaybackController>(
    () => ({
      load: (url: string, bufferProfile: BufferProfile) =>
        dispatch({ type: 'LOAD', url, bufferProfile }),
      play: () => {
        videoRef.current?.play().catch(() => {
          // Autoplay may be blocked — status stays as-is until user interacts.
        });
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

  // --- DOM event listeners — attached once after mount; video element is stable ---
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

  // --- Player init / teardown when URL or buffer profile changes ---
  useEffect(() => {
    const video = videoRef.current;

    // Always destroy the previous player before (re-)initialising.
    hlsRef.current?.destroy();
    hlsRef.current = null;
    if (mpegtsRef.current) {
      mpegtsRef.current.destroy();
      mpegtsRef.current = null;
    }

    if (!state.url || !video) return;

    const hlsParams = toPlatformParams(state.bufferProfile, 'web');

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
        video.play().catch(() => {});
      });
      hlsRef.current = hls;
    } else {
      // Safari: native HLS without hls.js.
      video.src = state.url;
      video.play().catch(() => {});
    }

    return () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
      if (mpegtsRef.current) {
        mpegtsRef.current.destroy();
        mpegtsRef.current = null;
      }
      video.removeAttribute('src');
      video.load();
    };
  }, [state.url, state.bufferProfile]);

  // VideoComponent is always rendered so videoRef is populated before effects run.
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
