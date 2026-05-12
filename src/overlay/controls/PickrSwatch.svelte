<script module>
  let cssInjected = false;
</script>

<script>
  import { onMount, onDestroy } from 'svelte';
  import Pickr from '@simonwep/pickr';
  import pickrBaseCSS from '@simonwep/pickr/dist/themes/nano.min.css?inline';
  import { PICKR_DARK_OVERRIDES } from './pickrTheme.js';

  let { color = '#000000', showTransparent = false, isTransparent = false, oninput, onchange, ontransparent } = $props();
  const COMMIT_DELAY_MS = 300;

  let pickerOpen = $state(false);
  let pickrInstance = null;
  let transparentBtn = null;
  let wrapEl;
  let pickrEl;
  let updatingFromProp = false;
  let commitTimer;


  function pickrColorToHex(c) {
    return '#' + c.toHEXA().slice(0, 3).join('');
  }

  function injectPickrStyles() {
    if (cssInjected) return;
    const root = wrapEl.getRootNode();
    const style = document.createElement('style');
    style.textContent = pickrBaseCSS + PICKR_DARK_OVERRIDES;
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
      ontransparent?.();
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
      oninput?.({ value: hex });

      clearTimeout(commitTimer);
      commitTimer = setTimeout(() => {
        onchange?.({ value: hex });
      }, COMMIT_DELAY_MS);
    });

    pickrInstance.on('changestop', (_, inst) => {
      if (updatingFromProp) return;
      clearTimeout(commitTimer);
      const hex = pickrColorToHex(inst.getColor());
      onchange?.({ value: hex });
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
  $effect(() => {
    if (pickrInstance && color) {
      updatingFromProp = true;
      try { pickrInstance.setColor(color); } catch (_) {}
      updatingFromProp = false;
    }
  });

  // Sync transparent toggle button state
  $effect(() => {
    if (transparentBtn) {
      transparentBtn.className = 'pcr-no-color' + (isTransparent ? ' active' : '');
      transparentBtn.title = isTransparent ? 'Add color' : 'Set transparent';
    }
  });

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
  <div class="pickr-swatch" class:transparent={isTransparent} onclick={togglePicker}>
    <div class="swatch-fill" style="background-color: {isTransparent ? 'transparent' : color}"></div>
  </div>

  <div class="pickr-inline" class:open={pickerOpen}>
    <div bind:this={pickrEl}></div>
  </div>
</div>

<style>
  .pickr-wrap {
    flex-shrink: 0;
    position: relative;
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
    position: absolute;
    top: 0;
    left: calc(100% + 6px);
    z-index: 200;
  }
  .pickr-inline.open {
    display: block;
  }
</style>
