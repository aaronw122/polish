<script>
  import { createEventDispatcher } from 'svelte';
  import { rgbToHex } from '../lib/utils.js';

  export let property;
  export let value = '#000000';
  export let label = '';

  const dispatch = createEventDispatcher();

  $: isTransparent = rgbToHex(value) === 'transparent';
  $: hexValue = isTransparent ? '#000000' : rgbToHex(value);

  // Remember last color so toggle can restore it
  let lastHexValue = '#000000';
  $: if (!isTransparent) lastHexValue = hexValue;

  let textValue = '';
  $: textValue = isTransparent ? 'transparent' : hexValue;

  function onPickerInput(e) {
    const v = e.target.value;
    textValue = v;
    dispatch('input', { property, value: v });
  }

  function onPickerChange(e) {
    const v = e.target.value;
    textValue = v;
    dispatch('change', { property, value: v });
  }

  function onTextInput(e) {
    if (isTransparent) return;
    const v = e.target.value.trim();
    textValue = v;
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      dispatch('input', { property, value: v });
    }
  }

  function onTextChange(e) {
    if (isTransparent) return;
    const v = e.target.value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      dispatch('change', { property, value: v });
    }
  }

  function toggleTransparent() {
    dispatch('change', { property, value: isTransparent ? lastHexValue : 'transparent' });
  }
</script>

<div class="polish-control-row">
  <label class="polish-control-label">{label}</label>
  <div class="polish-control-inputs">
    <div class="polish-swatch" class:transparent={isTransparent}>
      <input
        type="color"
        class="polish-color-picker"
        data-property={property}
        value={hexValue}
        on:input={onPickerInput}
        on:change={onPickerChange}
      />
    </div>
    <input
      type="text"
      class="polish-hex-input"
      class:dimmed={isTransparent}
      data-property={property}
      placeholder="#000000"
      maxlength="7"
      value={textValue}
      readonly={isTransparent}
      on:input={onTextInput}
      on:change={onTextChange}
    />
    <button
      class="polish-no-color-btn"
      class:active={isTransparent}
      title={isTransparent ? 'Add color' : 'Set transparent'}
      on:click={toggleTransparent}
    ></button>
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
  .polish-swatch {
    position: relative;
    width: 28px;
    height: 22px;
    flex-shrink: 0;
    border-radius: 3px;
    overflow: hidden;
  }
  .polish-swatch.transparent::after {
    content: '';
    position: absolute;
    inset: 0;
    background: repeating-conic-gradient(#555 0% 25%, #333 0% 50%) 50% / 8px 8px;
    border-radius: 3px;
    pointer-events: none;
  }
  .polish-color-picker {
    width: 100%;
    height: 100%;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 3px;
    padding: 0;
    cursor: pointer;
    background: none;
    -webkit-appearance: none;
  }
  .polish-color-picker::-webkit-color-swatch-wrapper {
    padding: 1px;
  }
  .polish-color-picker::-webkit-color-swatch {
    border: none;
    border-radius: 2px;
  }
  .polish-hex-input {
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
  .polish-hex-input:focus {
    border-color: #4A9EFF;
  }
  .polish-hex-input.dimmed {
    color: #666;
    font-style: italic;
  }
  .polish-no-color-btn {
    width: 22px;
    height: 22px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.06);
    cursor: pointer;
    position: relative;
    padding: 0;
    flex-shrink: 0;
  }
  .polish-no-color-btn::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 50%;
    width: 1.5px;
    height: 14px;
    background: #e55;
    transform: translateX(-50%) rotate(45deg);
  }
  .polish-no-color-btn.active {
    border-color: rgba(74, 158, 255, 0.5);
    background: rgba(74, 158, 255, 0.1);
  }
</style>
