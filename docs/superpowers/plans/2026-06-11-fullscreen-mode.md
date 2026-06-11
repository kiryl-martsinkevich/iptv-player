# Fullscreen Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fullscreen viewing mode — browser-native fullscreen on desktop (button + double-click + F key), and idle-based chrome auto-hide on TV.

**Architecture:** Two small platform-specific hooks, no `packages/core` changes and no new dependencies. Desktop: `useFullscreen(ref)` wraps the DOM Fullscreen API and is wired into the `EpgPage` player panel. TV: `useAutoHideControls(timeoutMs)` uses react-native-tvos `useTVEventHandler` to hide the volume bar after idle; `PlayerScreen` gates the bar on it.

**Tech Stack:** TypeScript strict, React 18, browser Fullscreen API (desktop), react-native-tvos `useTVEventHandler` (TV).

**Spec:** `docs/superpowers/specs/2026-06-11-fullscreen-mode-design.md`

---

## Conventions for the executor

- The platform packages (`tv`, `desktop`) have **no Jest harness** (same as all prior phases). Verification for every task is `tsc --noEmit` + ESLint clean; behaviour is checked via the manual checklist in the final task. There are no unit-test steps because there is no runner — do not scaffold one.
- This plan runs in a git worktree where pnpm 11's pre-run dependency check aborts run-scripts. **Always** invoke pnpm as `pnpm --config.verify-deps-before-run=false <script>`.
- pnpm runs may leave `pnpm-workspace.yaml` modified with injected noise. Before every commit run `git checkout -- pnpm-workspace.yaml 2>/dev/null || true`. Never commit that file.
- Set the env once per shell: `export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"`.

## File Map

| Path | Role |
|------|------|
| `packages/desktop/src/ui/player/useFullscreen.ts` | **New.** `useFullscreen(targetRef) → { isFullscreen, toggle }` over the DOM Fullscreen API. |
| `packages/desktop/src/epg/EpgPage.tsx` | **Modify.** Ref the player panel; wire the hook, the `⤢` button, double-click, and the guarded F-key listener. |
| `packages/tv/src/ui/player/useAutoHideControls.ts` | **New.** `useAutoHideControls(timeoutMs) → { visible }` via `useTVEventHandler`. |
| `packages/tv/src/ui/player/PlayerScreen.tsx` | **Modify.** Gate the volume bar render on `visible`. |
| `CLAUDE.md` | **Modify.** Add a feature row to the phase-progress table. |

---

### Task 1: Desktop `useFullscreen` hook

**Files:**
- Create: `packages/desktop/src/ui/player/useFullscreen.ts`

- [ ] **Step 1: Write the hook**

Create `packages/desktop/src/ui/player/useFullscreen.ts`:

```ts
import { useCallback, useEffect, useState, type RefObject } from 'react';

/**
 * Drive the browser Fullscreen API for a single element.
 *
 * `isFullscreen` is derived from the `fullscreenchange` event (not from the
 * `toggle` call), so pressing Esc — the browser's native exit — flips it back
 * to false and any button bound to it updates correctly.
 */
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

- [ ] **Step 2: Typecheck**

```bash
pnpm --config.verify-deps-before-run=false --filter @iptv-player/desktop typecheck
```
Expected: exits 0, no output.

- [ ] **Step 3: Commit**

```bash
git checkout -- pnpm-workspace.yaml 2>/dev/null || true
git add packages/desktop/src/ui/player/useFullscreen.ts
git commit -m "feat(desktop): add useFullscreen hook over the Fullscreen API"
```

---

### Task 2: Wire fullscreen into the desktop `EpgPage` player panel

**Files:**
- Modify: `packages/desktop/src/epg/EpgPage.tsx`

The component already imports `useEffect, useMemo, useRef, useState` from React. The player panel is the
`<div style={{ position: 'relative', height: '55%', flexShrink: 0, background: '#000' }}>` that wraps
`{VideoComponent}`, `<BufferHealthBadge>`, and the volume slider.

- [ ] **Step 1: Import the hook**

After the existing line:
```tsx
import { findFavouriteIndex, matchFavouriteUrls, type AppSettings } from '@iptv-player/core';
```
add:
```tsx
import { useFullscreen } from '../ui/player/useFullscreen';
```

- [ ] **Step 2: Add the player ref and hook call**

Find this line (near the top of the component body):
```tsx
  const { prefetch } = usePrefetch(prefetchEnabled, 2);
