<script>
  import { createEventDispatcher } from 'svelte';
  import { parseNumericValue, clampValue } from '../lib/utils.js';

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

  // Icon SVGs keyed by 'property:value' — names are the documentation
  const ICONS = {
    'flex-direction:row':       '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2.5 7h9M8.5 4l3 3-3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    'flex-direction:column':    '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2.5v9M4 8.5l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    'align-items:flex-start':   '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><line x1="1" y1="2" x2="13" y2="2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><rect x="3" y="3.5" width="3" height="7" rx="0.5" fill="currentColor" opacity="0.7"/><rect x="8" y="3.5" width="3" height="5" rx="0.5" fill="currentColor" opacity="0.7"/></svg>',
    'align-items:center':       '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><line x1="1" y1="7" x2="13" y2="7" stroke="currentColor" stroke-width="0.5" stroke-dasharray="1.5 1"/><rect x="3" y="3" width="3" height="8" rx="0.5" fill="currentColor" opacity="0.7"/><rect x="8" y="4" width="3" height="6" rx="0.5" fill="currentColor" opacity="0.7"/></svg>',
    'align-items:flex-end':     '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><line x1="1" y1="12" x2="13" y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><rect x="3" y="3.5" width="3" height="7" rx="0.5" fill="currentColor" opacity="0.7"/><rect x="8" y="5.5" width="3" height="5" rx="0.5" fill="currentColor" opacity="0.7"/></svg>',
    'align-items:stretch':      '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><line x1="1" y1="1.5" x2="13" y2="1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="1" y1="12.5" x2="13" y2="12.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><rect x="3" y="3" width="3" height="8" rx="0.5" fill="currentColor" opacity="0.7"/><rect x="8" y="3" width="3" height="8" rx="0.5" fill="currentColor" opacity="0.7"/></svg>',
    'justify-content:flex-start':    '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><line x1="2" y1="1" x2="2" y2="13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><rect x="3.5" y="4" width="3" height="6" rx="0.5" fill="currentColor" opacity="0.7"/><rect x="7.5" y="4" width="3" height="6" rx="0.5" fill="currentColor" opacity="0.7"/></svg>',
    'justify-content:center':        '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><line x1="7" y1="1" x2="7" y2="13" stroke="currentColor" stroke-width="0.5" stroke-dasharray="1.5 1"/><rect x="2" y="4" width="3" height="6" rx="0.5" fill="currentColor" opacity="0.7"/><rect x="9" y="4" width="3" height="6" rx="0.5" fill="currentColor" opacity="0.7"/></svg>',
    'justify-content:flex-end':      '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><line x1="12" y1="1" x2="12" y2="13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><rect x="3.5" y="4" width="3" height="6" rx="0.5" fill="currentColor" opacity="0.7"/><rect x="7.5" y="4" width="3" height="6" rx="0.5" fill="currentColor" opacity="0.7"/></svg>',
    'justify-content:space-between': '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><line x1="1.5" y1="1" x2="1.5" y2="13" stroke="currentColor" stroke-width="1" stroke-linecap="round"/><line x1="12.5" y1="1" x2="12.5" y2="13" stroke="currentColor" stroke-width="1" stroke-linecap="round"/><rect x="2.5" y="4" width="3" height="6" rx="0.5" fill="currentColor" opacity="0.7"/><rect x="8.5" y="4" width="3" height="6" rx="0.5" fill="currentColor" opacity="0.7"/></svg>',
    'justify-content:space-around':  '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="2" y="4" width="3" height="6" rx="0.5" fill="currentColor" opacity="0.7"/><rect x="9" y="4" width="3" height="6" rx="0.5" fill="currentColor" opacity="0.7"/><line x1="0.5" y1="5" x2="0.5" y2="9" stroke="currentColor" stroke-width="0.5" stroke-dasharray="1 1"/><line x1="6.5" y1="5" x2="6.5" y2="9" stroke="currentColor" stroke-width="0.5" stroke-dasharray="1 1"/><line x1="7.5" y1="5" x2="7.5" y2="9" stroke="currentColor" stroke-width="0.5" stroke-dasharray="1 1"/><line x1="13.5" y1="5" x2="13.5" y2="9" stroke="currentColor" stroke-width="0.5" stroke-dasharray="1 1"/></svg>',
    'justify-content:space-evenly':  '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="3" y="4" width="2.5" height="6" rx="0.5" fill="currentColor" opacity="0.7"/><rect x="8.5" y="4" width="2.5" height="6" rx="0.5" fill="currentColor" opacity="0.7"/><line x1="1" y1="5" x2="1" y2="9" stroke="currentColor" stroke-width="0.5" stroke-dasharray="1 1"/><line x1="7" y1="5" x2="7" y2="9" stroke="currentColor" stroke-width="0.5" stroke-dasharray="1 1"/><line x1="13" y1="5" x2="13" y2="9" stroke="currentColor" stroke-width="0.5" stroke-dasharray="1 1"/></svg>',
  };

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
              {@html ICONS[row.property + ':' + opt.value]}
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
