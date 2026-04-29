<script context="module">
  let cssInjected = false;
</script>

<script>
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import Pickr from '@simonwep/pickr';
  import pickrBaseCSS from '@simonwep/pickr/dist/themes/nano.min.css?inline';

  export let color = '#000000';
  export let showTransparent = false;
  export let isTransparent = false;

  const dispatch = createEventDispatcher();
  const COMMIT_DELAY_MS = 300;

  let pickerOpen = false;
  let pickrInstance = null;
  let transparentBtn = null;
  let wrapEl;
  let pickrEl;
  let updatingFromProp = false;
  let commitTimer;

  const DARK_OVERRIDES = `
    .pcr-button {
      display: none !important;
    }
    .pcr-app[data-theme="nano"] {
      background: rgba(30, 30, 30, 0.98);
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
      padding: 8px;
      width: 100%;
      font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace;
    }
    .pcr-app[data-theme="nano"] .pcr-selection {
      display: grid;
      gap: 6px;
    }
    .pcr-app[data-theme="nano"] .pcr-selection .pcr-color-preview {
      margin: 0;
    }
    .pcr-app[data-theme="nano"] .pcr-selection .pcr-color-preview .pcr-current-color {
      border-radius: 4px;
    }
    .pcr-app[data-theme="nano"] .pcr-selection .pcr-color-chooser,
    .pcr-app[data-theme="nano"] .pcr-selection .pcr-color-opacity {
      margin: 0;
    }
    .pcr-app[data-theme="nano"] .pcr-selection .pcr-color-chooser .pcr-slider,
    .pcr-app[data-theme="nano"] .pcr-selection .pcr-color-opacity .pcr-slider {
      border-radius: 4px;
    }
    .pcr-app[data-theme="nano"] .pcr-interaction {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 0;
      margin-top: 2px;
    }
    .pcr-app[data-theme="nano"] .pcr-interaction input.pcr-result {
      flex: 1;
      min-width: 0;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #e0e0e0;
      border-radius: 3px;
      font-family: inherit;
      font-size: 11px;
      padding: 4px 6px;
      height: auto;
      margin: 0;
      box-shadow: none;
    }
    .pcr-app[data-theme="nano"] .pcr-interaction input.pcr-result:focus {
      border-color: #4A9EFF;
    }
    .pcr-app[data-theme="nano"] .pcr-interaction .pcr-type {
      display: none;
    }
    .pcr-app[data-theme="nano"] .pcr-interaction .pcr-save,
    .pcr-app[data-theme="nano"] .pcr-interaction .pcr-cancel,
    .pcr-app[data-theme="nano"] .pcr-interaction .pcr-clear {
      display: none;
    }
    .pcr-no-color {
      width: 24px;
      height: 24px;
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 3px;
      background: rgba(255, 255, 255, 0.06);
      cursor: pointer;
      position: relative;
      padding: 0;
      flex-shrink: 0;
    }
    .pcr-no-color:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.25);
    }
    .pcr-no-color::after {
      content: '';
      position: absolute;
      top: 3px;
      left: 50%;
      width: 1.5px;
      height: 16px;
      background: #e55;
      transform: translateX(-50%) rotate(45deg);
    }
    .pcr-no-color.active {
      border-color: rgba(74, 158, 255, 0.5);
      background: rgba(74, 158, 255, 0.1);
    }
  `;

  function pickrColorToHex(c) {
    return '#' + c.toHEXA().slice(0, 3).join('');
  }

  function injectPickrStyles() {
    if (cssInjected) return;
    const root = wrapEl.getRootNode();
    const style = document.createElement('style');
    style.textContent = pickrBaseCSS + DARK_OVERRIDES;
    root.appendChild(style);
    cssInjected = true;
  }

  function createTransparentToggle() {
    if (!showTransparent) return;
    const root = pickrInstance.getRoot();
    const btn = document.createElement('button');
    btn.className = 'pcr-no-color' + (isTransparent ? ' active' : '');
    btn.title = isTransparent ? 'Add color' : 'Set transparent';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      dispatch('transparent');
      pickerOpen = false;
    });
    if (root.interaction.result) {
      root.interaction.result.insertAdjacentElement('afterend', btn);
    }
    transparentBtn = btn;
  }

  function wirePickrEvents() {
    pickrInstance.on('change', (c) => {
      if (updatingFromProp) return;
      const hex = pickrColorToHex(c);
      dispatch('input', { value: hex });

      clearTimeout(commitTimer);
      commitTimer = setTimeout(() => {
        dispatch('change', { value: hex });
      }, COMMIT_DELAY_MS);
    });

    pickrInstance.on('changestop', (_, inst) => {
      clearTimeout(commitTimer);
      const hex = pickrColorToHex(inst.getColor());
      dispatch('change', { value: hex });
    });
  }

  function togglePicker() {
    pickerOpen = !pickerOpen;
    if (pickerOpen && !pickrInstance) {
      createPickr();
    }
  }

  function createPickr() {
    if (!pickrEl || pickrInstance) return;
    injectPickrStyles();

    pickrInstance = Pickr.create({
      el: pickrEl,
      theme: 'nano',
      container: pickrEl.parentElement,
      inline: true,
      showAlways: true,
      default: color || '#000000',
      comparison: false,
      components: {
        preview: true,
        opacity: false,
        hue: true,
        interaction: {
          hex: true,
          input: true,
          save: false,
          clear: false,
          cancel: false,
        }
      }
    });

    createTransparentToggle();
    wirePickrEvents();
  }

  // Sync pickr color when prop changes externally
  $: if (pickrInstance && color) {
    updatingFromProp = true;
    try { pickrInstance.setColor(color); } catch (_) {}
    updatingFromProp = false;
  }

  // Sync transparent toggle button state
  $: if (transparentBtn) {
    transparentBtn.className = 'pcr-no-color' + (isTransparent ? ' active' : '');
    transparentBtn.title = isTransparent ? 'Add color' : 'Set transparent';
  }

  function handleClickOutside(e) {
    if (pickerOpen && wrapEl && !wrapEl.contains(e.target)) {
      pickerOpen = false;
    }
  }

  onMount(() => {
    const root = wrapEl?.getRootNode() || document;
    root.addEventListener('mousedown', handleClickOutside, true);
  });

  onDestroy(() => {
    clearTimeout(commitTimer);
    const root = wrapEl?.getRootNode() || document;
    root.removeEventListener('mousedown', handleClickOutside, true);
    if (pickrInstance) {
      try { pickrInstance.destroyAndRemove(); } catch (_) {}
      pickrInstance = null;
    }
    transparentBtn = null;
  });
</script>

<div class="pickr-wrap" bind:this={wrapEl}>
  <div class="pickr-swatch" class:transparent={isTransparent} on:click={togglePicker}>
    <div class="swatch-fill" style="background-color: {isTransparent ? 'transparent' : color}"></div>
  </div>

  <div class="pickr-inline" class:open={pickerOpen}>
    <div bind:this={pickrEl}></div>
  </div>
</div>

<style>
  .pickr-wrap {
    flex-shrink: 0;
  }
  .pickr-swatch {
    width: 28px;
    height: 22px;
    border-radius: 3px;
    overflow: hidden;
    cursor: pointer;
    border: 1px solid rgba(255, 255, 255, 0.15);
    position: relative;
  }
  .pickr-swatch.transparent::after {
    content: '';
    position: absolute;
    inset: 0;
    background: repeating-conic-gradient(#555 0% 25%, #333 0% 50%) 50% / 8px 8px;
    border-radius: 2px;
    pointer-events: none;
  }
  .swatch-fill {
    width: 100%;
    height: 100%;
    border-radius: 2px;
  }
  .pickr-inline {
    display: none;
    margin-top: 6px;
  }
  .pickr-inline.open {
    display: block;
  }
</style>