```
Immediately after it, add:
```tsx
  const playerRef = useRef<HTMLDivElement>(null);
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(playerRef);
```

- [ ] **Step 3: Add the F-key listener**

Find this line:
```tsx
  useEffect(() => () => clearTimeout(searchTimerRef.current), []);
```
Immediately after it, add:
```tsx

  // Toggle fullscreen on "F" — but not while typing in the channel search box.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'f' && e.key !== 'F') return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      toggleFullscreen();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleFullscreen]);
```

- [ ] **Step 4: Ref the player panel, add double-click + the fullscreen button**

Find this exact block:
```tsx
        <div style={{ position: 'relative', height: '55%', flexShrink: 0, background: '#000' }}>
          {VideoComponent}
          <BufferHealthBadge status={controller.status} />
```
Replace it with:
```tsx
        <div
          ref={playerRef}
          onDoubleClick={toggleFullscreen}
          style={{ position: 'relative', height: '55%', flexShrink: 0, background: '#000' }}
        >
          {VideoComponent}
          <BufferHealthBadge status={controller.status} />
          <button
            onClick={e => { e.stopPropagation(); toggleFullscreen(); }}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            style={{
              position: 'absolute', top: 8, right: 8,
              width: 32, height: 32, lineHeight: '30px', textAlign: 'center',
              background: 'rgba(0,0,0,0.55)', border: '1px solid #444', borderRadius: 6,
              color: '#fff', fontSize: 16, cursor: 'pointer', padding: 0,
            }}
          >
            {isFullscreen ? '⤡' : '⤢'}
          </button>
```
(The rest of the panel — the volume bar `<div>` and the closing `</div>` — is unchanged. `⤢`/`⤡` are the diagonal "expand"/"collapse" glyphs Chromium renders reliably; the Tauri webview is Chromium/WebKit. `stopPropagation` on the button keeps a button click from also reaching the panel's `onDoubleClick` on rapid clicks.)

- [ ] **Step 5: Typecheck + lint**

```bash
pnpm --config.verify-deps-before-run=false --filter @iptv-player/desktop typecheck
pnpm --config.verify-deps-before-run=false lint
```
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git checkout -- pnpm-workspace.yaml 2>/dev/null || true
git add packages/desktop/src/epg/EpgPage.tsx
git commit -m "feat(desktop): fullscreen toggle on EpgPage player (button, double-click, F key)"
```

---

### Task 3: TV `useAutoHideControls` hook

**Files:**
- Create: `packages/tv/src/ui/player/useAutoHideControls.ts`

`useTVEventHandler` is exported and typed by the react-native-tvos fork
(`react-native` → `public/ReactNativeTVTypes.d.ts`):
`useTVEventHandler: (handleEvent: (event: HWEvent) => void) => void`. It fires on any remote key event.

- [ ] **Step 1: Write the hook**

Create `packages/tv/src/ui/player/useAutoHideControls.ts`:

```ts
import { useEffect, useRef, useState } from 'react';
import { useTVEventHandler } from 'react-native';

/**
 * Show on-screen controls, then hide them after `timeoutMs` of remote
 * inactivity. Any remote event reveals them and restarts the idle timer.
 */
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
    // arm() closes over timeoutMs, which is stable for the lifetime of a screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { visible };
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --config.verify-deps-before-run=false --filter @iptv-player/tv typecheck
```
Expected: exits 0.

