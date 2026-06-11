# Fullscreen Mode — Design Spec

> **Goal:** Add a fullscreen viewing mode to the video player on both platforms — browser-native fullscreen on desktop, and idle-based chrome auto-hide on TV (whose player already fills the screen).

**Architecture:** Platform-specific, no `packages/core` changes and no new dependencies. Two small hooks encapsulate the mechanism: `useFullscreen(targetRef)` on desktop (DOM Fullscreen API) and `useAutoHideControls(timeoutMs)` on TV (react-native-tvos remote events). The playback controllers are untouched — fullscreen is a UI/layout concern, not a playback concern.

**Tech Stack:** TypeScript strict, React 18, browser Fullscreen API (desktop), react-native-tvos `useTVEventHandler` (TV).

---

## 1. Platform scope

| Platform | What "fullscreen" means | Why |
|----------|------------------------|-----|
| Desktop  | The player panel (currently a 55%-height region inside `EpgPage`) expands to fill the entire monitor via the browser Fullscreen API. | The desktop player is embedded in the EPG layout, so true fullscreen is a real feature. |
| TV       | The player already occupies the whole screen (`EpgScreen` swaps to `PlayerScreen` on channel select). "Fullscreen" = auto-hide the on-screen chrome after idle so the video is edge-to-edge. | There is no smaller-than-screen state to expand from; the value is removing overlays. |

---

## 2. Desktop — browser Fullscreen API

### 2.1 `useFullscreen` hook

New file: `packages/desktop/src/ui/player/useFullscreen.ts`

```ts
import { useCallback, useEffect, useState, type RefObject } from 'react';

export function useFullscreen(targetRef: RefObject<HTMLElement>): {
  isFullscreen: boolean;
  toggle: () => void;
} {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === targetRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [targetRef]);

  const toggle = useCallback(() => {
    const el = targetRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void el.requestFullscreen();
    }
  }, [targetRef]);

  return { isFullscreen, toggle };
}
```

Notes:
- State is driven by the `fullscreenchange` event, **not** by the `toggle` call — so pressing **Esc** (browser-native exit) flips `isFullscreen` back to `false` and the button icon updates correctly.
- `document.fullscreenElement === targetRef.current` scopes the boolean to *our* element, so if some other element is fullscreen we don't report `true`.
- `requestFullscreen`/`exitFullscreen` return promises; `void` discards them (best-effort; a rejected request — e.g. not user-initiated — is a no-op).

### 2.2 Target element

The hook is attached to the **player-panel container** in `EpgPage.tsx`: the existing
`<div style={{ position: 'relative', height: '55%', flexShrink: 0, background: '#000' }}>`
that wraps `{VideoComponent}`, `<BufferHealthBadge>`, and the volume bar.

Fullscreening this container (rather than the bare `<video>`) keeps the buffer badge and volume slider usable in fullscreen. In fullscreen the browser makes the element fill the viewport; `height: '55%'` is ignored, the video's `objectFit: 'contain'` centres it, and the absolutely-positioned overlays remain anchored.

### 2.3 Triggers

All three toggle the same `toggle()`:

1. **Button** — a `⛶` toggle button overlaid bottom-right of the player panel. Its label/icon reflects `isFullscreen` (e.g. `⛶` to enter, `⛶`/`✕`-style to exit; copy finalised in the plan). Placed so it doesn't overlap the existing bottom volume bar (e.g. top-right of the panel, or right end of the volume row).
2. **Double-click** — `onDoubleClick` on the player-panel container calls `toggle()`.
3. **F key** — a `keydown` listener (added in `EpgPage`) toggles when `e.key === 'f'` or `'F'`, **unless** the event target / `document.activeElement` is an `<input>`/`<textarea>` (so typing "f" in the channel search box does not toggle fullscreen). The listener is cleaned up on unmount.
4. **Esc** — handled natively by the browser; no code needed. `fullscreenchange` keeps state in sync.

### 2.4 Files touched (desktop)

