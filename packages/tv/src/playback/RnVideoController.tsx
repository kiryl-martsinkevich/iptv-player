import React, { useCallback, useMemo, useReducer, useRef } from 'react';
import Video, {
  type OnBufferData,
  type OnProgressData,
  type OnVideoErrorData,
  type VideoRef,
  ResizeMode,
} from 'react-native-video';
import {
  toPlatformParams,
  type BufferProfile,
  type PlaybackController,
  type PlaybackStatus,
} from '@iptv-player/core';

interface ControllerState {
  url: string | null;
  paused: boolean;
  bufferProfile: BufferProfile;
  status: PlaybackStatus;
}

type Action =
  | { type: 'LOAD'; url: string; bufferProfile: BufferProfile }
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'DISPOSE' }
  | { type: 'SET_STATUS'; status: PlaybackStatus };

const INITIAL: ControllerState = {
  url: null,
  paused: true,
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
  }
}

export function useRnVideoController(): {
  controller: PlaybackController;
  VideoComponent: React.ReactElement | null;
} {
  const videoRef = useRef<VideoRef>(null);
  const [state, dispatch] = useReducer(reducer, INITIAL);

  // Ref holds the latest state so the stable controller object always reads current status.
  const stateRef = useRef(state);
  stateRef.current = state;

  const controller = useMemo<PlaybackController>(
    () => ({
      load: (url: string, bufferProfile: BufferProfile) =>
        dispatch({ type: 'LOAD', url, bufferProfile }),
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

  const onBuffer = useCallback((data: OnBufferData) => {
    dispatch({
      type: 'SET_STATUS',
      status: data.isBuffering
        ? { kind: 'buffering', bufferPercent: 0 }
        : { kind: 'playing', positionMs: 0, durationMs: null },
    });
  }, []);

  const onProgress = useCallback((data: OnProgressData) => {
    dispatch({
      type: 'SET_STATUS',
      status: {
        kind: 'playing',
        positionMs: data.currentTime * 1000,
        durationMs: data.seekableDuration > 0 ? data.seekableDuration * 1000 : null,
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
  }, []);

  const exoParams = toPlatformParams(state.bufferProfile, 'android');
  const avParams = toPlatformParams(state.bufferProfile, 'tvos');

  const VideoComponent = state.url ? (
    <Video
      ref={videoRef}
      source={{ uri: state.url, bufferConfig: exoParams }}
      paused={state.paused}
      style={{ width: '100%', height: '100%' }}
      resizeMode={ResizeMode.CONTAIN}
      preferredForwardBufferDuration={avParams.preferredForwardBufferDuration}
      onBuffer={onBuffer}
      onProgress={onProgress}
      onLoad={onLoad}
      onError={onError}
    />
  ) : null;

  return { controller, VideoComponent };
}
