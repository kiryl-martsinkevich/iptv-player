# Collapsible Sidebar (Desktop) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a top-left toggle button to the desktop player that collapses the channel sidebar so the player + EPG grid span the full window width.

**Architecture:** A single boolean of local state in `EpgPage` (`sidebarCollapsed`), gating whether the sidebar region renders. No new files, no hook, no `packages/core`/`AppSettings` changes; state is ephemeral. The toggle button mirrors the existing fullscreen button and is hidden while fullscreen.

**Tech Stack:** TypeScript strict, React 18, react-native-web (desktop).

**Spec:** `docs/superpowers/specs/2026-06-11-collapsible-sidebar-design.md`

---

## Conventions for the executor

- The desktop package has **no Jest harness** (same as all prior phases). Verification is `tsc --noEmit` + ESLint clean, plus the manual checklist in the final task. No unit-test steps — there is no runner.
- Set the env once per shell: `export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"`.
- Invoke pnpm run-scripts as `pnpm --config.verify-deps-before-run=false <script>` (pnpm 11 aborts run-scripts otherwise in this repo).
- pnpm runs may leave `pnpm-workspace.yaml` modified with injected noise — `git checkout -- pnpm-workspace.yaml 2>/dev/null || true` before every commit; never commit it.

## File Map

| Path | Change |
|------|--------|
| `packages/desktop/src/epg/EpgPage.tsx` | **Modify.** Add `sidebarCollapsed` state; gate the sidebar render on it; add the top-left toggle button (hidden in fullscreen). |
| `CLAUDE.md` | **Modify.** Add a feature row to the phase-progress table. |

---

### Task 1: Collapsible sidebar in `EpgPage`

**Files:**
- Modify: `packages/desktop/src/epg/EpgPage.tsx`

This component already has `const playerRef = useRef<HTMLDivElement>(null); const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(playerRef);` and a player panel whose top-right holds the fullscreen button. Read the file first to confirm the anchors below match.

- [ ] **Step 1: Add the collapse state**

Find this exact line:
```tsx
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(playerRef);
```
Immediately after it, add:
```tsx
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
```
(`useState` is already imported in this file.)

- [ ] **Step 2: Gate the sidebar region — opening**

Find this exact block:
```tsx
    <div style={{ display: 'flex', height: '100%', background: '#111', overflow: 'hidden' }}>
      {status === 'loading' ? (
```
Replace it with:
```tsx
    <div style={{ display: 'flex', height: '100%', background: '#111', overflow: 'hidden' }}>
      {!sidebarCollapsed && (status === 'loading' ? (
```

- [ ] **Step 3: Gate the sidebar region — closing**

The sidebar ternary closes just before the right-hand column. Find this exact block (the `)}` that ends the ternary, followed by the `flex: 1` column div):
```tsx
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
```
Replace it with (one extra closing paren to match the `(` added in Step 2):
```tsx
      ))}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
```

- [ ] **Step 4: Add the toggle button in the player panel**

The player panel's fullscreen button ends with `</button>` and is followed by the volume bar `<div>`. Find this exact block:
```tsx
            {isFullscreen ? '⤡' : '⤢'}
          </button>
          <div style={{
            position: 'absolute', bottom: 8, left: 8, right: 8,
```
Replace it with (insert the new button between the fullscreen button and the volume bar):
```tsx
            {isFullscreen ? '⤡' : '⤢'}
          </button>
          {!isFullscreen && (
            <button
              onClick={e => { e.stopPropagation(); setSidebarCollapsed(c => !c); }}
              title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
              aria-label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
              style={{
                position: 'absolute', top: 8, left: 8,
                width: 32, height: 32, lineHeight: '30px', textAlign: 'center',
                background: 'rgba(0,0,0,0.55)', border: '1px solid #444', borderRadius: 6,
                color: '#fff', fontSize: 16, cursor: 'pointer', padding: 0,
              }}
            >
              {sidebarCollapsed ? '▶' : '◀'}
            </button>
          )}
          <div style={{
            position: 'absolute', bottom: 8, left: 8, right: 8,
```

