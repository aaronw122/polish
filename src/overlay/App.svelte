<script>
  import { onMount, onDestroy } from 'svelte';
  import {
    active, hoveredElement, selectedElement,
    sourceData, panelVisible, shortcutHintShown,
  } from './stores/state.js';
  import {
    isPolishElement, formatLabel, describeElement,
    buildInfoHTML,
  } from './lib/utils.js';
  import { connect, send, setMessageHandler } from './lib/socket.js';
  import Panel from './Panel.svelte';

  // ── Overlay DOM refs ────────────────────────────────────────────
  let hoverBox, hoverLabel, selectBox, selectLabel, infoPanel;
  let badgeEl, shortcutHint;
  let panelComponent;

  // ── Shortcut hint ───────────────────────────────────────────────
  let hintVisible = false;
  let hintFading = false;

  // ── Position helpers ────────────────────────────────────────────
  function positionBox(box, label, rect) {
    if (!box || !label) return;
    box.style.display = 'block';
    box.style.top = rect.top + 'px';
    box.style.left = rect.left + 'px';
    box.style.width = rect.width + 'px';
    box.style.height = rect.height + 'px';

    label.style.display = 'block';
    const labelTop = rect.top - 20;
    if (labelTop < 2) {
      label.style.top = (rect.top + 2) + 'px';
    } else {
      label.style.top = labelTop + 'px';
    }
    label.style.left = rect.left + 'px';
  }

  function hideBox(box, label) {
    if (!box || !label) return;
    box.style.display = 'none';
    label.style.display = 'none';
  }

  function positionInfoPanel(rect) {
    if (!infoPanel) return;
    infoPanel.style.display = 'block';
    const panelHeight = 80;
    const gap = 8;

    let top = rect.bottom + gap;
    if (top + panelHeight > window.innerHeight) {
      top = rect.top - panelHeight - gap;
      if (top < 0) top = gap;
    }

    let left = rect.left;
    if (left + 320 > window.innerWidth) {
      left = window.innerWidth - 330;
    }
    if (left < 0) left = 4;

    infoPanel.style.top = top + 'px';
    infoPanel.style.left = left + 'px';
  }

  // ── Shortcut hint ───────────────────────────────────────────────
  function showShortcutHint() {
    if ($shortcutHintShown) return;
    $shortcutHintShown = true;
    hintVisible = true;
    hintFading = false;
    setTimeout(() => {
      hintFading = true;
      setTimeout(() => {
        hintVisible = false;
        hintFading = false;
      }, 500);
    }, 4000);
  }

  // ── Toggle overlay ──────────────────────────────────────────────
  function toggleOverlay() {
    $active = !$active;

    if ($active) {
      showShortcutHint();
    } else {
      hideBox(hoverBox, hoverLabel);
      hideBox(selectBox, selectLabel);
      if (infoPanel) infoPanel.style.display = 'none';
      $panelVisible = false;
      $selectedElement = null;
      $hoveredElement = null;
    }
  }

  // ── Selection ───────────────────────────────────────────────────
  function selectEl(el) {
    $selectedElement = el;
    const rect = el.getBoundingClientRect();

    if (selectLabel) selectLabel.textContent = formatLabel(el);
    positionBox(selectBox, selectLabel, rect);
    if (infoPanel) infoPanel.innerHTML = buildInfoHTML(el);
    positionInfoPanel(rect);

    $panelVisible = true;

    const { tag, id, classes } = describeElement(el);
    send({
      type: 'select',
      tag,
      id,
      classes,
      inlineStyles: el.getAttribute('style') || '',
      rect: {
        top: Math.round(rect.top),
        left: Math.round(rect.left),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    });
  }

  function deselectEl() {
    $selectedElement = null;
    hideBox(selectBox, selectLabel);
    if (infoPanel) infoPanel.style.display = 'none';
    $panelVisible = false;
    $sourceData = null;
    send({ type: 'deselect' });
  }

  // ── Event handlers ──────────────────────────────────────────────
  function onMouseMove(e) {
    if (!$active) return;
    const target = e.target;
    if (isPolishElement(target)) {
      hideBox(hoverBox, hoverLabel);
      $hoveredElement = null;
      return;
    }
    if (target === $hoveredElement) return;
    $hoveredElement = target;
    const rect = target.getBoundingClientRect();
    if (hoverLabel) hoverLabel.textContent = formatLabel(target);
    positionBox(hoverBox, hoverLabel, rect);
  }

  function onMouseOut(e) {
    if (!e.relatedTarget || e.relatedTarget === document) {
      hideBox(hoverBox, hoverLabel);
      $hoveredElement = null;
    }
  }

  function onClick(e) {
    if (!$active) return;
    const target = e.target;
    if (isPolishElement(target)) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    if ($selectedElement === target) {
      deselectEl();
      return;
    }
    selectEl(target);
  }

  function onKeyDown(e) {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modifier = isMac ? e.metaKey : e.ctrlKey;

    if (modifier && e.shiftKey && e.key === 'P') {
      e.preventDefault();
      e.stopPropagation();
      toggleOverlay();
    }

    if ($active && $selectedElement && e.key === 'Escape') {
      e.preventDefault();
      deselectEl();
    }

    // Tab / Shift+Tab: cycle to sibling elements
    if ($active && $selectedElement && e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      const parent = $selectedElement.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (c) => !isPolishElement(c) && c.nodeType === 1
        );
        const currentIdx = siblings.indexOf($selectedElement);
        if (currentIdx !== -1) {
          let nextIdx;
          if (e.shiftKey) {
            nextIdx = (currentIdx - 1 + siblings.length) % siblings.length;
          } else {
            nextIdx = (currentIdx + 1) % siblings.length;
          }
          selectEl(siblings[nextIdx]);
        }
      }
    }
  }

  function onScroll() {
    if ($hoveredElement && $active) {
      const rect = $hoveredElement.getBoundingClientRect();
      if (hoverLabel) hoverLabel.textContent = formatLabel($hoveredElement);
      positionBox(hoverBox, hoverLabel, rect);
    }
    if ($selectedElement) {
      const rect = $selectedElement.getBoundingClientRect();
      if (selectLabel) selectLabel.textContent = formatLabel($selectedElement);
      positionBox(selectBox, selectLabel, rect);
      positionInfoPanel(rect);
      if ($panelVisible && panelComponent) {
        panelComponent.reposition();
      }
    }
  }

  // ── WebSocket message handling ──────────────────────────────────
  function handleServerMessage(message) {
    switch (message.type) {
      case 'source':
        handleSourceMessage(message);
        break;
      case 'reload':
        handleReloadMessage(message);
        break;
    }
  }

  function handleSourceMessage(message) {
    const matchedRules = message.matchedRules || [];
    const cssFiles = message.cssFiles || [];

    let file = message.file;
    let selector = message.selector;

    // No-source fallback
    if (!selector && $selectedElement) {
      const desc = describeElement($selectedElement);
      if (desc.id) {
        selector = '#' + desc.id;
      } else if (desc.classes.length) {
        selector = '.' + desc.classes.join('.');
      } else {
        selector = desc.tag;
      }
      file = cssFiles[0] || 'polish-overrides.css';
    }

    $sourceData = {
      file,
      selector,
      line: message.line,
      properties: message.properties || {},
      cssFiles,
      matchedRules,
    };
  }

  function handleReloadMessage(message) {
    if (message.cssOnly && message.files) {
      reloadCSS(message.files);
    } else {
      location.reload();
    }
  }

  function reloadCSS(files) {
    const links = document.querySelectorAll('link[rel="stylesheet"]');
    for (const link of links) {
      const href = link.getAttribute('href');
      if (!href) continue;

      const shouldReload = files.some((f) => href.includes(f));
      if (!shouldReload) continue;

      const url = new URL(href, location.href);
      url.searchParams.set('_polish', Date.now());

      const newLink = link.cloneNode(false);
      newLink.href = url.toString();

      newLink.onload = () => {
        link.remove();
      };

      newLink.onerror = () => {
        newLink.remove();
      };

      link.parentNode.insertBefore(newLink, link.nextSibling);
    }
  }

  // ── Mac detection for hint ──────────────────────────────────────
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const modKey = isMac ? 'Cmd' : 'Ctrl';

  // ── Lifecycle ───────────────────────────────────────────────────
  onMount(() => {
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('mouseout', onMouseOut, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);

    setMessageHandler(handleServerMessage);
    connect();
    showShortcutHint();
  });

  onDestroy(() => {
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('mouseout', onMouseOut, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', onScroll);
  });
</script>

<!-- Hover overlay -->
<div class="polish-hover" bind:this={hoverBox}></div>
<div class="polish-hover-label" bind:this={hoverLabel}></div>

<!-- Select overlay -->
<div class="polish-select" bind:this={selectBox}></div>
<div class="polish-select-label" bind:this={selectLabel}></div>

<!-- Info panel -->
<div class="polish-info" bind:this={infoPanel}></div>

<!-- Badge -->
<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  class="polish-badge"
  class:active={$active}
  class:inactive={!$active}
  style="pointer-events: auto;"
  bind:this={badgeEl}
  on:click|stopPropagation={toggleOverlay}
>Polish</div>

<!-- Keyboard shortcut hint -->
{#if hintVisible}
  <div
    class="polish-shortcut-hint"
    class:fading={hintFading}
    bind:this={shortcutHint}
  >
    <strong>Shortcuts:</strong><br>
    {modKey}+Shift+P &mdash; Toggle overlay<br>
    Click &mdash; Select element<br>
    Esc &mdash; Deselect<br>
    Tab / Shift+Tab &mdash; Cycle siblings
  </div>
{/if}

<!-- Panel (when an element is selected) -->
{#if $panelVisible && $selectedElement}
  <Panel
    bind:this={panelComponent}
    element={$selectedElement}
    on:close={deselectEl}
  />
{/if}

<style>
  /* ── Overlay Boxes ─────────────────────────────────── */
  .polish-hover,
  .polish-select {
    position: fixed;
    pointer-events: none;
    box-sizing: border-box;
    border-radius: 2px;
    transition: all 0.05s ease-out;
    display: none;
  }
  .polish-hover {
    border: 2px solid rgba(59, 130, 246, 0.8);
    background: rgba(59, 130, 246, 0.05);
  }
  .polish-select {
    border: 2px solid rgba(234, 88, 12, 0.9);
    background: rgba(234, 88, 12, 0.05);
  }
  .polish-hover-label,
  .polish-select-label {
    position: fixed;
    pointer-events: none;
    font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace;
    font-size: 11px;
    line-height: 1;
    padding: 3px 6px;
    border-radius: 3px;
    white-space: nowrap;
    display: none;
    z-index: 1;
  }
  .polish-hover-label {
    background: rgba(59, 130, 246, 0.9);
    color: #fff;
  }
  .polish-select-label {
    background: rgba(234, 88, 12, 0.9);
    color: #fff;
  }

  /* ── Info Panel ──────────────────────────────────── */
  .polish-info {
    position: fixed;
    pointer-events: none;
    background: rgba(15, 15, 15, 0.92);
    color: #e5e5e5;
    font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace;
    font-size: 11px;
    line-height: 1.5;
    padding: 8px 10px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    max-width: 320px;
    display: none;
    z-index: 2;
    backdrop-filter: blur(8px);
  }
  /* Info panel child classes use :global because innerHTML is set dynamically */
  .polish-info :global(.tag) { color: #93c5fd; }
  .polish-info :global(.id) { color: #fbbf24; }
  .polish-info :global(.cls) { color: #86efac; }
  .polish-info :global(.dim) { color: #a5a5a5; }
  .polish-info :global(.sep) { color: #525252; margin: 0 4px; }
  .polish-info :global(.polish-breadcrumb) {
    font-size: 9px;
    color: #888;
    letter-spacing: 0.3px;
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: block;
    max-width: 300px;
    margin-bottom: 2px;
  }

  /* ── Badge ──────────────────────────────────────── */
  .polish-badge {
    position: fixed;
    bottom: 12px;
    right: 12px;
    font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace;
    font-size: 11px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 4px;
    cursor: pointer;
    user-select: none;
    z-index: 3;
    transition: opacity 0.2s, background 0.2s;
  }
  .polish-badge.active {
    background: rgba(234, 88, 12, 0.9);
    color: #fff;
    opacity: 1;
  }
  .polish-badge.inactive {
    background: rgba(60, 60, 60, 0.7);
    color: #888;
    opacity: 0.6;
  }

  /* ── Shortcut Hint ─────────────────────────────── */
  .polish-shortcut-hint {
    position: fixed;
    bottom: 40px;
    right: 12px;
    background: rgba(15, 15, 15, 0.92);
    color: #ccc;
    font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace;
    font-size: 10px;
    line-height: 1.6;
    padding: 8px 12px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(8px);
    z-index: 4;
    pointer-events: none;
    transition: opacity 0.5s ease;
  }
  .polish-shortcut-hint.fading {
    opacity: 0;
  }
  .polish-shortcut-hint :global(strong) {
    color: #fff;
  }

  /* ── Host reset ──────────────────────────────────── */
  :host {
    all: initial;
  }
</style>
