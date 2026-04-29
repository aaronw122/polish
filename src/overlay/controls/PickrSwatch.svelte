<script context="module">
  // Shared across all PickrSwatch instances — inject CSS only once per shadow root
  let cssInjected = false;
</script>

<script>
  import { createEventDispatcher, onMount, onDestroy, tick } from 'svelte';
  import Pickr from '@simonwep/pickr';
  import pickrBaseCSS from '@simonwep/pickr/dist/themes/monolith.min.css?inline';

  export let color = '#000000';
  export let showTransparent = false;
  export let isTransparent = false;

  const dispatch = createEventDispatcher();

  let pickerOpen = false;
  let pickrInstance = null;
  let pickrEl;
  let wrapEl;
  let updatingFromProp = false;
  let commitTimer;

  const DARK_OVERRIDES = `
    .pcr-app[data-theme="monolith"] {
      background: rgba(30, 30, 30, 0.98);
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
      padding: 8px;
      width: 100%;
      max-width: 260px;
      font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace;
    }
    .pcr-app[data-theme="monolith"] .pcr-selection {
      display: grid;
      gap: 6px;
    }
    .pcr-app[data-theme="monolith"] .pcr-selection .pcr-color-chooser,
    .pcr-app[data-theme="monolith"] .pcr-selection .pcr-color-opacity {
      margin: 0;
    }
    .pcr-app[data-theme="monolith"] .pcr-selection .pcr-color-chooser .pcr-slider,
    .pcr-app[data-theme="monolith"] .pcr-selection .pcr-color-opacity .pcr-slider {
      border-radius: 4px;
    }
    .pcr-app[data-theme="monolith"] .pcr-selection .pcr-color-preview {
      margin: 0;
    }
    .pcr-app[data-theme="monolith"] .pcr-selection .pcr-color-preview .pcr-current-color {
      border-radius: 4px;
    }
    .pcr-app[data-theme="monolith"] .pcr-interaction {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 0;
      margin-top: 2px;
    }
    .pcr-app[data-theme="monolith"] .pcr-interaction input.pcr-result {
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
    .pcr-app[data-theme="monolith"] .pcr-interaction input.pcr-result:focus {
      border-color: #4A9EFF;
    }
    .pcr-app[data-theme="monolith"] .pcr-interaction .pcr-type {
      display: none;
    }
    .pcr-app[data-theme="monolith"] .pcr-interaction .pcr-save,
    .pcr-app[data-theme="monolith"] .pcr-interaction .pcr-cancel,
    .pcr-app[data-theme="monolith"] .pcr-interaction .pcr-clear {
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

  function injectCSS() {
    if (cssInjected) return;
    const root = pickrEl.getRootNode();
    const style = document.createElement('style');
    style.textContent = pickrBaseCSS + DARK_OVERRIDES;
    if (root !== document) {
      root.appendChild(style);
    } else {
      document.head.appendChild(style);
    }
    cssInjected = true;
  }

  function togglePicker() {
    pickerOpen = !pickerOpen;
    if (pickerOpen && !pickrInstance) {
      tick().then(createPickr);
    }
  }

  function createPickr() {
    if (!pickrEl || pickrInstance) return;
    injectCSS();

    pickrInstance = Pickr.create({
      el: pickrEl,
      theme: 'monolith',
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

    // Inject transparent toggle into interaction area
    if (showTransparent) {
      try {
        const root = pickrInstance.getRoot();
        const interaction = root.interaction;
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'pcr-no-color' + (isTransparent ? ' active' : '');
        toggleBtn.title = isTransparent ? 'Add color' : 'Set transparent';
        toggleBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          dispatch('transparent');
          pickerOpen = false;
        });
        // Insert after the result input
        if (interaction.result) {
          interaction.result.insertAdjacentElement('afterend', toggleBtn);
        }
        // Store reference so we can update it
        pickrInstance._transparentBtn = toggleBtn;
      } catch (e) {
        // Fallback: transparent toggle won't be inside pickr
      }
    }

    pickrInstance.on('change', (c) => {
      if (updatingFromProp) return;
      const hex = '#' + c.toHEXA().slice(0, 3).join('');
      dispatch('input', { value: hex });

      clearTimeout(commitTimer);
      commitTimer = setTimeout(() => {
        dispatch('change', { value: hex });
      }, 300);
    });

    pickrInstance.on('changestop', (_, inst) => {
      clearTimeout(commitTimer);
      const c = inst.getColor();
      const hex = '#' + c.toHEXA().slice(0, 3).join('');
      dispatch('change', { value: hex });
    });
  }

  // Update pickr color when prop changes
  $: if (pickrInstance && color) {
    updatingFromProp = true;
    try { pickrInstance.setColor(color); } catch (e) {}
    updatingFromProp = false;
  }

  // Update transparent toggle button state
  $: if (pickrInstance && pickrInstance._transparentBtn) {
    const btn = pickrInstance._transparentBtn;
    btn.className = 'pcr-no-color' + (isTransparent ? ' active' : '');
    btn.title = isTransparent ? 'Add color' : 'Set transparent';
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
      try { pickrInstance.destroyAndRemove(); } catch (e) {}
      pickrInstance = null;
    }
  });
</script>

<div class="pickr-wrap" bind:this={wrapEl}>
  <div class="pickr-swatch" class:transparent={isTransparent} on:click={togglePicker}>
    <div class="swatch-fill" style="background-color: {isTransparent ? 'transparent' : color}"></div>
  </div>

  <div class="pickr-popup" class:open={pickerOpen}>
    <div bind:this={pickrEl}></div>
  </div>
</div>

<style>
  .pickr-wrap {
    position: relative;
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
  .pickr-popup {
    display: none;
    position: absolute;
    left: 0;
    top: calc(100% + 4px);
    z-index: 200;
    width: 260px;
  }
  .pickr-popup.open {
    display: block;
  }
</style>
