<script>
  import { createEventDispatcher } from 'svelte';
  import { toOklch, fromOklch, isTransparent as checkTransparent } from '../lib/color.js';

  export let property;
  export let value = '#000000';
  export let format = 'hex';
  export let label = '';

  const dispatch = createEventDispatcher();

  // ── OKLCH state ──────────────────────────────────────────────────
  let l = 0;
  let c = 0;
  let h = 0;
  let transparent = false;
  let lastOklch = { l: 0, c: 0, h: 0 };

  // Parse incoming value into OKLCH whenever it changes externally
  $: {
    const isT = checkTransparent(value);
    transparent = isT;
    if (!isT) {
      const parsed = toOklch(value);
      if (parsed) {
        l = parsed.l;
        c = parsed.c;
        h = parsed.h;
        lastOklch = { l: parsed.l, c: parsed.c, h: parsed.h };
      }
    }
  }

  // Format the display value in the authored format
  $: displayValue = transparent ? 'transparent' : fromOklch({ l, c, h }, format);

  // ── Slider gradient backgrounds ──────────────────────────────────
  $: lGradient = `linear-gradient(to right, oklch(0 ${c} ${h}), oklch(1 ${c} ${h}))`;
  $: cGradient = `linear-gradient(to right, oklch(${l} 0 ${h}), oklch(${l} 0.4 ${h}))`;
  $: hGradient = `linear-gradient(to right, ${
    [0, 60, 120, 180, 240, 300, 360].map(deg => `oklch(${l} ${c} ${deg})`).join(', ')
  })`;

  // ── Event handlers ───────────────────────────────────────────────
  function onSliderInput(dimension, e) {
    const val = parseFloat(e.target.value);
    if (dimension === 'l') l = val;
    else if (dimension === 'c') c = val;
    else if (dimension === 'h') h = val;
    dispatch('input', { property, value: fromOklch({ l, c, h }, format) });
  }

  function onSliderChange(dimension, e) {
    const val = parseFloat(e.target.value);
    if (dimension === 'l') l = val;
    else if (dimension === 'c') c = val;
    else if (dimension === 'h') h = val;
    dispatch('change', { property, value: fromOklch({ l, c, h }, format) });
  }

  function onTextInput(e) {
    if (transparent) return;
    const v = e.target.value.trim();
    // Only dispatch if it looks like a plausible color value
    if (v.startsWith('#') || v.startsWith('rgb') || v.startsWith('hsl') || v.startsWith('oklch') || v.startsWith('oklab')) {
      dispatch('input', { property, value: v });
    }
  }

  function onTextChange(e) {
    if (transparent) return;
    const v = e.target.value.trim();
    if (v) {
      dispatch('change', { property, value: v });
    }
  }

  function toggleTransparent() {
    if (transparent) {
      // Restore last color
      l = lastOklch.l;
      c = lastOklch.c;
      h = lastOklch.h;
      dispatch('change', { property, value: fromOklch(lastOklch, format) });
    } else {
      dispatch('change', { property, value: 'transparent' });
    }
  }
</script>

