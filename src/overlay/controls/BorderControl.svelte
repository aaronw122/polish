<script>
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { rgbToHex, parseNumericValue } from '../lib/utils.js';
  import PickrSwatch from './PickrSwatch.svelte';

  export let values = {};

  const dispatch = createEventDispatcher();
  const SIDES = ['top', 'right', 'bottom', 'left'];
  const STYLES = ['none', 'solid', 'dashed', 'dotted', 'double'];

  let activeSide = 'all';
  let dropdownOpen = false;
  let dropdownEl;

  const SIDE_OPTIONS = [
    { value: 'all',    label: 'All' },
    { value: 'top',    label: 'Top' },
    { value: 'bottom', label: 'Bottom' },
    { value: 'left',   label: 'Left' },
    { value: 'right',  label: 'Right' },
  ];

  // SVG icons: 14x14, solid line = active side, dashed = inactive sides
  const SIDE_ICONS = {
    all:    '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="1.5" width="11" height="11" rx="1" stroke="currentColor" stroke-width="1.5"/></svg>',
    top:    '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><line x1="1.5" y1="1.5" x2="12.5" y2="1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="1.5" y1="12.5" x2="12.5" y2="12.5" stroke="currentColor" stroke-width="1" stroke-dasharray="1.5 1.5" opacity="0.35"/><line x1="1.5" y1="1.5" x2="1.5" y2="12.5" stroke="currentColor" stroke-width="1" stroke-dasharray="1.5 1.5" opacity="0.35"/><line x1="12.5" y1="1.5" x2="12.5" y2="12.5" stroke="currentColor" stroke-width="1" stroke-dasharray="1.5 1.5" opacity="0.35"/></svg>',
    bottom: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><line x1="1.5" y1="12.5" x2="12.5" y2="12.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="1.5" y1="1.5" x2="12.5" y2="1.5" stroke="currentColor" stroke-width="1" stroke-dasharray="1.5 1.5" opacity="0.35"/><line x1="1.5" y1="1.5" x2="1.5" y2="12.5" stroke="currentColor" stroke-width="1" stroke-dasharray="1.5 1.5" opacity="0.35"/><line x1="12.5" y1="1.5" x2="12.5" y2="12.5" stroke="currentColor" stroke-width="1" stroke-dasharray="1.5 1.5" opacity="0.35"/></svg>',
    left:   '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><line x1="1.5" y1="1.5" x2="1.5" y2="12.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="1.5" y1="1.5" x2="12.5" y2="1.5" stroke="currentColor" stroke-width="1" stroke-dasharray="1.5 1.5" opacity="0.35"/><line x1="1.5" y1="12.5" x2="12.5" y2="12.5" stroke="currentColor" stroke-width="1" stroke-dasharray="1.5 1.5" opacity="0.35"/><line x1="12.5" y1="1.5" x2="12.5" y2="12.5" stroke="currentColor" stroke-width="1" stroke-dasharray="1.5 1.5" opacity="0.35"/></svg>',
    right:  '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><line x1="12.5" y1="1.5" x2="12.5" y2="12.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="1.5" y1="1.5" x2="12.5" y2="1.5" stroke="currentColor" stroke-width="1" stroke-dasharray="1.5 1.5" opacity="0.35"/><line x1="1.5" y1="12.5" x2="12.5" y2="12.5" stroke="currentColor" stroke-width="1" stroke-dasharray="1.5 1.5" opacity="0.35"/><line x1="1.5" y1="1.5" x2="1.5" y2="12.5" stroke="currentColor" stroke-width="1" stroke-dasharray="1.5 1.5" opacity="0.35"/></svg>',
  };

  // Derive current side's values
  $: refSide = activeSide === 'all' ? 'top' : activeSide;
  $: currentWidth = parseNumericValue(values[`border-${refSide}-width`] || '0px').num;
  $: currentStyle = values[`border-${refSide}-style`] || 'none';
  $: currentColorRaw = values[`border-${refSide}-color`] || '';
  $: currentHex = rgbToHex(currentColorRaw) === 'transparent' ? '#000000' : rgbToHex(currentColorRaw);

  function selectSide(side) {
    activeSide = side;
    dropdownOpen = false;
  }

  function emitChange(property, value) {
    if (activeSide === 'all') {
      for (const s of SIDES) {
        const perSide = property.replace('border-', `border-${s}-`);
        dispatch('change', { property: perSide, value });
      }
    } else {
      const perSide = property.replace('border-', `border-${activeSide}-`);
      dispatch('change', { property: perSide, value });
    }
  }

  function emitInput(property, value) {
    if (activeSide === 'all') {
      for (const s of SIDES) {
        const perSide = property.replace('border-', `border-${s}-`);
        dispatch('input', { property: perSide, value });
      }
    } else {
      const perSide = property.replace('border-', `border-${activeSide}-`);
      dispatch('input', { property: perSide, value });
    }
  }

  function onColorInput(e) {
    emitInput('border-color', e.detail.value);
  }
  function onColorChange(e) {
    emitChange('border-color', e.detail.value);
  }

  function onWidthInput(e) {
    const v = Math.max(0, parseInt(e.target.value) || 0) + 'px';
    emitInput('border-width', v);
  }
  function onWidthChange(e) {
    const v = Math.max(0, parseInt(e.target.value) || 0) + 'px';
    emitChange('border-width', v);
    if (parseInt(v) > 0 && currentStyle === 'none') {
      emitChange('border-style', 'solid');
    }
  }

  function onStyleChange(e) {
    emitChange('border-style', e.target.value);
  }

  function onHexInput(e) {
    const v = e.target.value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      emitInput('border-color', v);
    }
  }
  function onHexChange(e) {
    const v = e.target.value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      emitChange('border-color', v);
    }
  }

  function handleClickOutside(e) {
    if (dropdownOpen && dropdownEl && !dropdownEl.contains(e.target)) {
      dropdownOpen = false;
    }
  }

  onMount(() => {
    document.addEventListener('mousedown', handleClickOutside, true);
  });
  onDestroy(() => {
    document.removeEventListener('mousedown', handleClickOutside, true);
  });
