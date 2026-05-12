<script>
  import { rgbToHex } from '../lib/utils.js';
  import PickrSwatch from './PickrSwatch.svelte';

  let { property, value = '#000000', label = '', oninput, onchange } = $props();

  const HEX_RE = /^#[0-9a-fA-F]{6}$/;

  let isTransparent = $derived(rgbToHex(value) === 'transparent');
  let hexValue = $derived(isTransparent ? '#000000' : rgbToHex(value));

  // Remember last color so toggle can restore it
  let lastHexValue = '#000000';
  $effect(() => {
    if (!isTransparent) lastHexValue = hexValue;
  });

  let swatchColor = $state('#000000');
  $effect(() => {
    swatchColor = hexValue;
  });

  let textValue = $state('');
  $effect(() => {
    textValue = isTransparent ? 'transparent' : hexValue;
  });

  function onPickrInput({ value: nextColor }) {
    swatchColor = nextColor;
    textValue = nextColor;
    oninput?.({ property, value: nextColor });
  }

  function onPickrChange({ value: nextColor }) {
    swatchColor = nextColor;
    textValue = nextColor;
    onchange?.({ property, value: nextColor });
  }

  function onTextInput(e) {
    if (isTransparent) return;
    const nextColor = e.target.value.trim();
    textValue = nextColor;
    if (HEX_RE.test(nextColor)) {
      swatchColor = nextColor;
      oninput?.({ property, value: nextColor });
    }
  }

  function onTextChange(e) {
    if (isTransparent) return;
    const nextColor = e.target.value.trim();
    if (HEX_RE.test(nextColor)) {
      swatchColor = nextColor;
      onchange?.({ property, value: nextColor });
    }
  }

  function toggleTransparent() {
    onchange?.({ property, value: isTransparent ? lastHexValue : 'transparent' });
  }
</script>

<div class="polish-control-row">
  <label class="polish-control-label">{label}</label>
  <div class="polish-control-inputs">
    <PickrSwatch
      color={swatchColor}
      showTransparent={true}
      {isTransparent}
      oninput={onPickrInput}
      onchange={onPickrChange}
      ontransparent={toggleTransparent}
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
      oninput={onTextInput}
      onchange={onTextChange}
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
