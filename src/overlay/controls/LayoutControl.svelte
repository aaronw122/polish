<script>
  import { createEventDispatcher } from 'svelte';
  import { parseNumericValue, clampValue } from '../lib/utils.js';
  import { LAYOUT_ICONS } from './layoutIcons.js';

  export let values = {};

  const dispatch = createEventDispatcher();

  $: direction = values['flex-direction'] || 'row';
  $: isColumn = direction === 'column' || direction === 'column-reverse';
  $: gapRem = toRoundedGapRem(values['gap'] || '0');

  function toRoundedGapRem(raw) {
    if (raw === 'normal' || raw === 'none' || raw === 'auto') return 0;
    const parsed = parseNumericValue(raw);
    const rem = parsed.unit === 'px' ? parsed.num / 16 : parsed.num;
    return Math.round(clampValue(rem, 0, 10) * 8) / 8;
  }

  function dispatchGap(eventName, rawValue) {
    const clamped = Math.round(clampValue(parseFloat(rawValue), 0, 10) * 8) / 8;
    dispatch(eventName, { property: 'gap', value: clamped + 'rem' });
  }

  function onGapKeydown(e) {
    if (e.key === 'Enter') e.target.blur();
  }

  // Each row: label, CSS property, default value, whether icons rotate in column mode
  const BUTTON_ROWS = [
    { label: 'Direction', property: 'flex-direction', default: 'row', rotateIcons: false, options: [
      { value: 'row', label: 'Row' },
      { value: 'column', label: 'Column' },
    ]},
    { label: 'Align', property: 'align-items', default: 'stretch', rotateIcons: true, options: [
      { value: 'flex-start', label: 'Start' },
      { value: 'center', label: 'Center' },
      { value: 'flex-end', label: 'End' },
      { value: 'stretch', label: 'Stretch' },
    ]},
    { label: 'Distribute', property: 'justify-content', default: 'flex-start', rotateIcons: true, options: [
      { value: 'flex-start', label: 'Start' },
      { value: 'center', label: 'Center' },
      { value: 'flex-end', label: 'End' },
      { value: 'space-between', label: 'Between' },
      { value: 'space-around', label: 'Around' },
      { value: 'space-evenly', label: 'Evenly' },
    ]},
  ];
</script>

<div class="layout-control">
  {#each BUTTON_ROWS as row}
    <div class="layout-row">
      <span class="layout-label">{row.label}</span>
      <div class="layout-btn-group">
        {#each row.options as opt}
          <button
            class="layout-btn"
            class:active={(values[row.property] || row.default) === opt.value}
            title={opt.label}
            on:click={() => dispatch('change', { property: row.property, value: opt.value })}
          >
            <span class="layout-icon" class:rotated={row.rotateIcons && isColumn}>
              {@html LAYOUT_ICONS[row.property + ':' + opt.value]}
            </span>
          </button>
        {/each}
      </div>
    </div>
  {/each}

  <div class="layout-row">
    <span class="layout-label">Gap</span>
    <div class="layout-gap-inputs">
      <input
        type="range"
        class="polish-slider"
        min="0" max="10" step="0.125"
        value={gapRem}
        on:input={e => dispatchGap('input', e.target.value)}
        on:change={e => dispatchGap('change', e.target.value)}
      />
      <input
        type="number"
        class="polish-num-input"
        min="0" max="10" step="0.125"
        value={gapRem}
        on:change={e => dispatchGap('change', e.target.value)}
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

  .layout-icon {
    display: flex;
    transition: transform 0.15s ease;
  }

  .layout-icon.rotated {
    transform: rotate(90deg);
  }

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
