<script>
  import { createEventDispatcher } from 'svelte';
  import { rgbToHex } from '../lib/utils.js';

  export let property;
  export let value = '#000000';
  export let label = '';

  const dispatch = createEventDispatcher();

  // Normalize incoming value to hex
  $: hexValue = rgbToHex(value);

  let textValue = '';
  $: textValue = hexValue;

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
    const v = e.target.value.trim();
    textValue = v;
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      dispatch('input', { property, value: v });
    }
  }

  function onTextChange(e) {
    const v = e.target.value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      dispatch('change', { property, value: v });
    }
  }
</script>

<div class="polish-control-row">
  <label class="polish-control-label">{label}</label>
  <div class="polish-control-inputs">
    <input
      type="color"
      class="polish-color-picker"
      data-property={property}
      value={hexValue}
      on:input={onPickerInput}
      on:change={onPickerChange}
    />
    <input
      type="text"
      class="polish-hex-input"
      data-property={property}
      placeholder="#000000"
      maxlength="7"
      value={textValue}
      on:input={onTextInput}
      on:change={onTextChange}
    />
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
  .polish-color-picker {
    width: 28px;
    height: 22px;
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
</style>
