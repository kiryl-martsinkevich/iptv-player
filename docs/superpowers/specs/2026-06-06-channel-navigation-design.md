# Channel Navigation — Design Spec

> **Goal:** Replace the flat channel list with tabbed navigation (Favourites, Categories), persistent search, right-click/long-press context menus, and lazy EPG computation — on both desktop and TV platforms.

**Architecture:** New `ChannelTabs`, `ChannelContextMenu`, and `useFavourites` units wrap the existing `ChannelList`. `AppSettings` gains `favouriteUrls: string[]`. `useEpgData` computes Now/Next lazily (visible tab first, rest via idle callback). Search filters within the active tab.

**Tech Stack:** TypeScript strict, React (RN-Web for desktop, react-native-tvos for TV), localStorage/AsyncStorage for favourites persistence.

---

## 1. AppSettings change (core)

Add `favouriteUrls` to the shared settings type. Favourites persist across app restarts via the existing settings persistence pipeline.

```ts
// packages/core/src/settings/appSettings.ts — add to AppSettings:
favouriteUrls: string[];  // channel URLs marked as favourite
```

`DEFAULT_SETTINGS.favouriteUrls` defaults to `[]`. `mergeSettings` works as-is (shallow merge; arrays replace).

---

## 2. useFavourites hook (both platforms)

Thin wrapper around `useSettings().updateSettings` for toggling favourites.

```ts
// Signature (shared concept, separate per-platform files)
function useFavourites(): {
  favourites: Set<string>;       // derived from settings.favouriteUrls
  isFavourite(url: string): boolean;
  toggle(url: string): void;     // add or remove
}
```

Desktop: synchronous via `useSettings()`. TV: async via `useSettings()` with `loading` guard.

---

## 3. ChannelTabs component (both platforms)

Renders atop the channel panel, above the scrolled channel list.

```
┌──────────────────────────────┐
│  [ 🔍 Search channels...   ] │  ← always visible, filters active tab
│                              │
│  [★ Favourites] [📁 Categories] │  ← Favourites = default tab
│                              │
│  ── channel rows ──────────  │
└──────────────────────────────┘
```

**Search bar:** Text input that updates `searchQuery` state. Debounce not needed (local filter, O(n) string match). Case-insensitive substring match on `m3uChannel.name`.

**Favourites tab (default):** Shows only channels whose URL is in `AppSettings.favouriteUrls`. When empty, shows an inline hint: "No favourites yet. Long-press a channel to add it."

**Categories tab:** Groups channels by `m3uChannel.groupTitle`. Channels with no `groupTitle` go into an "Uncategorized" group. Each group is a collapsible section header + channel rows.

**Group headers in Categories tab:** Simple text headers (e.g., "Sports", "News", "Uncategorized"). Clicking a header collapses/expands the group.

**Channel ordering:** Within each category, channels maintain their M3U order (stable).

---

## 4. ChannelList changes (both platforms)

- Props gain: `onContextMenu: (entry: ChannelEntry, position: {x: number, y: number}) => void`
- `entries` prop is now pre-filtered by the parent — `ChannelList` just renders what it's given
- Desktop: passes `onContextMenu` to each `ChannelRow` for right-click
- TV: passes `onLongPress` to each `ChannelRow`

---

## 5. ChannelRow changes (both platforms)

**Desktop:** Add `onContextMenu` prop. Attach `onContextMenu` handler that calls `e.preventDefault()` and invokes the callback with cursor coordinates.

**TV:** Add `onLongPress` prop. RN `Pressable` supports `onLongPress`. Attach it.

Normal click/press → `onSelect` (play immediately) — unchanged behavior.

---

## 6. ChannelContextMenu component (both platforms)

### Desktop

Custom overlay, positioned at right-click coordinates. Dark theme: `background: #222`, `border: 1px solid #444`, `borderRadius: 8px`, `zIndex: 200`.

```
┌──────────────────────────────┐
│  ▶ Play                      │
│  ☆ Add to Favourites         │  (or ★ Remove from Favourites)
└──────────────────────────────┘
```

- Click outside → close
- Press Escape → close
- Click "Play" → calls `onSelect(entry)`, closes
- Click "☆/★" → calls `toggle(entry.m3uChannel.url)`, closes

### TV

React Native `Modal` with `transparent` background, `animationType="fade"`. Centered overlay with same two actions. TV focus engine handles navigation between the two buttons.

---

## 7. EpgPage / EpgScreen integration (both platforms)