<div class="polish-color-control">
  <label class="polish-color-label">{label}</label>

  <!-- Swatch + text + transparent toggle row -->
  <div class="polish-color-top-row">
    <div class="polish-swatch" class:transparent style="background: {transparent ? 'none' : `oklch(${l} ${c} ${h})`};">
    </div>
    <input
      type="text"
      class="polish-color-text"
      class:dimmed={transparent}
      data-property={property}
      value={displayValue}
      readonly={transparent}
      on:input={onTextInput}
      on:change={onTextChange}
    />
    <button
      class="polish-transparent-btn"
      class:active={transparent}
      title={transparent ? 'Add color' : 'Set transparent'}
      on:click={toggleTransparent}
    >&#8856;</button>
  </div>

  <!-- OKLCH sliders -->
  <div class="polish-sliders" class:disabled={transparent}>
    <div class="polish-slider-row">
      <span class="polish-slider-label">L</span>
      <input
        type="range"
        class="polish-range polish-range-l"
        min="0" max="1" step="0.01"
        value={l}
        disabled={transparent}
        style="--track-bg: {lGradient}"
        on:input={(e) => onSliderInput('l', e)}
        on:change={(e) => onSliderChange('l', e)}
      />
      <span class="polish-slider-value">{l.toFixed(2)}</span>
    </div>
    <div class="polish-slider-row">
      <span class="polish-slider-label">C</span>
      <input
        type="range"
        class="polish-range polish-range-c"
        min="0" max="0.4" step="0.001"
        value={c}
        disabled={transparent}
        style="--track-bg: {cGradient}"
        on:input={(e) => onSliderInput('c', e)}
        on:change={(e) => onSliderChange('c', e)}
      />
      <span class="polish-slider-value">{c.toFixed(3)}</span>
    </div>
    <div class="polish-slider-row">
      <span class="polish-slider-label">H</span>
      <input
        type="range"
        class="polish-range polish-range-h"
        min="0" max="360" step="1"
        value={h}
        disabled={transparent}
        style="--track-bg: {hGradient}"
        on:input={(e) => onSliderInput('h', e)}
        on:change={(e) => onSliderChange('h', e)}
      />
      <span class="polish-slider-value">{Math.round(h)}</span>
    </div>
  </div>
</div>

<style>
  .polish-color-control {
    margin-bottom: 6px;
  }
  .polish-color-label {
    display: block;
    font-size: 10px;
    color: #888;
    margin-bottom: 3px;
  }

  /* Top row: swatch + text + toggle */
  .polish-color-top-row {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 4px;
  }
  .polish-swatch {
    width: 28px;
    height: 22px;
    flex-shrink: 0;
    border-radius: 3px;
    border: 1px solid rgba(255, 255, 255, 0.15);
  }
  .polish-swatch.transparent {
    background: repeating-conic-gradient(#555 0% 25%, #333 0% 50%) 50% / 8px 8px !important;
  }
  .polish-color-text {
    flex: 1;
    min-width: 0;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 3px;
    color: #e0e0e0;
    font-family: inherit;
    font-size: 11px;
    padding: 3px 6px;
    outline: none;
  }
  .polish-color-text:focus {
    border-color: #4A9EFF;
  }
  .polish-color-text.dimmed {
    color: #666;
    font-style: italic;
  }
  .polish-transparent-btn {
    width: 22px;
    height: 22px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.06);
    cursor: pointer;
    padding: 0;
    flex-shrink: 0;
    font-size: 14px;
    line-height: 20px;
    color: #888;
  }
  .polish-transparent-btn.active {
    border-color: rgba(74, 158, 255, 0.5);
    background: rgba(74, 158, 255, 0.1);
    color: #4A9EFF;
  }

  /* Sliders */
  .polish-sliders {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .polish-sliders.disabled {
    opacity: 0.35;
    pointer-events: none;
  }
  .polish-slider-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .polish-slider-label {
    width: 10px;
    font-size: 9px;
    color: #777;
    text-align: right;
    flex-shrink: 0;
  }
  .polish-slider-value {
    width: 36px;
    font-size: 9px;
    color: #999;
    text-align: right;
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }

  /* Range slider styling */
  .polish-range {
    flex: 1;
    height: 14px;
    -webkit-appearance: none;
    appearance: none;
    background: transparent;
    cursor: pointer;
    min-width: 0;
  }
  .polish-range::-webkit-slider-runnable-track {
    height: 8px;
    border-radius: 4px;
    background: var(--track-bg, #333);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
  .polish-range::-moz-range-track {
    height: 8px;
    border-radius: 4px;
    background: var(--track-bg, #333);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
  .polish-range::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #fff;
    border: 1px solid rgba(0, 0, 0, 0.3);
    margin-top: -3px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }
  .polish-range::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #fff;
    border: 1px solid rgba(0, 0, 0, 0.3);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }
  .polish-range:disabled {
    cursor: default;
  }
</style>
