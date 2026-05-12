# Svelte 5 Migration Plan

Migrate Polish overlay from Svelte 4 to Svelte 5 (runes). Organized into 5 phases — each produces a buildable checkpoint.

---

## Phase 0: Dependencies & Build Config

**Goal:** Get Svelte 5 installed and building in backward-compat mode before converting any components.

- [x] Update `package.json` devDependencies:
  - `svelte`: `^4.2.19` → `^5.0.0`
  - `@sveltejs/vite-plugin-svelte`: `^3.1.2` → `^5.0.0`
- [x] Update `src/overlay/main.js`: `new App({ target: shadow })` → `mount(App, { target: shadow })`
  - Import `mount` from `svelte`
  - `mount()` returns the component's exports (confirmed in docs: `mount<Props, Exports>(...): Exports`), so `app.init()` works directly
- [x] `bun install` + `bun run build`
- [ ] Verify IIFE bundle loads in browser (badge appears, init runs, WebSocket connects)
- [x] Check bundle size delta (Svelte 5 runtime is slightly larger) — actually decreased: 147→143 KB

**Gate:** Do not proceed until the build works and the overlay loads correctly.

---

## Phase 1: Stores — Keep As-Is

`svelte/store` writable + `$storeName` auto-subscription still works in Svelte 5. No changes needed now.

Convert to runes-based `$state` in a follow-up (would require renaming `state.js` → `state.svelte.js` and updating all imports).

---

## Phase 2: Leaf Control Components

**Goal:** Convert the 7 leaf controls. These have no child Svelte components (except PickrSwatch used by ColorControl/BorderControl).

### Common changes per control

1. `export let prop` → `let { prop, oninput, onchange } = $props()`
2. `createEventDispatcher` + `dispatch('event', detail)` → `oninput?.(detail)` / `onchange?.(detail)`
3. `$: computed = expr` → `let computed = $derived(expr)`
4. `$: { sideEffect }` → `$effect(() => { sideEffect })`
5. Template `on:click={fn}` → `onclick={fn}` (native DOM events)
6. `<script context="module">` → `<script module>`
7. `svelte-ignore` comments: kebab-case → snake_case (e.g., `a11y-no-static-element-interactions` → `a11y_no_static_element_interactions`)

**Important:** Event payload shape changes — parents currently read `e.detail.property`, after migration they receive `{ property, value }` directly (no `.detail` wrapper). All parent handler signatures must update too.

### Parallel batch (no dependencies between these)

