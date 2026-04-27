<script>
  import { createEventDispatcher } from 'svelte';
  import { parseNumericValue, clampValue } from '../lib/utils.js';

  export let values = {};

  const dispatch = createEventDispatcher();

  // ── Derived state ──────────────────────────────────────────────
  $: direction = values['flex-direction'] || 'row';
  $: alignItems = values['align-items'] || 'stretch';
  $: justifyContent = values['justify-content'] || 'flex-start';
  $: isColumn = direction === 'column' || direction === 'column-reverse';

  // ── Gap parsing ────────────────────────────────────────────────
  // Computed gap can be 'normal' (non-flex), px, or rem.
  // Normalize everything to rem for the slider.
  let gapNum = 0;

  $: {
    const raw = values['gap'] || '0';
    if (raw === 'normal' || raw === 'none' || raw === 'auto') {
      gapNum = 0;
    } else {
      const parsed = parseNumericValue(raw);
      if (parsed.unit === 'px') {
        // Convert px to rem (assume 16px root)
        gapNum = clampValue(parsed.num / 16, 0, 10);
      } else {
        // rem, em, or unitless — treat as rem
        gapNum = clampValue(parsed.num, 0, 10);
      }
    }
    // Round to nearest step (0.125)
    gapNum = Math.round(gapNum * 8) / 8;
  }

  // ── Icon rotation for column mode ──────────────────────────────
  $: iconRotateStyle = isColumn ? 'transform: rotate(90deg)' : '';

  // ── Direction buttons ──────────────────────────────────────────
  const directionOptions = [
    { value: 'row', label: 'Row' },
    { value: 'column', label: 'Column' },
  ];

  // ── Align buttons ──────────────────────────────────────────────
  const alignOptions = [
    { value: 'flex-start', label: 'Start' },
    { value: 'center', label: 'Center' },
    { value: 'flex-end', label: 'End' },
    { value: 'stretch', label: 'Stretch' },
  ];

  // ── Distribute buttons ─────────────────────────────────────────
  const distributeOptions = [
    { value: 'flex-start', label: 'Start' },
    { value: 'center', label: 'Center' },
    { value: 'flex-end', label: 'End' },
    { value: 'space-between', label: 'Between' },
    { value: 'space-around', label: 'Around' },
    { value: 'space-evenly', label: 'Evenly' },
  ];

  // ── Event handlers ─────────────────────────────────────────────
  function onDirectionClick(val) {
    dispatch('change', { property: 'flex-direction', value: val });
  }

  function onAlignClick(val) {
    dispatch('change', { property: 'align-items', value: val });
  }

  function onDistributeClick(val) {
    dispatch('change', { property: 'justify-content', value: val });
  }

  function onGapSliderInput(e) {
    gapNum = parseFloat(e.target.value);
    dispatch('input', { property: 'gap', value: gapNum + 'rem' });
  }

  function onGapSliderChange(e) {
    gapNum = parseFloat(e.target.value);
    dispatch('change', { property: 'gap', value: gapNum + 'rem' });
  }

  function onGapNumChange(e) {
    const clamped = clampValue(parseFloat(e.target.value), 0, 10);
    gapNum = Math.round(clamped * 8) / 8;
    dispatch('change', { property: 'gap', value: gapNum + 'rem' });
  }

  function onGapKeydown(e) {
    if (e.key === 'Enter') {
      e.target.blur();
    }
  }
</script>

