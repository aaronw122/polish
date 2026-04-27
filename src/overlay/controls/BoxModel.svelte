<script>
  import { createEventDispatcher } from 'svelte';
  import { formatSpacingValue } from '../lib/utils.js';

  export let values = {};
  export let uniformMode = false;

  const dispatch = createEventDispatcher();

  function getVal(prefix, side) {
    return values[`${prefix}-${side}`] || '0';
  }

  function onInput(e, prop) {
    const fullVal = formatSpacingValue(e.target.value);
    dispatch('input', { property: prop, value: fullVal, raw: e.target.value });

    if (uniformMode) {
      const prefix = prop.startsWith('margin') ? 'margin' : 'padding';
      ['top', 'right', 'bottom', 'left'].forEach(side => {
        const sibProp = `${prefix}-${side}`;
        if (sibProp !== prop) {
          dispatch('input', { property: sibProp, value: fullVal, raw: e.target.value });
        }
      });
    }
  }

  function onChange(e, prop) {
    const fullVal = formatSpacingValue(e.target.value);
    dispatch('change', { property: prop, value: fullVal });

    if (uniformMode) {
      const prefix = prop.startsWith('margin') ? 'margin' : 'padding';
      ['top', 'right', 'bottom', 'left'].forEach(side => {
        const sibProp = `${prefix}-${side}`;
        if (sibProp !== prop) {
          dispatch('change', { property: sibProp, value: fullVal });
        }
      });
    }
  }
</script>

<div class="box-model">
  <!-- Margin layer -->
  <div class="layer margin-layer">
    <span class="layer-label">margin</span>
    <div class="side top">
      <input value={getVal('margin','top')} on:input={(e) => onInput(e,'margin-top')} on:change={(e) => onChange(e,'margin-top')} />
    </div>
    <div class="side left">
      <input value={getVal('margin','left')} on:input={(e) => onInput(e,'margin-left')} on:change={(e) => onChange(e,'margin-left')} />
    </div>
    <div class="inner">
      <!-- Border layer -->
      <div class="layer border-layer">
        <span class="layer-label">border</span>
        <div class="side top">
          <input value={getVal('border','top') || '0'} readonly tabindex="-1" />
        </div>
        <div class="side left">
          <input value={getVal('border','left') || '0'} readonly tabindex="-1" />
        </div>
        <div class="inner">
          <!-- Padding layer -->
          <div class="layer padding-layer">
            <span class="layer-label">padding</span>
            <div class="side top">
              <input value={getVal('padding','top')} on:input={(e) => onInput(e,'padding-top')} on:change={(e) => onChange(e,'padding-top')} />
            </div>
            <div class="side left">
              <input value={getVal('padding','left')} on:input={(e) => onInput(e,'padding-left')} on:change={(e) => onChange(e,'padding-left')} />
            </div>
            <div class="inner">
              <div class="content-box">content</div>
            </div>
            <div class="side right">
              <input value={getVal('padding','right')} on:input={(e) => onInput(e,'padding-right')} on:change={(e) => onChange(e,'padding-right')} />
            </div>
            <div class="side bottom">
              <input value={getVal('padding','bottom')} on:input={(e) => onInput(e,'padding-bottom')} on:change={(e) => onChange(e,'padding-bottom')} />
            </div>
          </div>
        </div>
        <div class="side right">
          <input value={getVal('border','right') || '0'} readonly tabindex="-1" />
        </div>
        <div class="side bottom">
          <input value={getVal('border','bottom') || '0'} readonly tabindex="-1" />
        </div>
      </div>
    </div>
    <div class="side right">
      <input value={getVal('margin','right')} on:input={(e) => onInput(e,'margin-right')} on:change={(e) => onChange(e,'margin-right')} />
    </div>
    <div class="side bottom">
      <input value={getVal('margin','bottom')} on:input={(e) => onInput(e,'margin-bottom')} on:change={(e) => onChange(e,'margin-bottom')} />
    </div>
  </div>
</div>

<style>
  .box-model {
    width: 100%;
    font-size: 10px;
  }

  .layer {
    display: grid;
    grid-template-columns: auto 1fr auto;
    grid-template-rows: auto 1fr auto;
    align-items: center;
    justify-items: center;
    border: 1px dashed;
    position: relative;
  }

  .margin-layer {
    background: rgba(251, 191, 36, 0.12);
    border-color: rgba(251, 191, 36, 0.4);
  }
  .border-layer {
    background: rgba(148, 163, 184, 0.12);
    border-color: rgba(148, 163, 184, 0.4);
  }
  .padding-layer {
    background: rgba(134, 239, 172, 0.12);
    border-color: rgba(134, 239, 172, 0.4);
  }

  .layer-label {
    position: absolute;
    top: 1px;
    left: 4px;
    font-size: 8px;
    color: #888;
  }

  .side {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    min-height: 16px;
  }

  .side.top { grid-column: 2; grid-row: 1; padding: 2px 0; }
  .side.left { grid-column: 1; grid-row: 2; padding: 0 4px; }
  .side.right { grid-column: 3; grid-row: 2; padding: 0 4px; }
  .side.bottom { grid-column: 2; grid-row: 3; padding: 2px 0; }

  .inner {
    grid-column: 2;
    grid-row: 2;
    width: 100%;
  }

  .content-box {
    text-align: center;
    padding: 4px 8px;
    background: rgba(147, 197, 253, 0.12);
    border: 1px dashed rgba(147, 197, 253, 0.4);
    color: #888;
    font-size: 9px;
  }

  input {
    width: 28px;
    text-align: center;
    background: transparent;
    border: none;
    color: #ccc;
    font-family: inherit;
    font-size: 10px;
    padding: 0;
    outline: none;
  }
  input:focus {
    background: rgba(74, 158, 255, 0.15);
    border-radius: 2px;
  }
  input[readonly] {
    color: #777;
    cursor: default;
  }
</style>