- [ ] **Step 5: Typecheck + lint**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm --config.verify-deps-before-run=false --filter @iptv-player/desktop typecheck
pnpm --config.verify-deps-before-run=false lint
```
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git checkout -- pnpm-workspace.yaml 2>/dev/null || true
git add packages/desktop/src/epg/EpgPage.tsx
git commit -m "feat(desktop): collapsible sidebar — full-width player via top-left toggle"
```

---

### Task 2: Verification + CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Full verification**

```bash
export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME/bin:$PATH"
pnpm --config.verify-deps-before-run=false typecheck
pnpm --config.verify-deps-before-run=false --filter @iptv-player/tv typecheck
pnpm --config.verify-deps-before-run=false --filter @iptv-player/desktop typecheck
pnpm --config.verify-deps-before-run=false lint
pnpm --config.verify-deps-before-run=false test 2>&1 | tail -3
```
Expected: all exit 0; tests still `107 passed` (core unaffected).

- [ ] **Step 2: Manual behaviour checklist (record in the commit/PR; do not block on a GUI you can't launch)**

With `pnpm --config.verify-deps-before-run=false --filter @iptv-player/desktop dev`, a source loaded, a channel playing:
- Clicking the top-left `◀` button hides the sidebar; the player and EPG grid expand to the full window width; the glyph becomes `▶`.
- Clicking `▶` restores the sidebar.
- Entering fullscreen hides the toggle button; exiting fullscreen restores it.
- The fullscreen button and volume slider still work.

If no GUI is available, state the checklist is deferred to a human and that typecheck/lint/tests are green.

- [ ] **Step 3: Update CLAUDE.md**

In `CLAUDE.md`, in the Phase progress table, add this row immediately after the `| 11 — Fullscreen mode |` row:

```markdown
| 12 — Collapsible sidebar | ✅ complete | Desktop: ephemeral `sidebarCollapsed` state in EpgPage + a top-left ◀/▶ toggle button (mirrors the fullscreen button, hidden while fullscreen) that hides the channel sidebar so the player + EPG grid span the full window width. No core changes — typechecks + lint clean, 107 tests. |
```

- [ ] **Step 4: Commit**

```bash
git checkout -- pnpm-workspace.yaml 2>/dev/null || true
git add CLAUDE.md
git commit -m "docs: CLAUDE.md — collapsible sidebar row"
```

---

## Self-Review

**Spec coverage:**
- §2 add `sidebarCollapsed` state → Task 1 Step 1. ✅
- §2 wrap the entire sidebar ternary in `{!sidebarCollapsed && (…)}` → Task 1 Steps 2–3 (open `(` + matching `))}`). ✅
- §2 right column already `flex: 1` so it widens automatically → no code needed; verified by the manual check. ✅
- §2 toggle button top-left, mirrors fullscreen button, `stopPropagation` + `setSidebarCollapsed(c => !c)`, `▶`/`◀` glyph + Show/Hide labels, rendered only when `!isFullscreen` → Task 1 Step 4. ✅
- §1/§3 desktop-only, ephemeral, no core changes, no keyboard shortcut, no animation → nothing added beyond the above. ✅
- §4 testing = typecheck + lint + manual → Task 1 Step 5, Task 2. ✅

**Placeholder scan:** none — every step shows exact code and exact anchors; commands have expected output.

**Type consistency:** `sidebarCollapsed` / `setSidebarCollapsed` from `useState(false)` are used identically in the gate (Step 2) and the button (Step 4). `isFullscreen` is the existing value from `useFullscreen` (Task 1 relies on it already being in scope, which it is post-fullscreen-feature). `setSidebarCollapsed(c => !c)` uses the functional updater form — consistent single use site.