<div class="layout-control">
  <!-- Direction row -->
  <div class="layout-row">
    <span class="layout-label">Direction</span>
    <div class="layout-btn-group">
      {#each directionOptions as opt}
        <button
          class="layout-btn"
          class:active={direction === opt.value}
          title={opt.label}
          on:click={() => onDirectionClick(opt.value)}
        >
          {#if opt.value === 'row'}
            <!-- Arrow right icon -->
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2.5 7h9M8.5 4l3 3-3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          {:else}
            <!-- Arrow down icon -->
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 2.5v9M4 8.5l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          {/if}
        </button>
      {/each}
    </div>
  </div>

  <!-- Align row (cross-axis) -->
  <div class="layout-row">
    <span class="layout-label">Align</span>
    <div class="layout-btn-group">
      {#each alignOptions as opt}
        <button
          class="layout-btn"
          class:active={alignItems === opt.value}
          title={opt.label}
          on:click={() => onAlignClick(opt.value)}
        >
          {#if opt.value === 'flex-start'}
            <!-- Align start: items pushed to start of cross axis -->
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={iconRotateStyle}>
              <line x1="1" y1="2" x2="13" y2="2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              <rect x="3" y="3.5" width="3" height="7" rx="0.5" fill="currentColor" opacity="0.7"/>
              <rect x="8" y="3.5" width="3" height="5" rx="0.5" fill="currentColor" opacity="0.7"/>
            </svg>
          {:else if opt.value === 'center'}
            <!-- Align center: items centered on cross axis -->
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={iconRotateStyle}>
              <line x1="1" y1="7" x2="13" y2="7" stroke="currentColor" stroke-width="0.5" stroke-dasharray="1.5 1"/>
              <rect x="3" y="3" width="3" height="8" rx="0.5" fill="currentColor" opacity="0.7"/>
              <rect x="8" y="4" width="3" height="6" rx="0.5" fill="currentColor" opacity="0.7"/>
            </svg>
          {:else if opt.value === 'flex-end'}
            <!-- Align end: items pushed to end of cross axis -->
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={iconRotateStyle}>
              <line x1="1" y1="12" x2="13" y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              <rect x="3" y="3.5" width="3" height="7" rx="0.5" fill="currentColor" opacity="0.7"/>
              <rect x="8" y="5.5" width="3" height="5" rx="0.5" fill="currentColor" opacity="0.7"/>
            </svg>
          {:else}
            <!-- Stretch: items fill cross axis -->
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={iconRotateStyle}>
              <line x1="1" y1="1.5" x2="13" y2="1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              <line x1="1" y1="12.5" x2="13" y2="12.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              <rect x="3" y="3" width="3" height="8" rx="0.5" fill="currentColor" opacity="0.7"/>
              <rect x="8" y="3" width="3" height="8" rx="0.5" fill="currentColor" opacity="0.7"/>
            </svg>
          {/if}
        </button>
      {/each}
    </div>
  </div>

  <!-- Distribute row (main-axis) -->
  <div class="layout-row">
    <span class="layout-label">Distribute</span>
    <div class="layout-btn-group">
      {#each distributeOptions as opt}
        <button
          class="layout-btn"
          class:active={justifyContent === opt.value}
          title={opt.label}
          on:click={() => onDistributeClick(opt.value)}
        >
          {#if opt.value === 'flex-start'}
            <!-- Justify start: items packed to start -->
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={iconRotateStyle}>
              <line x1="2" y1="1" x2="2" y2="13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              <rect x="3.5" y="4" width="3" height="6" rx="0.5" fill="currentColor" opacity="0.7"/>
              <rect x="7.5" y="4" width="3" height="6" rx="0.5" fill="currentColor" opacity="0.7"/>
            </svg>
          {:else if opt.value === 'center'}
            <!-- Justify center: items packed to center -->
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={iconRotateStyle}>
              <line x1="7" y1="1" x2="7" y2="13" stroke="currentColor" stroke-width="0.5" stroke-dasharray="1.5 1"/>
              <rect x="2" y="4" width="3" height="6" rx="0.5" fill="currentColor" opacity="0.7"/>
              <rect x="9" y="4" width="3" height="6" rx="0.5" fill="currentColor" opacity="0.7"/>
            </svg>
          {:else if opt.value === 'flex-end'}
            <!-- Justify end: items packed to end -->
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={iconRotateStyle}>
              <line x1="12" y1="1" x2="12" y2="13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              <rect x="3.5" y="4" width="3" height="6" rx="0.5" fill="currentColor" opacity="0.7"/>
              <rect x="7.5" y="4" width="3" height="6" rx="0.5" fill="currentColor" opacity="0.7"/>
            </svg>
          {:else if opt.value === 'space-between'}
            <!-- Space between: items spread to edges -->
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={iconRotateStyle}>
              <line x1="1.5" y1="1" x2="1.5" y2="13" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
              <line x1="12.5" y1="1" x2="12.5" y2="13" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
              <rect x="2.5" y="4" width="3" height="6" rx="0.5" fill="currentColor" opacity="0.7"/>
              <rect x="8.5" y="4" width="3" height="6" rx="0.5" fill="currentColor" opacity="0.7"/>
            </svg>
          {:else if opt.value === 'space-around'}
            <!-- Space around: equal space around each item -->
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={iconRotateStyle}>
              <rect x="2" y="4" width="3" height="6" rx="0.5" fill="currentColor" opacity="0.7"/>
              <rect x="9" y="4" width="3" height="6" rx="0.5" fill="currentColor" opacity="0.7"/>
              <line x1="0.5" y1="5" x2="0.5" y2="9" stroke="currentColor" stroke-width="0.5" stroke-dasharray="1 1"/>
              <line x1="6.5" y1="5" x2="6.5" y2="9" stroke="currentColor" stroke-width="0.5" stroke-dasharray="1 1"/>
              <line x1="7.5" y1="5" x2="7.5" y2="9" stroke="currentColor" stroke-width="0.5" stroke-dasharray="1 1"/>
              <line x1="13.5" y1="5" x2="13.5" y2="9" stroke="currentColor" stroke-width="0.5" stroke-dasharray="1 1"/>
            </svg>
          {:else}
            <!-- Space evenly: equal space between and at edges -->
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={iconRotateStyle}>
              <rect x="3" y="4" width="2.5" height="6" rx="0.5" fill="currentColor" opacity="0.7"/>
              <rect x="8.5" y="4" width="2.5" height="6" rx="0.5" fill="currentColor" opacity="0.7"/>
              <line x1="1" y1="5" x2="1" y2="9" stroke="currentColor" stroke-width="0.5" stroke-dasharray="1 1"/>
              <line x1="7" y1="5" x2="7" y2="9" stroke="currentColor" stroke-width="0.5" stroke-dasharray="1 1"/>
              <line x1="13" y1="5" x2="13" y2="9" stroke="currentColor" stroke-width="0.5" stroke-dasharray="1 1"/>
            </svg>
          {/if}
        </button>
      {/each}
    </div>
  </div>

  <!-- Gap row -->
  <div class="layout-row">
    <span class="layout-label">Gap</span>
    <div class="layout-gap-inputs">
      <input
        type="range"
        class="polish-slider"
        min="0"
        max="10"
        step="0.125"
        value={gapNum}
        on:input={onGapSliderInput}
        on:change={onGapSliderChange}
      />
      <input
        type="number"
        class="polish-num-input"
        min="0"
        max="10"
        step="0.125"
        value={gapNum}
        on:change={onGapNumChange}
        on:keydown={onGapKeydown}
      />
      <span class="layout-unit">rem</span>
    </div>
  </div>
</div>

<style>
  .layout-control {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .layout-row {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .layout-label {
    font-size: 10px;
    color: #888;
  }

  /* ── Button groups ──────────────────────────────────────────── */
  .layout-btn-group {
    display: flex;
    gap: 2px;
  }

  .layout-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 24px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.06);
    color: #999;
    cursor: pointer;
    padding: 0;
    transition: color 0.1s, border-color 0.1s, background 0.1s;
  }

  .layout-btn:hover {
    color: #ccc;
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.2);
  }

  .layout-btn.active {
    color: #4A9EFF;
    background: rgba(74, 158, 255, 0.12);
    border-color: rgba(74, 158, 255, 0.35);
  }

  .layout-btn :global(svg) {
    transition: transform 0.15s ease;
  }

  /* ── Gap slider + input ─────────────────────────────────────── */
  .layout-gap-inputs {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .layout-unit {
    font-size: 10px;
    color: #888;
    flex-shrink: 0;
  }

  /* Reuse .polish-slider and .polish-num-input styles from SliderControl */
  .polish-slider {
    flex: 1;
    height: 4px;
    -webkit-appearance: none;
    appearance: none;
    background: rgba(255, 255, 255, 0.12);
    border-radius: 2px;
    outline: none;
  }
  .polish-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #4A9EFF;
    cursor: pointer;
    border: none;
  }
  .polish-slider::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #4A9EFF;
    cursor: pointer;
    border: none;
  }

  .polish-num-input {
    width: 44px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 3px;
    color: #e0e0e0;
    font-family: inherit;
    font-size: 11px;
    padding: 3px 4px;
    outline: none;
    text-align: right;
  }
  .polish-num-input:focus {
    border-color: #4A9EFF;
  }
  .polish-num-input::-webkit-inner-spin-button,
  .polish-num-input::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
</style>