- [x] **SelectControl.svelte** — Props + dispatcher only, no `$:` blocks
- [x] **SliderControl.svelte** — Props, dispatcher, convert `$:` block (lines 19-25) to `$derived`/`$effect` for parsed value/unit
- [x] **BoxModel.svelte** — Props + dispatcher, dynamic event name pattern
- [x] **LayoutControl.svelte** — Props, dispatcher, 3 `$derived` conversions (direction, isColumn, gapRem)
- [ ] **ResizeHandles.svelte** — SKIPPED (not on dev branch; migrate after PR #13 merges)
- [x] **PickrSwatch.svelte** — Props, dispatcher, `<script context="module">` → `<script module>`, 2 `$effect` conversions for pickr/transparent sync

### After PickrSwatch completes

- [x] **ColorControl.svelte** — Props, dispatcher, 6 `$:` conversions. Used `$state` + `$effect` for `swatchColor`/`textValue` (imperative writes in handlers)
- [x] **BorderControl.svelte** — Props, dispatcher, 7 `$derived` conversions, `$effect` for `hasBorder`. Updated PickrSwatch usage to callback props

---

## Phase 3: Panel.svelte

**Goal:** Convert the largest component — heaviest consumer of dispatchers, reactive blocks, and exported methods.

- [x] **Props:** `export let element` → `let { element = null, onclose } = $props()`
- [x] **Dispatcher:** Remove `createEventDispatcher`, replace `dispatch('close')` with `onclose?.()`
- [x] **Exported methods** — Keep as `export function`. `bind:this` returns exported bindings in Svelte 5 (confirmed in docs):
  - `reposition()`
  - `previewResize(property, value)`
  - `getCurrentValues(properties)`
  - `persistResize(property, value)`
  - `clearPreviews()`
- [x] **Convert 5 `$:` blocks:**
  1. `$: if (!element)` → `$effect.pre` (reset state — runs before DOM update to avoid stale flash)
  2. `$: if (element && element !== initializedElement)` → `$effect.pre` (init on element change — must run before render)
  3. `$: if ($sourceData && element)` → `$effect` with `untrack()` (update from source). **Critical:** `$effect` tracks dependencies through function calls. `updateFromSource()` reads `borderValues`, `controlValues`, `layoutValues`, etc. — without `untrack()`, the effect re-runs on every state change it causes:
     ```js
     $effect(() => {
         if ($sourceData && element) {
             untrack(() => updateFromSource($sourceData));
         }
     });
     ```
  4. `$: { if (activeState === 'normal') ... }` → `$effect` with `untrack()` for the `$sourceData` read inside `applyPseudoControlState`. Without this, the block re-runs on every `$sourceData` change, not just `activeState` changes:
     ```js
     $effect(() => {
         if (activeState === 'normal') {
             applyNormalControlState();
         } else {
             const pseudoProperties = untrack(() => $sourceData?.pseudoStates?.[activeState]?.properties);
             if (pseudoProperties) applyPseudoControlState(pseudoProperties);
         }
     });
     ```
  5. `$: sections = getPanelSections(element)` → `$derived`
- [x] **Timing note:** Used `$effect.pre` for blocks #1, #2; `$effect` for blocks #3, #4.
- [x] **State variables** that drive rendering → `$state()`. Complete list:
  - `panelLeft`, `panelTop` — style bindings
  - `controlValues`, `spacingValues`, `borderValues`, `layoutValues` — control component props
  - `collapsedSections` — section collapse class binding
  - `shorthandProps`, `pseudoClasses` — template `{#if .size > 0}` guards
  - `activeState` — state toggle button class binding
  - `primaryMediaQuery` — media query warning `{#if}` guard
  - `extraFontOptions` — passed to `getOptions()` in template
  - `layoutDisplayValue` — not in template (no `$state` needed)
  - `dragState`, `initializedElement`, `positionedElement`, `debounceTimers`, `previewedProperties`, `persistedInlineProperties`, `normalControlValues`, `normalSpacingValues`, `normalBorderValues`, `normalLayoutValues`, `_lastSourceData` — script-only (no `$state` needed)
- [x] **Update handler signatures:** `e.detail.property` → `{ property, value }` for all control callbacks
- [x] **Template — native DOM events:** `on:mousedown`, `on:click` → `onmousedown`, `onclick`
- [x] **Template — child component events:** `on:input`/`on:change` → `oninput`/`onchange` callback props
- [x] **`svelte-ignore` comments** (4 instances): updated kebab-case → snake_case

---

## Phase 4: App.svelte

**Goal:** Convert the root component.

- [x] **State:** `hintVisible`, `hintFading` → `$state()` (`selectedRect`/`draggingResize` not present on dev)
- [x] **`export function init()`** — Remains as-is. `mount()` returns exports.
- [x] **Remove unused `onMount` import** — only `onDestroy` is used
- [x] **Event modifiers:** `on:click|stopPropagation` → `onclick` with manual `e.stopPropagation()`
- [x] **Child components:**
  - `<Panel on:close={deselectEl}>` → `<Panel onclose={deselectEl}>`
  - ResizeHandles — SKIPPED (not on dev branch)
- [ ] **Handler signatures** — ResizeHandles handlers (`onInlinePromote`, `onResize`, `onResizeEnd`) — SKIPPED (not on dev branch)
- [x] **Svelte-ignore comments** (2 instances): updated kebab-case → snake_case
- [x] **Store subscriptions:** `$active`, `$selectedElement`, etc. — no changes needed

---

## Phase 5: Test & Verify

- [x] `bun run build` succeeds (143.25 KB, 0 warnings)
- [x] Existing tests pass (`bun test` — 20/20)
- [ ] Manual verification:
  - Overlay loads in shadow DOM, badge appears
  - Cmd+Shift+P toggles overlay
  - Hover highlighting works
  - Click selects element, panel appears
  - Panel is draggable
  - All control sections render (Text, Layout, Position, Border, Colors, Effects)
  - Slider controls update live preview
  - Color picker (Pickr) opens and applies colors
  - Border controls work
  - Box model spacing inputs work
  - Layout flexbox controls work
  - Resize handles work (drag corners/edges)
  - Undo (Cmd+Z) works after resize
  - Tab/Shift+Tab cycles siblings
  - Escape deselects
  - WebSocket reconnects and receives source data
  - CSS reload clears inline previews
  - Pseudo-state toggle (Normal/:hover/:focus/:active) works

---

## Risk Items

1. **`mount()` + `export function init()`** — Low risk. Docs confirm `mount()` returns exports (`mount<Props, Exports>(...): Exports`). No fallback needed.
2. **`bind:this` on Panel** — Low risk. App.svelte calls `panelComponent.clearPreviews()`, `.previewResize()`, etc. Svelte 5 docs confirm `bind:this` returns exported bindings.
3. **IIFE bundle size** — Svelte 5 runtime is larger. Check the delta since this gets injected into every proxied page.
4. **Pickr CSS injection into shadow DOM** — `wrapEl.getRootNode()` pattern in PickrSwatch must still work after `<script context="module">` → `<script module>`.
5. **`$effect` dependency tracking through function calls** — Unlike Svelte 4's `$:` (compile-time static analysis), `$effect` tracks dependencies at runtime through function calls. Any state read inside a called function becomes a dependency. Use `untrack()` to prevent spurious re-runs (see blocks #3 and #4 in Phase 3).
6. **`$effect` vs `$:` timing** — `$:` blocks run synchronously before DOM updates. `$effect` runs after DOM updates. Use `$effect.pre` for init/reset blocks that must execute before the first paint.

---

## Execution Order

```
Phase 0 (deps + build gate)
  │
Phase 1 (stores — no-op)
  │
Phase 2 (leaf controls — parallel batch)
  ├── SelectControl
  ├── SliderControl
  ├── BoxModel
  ├── LayoutControl
  ├── ResizeHandles
  └── PickrSwatch
       ├── ColorControl  (after PickrSwatch)
       └── BorderControl (after PickrSwatch)
  │
Phase 3 (Panel.svelte)
  │
Phase 4 (App.svelte)
  │
Phase 5 (test + verify)
```
