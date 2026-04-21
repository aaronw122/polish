<script>
  import { createEventDispatcher } from 'svelte';
  import { formatSpacingValue } from '../lib/utils.js';

  export let values = {};
  export let uniformMode = false;

  const dispatch = createEventDispatcher();

  const SIDES = ['top', 'right', 'bottom', 'left'];

  function getVal(prefix, side) {
    return values[`${prefix}-${side}`] || '0';
  }

  function onInput(e, prop) {
    const fullVal = formatSpacingValue(e.target.value);
    dispatch('input', { property: prop, value: fullVal, raw: e.target.value });

    if (uniformMode) {
      const prefix = prop.startsWith('margin') ? 'margin' : 'padding';
      SIDES.forEach(side => {
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
      SIDES.forEach(side => {
        const sibProp = `${prefix}-${side}`;
        if (sibProp !== prop) {
          dispatch('change', { property: sibProp, value: fullVal });
        }
      });
    }
  }
</script>

<div class="polish-box-model">
  <div class="polish-box-margin">
    <span class="polish-box-label">margin</span>
    {#each SIDES as side}
      <input
        class="polish-box-value {side}"
        data-property="margin-{side}"
        value={getVal('margin', side)}
        on:input={(e) => onInput(e, `margin-${side}`)}
        on:change={(e) => onChange(e, `margin-${side}`)}
      />
    {/each}
    <div class="polish-box-border">
      <span class="polish-box-label">border</span>
      <div class="polish-box-padding">
        <span class="polish-box-label">padding</span>
        {#each SIDES as side}
          <input
            class="polish-box-value {side}"
            data-property="padding-{side}"
            value={getVal('padding', side)}
            on:input={(e) => onInput(e, `padding-${side}`)}
            on:change={(e) => onChange(e, `padding-${side}`)}
          />
        {/each}
        <div class="polish-box-content">
          <span class="polish-box-label dim">content</span>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .polish-box-model {
    width: 100%;
  }
  .polish-box-margin,
  .polish-box-border,
  .polish-box-padding {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 14px 24px;
    border-radius: 3px;
  }
  .polish-box-margin {
    background: rgba(251, 191, 36, 0.08);
    border: 1px dashed rgba(251, 191, 36, 0.3);
  }
  .polish-box-border {
    width: 100%;
    background: rgba(148, 163, 184, 0.08);
    border: 1px dashed rgba(148, 163, 184, 0.3);
  }
  .polish-box-padding {
    width: 100%;
    background: rgba(134, 239, 172, 0.08);
    border: 1px dashed rgba(134, 239, 172, 0.3);
  }
  .polish-box-content {
    width: 100%;
    height: 24px;
    background: rgba(147, 197, 253, 0.1);
    border: 1px dashed rgba(147, 197, 253, 0.3);
    border-radius: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .polish-box-label {
    position: absolute;
    top: 1px;
    left: 4px;
    font-size: 8px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #777;
  }
  .polish-box-label.dim {
    position: static;
    color: #666;
  }
  .polish-box-value {
    position: absolute;
    width: 30px;
    text-align: center;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 2px;
    color: #ccc;
    font-family: inherit;
    font-size: 10px;
    padding: 1px 2px;
    outline: none;
  }
  .polish-box-value:focus {
    border-color: #4A9EFF;
    background: rgba(74, 158, 255, 0.1);
  }
  .polish-box-value.top { top: 14px; left: 50%; transform: translateX(-50%); }
  .polish-box-value.right { right: 2px; top: 50%; transform: translateY(-50%); }
  .polish-box-value.bottom { bottom: 2px; left: 50%; transform: translateX(-50%); }
  .polish-box-value.left { left: 2px; top: 50%; transform: translateY(-50%); }
</style>