| File | Change |
|------|--------|
| `packages/desktop/src/ui/player/useFullscreen.ts` | **New** — the hook above. |
| `packages/desktop/src/epg/EpgPage.tsx` | Add a `playerRef` on the player-panel div; call `useFullscreen(playerRef)`; add the `⛶` button, `onDoubleClick`, and the guarded F-key `keydown` effect. |

`PlayerPage.tsx` (a standalone player component not wired into the desktop app flow — `App` renders `EpgPage`, which drives the controller directly) is **out of scope**. If it is ever wired in, it can reuse `useFullscreen` the same way.

---

## 3. TV — idle chrome auto-hide

### 3.1 `useAutoHideControls` hook

New file: `packages/tv/src/ui/player/useAutoHideControls.ts`

```ts
import { useEffect, useRef, useState } from 'react';
import { useTVEventHandler } from 'react-native';

export function useAutoHideControls(timeoutMs = 3000): { visible: boolean } {
  const [visible, setVisible] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const arm = () => {
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = setTimeout(() => setVisible(false), timeoutMs);
  };

  // Any remote event reveals the chrome and restarts the idle timer.
  useTVEventHandler(() => {
    setVisible(true);
    arm();
  });

  useEffect(() => {
    arm();
    return () => {
      if (timer.current !== undefined) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { visible };
}
```

Notes:
- `useTVEventHandler` (exported from `react-native` in the react-native-tvos fork) fires on any remote key event (arrows, select, play/pause, etc.). Each event shows the chrome and re-arms the 3s timer.
- On mount the timer is armed immediately, so a stream that starts and is left untouched hides its chrome after `timeoutMs`.
- If `useTVEventHandler` is unavailable or behaves unexpectedly on the installed react-native-tvos version, the hook still compiles and degrades to "hide after initial timeout" — the plan's verification step confirms the import resolves; if it does not, fall back to a focusable wrapper `Pressable`'s `onPress`/focus events. (This contingency is noted for the implementer; the primary path is `useTVEventHandler`.)

### 3.2 Integration in `PlayerScreen`

`packages/tv/src/ui/player/PlayerScreen.tsx`:

- Call `const { visible } = useAutoHideControls();`
- Gate **only the volume bar** on `visible` — render it when `visible`, omit it otherwise.
- Leave `BufferHealthBadge` always mounted: it already returns `null` during steady playback and only renders for `loading`/`buffering`/`error`. So nothing is hidden during normal playback, and the user never loses the "Buffering…"/error signal. (Explicitly **not** gated on `visible`.)

Net behaviour: during uninterrupted playback the screen shows only video; any remote press brings the volume bar back for 3 seconds.

### 3.3 Focus consideration

The volume bar contains focusable `Pressable` buttons (🔉/🔊). When the bar is hidden, those lose focus; the next remote press re-shows the bar (via `useTVEventHandler`) before the user can act on it, which is the intended reveal-then-interact flow. The implementation should ensure hiding the bar does not crash the TV focus engine (e.g. it is acceptable for focus to fall back to the default); this is verified manually, since TV has no automated test harness.

### 3.4 Files touched (TV)

| File | Change |
|------|--------|
| `packages/tv/src/ui/player/useAutoHideControls.ts` | **New** — the hook above. |
| `packages/tv/src/ui/player/PlayerScreen.tsx` | Call `useAutoHideControls`; gate the volume bar render on `visible`. |

---

## 4. Testing strategy

- **Core:** no changes, so no new core tests.
- **Desktop / TV:** no Jest harness exists for the platform packages (consistent with prior phases). Verification is `tsc --noEmit` + ESLint clean on both packages, plus manual checks:
  - Desktop: button / double-click / F toggle fullscreen; F is ignored while the search box is focused; Esc exits and the button icon resets; volume + badge remain usable in fullscreen.
  - TV: volume bar hides ~3s after the last remote press and reappears on any press; buffer/error badge still shows when relevant.

---

## 5. Out of scope

- Persisting a "fullscreen by default" preference in `AppSettings`.
- Picture-in-picture.
- Desktop `PlayerPage.tsx` (not in the app flow).
- A TV on-screen fullscreen *button* (the platform uses idle auto-hide instead).
- Hiding the desktop chrome on idle (desktop keeps its controls visible; only the panel-vs-monitor size changes).
