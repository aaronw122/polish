<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { CONTROL_SCHEMA, SPACING_PROPS, LAYOUT_PROPS } from './lib/schema.js';
  import {
    parseNumericValue, clampValue, cssToCamel,
    computePanelPosition, DEBOUNCE_MS,
  } from './lib/utils.js';
  import { detectFormat } from './lib/color.js';
  import { send } from './lib/socket.js';
  import { sourceData, uniformMode } from './stores/state.js';
  import ColorControl from './controls/ColorControl.svelte';
  import SliderControl from './controls/SliderControl.svelte';
  import SelectControl from './controls/SelectControl.svelte';
  import BoxModel from './controls/BoxModel.svelte';
  import LayoutControl from './controls/LayoutControl.svelte';

  export let element = null;

  const dispatch = createEventDispatcher();

  // ── Panel state ─────────────────────────────────────────────────
  let panelEl;
  let panelLeft = 0;
  let panelTop = 0;
  let dragState = null;
  let initializedElement = null;
  let positionedElement = null;
  let collapsedSections = {};
  let debounceTimers = {};
  let previewedProperties = new Set();

  // ── Control values (keyed by CSS property) ──────────────────────
  let controlValues = {};
  let colorFormats = {};
  let spacingValues = {};
  let normalControlValues = {};
  let normalSpacingValues = {};
  let layoutValues = {};
  let normalLayoutValues = {};
  let layoutDisplayValue = 'block';
  let shorthandProps = new Set();
  let pseudoClasses = new Set();
  let primaryMediaQuery = null;
  let activeState = 'normal'; // 'normal', 'hover', 'focus', 'active'
  let availableStates = []; // pseudo states that have CSS rules

  // ── Font-family special handling ────────────────────────────────
  // Track extra font options that were added dynamically for fonts
  // not in the web-safe list.
  let extraFontOptions = {};

  // ── Reactivity: init panel when element changes ─────────────────
  // Edits to the same selection should not re-anchor the panel.
  $: if (!element) {
    initializedElement = null;
    positionedElement = null;
  }

  $: if (element && element !== initializedElement) {
    initializedElement = element;
    activeState = 'normal';
    initFromElement(element);
    positionNearElement(element);
    positionedElement = element;
  }

  // ── Reactivity: update from source data ─────────────────────────
  $: if ($sourceData && element) {
    updateFromSource($sourceData);
  }

  // ── Reactivity: switch control values when activeState changes ──
  $: {
    if (activeState === 'normal') {
      controlValues = { ...normalControlValues };
      spacingValues = { ...normalSpacingValues };
      layoutValues = { ...normalLayoutValues };
    } else {
      const src = $sourceData;
      const pseudoState = src && src.pseudoStates && src.pseudoStates[activeState];
      if (pseudoState && pseudoState.properties) {
        // Start from normal values, overlay the pseudo-state's properties
        controlValues = { ...normalControlValues, ...pseudoState.properties };

        // Overlay layout props from pseudo-state
        const pseudoLayout = {};
        LAYOUT_PROPS.forEach(prop => {
          if (prop in pseudoState.properties) {
            pseudoLayout[prop] = pseudoState.properties[prop];
          }
        });
        layoutValues = { ...normalLayoutValues, ...pseudoLayout };
      }
    }
  }

  // ── Initialize control values from computed styles ──────────────
  function initFromElement(el) {
    // Clear any lingering inline previews from previous element
    for (const prop of previewedProperties) {
      if (element) element.style.removeProperty(prop);
    }
    previewedProperties.clear();

    const computed = window.getComputedStyle(el);
    const vals = {};

    for (const sectionDef of CONTROL_SCHEMA) {
      for (const def of sectionDef.controls) {
        const prop = def.property;
        if (def.type === 'select' && prop === 'font-family') {
          const raw = computed.fontFamily;
          const currentFont = raw.split(',')[0].trim().replace(/['"]/g, '');
          vals[prop] = currentFont;

          // Check if current font is in the schema options
          const hasFont = def.options.some(o => o.value === currentFont);
          if (!hasFont) {
            extraFontOptions[prop] = [{ value: currentFont, label: currentFont + ' (current)' }];
          } else {
            extraFontOptions[prop] = [];
          }
        } else {
          vals[prop] = computed.getPropertyValue(prop);
        }
      }
    }
    controlValues = vals;
    normalControlValues = { ...vals };

    // Computed styles are always in RGB — set initial format for color properties
    const cf = {};
    for (const sectionDef of CONTROL_SCHEMA) {
      for (const def of sectionDef.controls) {
        if (def.type === 'color') {
          cf[def.property] = 'rgb';
        }
      }
    }
    colorFormats = cf;

    // Spacing
    const sv = {};
    SPACING_PROPS.forEach(prop => {
      const val = parseNumericValue(computed.getPropertyValue(prop));
      sv[prop] = String(Math.round(val.num));
    });
    spacingValues = sv;
    normalSpacingValues = { ...sv };

    // Layout
    const lv = {};
    LAYOUT_PROPS.forEach(prop => {
      lv[prop] = computed.getPropertyValue(prop);
    });
    layoutValues = lv;
    normalLayoutValues = { ...lv };
    layoutDisplayValue = computed.display;

  }

  // ── Update panel from authored source data ──────────────────────
  function updateFromSource(src) {
    if (src.properties) {
      for (const [prop, val] of Object.entries(src.properties)) {
        const def = findControlDef(prop);
        if (!def) continue;
        if (def.type === 'slider') {
          const parsed = parseNumericValue(val);
          if (parsed.num > 0 || prop !== 'font-size') {
            controlValues[prop] = val;
            normalControlValues[prop] = val;
          }
        } else {
          // color, select, text — always sync from source
          controlValues[prop] = val;
          normalControlValues[prop] = val;

          // Detect authored color format from source data
          if (def.type === 'color') {
            const fmt = detectFormat(val);
            if (fmt) colorFormats[def.property] = fmt;
          }
        }
      }
      controlValues = controlValues; // trigger reactivity
      normalControlValues = normalControlValues;
      colorFormats = colorFormats; // trigger reactivity
    }

    // Layout props (not in CONTROL_SCHEMA, need their own sync loop)
    if (src.properties) {
      for (const prop of LAYOUT_PROPS) {
        if (prop in src.properties) {
          layoutValues[prop] = src.properties[prop];
          normalLayoutValues[prop] = src.properties[prop];
        }
      }
      if ('display' in src.properties) {
        layoutDisplayValue = src.properties['display'];
      }
      layoutValues = layoutValues; // trigger reactivity
      normalLayoutValues = normalLayoutValues;
    }

    // Shorthand badges
    const sp = new Set();
    const rules = src.matchedRules || [];
    for (const rule of rules) {
      const props = rule.properties || {};
      if (props['padding']) sp.add('padding');
      if (props['margin']) sp.add('margin');
    }
    shorthandProps = sp;

    // Pseudo-class states from resolver
    const states = src.pseudoStates || {};
    availableStates = Object.keys(states);
    pseudoClasses = new Set(availableStates);

    // If we switched to a state that no longer exists, reset to normal
    if (activeState !== 'normal' && !availableStates.includes(activeState)) {
      activeState = 'normal';
    }

    // Media query warning: check if the primary matched rule is inside @media
    const primary = rules.length > 0 ? rules[rules.length - 1] : null;
    primaryMediaQuery = (primary && primary.mediaQuery) ? primary.mediaQuery : null;
  }

  function findControlDef(property) {
    for (const s of CONTROL_SCHEMA) {
      for (const c of s.controls) {
        if (c.property === property) return c;
      }
    }
    return null;
  }

  // ── Panel positioning ───────────────────────────────────────────
  function positionNearElement(el) {
    const rect = el.getBoundingClientRect();
    const panelHeight = (panelEl && panelEl.offsetHeight) || 400;
    const pos = computePanelPosition(rect, window.innerWidth, window.innerHeight, panelHeight);
    panelLeft = pos.left;
    panelTop = pos.top;
  }

  export function reposition() {
    if (!element || element === positionedElement) return;
    positionNearElement(element);
    positionedElement = element;
  }

  // ── Live preview + messaging ────────────────────────────────────
  function applyLivePreview(property, value) {
    if (!element) return;
    // Skip inline preview for pseudo-states — inline styles can't target
    // :hover/:focus/:active and would override the normal state instead.
    if (activeState !== 'normal') return;
    element.style[cssToCamel(property)] = value;
    previewedProperties.add(property);
  }

  /**
   * Clear inline previews whose CSS value now matches what we set.
   * Called by App after a stylesheet reloads. If the CSS write hasn't
   * landed yet (race with writer/watcher debounce), the inline preview
   * stays so the element doesn't flash to the old value.
   */
  export function clearPreviews() {
    if (!element) { previewedProperties.clear(); return; }
    const computed = window.getComputedStyle(element);
    for (const prop of previewedProperties) {
      const inlineVal = element.style.getPropertyValue(prop);
      if (!inlineVal) { previewedProperties.delete(prop); continue; }

      // Read computed value WITH inline style applied
      const withInline = computed.getPropertyValue(prop);

      // Remove inline and re-read — now we see CSS-only value
      element.style.removeProperty(prop);
      const withoutInline = computed.getPropertyValue(prop);

      // Both are computed (rgb format), so string comparison works.
      // If equal, CSS has caught up — leave inline removed.
      // If different, CSS hasn't reloaded yet — re-apply preview.
      if (withInline !== withoutInline) {
        element.style.setProperty(prop, inlineVal);
      } else {
        previewedProperties.delete(prop);
      }
    }
  }

  function debounceSendChange(property, value) {
    if (debounceTimers[property]) {
      clearTimeout(debounceTimers[property]);
    }
    debounceTimers[property] = setTimeout(() => {
      delete debounceTimers[property];
      sendChangeMessage(property, value);
    }, DEBOUNCE_MS);
  }

  function sendChangeImmediate(property, value) {
    if (debounceTimers[property]) {
      clearTimeout(debounceTimers[property]);
      delete debounceTimers[property];
    }
    sendChangeMessage(property, value);
  }

  function sendChangeMessage(property, value) {
    const src = $sourceData;
    if (!src || !src.selector) return;

    // Inline preview is kept alive until CSS actually reloads —
    // App.svelte calls clearPreviews() after the stylesheet swaps.

    // If editing a pseudo state (:hover, :focus, :active), route to that rule
    if (activeState !== 'normal') {
      const pseudoState = (src.pseudoStates || {})[activeState];
      if (pseudoState) {
        send({
          type: 'change',
          file: pseudoState.file,
          selector: pseudoState.selector,
          property: property,
          value: value,
          line: pseudoState.line || undefined,
          styleType: 'css',
        });
        return;
      }
      // No existing rule for this state — create one by appending pseudo-class
      // to the base selector (e.g., `.btn-primary` → `.btn-primary:hover`)
      const baseSelector = src.selector.replace(/:[a-z-]+/g, ''); // strip any pseudo
      send({
        type: 'change',
        file: src.file,
        selector: baseSelector + ':' + activeState,
        property: property,
        value: value,
        styleType: 'css',
      });
      return;
    }

    // When the primary match is inline but the property exists in a CSS rule,
    // route the change to the CSS rule instead of the inline style.
    const cssRule = src.cssRule;
    if (src.styleType === 'inline' && cssRule && cssRule.properties && property in cssRule.properties) {
      send({
        type: 'change',
        file: cssRule.file,
        selector: cssRule.selector,
        property: property,
        value: value,
        line: cssRule.line || undefined,
        styleType: 'css',
      });
      return;
    }

    send({
      type: 'change',
      file: src.file,
      selector: src.selector,
      property: property,
      value: value,
      line: src.line || undefined,
      styleType: src.styleType || undefined,
    });
  }

  // ── Control event handlers ──────────────────────────────────────
  function onControlInput(e) {
    const { property, value } = e.detail;
    controlValues[property] = value;

    applyLivePreview(property, value);
    debounceSendChange(property, value);

    // Preview border visibility when picking border-color
    if (property === 'border-color' && value !== 'transparent' && element) {
      const computed = window.getComputedStyle(element);
      if (computed.borderTopStyle === 'none') applyLivePreview('border-style', 'solid');
      if (parseFloat(computed.borderTopWidth) === 0) applyLivePreview('border-width', '1px');
    }
  }

  function onControlChange(e) {
    const { property, value } = e.detail;
    controlValues[property] = value;

    applyLivePreview(property, value);
    sendChangeImmediate(property, value);

    // Auto-set border-style/width when adding a border color to an element with no border
    if (property === 'border-color' && value !== 'transparent' && element) {
      const computed = window.getComputedStyle(element);
      const needsStyle = computed.borderTopStyle === 'none';
      const needsWidth = parseFloat(computed.borderTopWidth) === 0;
      if (needsStyle) {
        applyLivePreview('border-style', 'solid');
        sendChangeImmediate('border-style', 'solid');
      }
      if (needsWidth) {
        applyLivePreview('border-width', '1px');
        sendChangeImmediate('border-width', '1px');
      }
    }
  }

  function onSpacingInput(e) {
    const { property, value } = e.detail;
    spacingValues[property] = e.detail.raw || value.replace(/px$/, '');

    applyLivePreview(property, value);
    debounceSendChange(property, value);
  }

  function onSpacingChange(e) {
    const { property, value } = e.detail;

    applyLivePreview(property, value);
    sendChangeImmediate(property, value);
  }

  function onLayoutInput(e) {
    const { property, value } = e.detail;
    layoutValues[property] = value;

    applyLivePreview(property, value);
    debounceSendChange(property, value);
  }

  function onLayoutChange(e) {
    const { property, value } = e.detail;
    layoutValues[property] = value;

    applyLivePreview(property, value);
    sendChangeImmediate(property, value);
    ensureFlexDisplay();
  }

  function ensureFlexDisplay() {
    if (layoutDisplayValue !== 'flex' && layoutDisplayValue !== 'inline-flex') {
      layoutDisplayValue = 'flex';
      applyLivePreview('display', 'flex');
      sendChangeImmediate('display', 'flex');
    }
  }

  // ── Section collapse ────────────────────────────────────────────
  function toggleSection(id) {
    collapsedSections[id] = !collapsedSections[id];
    collapsedSections = collapsedSections;
  }

  // ── Drag handling ───────────────────────────────────────────────
  function onHeaderMousedown(e) {
    if (e.target.closest('.polish-panel-close')) return;
    e.preventDefault();
    dragState = {
      startX: e.clientX,
      startY: e.clientY,
      startLeft: panelLeft,
      startTop: panelTop,
    };
    // Add listeners on window to track drag across the whole page
    window.addEventListener('mousemove', onDrag, true);
    window.addEventListener('mouseup', onDragEnd, true);
  }

  function onDrag(e) {
    if (!dragState) return;
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    let newLeft = dragState.startLeft + dx;
    let newTop = dragState.startTop + dy;

    const pw = (panelEl && panelEl.offsetWidth) || 280;
    newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - pw));
    newTop = Math.max(0, Math.min(newTop, window.innerHeight - 40));

    panelLeft = newLeft;
    panelTop = newTop;
  }

  function onDragEnd() {
    dragState = null;
    window.removeEventListener('mousemove', onDrag, true);
    window.removeEventListener('mouseup', onDragEnd, true);
  }

  // ── Lock toggle ─────────────────────────────────────────────────
  function toggleLock() {
    $uniformMode = !$uniformMode;
  }

  // ── Close ───────────────────────────────────────────────────────
  function onClose(e) {
    e.stopPropagation();
    // Clear debounce timers
    Object.keys(debounceTimers).forEach(key => {
      clearTimeout(debounceTimers[key]);
    });
    debounceTimers = {};
    // Clear inline previews on close
    for (const prop of previewedProperties) {
      if (element) element.style.removeProperty(prop);
    }
    previewedProperties.clear();
    dispatch('close');
  }

  // Stop event propagation from the panel to avoid triggering overlay click handlers
  function onPanelMousedown(e) {
    e.stopPropagation();
  }
  function onPanelClick(e) {
    e.stopPropagation();
  }

  // ── Get options for a select control (with extra font options) ──
  function getOptions(def) {
    if (def.property === 'font-family' && extraFontOptions[def.property]) {
      return [...extraFontOptions[def.property], ...def.options];
    }
    return def.options;
  }

  // Build panel sections: schema-driven controls plus custom sections (Spacing, Layout)
  function getPanelSections() {
    const result = [];
    for (const s of CONTROL_SCHEMA) {
      result.push(s);
      if (s.id === 'size') {
        result.push({ section: 'Spacing', id: 'spacing', controls: null });
        result.push({ section: 'Layout', id: 'layout', controls: null });
      }
    }
    return result;
  }

  $: sections = getPanelSections();
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  class="polish-panel"
  bind:this={panelEl}
  style="left: {panelLeft}px; top: {panelTop}px; pointer-events: auto;"
  on:mousedown={onPanelMousedown}
  on:click={onPanelClick}
