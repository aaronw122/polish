<script>
  import { clampValue, parseNumericValue } from '../lib/utils.js';

  let { property, value = '0', label = '', min = 0, max = 100, step = 1, units = 'px', oninput, onchange } = $props();

  // Parse the incoming value
  let numVal = $state(0);
  let currentUnit = $state('');

  let unitOptions = $derived(units ? (Array.isArray(units) ? units : [units]) : []);

  $effect(() => {
    const parsed = parseNumericValue(value);
    numVal = clampValue(parsed.num, min, max);
    if (unitOptions.length > 0 && parsed.unit) {
      currentUnit = parsed.unit;
    }
  });

  function getFullValue(num, unit) {
    if (unit === 'auto') return 'auto';
    if (unitOptions.length > 0) return num + unit;
    // No units (e.g., opacity) — just the number
    return String(num);
  }

  function emitNumericChange(e, eventName, shouldClamp) {
    const raw = parseFloat(e.target.value);
    numVal = shouldClamp ? clampValue(raw, min, max) : raw;
    const full = getFullValue(numVal, currentUnit);
    const detail = { property, value: full };
    if (eventName === 'input') oninput?.(detail);
    else onchange?.(detail);
  }

  function onUnitChange(e) {
    currentUnit = e.target.value;
    if (currentUnit === 'auto') {
      onchange?.({ property, value: 'auto' });
    } else {
      const full = getFullValue(numVal, currentUnit);
      onchange?.({ property, value: full });
    }
  }
</script>

<div class="polish-control-row">
  <label class="polish-control-label">{label}</label>
  <div class="polish-control-inputs">
    <input
      type="range"
      class="polish-slider"
      data-property={property}
      {min}
      {max}
      {step}
      value={numVal}
      oninput={(e) => emitNumericChange(e, 'input', false)}
      onchange={(e) => emitNumericChange(e, 'change', false)}
    />
    <input
      type="number"
      class="polish-num-input"
      data-property={property}
      {min}
      {max}
      {step}
      value={numVal}
      oninput={(e) => emitNumericChange(e, 'input', true)}
      onchange={(e) => emitNumericChange(e, 'change', true)}
    />
    {#if unitOptions.length > 0}
      <select
        class="polish-unit-select"
        value={currentUnit}
        onchange={onUnitChange}
      >
        {#each unitOptions as u}
          <option value={u}>{u}</option>
        {/each}
      </select>
    {/if}
  </div>
</div>

<style>
  .polish-control-row {
    margin-bottom: 6px;
  }
  .polish-control-label {
    display: block;
    font-size: 10px;
    color: #888;
    margin-bottom: 3px;
  }
  .polish-control-inputs {
    display: flex;
    align-items: center;
    gap: 4px;
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
  .polish-unit-select {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 3px;
    color: #e0e0e0;
    font-family: inherit;
    font-size: 10px;
    padding: 3px 4px;
    outline: none;
    cursor: pointer;
  }
  .polish-unit-select:focus {
    border-color: #4A9EFF;
  }
  .polish-unit-select option {
    background: #2a2a2a;
    color: #e0e0e0;
  }
</style>
