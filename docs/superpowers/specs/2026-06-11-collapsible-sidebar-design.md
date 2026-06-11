# Collapsible Sidebar (Desktop) — Design Spec

> **Goal:** Let the desktop user collapse the channel sidebar so the player and EPG grid span the full window width, via a single toggle button in the player's top-left corner.

**Architecture:** Local component state in `EpgPage` only. No new files, no hook (a single boolean needs none), no `packages/core`/`AppSettings` changes. The collapse state is ephemeral (resets to expanded on each launch), matching how fullscreen state isn't persisted.

**Tech Stack:** TypeScript strict, React 18, react-native-web (desktop). Browser-only feature.

---

## 1. Scope

- **Desktop only.** TV is unaffected (its player already fills the screen and has no sidebar).
- Distinct from the existing Fullscreen API mode. This is an in-app layout toggle for the *normal* (non-fullscreen) view. In fullscreen, only the player panel is shown (the Fullscreen API targets that `<div>`), so the sidebar isn't visible regardless — the toggle is therefore hidden while fullscreen.

## 2. Behavior

In `packages/desktop/src/epg/EpgPage.tsx`:

- Add `const [sidebarCollapsed, setSidebarCollapsed] = useState(false);`
- Wrap the **entire sidebar region** — the `status === 'loading' ? … : status === 'error' ? … : (<div style={sidebarStyle}>…)` ternary — in `{!sidebarCollapsed && ( … )}`. When collapsed it renders nothing; the existing right-hand column (`<div style={{ flex: 1, … }}>` holding the player panel + EPG grid) already has `flex: 1`, so it expands to the full width automatically. Both the player and the grid widen.
- **Toggle button:** one `<button>` in the player panel (the `position: relative; height: 55%` div), positioned **top-left** (`top: 8, left: 8`), mirroring the existing fullscreen button at top-right. It renders **only when `!isFullscreen`** (`isFullscreen` is already returned by `useFullscreen` in this component).
  - Glyph + labels reflect state: collapsed → `▶` / "Show sidebar"; expanded → `◀` / "Hide sidebar".
  - `onClick` calls `e.stopPropagation()` then `setSidebarCollapsed(c => !c)`. (`stopPropagation` keeps the click from reaching the panel's `onDoubleClick` fullscreen handler, consistent with the fullscreen button.)
  - Styling matches the fullscreen button (32×32, `rgba(0,0,0,0.55)` background, `1px solid #444`, `borderRadius: 6`, white glyph) so the two corner controls are visually consistent. No collision: toggle is top-left, fullscreen is top-right, volume bar is bottom.

## 3. Out of scope

- Persisting collapse state across restarts (ephemeral by choice).
- A keyboard shortcut.
- TV.
- Any animation/transition on collapse (instant show/hide).
- Re-flowing the EPG grid's internal layout — it simply receives more width.

## 4. Testing

No Jest harness exists for the desktop package (consistent with prior phases). Verification:
- `tsc --noEmit` + ESLint clean on the desktop package.
- Manual: clicking the top-left button hides the sidebar and the player + EPG grid fill the window width; clicking again restores it; the button is absent while in fullscreen; the fullscreen and volume controls still work.
