(function () {
  'use strict';

  // Prevent double-initialization
  if (window.__polishOverlayInitialized) return;
  window.__polishOverlayInitialized = true;

  // ── State ──────────────────────────────────────────────────────────
  let active = true;
  let hoveredElement = null;
  let selectedElement = null;
  let ws = null;
  let reconnectTimer = null;

  // ── Shadow DOM Container ───────────────────────────────────────────
  const host = document.createElement('div');
  host.setAttribute('data-polish-root', '');
  host.style.cssText = 'all:initial; position:fixed; top:0; left:0; width:0; height:0; z-index:2147483647; pointer-events:none;';
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'closed' });

  // ── Overlay Elements ───────────────────────────────────────────────

  // Hover highlight box
  const hoverBox = document.createElement('div');
  hoverBox.className = 'polish-hover';
  shadow.appendChild(hoverBox);

  // Hover label (tag + class info)
  const hoverLabel = document.createElement('div');
  hoverLabel.className = 'polish-hover-label';
  shadow.appendChild(hoverLabel);

  // Selection box
  const selectBox = document.createElement('div');
  selectBox.className = 'polish-select';
  shadow.appendChild(selectBox);

  // Selection label
  const selectLabel = document.createElement('div');
  selectLabel.className = 'polish-select-label';
  shadow.appendChild(selectLabel);

  // Info panel for selected element
  const infoPanel = document.createElement('div');
  infoPanel.className = 'polish-info';
  shadow.appendChild(infoPanel);

  // Badge
  const badge = document.createElement('div');
  badge.className = 'polish-badge active';
  badge.textContent = 'Polish';
  badge.style.pointerEvents = 'auto';
  badge.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleOverlay();
  });
  shadow.appendChild(badge);

  // ── Styles (injected into Shadow DOM) ──────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    :host {
      all: initial;
    }

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

    .polish-info .tag { color: #93c5fd; }
    .polish-info .id { color: #fbbf24; }
    .polish-info .cls { color: #86efac; }
    .polish-info .dim { color: #a5a5a5; }
    .polish-info .sep { color: #525252; margin: 0 4px; }

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
  `;
  shadow.appendChild(style);

  // ── Helpers ────────────────────────────────────────────────────────

  function describeElement(el) {
    const tag = el.tagName.toLowerCase();
    const id = el.id || '';
    const classes = Array.from(el.classList);
    return { tag, id, classes };
  }

  function formatLabel(el) {
    const { tag, id, classes } = describeElement(el);
    let label = tag;
    if (id) label += `#${id}`;
    if (classes.length) label += `.${classes.join('.')}`;
    const rect = el.getBoundingClientRect();
    label += ` ${Math.round(rect.width)}\u00D7${Math.round(rect.height)}`;
    return label;
  }

  function positionBox(box, label, rect, offset) {
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
    box.style.display = 'none';
    label.style.display = 'none';
  }

  function positionInfoPanel(rect) {
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

  function buildInfoHTML(el) {
    const { tag, id, classes } = describeElement(el);
    const rect = el.getBoundingClientRect();
    const computed = window.getComputedStyle(el);

    let html = `<span class="tag">&lt;${tag}&gt;</span>`;
    if (id) html += `<span class="sep">|</span><span class="id">#${id}</span>`;
    if (classes.length) html += `<span class="sep">|</span><span class="cls">.${classes.join('.')}</span>`;
    html += `<br><span class="dim">${Math.round(rect.width)} \u00D7 ${Math.round(rect.height)}px</span>`;
    html += `<span class="sep">|</span><span class="dim">padding: ${computed.padding}</span>`;
    html += `<span class="sep">|</span><span class="dim">margin: ${computed.margin}</span>`;

    return html;
  }

  function isPolishElement(el) {
    if (!el || el === document || el === document.documentElement) return true;
    if (el.hasAttribute && el.hasAttribute('data-polish-root')) return true;
    return false;
  }

  // ── Event Handlers ─────────────────────────────────────────────────

  function onMouseMove(e) {
    if (!active) return;

    const target = e.target;
    if (isPolishElement(target)) {
      hideBox(hoverBox, hoverLabel);
      hoveredElement = null;
      return;
    }

    if (target === hoveredElement) return;
    hoveredElement = target;

    const rect = target.getBoundingClientRect();
    hoverLabel.textContent = formatLabel(target);
    positionBox(hoverBox, hoverLabel, rect);
  }

  function onMouseOut(e) {
    if (!e.relatedTarget || e.relatedTarget === document) {
      hideBox(hoverBox, hoverLabel);
      hoveredElement = null;
    }
  }

  function onClick(e) {
    if (!active) return;

    const target = e.target;
    if (isPolishElement(target)) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    if (selectedElement === target) {
      deselectElement();
      return;
    }

    selectElement(target);
  }

  function selectElement(el) {
    selectedElement = el;
    const rect = el.getBoundingClientRect();

    selectLabel.textContent = formatLabel(el);
    positionBox(selectBox, selectLabel, rect);
    infoPanel.innerHTML = buildInfoHTML(el);
    positionInfoPanel(rect);

    const { tag, id, classes } = describeElement(el);
    sendMessage({
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

  function deselectElement() {
    selectedElement = null;
    hideBox(selectBox, selectLabel);
    infoPanel.style.display = 'none';
    sendMessage({ type: 'deselect' });
  }

  function onScroll() {
    if (hoveredElement && active) {
      const rect = hoveredElement.getBoundingClientRect();
      hoverLabel.textContent = formatLabel(hoveredElement);
      positionBox(hoverBox, hoverLabel, rect);
    }
    if (selectedElement) {
      const rect = selectedElement.getBoundingClientRect();
      selectLabel.textContent = formatLabel(selectedElement);
      positionBox(selectBox, selectLabel, rect);
      positionInfoPanel(rect);
    }
  }

  function onResize() {
    onScroll();
  }

  function onKeyDown(e) {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modifier = isMac ? e.metaKey : e.ctrlKey;

    if (modifier && e.shiftKey && e.key === 'P') {
      e.preventDefault();
      e.stopPropagation();
      toggleOverlay();
    }

    if (active && selectedElement && e.key === 'Escape') {
      e.preventDefault();
      deselectElement();
    }
  }

  function toggleOverlay() {
    active = !active;

    if (active) {
      badge.className = 'polish-badge active';
      badge.textContent = 'Polish';
    } else {
      badge.className = 'polish-badge inactive';
      badge.textContent = 'Polish';
      hideBox(hoverBox, hoverLabel);
      hideBox(selectBox, selectLabel);
      infoPanel.style.display = 'none';
      hoveredElement = null;
    }
  }

  // ── WebSocket ──────────────────────────────────────────────────────

  function connectWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${location.host}/__polish__/ws`;

    ws = new WebSocket(url);

    ws.onopen = () => {
      console.log('[Polish] Connected');
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleServerMessage(message);
      } catch (err) {
        console.error('[Polish] Invalid message:', err);
      }
    };

    ws.onclose = () => {
      console.log('[Polish] Disconnected, reconnecting...');
      scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose will fire after this
    };
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connectWebSocket();
    }, 2000);
  }

  function sendMessage(data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  function handleServerMessage(message) {
    switch (message.type) {
      case 'source':
        // M2 will handle source resolution display
        break;

      case 'reload':
        if (message.cssOnly && message.files) {
          reloadCSS(message.files);
        } else {
          location.reload();
        }
        break;
    }
  }

  function reloadCSS(files) {
    const links = document.querySelectorAll('link[rel="stylesheet"]');
    for (const link of links) {
      const href = link.getAttribute('href');
      if (!href) continue;

      const shouldReload = files.some((f) => href.includes(f));
      if (shouldReload) {
        const url = new URL(href, location.href);
        url.searchParams.set('_polish', Date.now());
        link.href = url.toString();
      }
    }
  }

  // ── Initialize ─────────────────────────────────────────────────────

  function init() {
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('mouseout', onMouseOut, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);

    connectWebSocket();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
