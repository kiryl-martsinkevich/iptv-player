import React, { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import Video, {
  type OnBufferData,
  type OnProgressData,
  type OnVideoErrorData,
  type VideoRef,
  ResizeMode,
  SelectedVideoTrackType,
} from 'react-native-video';
import {
  getRetryDelay,
  toPlatformParams,
  type BufferProfile,
  type PlaybackController,
  type PlaybackStatus,
  type ResilienceConfig,
} from '@iptv-player/core';

const MAX_RETRIES = 10;

interface ControllerState {
  url: string | null;
  paused: boolean;
  bufferProfile: BufferProfile;
  resilienceConfig: ResilienceConfig;
  retryTick: number;
  status: PlaybackStatus;
}

type Action =
  | { type: 'LOAD'; url: string; bufferProfile: BufferProfile; resilienceConfig: ResilienceConfig }
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'DISPOSE' }
  | { type: 'SET_STATUS'; status: PlaybackStatus }
  | { type: 'RETRY' };

const INITIAL: ControllerState = {
  url: null,
  paused: true,
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
        paused: false,
        status: { kind: 'loading' },
      };
    case 'PLAY':
      return { ...state, paused: false };
    case 'PAUSE':
      return {
        ...state,
        paused: true,
        status:
          state.status.kind === 'playing'
            ? { kind: 'paused', positionMs: state.status.positionMs }
            : state.status,
      };
    case 'DISPOSE':
      return INITIAL;
    case 'SET_STATUS':
      return { ...state, status: action.status };
    case 'RETRY':
      return { ...state, retryTick: state.retryTick + 1, status: { kind: 'loading' } };
  }
}

export function useRnVideoController(): {
  controller: PlaybackController;
  VideoComponent: React.ReactElement | null;
} {
  const videoRef = useRef<VideoRef>(null);
  const [state, dispatch] = useReducer(reducer, INITIAL);

  const stateRef = useRef(state);
  stateRef.current = state;

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Wall-clock timestamp of last onProgress call — used by stall watchdog.
  const lastProgressWallRef = useRef<number>(Date.now());
  const lastProgressPosRef = useRef<number>(0);

  const controller = useMemo<PlaybackController>(
    () => ({
      load: (url: string, bufferProfile: BufferProfile, resilienceConfig: ResilienceConfig = {}) =>
        dispatch({ type: 'LOAD', url, bufferProfile, resilienceConfig }),
      play: () => dispatch({ type: 'PLAY' }),
      pause: () => dispatch({ type: 'PAUSE' }),
      seek: (positionMs: number) => videoRef.current?.seek(positionMs / 1000),
      dispose: () => dispatch({ type: 'DISPOSE' }),
      get status(): PlaybackStatus {
        return stateRef.current.status;
      },
    }),
    [],
  );

  // --- Stall watchdog ---
  useEffect(() => {
    if (!state.url) return;
    const stallTimeoutSec = state.resilienceConfig.stallTimeoutSec ?? 8;
    lastProgressWallRef.current = Date.now();
    lastProgressPosRef.current = 0;

    const timer = setInterval(() => {
      if (stateRef.current.status.kind !== 'playing') return;
      const elapsedSec = (Date.now() - lastProgressWallRef.current) / 1_000;
      if (elapsedSec > stallTimeoutSec) {
        dispatch({ type: 'SET_STATUS', status: { kind: 'buffering', bufferPercent: 0 } });
        videoRef.current?.seek(lastProgressPosRef.current / 1_000 + 0.1);
        lastProgressWallRef.current = Date.now(); // reset to avoid repeated seeks
      }
    }, 2_000);

    return () => clearInterval(timer);
  }, [state.url, state.resilienceConfig, state.retryTick]);

  const onBuffer = useCallback((data: OnBufferData) => {
    dispatch({
      type: 'SET_STATUS',
      status: data.isBuffering
        ? { kind: 'buffering', bufferPercent: 0 }
        : { kind: 'playing', positionMs: 0, durationMs: null },
    });
  }, []);

  const onProgress = useCallback((data: OnProgressData) => {
    lastProgressWallRef.current = Date.now();
    lastProgressPosRef.current = data.currentTime * 1_000;
    dispatch({
      type: 'SET_STATUS',
      status: {
        kind: 'playing',
        positionMs: data.currentTime * 1_000,
        durationMs: data.seekableDuration > 0 ? data.seekableDuration * 1_000 : null,
      },
    });
  }, []);

  const onLoad = useCallback(() => {
    if (!stateRef.current.paused) {
      dispatch({
        type: 'SET_STATUS',
        status: { kind: 'playing', positionMs: 0, durationMs: null },
      });
    }
  }, []);

  const onError = useCallback((data: OnVideoErrorData) => {
    const message =
      data.error.localizedDescription ??
      data.error.errorString ??
      'Playback error';
    dispatch({ type: 'SET_STATUS', status: { kind: 'error', message } });

    const { url, resilienceConfig, retryTick } = stateRef.current;
    if (!url || retryTick >= MAX_RETRIES) return;
    const maxDelayMs = resilienceConfig.retryMaxDelayMs ?? 30_000;
    const delay = getRetryDelay(retryTick, maxDelayMs);
    setTimeout(() => {
      if (mountedRef.current && stateRef.current.url === url) {
        dispatch({ type: 'RETRY' });
      }
    }, delay);
  }, []);

  const exoParams = toPlatformParams(state.bufferProfile, 'android');
  const avParams = toPlatformParams(state.bufferProfile, 'tvos');
  const { resilienceConfig } = state;

  // ABR cap: use abrCapBps; bitrate lock: set maxBitRate to 1 to force lowest quality
  const maxBitRate = resilienceConfig.bitrateLock
    ? 1
    : resilienceConfig.abrCapBps;

  // selectedVideoTrack: undefined lets ExoPlayer/AVPlayer handle ABR normally
  const selectedVideoTrack = resilienceConfig.bitrateLock
    ? { type: SelectedVideoTrackType.INDEX, value: 0 }
    : undefined;

  const VideoComponent = state.url ? (
    <Video
      ref={videoRef}
      source={{ uri: state.url, bufferConfig: exoParams }}
      paused={state.paused}
      style={{ width: '100%', height: '100%' }}
      resizeMode={ResizeMode.CONTAIN}
      preferredForwardBufferDuration={avParams.preferredForwardBufferDuration}
      maxBitRate={maxBitRate}
      selectedVideoTrack={selectedVideoTrack}
      onBuffer={onBuffer}
      onProgress={onProgress}
      onLoad={onLoad}
      onError={onError}
    />
  ) : null;

  return { controller, VideoComponent };
}
