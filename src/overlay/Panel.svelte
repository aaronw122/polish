<script>
  import { untrack } from 'svelte';
  import { CONTROL_SCHEMA, SPACING_PROPS, BORDER_PROPS, LAYOUT_PROPS, SIZE_CONTROLS, isTextElement, computeCollapsedSections } from './lib/schema.js';
  import {
    parseNumericValue, cssToCamel,
    computePanelPosition, DEBOUNCE_MS,
  } from './lib/utils.js';
  import { send } from './lib/socket.js';
  import { sourceData, uniformMode } from './stores/state.js';
  import ColorControl from './controls/ColorControl.svelte';
  import SliderControl from './controls/SliderControl.svelte';
  import SelectControl from './controls/SelectControl.svelte';
  import BoxModel from './controls/BoxModel.svelte';
  import BorderControl from './controls/BorderControl.svelte';
  import LayoutControl from './controls/LayoutControl.svelte';

  let { element = null, onclose } = $props();

  // ── Panel state ─────────────────────────────────────────────────
  let panelEl;
  let panelLeft = $state(0);
  let panelTop = $state(0);
  let dragState = null;
  let initializedElement = null;
  let positionedElement = null;
  let collapsedSections = $state({});
  let debounceTimers = {};
  let previewedProperties = new Set();

  // ── Control values (keyed by CSS property) ──────────────────────
  let controlValues = $state({});
  let spacingValues = $state({});
  let normalControlValues = {};
  let normalSpacingValues = {};
  let borderValues = $state({});
  let normalBorderValues = {};
  let layoutValues = $state({});
  let normalLayoutValues = {};
  let layoutDisplayValue = 'block';
  let shorthandProps = $state(new Set());
  let pseudoClasses = $state(new Set());
  let primaryMediaQuery = $state(null);
  let activeState = $state('normal'); // 'normal', 'hover', 'focus', 'active'
  let availableStates = $state([]); // pseudo states that have CSS rules

  // ── Font-family special handling ────────────────────────────────
  // Track extra font options that were added dynamically for fonts
  // not in the web-safe list.
  let extraFontOptions = $state({});

  // ── Reactivity: init panel when element changes ─────────────────
  // Edits to the same selection should not re-anchor the panel.
  $effect.pre(() => {
    if (!element) {
      initializedElement = null;
      positionedElement = null;
    }
  });

  $effect.pre(() => {
    if (element && element !== initializedElement) {
      initializedElement = element;
      activeState = 'normal';
      collapsedSections = {};
      initFromElement(element);
      positionNearElement(element);
      positionedElement = element;
    }
  });

  // ── Reactivity: update from source data ─────────────────────────
  // Guard: only call updateFromSource when $sourceData actually changes,
  // not on every reactive re-run (which can be triggered by borderValues
  // or other variables referenced inside updateFromSource).
  let _lastSourceData = null;
  $effect(() => {
    if ($sourceData && element) {
      if ($sourceData !== _lastSourceData) {
        _lastSourceData = $sourceData;
        untrack(() => updateFromSource($sourceData));
      }
    }
  });

  // ── Helpers: pseudo-state control switching ─────────────────────
  function pickProperties(sourceProperties = {}, propertyNames) {
    const picked = {};
    for (const property of propertyNames) {
      if (property in sourceProperties) picked[property] = sourceProperties[property];
    }
    return picked;
  }

  function applyNormalControlState() {
    controlValues = { ...normalControlValues };
    spacingValues = { ...normalSpacingValues };
    borderValues = { ...normalBorderValues };
    layoutValues = { ...normalLayoutValues };
  }

  function applyPseudoControlState(pseudoProperties) {
    controlValues = { ...normalControlValues, ...pseudoProperties };
    borderValues = {
      ...normalBorderValues,
      ...pickProperties(pseudoProperties, BORDER_PROPS),
    };
    layoutValues = {
      ...normalLayoutValues,
      ...pickProperties(pseudoProperties, LAYOUT_PROPS),
    };
  }

  // ── Reactivity: switch control values when activeState changes ──
  $effect(() => {
    if (activeState === 'normal') {
      untrack(() => applyNormalControlState());
    } else {
      const pseudoProperties = untrack(() => $sourceData?.pseudoStates?.[activeState]?.properties);
      if (pseudoProperties) untrack(() => applyPseudoControlState(pseudoProperties));
    }
  });

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
    // Size controls (width/height) — now in Layout section but use controlValues
    for (const def of SIZE_CONTROLS) {
      vals[def.property] = computed.getPropertyValue(def.property);
    }

    controlValues = vals;
    normalControlValues = { ...vals };

    // Spacing
    const sv = {};
    SPACING_PROPS.forEach(prop => {
      const val = parseNumericValue(computed.getPropertyValue(prop));
      sv[prop] = String(Math.round(val.num));
    });
    spacingValues = sv;
    normalSpacingValues = { ...sv };

    // Border
    const bv = {};
    BORDER_PROPS.forEach(prop => {
      bv[prop] = computed.getPropertyValue(prop);
    });
    borderValues = bv;
    normalBorderValues = { ...bv };

    // Layout
    const lv = {};
    LAYOUT_PROPS.forEach(prop => {
      lv[prop] = computed.getPropertyValue(prop);
    });
    layoutValues = lv;
    normalLayoutValues = { ...lv };
    layoutDisplayValue = computed.display;

  }

  // All possible section ids for collapse computation
  const ALL_SECTION_IDS = ['text', 'layout', 'spacing', 'border', 'colors', 'effects'];

  // ── Update panel from authored source data ──────────────────────
  function updateFromSource(src) {
    // Auto-collapse sections without authored CSS — but never re-collapse
    // a section the user has already opened
    const autoCollapsed = computeCollapsedSections(src.properties, ALL_SECTION_IDS);
    for (const id of ALL_SECTION_IDS) {
      if (autoCollapsed[id]) {
        // Only collapse if not currently expanded (don't override user toggle)
        if (collapsedSections[id] === undefined) collapsedSections[id] = true;
      } else {
        // Section has authored values — expand it
        collapsedSections[id] = false;
      }
    }
    collapsedSections = collapsedSections;
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
        }
      }
      controlValues = controlValues; // trigger reactivity
      normalControlValues = normalControlValues;
    }

    // Border props
    if (src.properties) {
      for (const prop of BORDER_PROPS) {
        if (prop in src.properties) {
          borderValues[prop] = src.properties[prop];
          normalBorderValues[prop] = src.properties[prop];
        }
      }
      borderValues = borderValues;
      normalBorderValues = normalBorderValues;
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
    // Also check SIZE_CONTROLS (width/height in Layout section)
    for (const c of SIZE_CONTROLS) {
      if (c.property === property) return c;
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

  function clearDebounceTimer(property) {
    if (!debounceTimers[property]) return;
    clearTimeout(debounceTimers[property]);
    delete debounceTimers[property];
  }

  function queueChange(property, value) {
    clearDebounceTimer(property);
    debounceTimers[property] = setTimeout(() => {
      delete debounceTimers[property];
      sendChangeMessage(property, value);
    }, DEBOUNCE_MS);
  }

  function commitChange(property, value) {
    clearDebounceTimer(property);
    sendChangeMessage(property, value);
  }

  function getChangeTarget(src, property) {
    if (activeState !== 'normal') {
      const pseudoState = (src.pseudoStates || {})[activeState];
      if (pseudoState) {
        return { file: pseudoState.file, selector: pseudoState.selector, line: pseudoState.line || undefined, styleType: 'css' };
      }
      const baseSelector = src.selector.replace(/:[a-z-]+/g, '');
      return { file: src.file, selector: baseSelector + ':' + activeState, styleType: 'css' };
    }

    const cssRule = src.cssRule;
    if (src.styleType === 'inline' && cssRule?.properties && property in cssRule.properties) {
      return { file: cssRule.file, selector: cssRule.selector, line: cssRule.line || undefined, styleType: 'css' };
    }

    return { file: src.file, selector: src.selector, line: src.line || undefined, styleType: src.styleType || undefined };
  }

  function sendChangeMessage(property, value) {
    const src = $sourceData;
    if (!src?.selector) return;
    send({ type: 'change', ...getChangeTarget(src, property), property, value });
  }

  // ── Control event handlers ──────────────────────────────────────
  function onControlInput({ property, value }) {
    controlValues = { ...controlValues, [property]: value };
    if (activeState === 'normal') normalControlValues[property] = value;
    applyLivePreview(property, value);
    queueChange(property, value);
  }

  function onControlChange({ property, value }) {
    controlValues = { ...controlValues, [property]: value };
    if (activeState === 'normal') normalControlValues[property] = value;
    applyLivePreview(property, value);
    commitChange(property, value);
  }

  function onSpacingInput({ property, value, raw }) {
    spacingValues[property] = raw || value.replace(/px$/, '');
    applyLivePreview(property, value);
    queueChange(property, value);
  }

  function onSpacingChange({ property, value }) {
    applyLivePreview(property, value);
    commitChange(property, value);
  }

  function onBorderInput({ property, value }) {
    borderValues = { ...borderValues, [property]: value };
    if (activeState === 'normal') {
      normalBorderValues = { ...normalBorderValues, [property]: value };
    }
    applyLivePreview(property, value);
    queueChange(property, value);
  }

  function onBorderChange({ property, value }) {
    borderValues = { ...borderValues, [property]: value };
    if (activeState === 'normal') {
      normalBorderValues = { ...normalBorderValues, [property]: value };
    }
    applyLivePreview(property, value);
    commitChange(property, value);
  }

  function onLayoutInput({ property, value }) {
    layoutValues[property] = value;
    applyLivePreview(property, value);
    queueChange(property, value);
  }

  function onLayoutChange({ property, value }) {
    layoutValues[property] = value;
    applyLivePreview(property, value);
    commitChange(property, value);
    ensureFlexDisplay();
  }

  function ensureFlexDisplay() {
    if (layoutDisplayValue !== 'flex' && layoutDisplayValue !== 'inline-flex') {
      layoutDisplayValue = 'flex';
      applyLivePreview('display', 'flex');
      commitChange('display', 'flex');
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
    onclose?.();
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

  // Build panel sections: schema-driven controls plus custom sections,
  // ordered by element type (text vs container).
  function getPanelSections(el) {
    // Collect all sections into a lookup by id
    const sectionMap = {};
    for (const s of CONTROL_SCHEMA) {
      sectionMap[s.id] = s;
    }
    // Custom sections (not in CONTROL_SCHEMA)
    sectionMap['layout'] = { section: 'Layout', id: 'layout', controls: null };
    sectionMap['spacing'] = { section: 'Position', id: 'spacing', controls: null };
    sectionMap['border'] = { section: 'Border', id: 'border', controls: null };

    // Determine ordering based on element type
    const tagName = el ? el.tagName : 'DIV';
    const isText = isTextElement(tagName);

    // Text element order:   Text, Layout, Position, Border, Colors, Effects
    // Container order:      Layout, Position, Border, Colors, Text, Effects
    const order = isText
      ? ['text', 'layout', 'spacing', 'border', 'colors', 'effects']
      : ['layout', 'spacing', 'border', 'colors', 'text', 'effects'];

    return order.map(id => sectionMap[id]).filter(Boolean);
  }

  let sections = $derived(getPanelSections(element));
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="polish-panel"
  bind:this={panelEl}
  style="left: {panelLeft}px; top: {panelTop}px; pointer-events: auto;"
  onmousedown={onPanelMousedown}
  onclick={onPanelClick}
>
  <!-- Header -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="polish-panel-header" onmousedown={onHeaderMousedown}>
    <span class="polish-panel-title">Properties</span>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <span class="polish-panel-close" onclick={onClose}>&times;</span>
  </div>

  <!-- State toggle: Normal / :hover / :focus / :active -->
  {#if pseudoClasses.size > 0}
    <div class="polish-state-toggle">
      <button
        class="polish-state-btn"
        class:active={activeState === 'normal'}
        onclick={() => activeState = 'normal'}
      >Normal</button>
      {#each [...pseudoClasses] as pc}
        <button
          class="polish-state-btn"
          class:active={activeState === pc}
          onclick={() => activeState = pc}
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
        <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
        <div class="polish-section-header" onclick={() => toggleSection(sectionDef.id)}>
          <span class="polish-section-arrow">&#9654;</span> {sectionDef.section}
        </div>
        <div class="polish-section-content">
          {#if sectionDef.id === 'border'}
            <BorderControl
              values={borderValues}
              oninput={onBorderInput}
              onchange={onBorderChange}
            />
          {:else if sectionDef.id === 'spacing'}
            <!-- Spacing section: box model + lock + shorthand badges -->
            <div class="polish-spacing-container">
              <BoxModel
                values={spacingValues}
                uniformMode={$uniformMode}
                oninput={onSpacingInput}
                onchange={onSpacingChange}
              />
              <div class="polish-lock-row">
                <button
                  class="polish-lock-btn"
                  class:locked={$uniformMode}
                  title="Toggle uniform spacing"
                  onclick={toggleLock}
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
            {#each SIZE_CONTROLS as def}
              <SliderControl
                property={def.property}
                value={controlValues[def.property] || ''}
                label={def.label}
                min={def.min}
                max={def.max}
                step={def.step}
                units={def.units}
                oninput={onControlInput}
                onchange={onControlChange}
              />
            {/each}
            <LayoutControl
              values={layoutValues}
              oninput={onLayoutInput}
              onchange={onLayoutChange}
            />
          {:else if sectionDef.controls}
            {#each sectionDef.controls as def}
              {#if def.type === 'color'}
                <ColorControl
                  property={def.property}
                  value={controlValues[def.property] || ''}
                  label={def.label}
                  oninput={onControlInput}
                  onchange={onControlChange}
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
                  oninput={onControlInput}
                  onchange={onControlChange}
                />
              {:else if def.type === 'select'}
                <SelectControl
                  property={def.property}
                  value={controlValues[def.property] || ''}
                  label={def.label}
                  options={getOptions(def)}
                  onchange={onControlChange}
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
