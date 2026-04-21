<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { CONTROL_SCHEMA, SPACING_PROPS } from './lib/schema.js';
  import {
    rgbToHex, parseNumericValue, clampValue, cssToCamel,
    computePanelPosition, DEBOUNCE_MS,
  } from './lib/utils.js';
  import { send } from './lib/socket.js';
  import { sourceData, uniformMode } from './stores/state.js';
  import ColorControl from './controls/ColorControl.svelte';
  import SliderControl from './controls/SliderControl.svelte';
  import SelectControl from './controls/SelectControl.svelte';
  import BoxModel from './controls/BoxModel.svelte';

  export let element = null;

  const dispatch = createEventDispatcher();

  // ── Panel state ─────────────────────────────────────────────────
  let panelEl;
  let panelLeft = 0;
  let panelTop = 0;
  let dragState = null;
  let collapsedSections = {};
  let debounceTimers = {};

  // ── Control values (keyed by CSS property) ──────────────────────
  let controlValues = {};
  let spacingValues = {};
  let shorthandProps = new Set();
  let pseudoClasses = new Set();

  // ── Font-family special handling ────────────────────────────────
  // Track extra font options that were added dynamically for fonts
  // not in the web-safe list.
  let extraFontOptions = {};

  // ── Reactivity: init panel when element changes ─────────────────
  $: if (element) {
    initFromElement(element);
  }

  // ── Reactivity: update from source data ─────────────────────────
  $: if ($sourceData && element) {
    updateFromSource($sourceData);
  }

  // ── Initialize control values from computed styles ──────────────
  function initFromElement(el) {
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

    // Spacing
    const sv = {};
    SPACING_PROPS.forEach(prop => {
      const val = parseNumericValue(computed.getPropertyValue(prop));
      sv[prop] = String(Math.round(val.num));
    });
    spacingValues = sv;

    // Position the panel
    positionNearElement(el);
  }

  // ── Update panel from authored source data ──────────────────────
  function updateFromSource(src) {
    if (src.properties) {
      for (const [prop, val] of Object.entries(src.properties)) {
        // Find the definition in schema
        const def = findControlDef(prop);
        if (def && def.type === 'slider') {
          const parsed = parseNumericValue(val);
          if (parsed.num > 0 || prop !== 'font-size') {
            controlValues[prop] = val;
          }
        }
      }
      controlValues = controlValues; // trigger reactivity
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

    // Pseudo-class badges
    const pc = new Set();
    for (const rule of rules) {
      if (rule.pseudoClasses && rule.pseudoClasses.length > 0) {
        for (const p of rule.pseudoClasses) {
          pc.add(p);
        }
      }
    }
    pseudoClasses = pc;
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
    if (element) positionNearElement(element);
  }

  // ── Live preview + messaging ────────────────────────────────────
  function applyLivePreview(property, value) {
    if (!element) return;
    element.style[cssToCamel(property)] = value;
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
    send({
      type: 'change',
      file: src.file,
      selector: src.selector,
      property: property,
      value: value,
      line: src.line || undefined,
    });
  }

  // ── Control event handlers ──────────────────────────────────────
  function onControlInput(e) {
    const { property, value } = e.detail;
    controlValues[property] = value;
    applyLivePreview(property, value);
    debounceSendChange(property, value);
  }

  function onControlChange(e) {
    const { property, value } = e.detail;
    controlValues[property] = value;
    applyLivePreview(property, value);
    sendChangeImmediate(property, value);
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

  // Build schema sections, inserting Spacing between Size and Effects
  function getSectionsWithSpacing() {
    const result = [];
    for (const s of CONTROL_SCHEMA) {
      result.push(s);
      if (s.id === 'size') {
        result.push({ section: 'Spacing', id: 'spacing', controls: null });
      }
    }
    return result;
  }

  $: sections = getSectionsWithSpacing();
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

  <!-- Pseudo-class badges -->
  {#if pseudoClasses.size > 0}
    <div class="polish-pseudo-badges">
      {#each [...pseudoClasses] as pc}
        <span class="polish-pseudo-badge">Has {pc} styles</span>
      {/each}
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
          {:else if sectionDef.controls}
            {#each sectionDef.controls as def}
              {#if def.type === 'color'}
                <ColorControl
                  property={def.property}
                  value={controlValues[def.property] || ''}
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

  /* Pseudo badges */
  .polish-pseudo-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 4px 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }
  .polish-pseudo-badge {
    display: inline-block;
    font-size: 9px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 3px;
    background: rgba(168, 85, 247, 0.15);
    color: #c084fc;
    border: 1px solid rgba(168, 85, 247, 0.25);
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