If `useTVEventHandler` is reported as not exported (unexpected — it is typed in this version), STOP and report; do not invent a fallback silently.

If lint flags the `react-hooks/exhaustive-deps` disable as an unknown rule (this repo's ESLint does **not** load the react-hooks plugin), remove that single `// eslint-disable-next-line react-hooks/exhaustive-deps` comment — the lint passes without it because the rule is not enforced. (Confirm in Step 4 of Task 4 where lint runs.)

- [ ] **Step 3: Commit**

```bash
git checkout -- pnpm-workspace.yaml 2>/dev/null || true
git add packages/tv/src/ui/player/useAutoHideControls.ts
git commit -m "feat(tv): add useAutoHideControls hook (idle-based chrome hide)"
```

---

### Task 4: Gate the TV volume bar on visibility

**Files:**
- Modify: `packages/tv/src/ui/player/PlayerScreen.tsx`

`PlayerScreen` currently renders, inside `<View style={styles.container}>`: `{VideoComponent}`,
`<BufferHealthBadge status={controller.status} />`, then `<View style={styles.volumeBar}>…</View>`.
Only the volume bar gets gated; the badge stays (it already renders nothing during steady playback).

- [ ] **Step 1: Import the hook**

After the existing line:
```tsx
import { BufferHealthBadge } from './BufferHealthBadge';
```
add:
```tsx
import { useAutoHideControls } from './useAutoHideControls';
```

- [ ] **Step 2: Call the hook**

Find this line in the component body:
```tsx
  const { controller, VideoComponent } = useRnVideoController();
```
Immediately after it, add:
```tsx
  const { visible } = useAutoHideControls();
```

- [ ] **Step 3: Gate the volume bar**

Find this exact block:
```tsx
      <View style={styles.volumeBar}>
        <Pressable style={styles.volBtn} onPress={() => adjustVolume(-0.1)}>
          <Text style={styles.volBtnText}>🔉</Text>
        </Pressable>
        <View style={styles.volTrack}>
          <View style={[styles.volFill, { width: `${volume * 100}%` }]} />
        </View>
        <Text style={styles.volLabel}>{Math.round(volume * 100)}%</Text>
        <Pressable style={styles.volBtn} onPress={() => adjustVolume(+0.1)}>
          <Text style={styles.volBtnText}>🔊</Text>
        </Pressable>
      </View>
```
Wrap it in a `{visible && ( … )}` guard:
```tsx
      {visible && (
        <View style={styles.volumeBar}>
          <Pressable style={styles.volBtn} onPress={() => adjustVolume(-0.1)}>
            <Text style={styles.volBtnText}>🔉</Text>
          </Pressable>
          <View style={styles.volTrack}>
            <View style={[styles.volFill, { width: `${volume * 100}%` }]} />
          </View>
          <Text style={styles.volLabel}>{Math.round(volume * 100)}%</Text>
          <Pressable style={styles.volBtn} onPress={() => adjustVolume(+0.1)}>
            <Text style={styles.volBtnText}>🔊</Text>
          </Pressable>
        </View>
      )}
```

- [ ] **Step 4: Typecheck + lint**

```bash
pnpm --config.verify-deps-before-run=false --filter @iptv-player/tv typecheck
pnpm --config.verify-deps-before-run=false lint
```
Expected: both exit 0. (If lint fails only on the `react-hooks/exhaustive-deps` disable comment in `useAutoHideControls.ts`, apply the removal noted in Task 3 Step 2, re-run, then continue.)

- [ ] **Step 5: Commit**

```bash
git checkout -- pnpm-workspace.yaml 2>/dev/null || true
git add packages/tv/src/ui/player/PlayerScreen.tsx
git commit -m "feat(tv): auto-hide the volume bar after idle in PlayerScreen"
```

---

### Task 5: Full verification + CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Full verification**

```bash
pnpm --config.verify-deps-before-run=false typecheck
pnpm --config.verify-deps-before-run=false --filter @iptv-player/tv typecheck
pnpm --config.verify-deps-before-run=false --filter @iptv-player/desktop typecheck
pnpm --config.verify-deps-before-run=false lint
pnpm --config.verify-deps-before-run=false test 2>&1 | tail -4
```
Expected: all exit 0; tests still `107 passed` (core unaffected).

- [ ] **Step 2: Manual behaviour checklist (record results in the commit/PR, do not block on a GUI you can't launch)**

Desktop (`pnpm --config.verify-deps-before-run=false --filter @iptv-player/desktop dev`, load a source, play a channel):
- Clicking `⤢` enters fullscreen; the glyph becomes `⤡`; the player fills the monitor; the buffer badge and volume slider remain visible.
- Double-clicking the player area toggles fullscreen.
- Pressing `F` toggles fullscreen; pressing `F` while the channel search box is focused types "f" and does NOT toggle.
- Pressing `Esc` exits fullscreen and the glyph resets to `⤢`.

TV (Metro / simulator if available):
- After ~3 s without remote input the volume bar disappears; any remote press brings it back for another 3 s.
- The buffer/error badge still appears when loading/buffering/error.

If no GUI is available in the environment, state that the checklist is deferred to a human and that typecheck/lint/tests are green.

- [ ] **Step 3: Update CLAUDE.md**

In `CLAUDE.md`, in the Phase progress table, add this row immediately after the `| 10 — Review fixes |` row:

```markdown
| 11 — Fullscreen mode | ✅ complete | Desktop: `useFullscreen` hook (Fullscreen API) on the EpgPage player — ⤢ button + double-click + F key (ignored while search focused), Esc exits. TV: `useAutoHideControls` (useTVEventHandler) hides the volume bar after 3s idle, any remote press reveals it; buffer/error badge unaffected. No core changes, no new deps — typechecks + lint clean, 107 tests. |
```

- [ ] **Step 4: Commit**

```bash
git checkout -- pnpm-workspace.yaml 2>/dev/null || true
git add CLAUDE.md
git commit -m "docs: CLAUDE.md — fullscreen mode row"
```

---

## Self-Review

**Spec coverage:**
- §2.1 `useFullscreen` hook → Task 1 (verbatim from spec). ✅
- §2.2 target = player-panel container → Task 2 Step 4 (ref on that exact div). ✅
- §2.3 triggers: button → Task 2 Step 4; double-click → Task 2 Step 4; F key with input guard → Task 2 Step 3; Esc native → covered by the hook's `fullscreenchange` sync (Task 1). ✅
- §2.4 files: `useFullscreen.ts` new (T1), `EpgPage.tsx` modified (T2); `PlayerPage.tsx` untouched (out of scope). ✅
- §3.1 `useAutoHideControls` hook → Task 3 (verbatim). ✅
- §3.2 gate only the volume bar, badge always mounted → Task 4 Step 3 (only the volume `<View>` wrapped). ✅
- §3.3 focus consideration → manual checklist (Task 5 Step 2); no automated TV test harness exists. ✅
- §4 testing strategy (typecheck + lint + manual) → every task + Task 5. ✅
- §5 out of scope (settings persistence, PiP, PlayerPage, TV button, desktop idle-hide) → none added. ✅

**Placeholder scan:** none. Every code step shows full code; every command states expected output. The only conditional ("if lint flags the disable comment") gives the exact remediation.

**Type consistency:** `useFullscreen(targetRef: RefObject<HTMLElement>)` is called with `useRef<HTMLDivElement>(null)` (assignable to `RefObject<HTMLElement>`) and destructured as `{ isFullscreen, toggle: toggleFullscreen }` — names match every use site in Task 2. `useAutoHideControls(): { visible: boolean }` is destructured as `{ visible }` and used in the Task 4 guard — consistent. `useTVEventHandler(() => {...})` matches the verified signature `(handleEvent: (event: HWEvent) => void) => void` (the handler ignores its `HWEvent` arg, which is allowed).