</script>

<div class="border-control">
  <!-- Color row -->
  <div class="border-row">
    <PickrSwatch
      color={currentHex}
      on:input={onColorInput}
      on:change={onColorChange}
    />
    <input
      type="text"
      class="border-hex"
      placeholder="#000000"
      maxlength="7"
      value={currentHex}
      on:input={onHexInput}
      on:change={onHexChange}
    />
  </div>

  <!-- Style + width + side selector row -->
  <div class="border-row">
    <select
      class="border-style-select"
      value={currentStyle}
      on:change={onStyleChange}
    >
      {#each STYLES as s}
        <option value={s}>{s}</option>
      {/each}
    </select>
    <input
      type="number"
      class="border-width-input"
      min="0" max="100" step="1"
      value={currentWidth}
      on:input={onWidthInput}
      on:change={onWidthChange}
    />
    <span class="border-unit">px</span>

    <!-- Side dropdown trigger -->
    <div class="side-dropdown-wrap" bind:this={dropdownEl}>
      <button
        class="side-trigger"
        title="Border side: {activeSide}"
        on:click={() => dropdownOpen = !dropdownOpen}
      >
        <span class="side-trigger-icon">{@html SIDE_ICONS[activeSide]}</span>
      </button>

      {#if dropdownOpen}
        <div class="side-dropdown">
          {#each SIDE_OPTIONS as opt}
            <button
              class="side-option"
              class:selected={activeSide === opt.value}
              on:click={() => selectSide(opt.value)}
            >
              {#if activeSide === opt.value}
                <span class="side-check">&#10003;</span>
              {:else}
                <span class="side-check"></span>
              {/if}
              <span class="side-icon">{@html SIDE_ICONS[opt.value]}</span>
              <span class="side-label">{opt.label}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .border-control {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .border-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .border-hex {
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
  .border-hex:focus { border-color: #4A9EFF; }

  /* Style dropdown */
  .border-style-select {
    flex: 1;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 3px;
    color: #e0e0e0;
    font-family: inherit;
    font-size: 11px;
    padding: 3px 6px;
    outline: none;
    cursor: pointer;
    -webkit-appearance: none;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg width='8' height='5' viewBox='0 0 8 5' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l3 3 3-3' stroke='%23888' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 6px center;
    padding-right: 20px;
  }
  .border-style-select:focus { border-color: #4A9EFF; }
  .border-style-select option {
    background: #1e1e1e;
    color: #e0e0e0;
  }

  /* Width input */
  .border-width-input {
    width: 36px;
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
  .border-width-input:focus { border-color: #4A9EFF; }
  .border-width-input::-webkit-inner-spin-button,
  .border-width-input::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .border-unit {
    font-size: 10px;
    color: #888;
    flex-shrink: 0;
  }

  /* Side dropdown */
  .side-dropdown-wrap {
    position: relative;
    flex-shrink: 0;
  }
  .side-trigger {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 22px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.06);
    color: #999;
    cursor: pointer;
    padding: 0;
  }
  .side-trigger:hover {
    color: #ccc;
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.25);
  }
  .side-trigger-icon {
    display: flex;
    align-items: center;
  }

  .side-dropdown {
    position: absolute;
    right: 0;
    top: calc(100% + 4px);
    background: rgba(30, 30, 30, 0.98);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 6px;
    padding: 4px;
    z-index: 100;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    min-width: 120px;
  }
  .side-option {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 5px 8px;
    border: none;
    border-radius: 4px;
    background: none;
    color: #ccc;
    font-family: inherit;
    font-size: 11px;
    cursor: pointer;
    white-space: nowrap;
  }
  .side-option:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
  }
  .side-option.selected {
    color: #fff;
  }
  .side-check {
    width: 12px;
    font-size: 10px;
    color: #4A9EFF;
    text-align: center;
  }
  .side-icon {
    display: flex;
    align-items: center;
    color: inherit;
  }
  .side-label {
    flex: 1;
  }
</style>