>
  <!-- Header -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="polish-panel-header" on:mousedown={onHeaderMousedown}>
    <span class="polish-panel-title">Properties</span>
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <span class="polish-panel-close" on:click={onClose}>&times;</span>
  </div>

  <!-- State toggle: Normal / :hover / :focus / :active -->
  {#if pseudoClasses.size > 0}
    <div class="polish-state-toggle">
      <button
        class="polish-state-btn"
        class:active={activeState === 'normal'}
        on:click={() => activeState = 'normal'}
      >Normal</button>
      {#each [...pseudoClasses] as pc}
        <button
          class="polish-state-btn"
          class:active={activeState === pc}
          on:click={() => activeState = pc}
        >:{pc}</button>
      {/each}
    </div>
  {/if}

  <!-- Ambiguity warning -->
  {#if $sourceData && $sourceData.ambiguous}
    <div class="polish-ambiguity-warning">
      Multiple CSS rules match — edits may target the wrong rule
    </div>
  {/if}

  <!-- Media query warning -->
  {#if primaryMediaQuery}
    <div class="polish-media-warning">
      Editing rule inside <code>@media {primaryMediaQuery}</code>
    </div>
  {/if}

  <!-- Body -->
  <div class="polish-panel-body">
    {#each sections as sectionDef}
      <div class="polish-section" class:collapsed={collapsedSections[sectionDef.id]}>
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div class="polish-section-header" on:click={() => toggleSection(sectionDef.id)}>
          <span class="polish-section-arrow">&#9654;</span> {sectionDef.section}
        </div>
        <div class="polish-section-content">
          {#if sectionDef.id === 'spacing'}
            <!-- Spacing section: box model + lock + shorthand badges -->
            <div class="polish-spacing-container">
              <BoxModel
                values={spacingValues}
                uniformMode={$uniformMode}
                on:input={onSpacingInput}
                on:change={onSpacingChange}
              />
              <div class="polish-lock-row">
                <button
                  class="polish-lock-btn"
                  class:locked={$uniformMode}
                  title="Toggle uniform spacing"
                  on:click={toggleLock}
                >{$uniformMode ? '\uD83D\uDD12' : '\uD83D\uDD13'}</button>
                <span class="polish-lock-label">Uniform</span>
              </div>
              {#if shorthandProps.size > 0}
                <div class="polish-shorthand-badges">
                  {#each [...shorthandProps] as prop}
                    <span class="polish-shorthand-badge" title="This value was expanded from a shorthand declaration">
                      {prop} (shorthand)
                    </span>
                  {/each}
                </div>
              {/if}
            </div>
          {:else if sectionDef.id === 'layout'}
            <LayoutControl
              values={layoutValues}
              on:input={onLayoutInput}
              on:change={onLayoutChange}
            />
          {:else if sectionDef.controls}
            {#each sectionDef.controls as def}
              {#if def.type === 'color'}
                <ColorControl
                  property={def.property}
                  value={controlValues[def.property] || ''}
                  format={colorFormats[def.property] || 'hex'}
                  label={def.label}
                  on:input={onControlInput}
                  on:change={onControlChange}
                />
              {:else if def.type === 'slider'}
                <SliderControl
                  property={def.property}
                  value={controlValues[def.property] || ''}
                  label={def.label}
                  min={def.min}
                  max={def.max}
                  step={def.step}
                  units={def.units}
                  on:input={onControlInput}
                  on:change={onControlChange}
                />
              {:else if def.type === 'select'}
                <SelectControl
                  property={def.property}
                  value={controlValues[def.property] || ''}
                  label={def.label}
                  options={getOptions(def)}
                  on:change={onControlChange}
                />
              {/if}
            {/each}
          {/if}
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .polish-panel {
    position: fixed;
    width: 280px;
    max-height: 80vh;
    background: rgba(30, 30, 30, 0.95);
    color: #e0e0e0;
    font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace;
    font-size: 11px;
    line-height: 1.4;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    z-index: 10;
    overflow: hidden;
    backdrop-filter: blur(12px);
  }
  .polish-panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 10px;
    background: rgba(255, 255, 255, 0.05);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    cursor: grab;
    user-select: none;
  }
  .polish-panel-header:active {
    cursor: grabbing;
  }
  .polish-panel-title {
    font-weight: 600;
    color: #fff;
    font-size: 11px;
  }
  .polish-panel-close {
    cursor: pointer;
    color: #888;
    font-size: 16px;
    line-height: 1;
    padding: 0 2px;
    transition: color 0.1s;
  }
  .polish-panel-close:hover {
    color: #fff;
  }
  .polish-panel-body {
    overflow-y: auto;
    max-height: calc(80vh - 36px);
    scrollbar-width: thin;
    scrollbar-color: rgba(255,255,255,0.15) transparent;
  }
  .polish-panel-body::-webkit-scrollbar {
    width: 4px;
  }
  .polish-panel-body::-webkit-scrollbar-track {
    background: transparent;
  }
  .polish-panel-body::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.15);
    border-radius: 2px;
  }

  /* Sections */
  .polish-section {
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }
  .polish-section:last-child {
    border-bottom: none;
  }
  .polish-section-header {
    padding: 6px 10px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #999;
    cursor: pointer;
    user-select: none;
    transition: color 0.1s;
  }
  .polish-section-header:hover {
    color: #ccc;
  }
  .polish-section-arrow {
    display: inline-block;
    font-size: 8px;
    margin-right: 4px;
    transition: transform 0.15s ease;
    transform: rotate(90deg);
  }
  .collapsed .polish-section-arrow {
    transform: rotate(0deg);
  }
  .polish-section-content {
    padding: 4px 10px 8px;
  }
  .collapsed .polish-section-content {
    display: none;
  }

  /* Spacing container */
  .polish-spacing-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }

  /* Lock */
  .polish-lock-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .polish-lock-btn {
    background: none;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 3px;
    color: #888;
    cursor: pointer;
    font-size: 12px;
    padding: 2px 4px;
    transition: color 0.1s, border-color 0.1s;
  }
  .polish-lock-btn:hover {
    color: #ccc;
    border-color: rgba(255, 255, 255, 0.2);
  }
  .polish-lock-btn.locked {
    color: #4A9EFF;
    border-color: rgba(74, 158, 255, 0.3);
  }
  .polish-lock-label {
    font-size: 10px;
    color: #777;
  }

  /* State toggle */
  .polish-state-toggle {
    display: flex;
    gap: 2px;
    padding: 4px 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }
  .polish-state-btn {
    font-size: 10px;
    font-weight: 500;
    font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace;
    padding: 2px 8px;
    border-radius: 3px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: transparent;
    color: #999;
    cursor: pointer;
    pointer-events: auto;
  }
  .polish-state-btn:hover {
    background: rgba(255, 255, 255, 0.05);
    color: #ccc;
  }
  .polish-state-btn.active {
    background: rgba(74, 158, 255, 0.15);
    border-color: rgba(74, 158, 255, 0.3);
    color: #4A9EFF;
    font-weight: 600;
  }

  /* Ambiguity warning */
  .polish-ambiguity-warning {
    padding: 4px 10px;
    font-size: 9px;
    font-weight: 600;
    color: #F59E0B;
    background: rgba(245, 158, 11, 0.1);
    border-bottom: 1px solid rgba(245, 158, 11, 0.2);
  }

  /* Media query warning */
  .polish-media-warning {
    padding: 4px 10px;
    font-size: 9px;
    font-weight: 600;
    color: #fb923c;
    background: rgba(249, 115, 22, 0.1);
    border-bottom: 1px solid rgba(249, 115, 22, 0.2);
  }
  .polish-media-warning code {
    font-family: inherit;
    background: rgba(249, 115, 22, 0.15);
    padding: 0 3px;
    border-radius: 2px;
  }

  /* Shorthand badges */
  .polish-shorthand-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    min-height: 0;
  }
  .polish-shorthand-badge {
    display: inline-block;
    font-size: 9px;
    padding: 1px 5px;
    border-radius: 2px;
    background: rgba(59, 130, 246, 0.12);
    color: #93c5fd;
    border: 1px solid rgba(59, 130, 246, 0.2);
  }
</style>
