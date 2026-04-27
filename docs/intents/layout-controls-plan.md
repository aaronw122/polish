---
title: "Layout Controls — Implementation Plan"
created: 2026-04-23
spec: layout-controls.md
---

# Layout Controls — Implementation Plan

## Overview

No backend changes needed. The resolver and writer are property-agnostic — they already handle any CSS property, including `flex-direction`, `align-items`, `justify-content`, and `gap`. The writer already has `flex-flow` and `gap` in its shorthand map.

## Files to Create

### 1. `src/overlay/controls/LayoutControl.svelte`

New composite component — the bulk of the work. Follows the same pattern as `BoxModel.svelte` (custom non-schema section, props in, events out).

**Structure:**
- Props: `values` (object keyed by CSS property), `displayValue` (current computed `display`)
- Events: dispatches `input` and `change` with `{ property, value }` detail

**Sub-controls (four labeled rows):**

| Row | Label | Type | CSS Property | Options |
|-----|-------|------|-------------|---------|
| 1 | Direction | 2 icon buttons | `flex-direction` | `row`, `column` |
| 2 | Align | 4 icon buttons | `align-items` | `flex-start`, `center`, `flex-end`, `stretch` |
| 3 | Distribute | 6 icon buttons | `justify-content` | `flex-start`, `center`, `flex-end`, `space-between`, `space-around`, `space-evenly` |
| 4 | Gap | Slider + number input | `gap` | `rem` only, min: 0, max: 10, step: 0.125 |

**Icon behavior:**
- Inline SVGs (no external library)
- Icons rotate 90deg when direction is `column` (cross/main axis flips visually)
- Smooth transition: `transform 0.15s ease`
- Active button highlighted with accent color

**Styling conventions (match existing panel):**
- Labels: `font-size: 10px; color: #888`
- Buttons: dark bg `rgba(255,255,255,0.06)`, border `rgba(255,255,255,0.1)`, active accent `#4A9EFF`
- Slider/input: match `.polish-slider` and `.polish-num-input` from SliderControl

## Files to Modify

### 2. `src/overlay/lib/schema.js`

Add after `SPACING_PROPS` (line 60):

```js
export const LAYOUT_PROPS = [
  'flex-direction', 'align-items', 'justify-content', 'gap',
];
```

No changes to `CONTROL_SCHEMA` — Layout is a custom section like Spacing.

### 3. `src/overlay/Panel.svelte`

Five areas of change:

**(a) Imports** — add `LAYOUT_PROPS` from schema.js and `LayoutControl` component.

**(b) State** — add `layoutValues`, `normalLayoutValues`, `layoutDisplayValue`. Populate in `initFromElement` from computed styles after the existing spacing block.

```js
const lv = {};
LAYOUT_PROPS.forEach(prop => {
  lv[prop] = computed.getPropertyValue(prop);
});
layoutValues = lv;
normalLayoutValues = { ...lv };
layoutDisplayValue = computed.display;
```

**(c) Source sync** — in `updateFromSource`, add a loop for `LAYOUT_PROPS` to sync from `$sourceData.properties` (layout props aren't in CONTROL_SCHEMA so the existing loop skips them).

**(d) Section insertion** — in `getSectionsWithSpacing`, push `{ section: 'Layout', id: 'layout', controls: null }` after Spacing. Section order: Colors, Typography, Size, Spacing, Layout, Effects.

**(e) Template + handlers** — add `{:else if sectionDef.id === 'layout'}` branch rendering `LayoutControl`. Add `onLayoutInput`/`onLayoutChange` handlers with auto-flex logic:

```js
function onLayoutChange(e) {
  const { property, value } = e.detail;
  layoutValues[property] = value;
  applyLivePreview(property, value);
  sendChangeImmediate(property, value);

  // Auto-set display:flex if not already flex
  if (layoutDisplayValue !== 'flex' && layoutDisplayValue !== 'inline-flex') {
    layoutDisplayValue = 'flex';
    applyLivePreview('display', 'flex');
    sendChangeImmediate('display', 'flex');
  }
}
```

## What Does NOT Change

- `resolver.js` — property-agnostic, returns all matched CSS properties
- `writer.js` — property-agnostic, already has `flex-flow` and `gap` in SHORTHAND_MAP
- `server.js` — property-agnostic message routing
- `App.svelte` — generic element/panel flow
- `stores/state.js` — no new stores needed
- `utils.js` — `parseNumericValue` already handles `rem`
- `css-utils.js` — no changes
- `socket.js` — no changes

## Edge Cases

1. **Gap = `normal`**: Non-flex elements compute `gap` as `normal`. Default to `0` in the slider, treat unit as `rem`.
2. **Source data sync**: Layout props aren't schema-driven, so `updateFromSource` needs a dedicated loop to avoid stale values after resolver responds.
3. **Pseudo-state switching**: Reset `layoutValues` to `normalLayoutValues` when switching back to normal state (same pattern as spacing/control values).
4. **Display value refresh**: After auto-setting `display: flex`, update `layoutDisplayValue` so subsequent changes don't re-send it.

## Task Order

1. `schema.js` — add `LAYOUT_PROPS` (no dependencies)
2. `LayoutControl.svelte` — create component (can parallel with step 1)
3. `Panel.svelte` — wire together (depends on 1 + 2)
