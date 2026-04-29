<script>
  import { createEventDispatcher } from 'svelte';
  import { rgbToHex } from '../lib/utils.js';
  import PickrSwatch from './PickrSwatch.svelte';

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

  function onPickrInput(e) {
    const v = e.detail.value;
    textValue = v;
    dispatch('input', { property, value: v });
  }

  function onPickrChange(e) {
    const v = e.detail.value;
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
    <PickrSwatch
      color={hexValue}
      showTransparent={true}
      {isTransparent}
      on:input={onPickrInput}
      on:change={onPickrChange}
      on:transparent={toggleTransparent}
    />
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
</style>