New state variables at the page/screen level:
- `activeTab: 'favourites' | 'categories'`
- `searchQuery: string`
- `contextMenu: { entry: ChannelEntry, x: number, y: number } | null`

Filtering pipeline:
```
allChannels → filter by activeTab → filter by searchQuery → displayChannels
```

Favourites tab: `channels.filter(c => favourites.has(c.m3uChannel.url))`
Categories tab: group by `group-title`, then flatten (or render as sections in ChannelList)

The filtered `displayChannels` array is passed to `ChannelList`.

---

## 8. EPG lazy computation (useEpgData)

Current behavior: ALL channels get Now/Next + programme arrays computed in one shot (in the Worker callback). This blocks rendering of the first channel row until all EPG has been processed.

New behavior after this change:
1. Parse M3U → all `ChannelEntry[]` with **empty** `nowNext` and `programs` (structural entries only)
2. Return immediately — UI renders tabs + channel list without EPG data
3. Compute Now/Next for visible channels first: the first N entries in the filtered list (where N = 20 or however many fit on screen)
4. Enqueue remaining channels' Now/Next via `requestIdleCallback` (desktop) / `InteractionManager.runAfterInteractions` (TV)
5. When tab switches, cancel the idle queue and reprioritize the new tab's channels

Implementation: split `useEpgData` return into phases:
- Phase 1 (immediate): `channels: ChannelEntry[]` with structural data (name, URL, EPG channel ID)
- Phase 2 (deferred): populate `nowNext` and `programs` field-by-field, triggering React re-renders

Since EPG computation is pure CPU work (no additional fetches), the "background loading" is purely about not blocking the UI thread with all-channel Now/Next calculation.

---

## 9. Categories tab — grouping and rendering

Categories are derived from `m3uChannel.groupTitle`. Implementation:

```ts
function groupByCategory(entries: ChannelEntry[]): Map<string, ChannelEntry[]> {
  const map = new Map<string, ChannelEntry[]>();
  for (const e of entries) {
    const cat = e.m3uChannel.groupTitle || 'Uncategorized';
    const list = map.get(cat) || [];
    list.push(e);
    if (!map.has(cat)) map.set(cat, list);
  }
  return map;
}
```

Category groups render as FlatList sections (TV: `SectionList`; Desktop: divs with section headers). Sections are collapsible — collapsed state tracked in a `Set<string>` at the EpgPage/EpgScreen level.

---

## 10. File plan

| Platform | Create | Modify |
|----------|--------|--------|
| core | — | `packages/core/src/settings/appSettings.ts` (add `favouriteUrls`) |
| core | — | `packages/core/src/index.ts` (no change needed, AppSettings already exported) |
| core | — | `packages/core/tests/settings/appSettings.test.ts` (add favourites tests) |
| desktop | `packages/desktop/src/epg/components/ChannelTabs.tsx` | — |
| desktop | `packages/desktop/src/epg/components/ChannelContextMenu.tsx` | — |
| desktop | — | `packages/desktop/src/epg/components/ChannelList.tsx` |
| desktop | — | `packages/desktop/src/epg/components/ChannelRow.tsx` |
| desktop | — | `packages/desktop/src/epg/EpgPage.tsx` |
| desktop | — | `packages/desktop/src/epg/useEpgData.ts` |
| TV | `packages/tv/src/epg/components/ChannelTabs.tsx` | — |
| TV | `packages/tv/src/epg/components/ChannelContextMenu.tsx` | — |
| TV | — | `packages/tv/src/epg/components/ChannelList.tsx` |
| TV | — | `packages/tv/src/epg/components/ChannelRow.tsx` |
| TV | — | `packages/tv/src/epg/EpgScreen.tsx` |
| TV | — | `packages/tv/src/epg/useEpgData.ts` |

No changes to `usePrefetch` — the existing `onFocus` hook already respects prefetch settings; the only change is that the EpgPage passes fewer channels to ChannelList, so less prefetching happens.

---

## 11. Testing strategy

- **Core**: add test for `DEFAULT_SETTINGS.favouriteUrls` default and merge behavior
- **Desktop/TV**: manual testing via `pnpm desktop:dev` / Metro; no Jest infrastructure exists for platform packages yet

---

## 12. Out of scope

- Favourite reordering / drag-and-drop
- Syncing favourites across devices
- Category customisation / user-created categories
- Search by EPG programme title (only channel name in v1)
- Animations on tab switch
