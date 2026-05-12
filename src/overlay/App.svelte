<script>
  import { onDestroy } from 'svelte';
  import {
    active, hoveredElement, selectedElement,
    sourceData, panelVisible, shortcutHintShown,
  } from './stores/state.js';
  import {
    isPolishElement, formatLabel, describeElement,
    buildInfoHTML, isOverlayToggleShortcut,
  } from './lib/utils.js';
  import { connect, send, setMessageHandler } from './lib/socket.js';
  import Panel from './Panel.svelte';

  // ── Fallback selector builder ───────────────────────────────────
  // When the resolver finds no matching CSS rule, build a reasonable
  // selector using the element and its nearest classed/id'd ancestor.

  function buildFallbackSelector(el) {
    const desc = describeElement(el);
    let selfPart;
    if (desc.id) {
      selfPart = '#' + desc.id;
    } else if (desc.classes.length) {
      // Use only simple class names (skip Tailwind bracket notation like min-[481px])
      const simpleClasses = desc.classes.filter(c => /^[\w-]+$/.test(c));
      selfPart = simpleClasses.length ? desc.tag + '.' + simpleClasses.join('.') : desc.tag;
    } else {
      selfPart = desc.tag;
    }

    // Walk up to find a parent with a class or id for context
    let parent = el.parentElement;
    while (parent && parent !== document.body && parent !== document.documentElement) {
      if (parent.id) return '#' + parent.id + ' ' + selfPart;
      if (parent.classList.length > 0) {
        const parentClasses = Array.from(parent.classList).filter(c => /^[\w-]+$/.test(c));
        if (parentClasses.length) return '.' + parentClasses.join('.') + ' ' + selfPart;
      }
      parent = parent.parentElement;
    }

    return selfPart;
  }

  // Detect compiled/hashed CSS filenames (e.g., index-DueiILQr.css)
  function isCompiledCss(filePath) {
    if (!filePath) return false;
    const basename = filePath.split('/').pop();
    return /[\w]+-[A-Za-z0-9_-]{6,}\.(css|scss)$/.test(basename);
  }

  // Derive the HTML file path from the current page URL
  function deriveHtmlFilePath() {
    let p = window.location.pathname;
    if (p.endsWith('/')) p += 'index.html';
    else if (!/\.\w+$/.test(p)) p += '/index.html';
    return p.replace(/^\//, '');
  }

  // ── Overlay DOM refs ────────────────────────────────────────────
  let hoverBox, hoverLabel, selectBox, selectLabel, infoPanel;
  let badgeEl, shortcutHint = $state();
  let panelComponent = $state();

  // ── Shortcut hint ───────────────────────────────────────────────
  let hintVisible = $state(false);
  let hintFading = $state(false);

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
    startLivenessCheck();
    const rect = el.getBoundingClientRect();

    if (selectLabel) selectLabel.textContent = formatLabel(el);
    positionBox(selectBox, selectLabel, rect);
    if (infoPanel) infoPanel.innerHTML = buildInfoHTML(el);
    positionInfoPanel(rect);

    $panelVisible = true;

    const { tag, id, classes } = describeElement(el);

    // Build ancestor chain so the resolver can match descendant selectors
    const ancestors = [];
    let parent = el.parentElement;
    while (parent && parent !== document.body && parent !== document.documentElement) {
      const desc = describeElement(parent);
      ancestors.push({ tag: desc.tag, id: desc.id, classes: desc.classes });
      parent = parent.parentElement;
    }

    send({
      type: 'select',
      tag,
      id,
      classes,
      ancestors,
      inlineStyles: el.getAttribute('style') || '',
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      rect: {
        top: Math.round(rect.top),
        left: Math.round(rect.left),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    });
  }

  function deselectEl() {
    stopLivenessCheck();
    $selectedElement = null;
    hideBox(selectBox, selectLabel);
    if (infoPanel) infoPanel.style.display = 'none';
    $panelVisible = false;
    $sourceData = null;
    send({ type: 'deselect' });
  }

  // ── Event handlers ──────────────────────────────────────────────
  function onMouseMove(e) {
    if (!$active) { return; }
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
    if (isOverlayToggleShortcut(e, navigator.platform)) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      toggleOverlay();
      return;
    }

    if ($active && $selectedElement && e.key === 'Escape') {
      e.preventDefault();
      deselectEl();
    }

    // Tab / Shift+Tab: cycle to sibling elements
    if ($active && $selectedElement && e.key === 'Tab') {
      if (!$selectedElement.isConnected) { deselectEl(); return; }
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
      if (!$selectedElement.isConnected) {
        deselectEl();
        return;
      }
      const rect = $selectedElement.getBoundingClientRect();
      if (selectLabel) selectLabel.textContent = formatLabel($selectedElement);
      positionBox(selectBox, selectLabel, rect);
      positionInfoPanel(rect);
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
    let styleType = message.styleType || null;

    // Compiled CSS (Tailwind, Vite bundles): write inline styles to HTML instead.
    // Editing utility class rules would break all elements sharing that class.
    let compiledCss = false;
    if (isCompiledCss(file) && $selectedElement) {
      file = deriveHtmlFilePath();
      selector = buildFallbackSelector($selectedElement);
      styleType = 'inline';
      compiledCss = true;
    }

    // No-source fallback: build a selector and target the first known CSS file
    if (!selector && $selectedElement) {
      selector = buildFallbackSelector($selectedElement);
      file = cssFiles[0] || file;
    }

    // If file is still null/unknown, try the first CSS file
    if ((!file || file === 'unknown') && cssFiles.length > 0) {
      file = cssFiles[0];
    }

    $sourceData = {
      file,
      selector,
      line: message.line,
      properties: message.properties || {},
      styleType,
      cssRule: compiledCss ? null : (message.cssRule || null),
      cssFiles,
      matchedRules,
      pseudoStates: message.pseudoStates || {},
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
        // CSS is now active — safe to drop inline previews
        if (panelComponent && panelComponent.clearPreviews) {
          panelComponent.clearPreviews();
        }
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

  // ── Liveness check for selected element ─────────────────────────
  // SPA frameworks (React, Vue, Svelte) replace DOM nodes on re-render.
  // The stored reference becomes detached — getBoundingClientRect()
  // returns zeros, and the overlay/panel display incorrectly.
  // Check on a short interval and clear the selection if the node
  // is no longer in the DOM.
  let livenessInterval;

  function startLivenessCheck() {
    stopLivenessCheck();
    livenessInterval = setInterval(() => {
      if ($selectedElement && !$selectedElement.isConnected) {
        deselectEl();
      }
    }, 500);
  }

  function stopLivenessCheck() {
    if (livenessInterval) {
      clearInterval(livenessInterval);
      livenessInterval = null;
    }
  }

  // ── Lifecycle ───────────────────────────────────────────────────
  // NOTE: onMount doesn't fire reliably in closed Shadow DOM.
  // Initialization is done via init() called from main.js.
  export function init() {
    window.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('mouseout', onMouseOut, true);
    document.addEventListener('click', onClick, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);

    setMessageHandler(handleServerMessage);
    connect();
    showShortcutHint();
  }

  onDestroy(() => {
    stopLivenessCheck();
    window.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('mouseout', onMouseOut, true);
    document.removeEventListener('click', onClick, true);
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
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="polish-badge"
  class:active={$active}
  class:inactive={!$active}
  style="pointer-events: auto;"
  bind:this={badgeEl}
  onclick={(e) => { e.stopPropagation(); toggleOverlay(); }}
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

<!-- Panel (when an element is selected). Keep the instance stable across edits. -->
{#if $panelVisible && $selectedElement}
  <Panel
    bind:this={panelComponent}
    element={$selectedElement}
    onclose={deselectEl}
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
    background: transparent;
  }
  .polish-select {
    border: 2px solid rgba(59, 130, 246, 1);
    background: transparent;
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
    background: rgba(59, 130, 246, 1);
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
