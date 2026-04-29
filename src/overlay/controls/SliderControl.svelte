<script>
  import { createEventDispatcher } from 'svelte';
  import { clampValue, parseNumericValue } from '../lib/utils.js';

  export let property;
  export let value = '0';
  export let label = '';
  export let min = 0;
  export let max = 100;
  export let step = 1;
  export let units = 'px'; // string or array of strings, or null

  const dispatch = createEventDispatcher();

  // Parse the incoming value
  let numVal = 0;
  let currentUnit = '';

  $: {
    const parsed = parseNumericValue(value);
    numVal = clampValue(parsed.num, min, max);
    if (unitOptions.length > 0 && parsed.unit) {
      currentUnit = parsed.unit;
    }
  }

  $: unitOptions = units ? (Array.isArray(units) ? units : [units]) : [];

  function getFullValue(num, unit) {
    if (unit === 'auto') return 'auto';
    if (unitOptions.length > 0) return num + unit;
    // No units (e.g., opacity) — just the number
    return String(num);
  }

  function onSliderInput(e) {
    numVal = parseFloat(e.target.value);
    const full = getFullValue(numVal, currentUnit);
    dispatch('input', { property, value: full });
  }

  function onSliderChange(e) {
    numVal = parseFloat(e.target.value);
    const full = getFullValue(numVal, currentUnit);
    dispatch('change', { property, value: full });
  }

  function onNumInput(e) {
    const clamped = clampValue(parseFloat(e.target.value), min, max);
    numVal = clamped;
    const full = getFullValue(clamped, currentUnit);
    dispatch('input', { property, value: full });
  }

  function onNumChange(e) {
    const clamped = clampValue(parseFloat(e.target.value), min, max);
    numVal = clamped;
    const full = getFullValue(clamped, currentUnit);
    dispatch('change', { property, value: full });
  }

  function onUnitChange(e) {
    currentUnit = e.target.value;
    if (currentUnit === 'auto') {
      dispatch('change', { property, value: 'auto' });
    } else {
      const full = getFullValue(numVal, currentUnit);
      dispatch('change', { property, value: full });
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
      on:input={onSliderInput}
      on:change={onSliderChange}
    />
    <input
      type="number"
      class="polish-num-input"
      data-property={property}
      {min}
      {max}
      {step}
      value={numVal}
      on:input={onNumInput}
      on:change={onNumChange}
    />
    {#if unitOptions.length > 0}
      <select
        class="polish-unit-select"
        value={currentUnit}
        on:change={onUnitChange}
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
