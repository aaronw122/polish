/**
 * Pure utility functions — no DOM, no state mutation.
 */

export const DEBOUNCE_MS = 150;

export function clampValue(val, min, max) {
  if (isNaN(val)) return min;
  return Math.min(max, Math.max(min, val));
}

export function rgbToHex(rgb) {
  if (!rgb || rgb === 'transparent' || rgb === 'rgba(0, 0, 0, 0)') return '#000000';
  if (rgb.startsWith('#')) return rgb.length === 7 ? rgb : rgb;
  const match = rgb.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!match) return '#000000';
  const r = parseInt(match[1], 10);
  const g = parseInt(match[2], 10);
  const b = parseInt(match[3], 10);
  return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
}

export function parseNumericValue(val) {
  if (!val || val === 'auto' || val === 'none') return { num: 0, unit: 'px' };
  const match = String(val).match(/^(-?[\d.]+)\s*(px|rem|em|%|vw|vh)?$/);
  if (!match) return { num: 0, unit: 'px' };
  return { num: parseFloat(match[1]), unit: match[2] || 'px' };
}

export function cssToCamel(property) {
  return property.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

export function describeElement(el) {
  const tag = el.tagName.toLowerCase();
  const id = el.id || '';
  const classes = Array.from(el.classList);
  return { tag, id, classes };
}

export function formatLabel(el) {
  const { tag, id, classes } = describeElement(el);
  let label = tag;
  if (id) label += `#${id}`;
  if (classes.length) label += `.${classes.join('.')}`;
  const rect = el.getBoundingClientRect();
  label += ` ${Math.round(rect.width)}\u00D7${Math.round(rect.height)}`;
  return label;
}

export function isPolishElement(el) {
  if (!el || el === document || el === document.documentElement) return true;
  if (el.hasAttribute && el.hasAttribute('data-polish-root')) return true;
  return false;
}

export function buildBreadcrumbs(el) {
  const parts = [];
  let node = el;
  while (node && node !== document.body && node !== document.documentElement) {
    const { tag, id, classes } = describeElement(node);
    let label = tag;
    if (id) label += '#' + id;
    if (classes.length) label += '.' + classes.slice(0, 2).join('.');
    if (classes.length > 2) label += '...';
    parts.unshift(label);
    if (parts.length >= 4) {
      parts.unshift('...');
      break;
    }
    node = node.parentElement;
  }
  return parts.join(' > ');
}

export function buildInfoHTML(el) {
  const { tag, id, classes } = describeElement(el);
  const rect = el.getBoundingClientRect();
  const computed = window.getComputedStyle(el);

  const breadcrumb = buildBreadcrumbs(el);
  let html = `<span class="polish-breadcrumb">${breadcrumb}</span><br>`;

  html += `<span class="tag">&lt;${tag}&gt;</span>`;
  if (id) html += `<span class="sep">|</span><span class="id">#${id}</span>`;
  if (classes.length) html += `<span class="sep">|</span><span class="cls">.${classes.join('.')}</span>`;
  html += `<br><span class="dim">${Math.round(rect.width)} \u00D7 ${Math.round(rect.height)}px</span>`;
  html += `<span class="sep">|</span><span class="dim">padding: ${computed.padding}</span>`;
  html += `<span class="sep">|</span><span class="dim">margin: ${computed.margin}</span>`;

  return html;
}

/**
 * Compute the optimal panel position relative to a selected element.
 */
export function computePanelPosition(elRect, viewportWidth, viewportHeight, panelHeight) {
  const panelWidth = 280;
  const effectivePanelHeight = panelHeight || 400;
  const gap = 12;

  let left, top;

  // Large element covering most of viewport
  const elCoversViewport = (
    elRect.width > viewportWidth * 0.7 && elRect.height > viewportHeight * 0.7
  );

  if (elCoversViewport) {
    left = viewportWidth - panelWidth - 12;
    top = 12;
  } else {
    // Prefer right side if there's room
    if (elRect.right + gap + panelWidth <= viewportWidth) {
      left = elRect.right + gap;
    }
    // Try left side
    else if (elRect.left - gap - panelWidth >= 0) {
      left = elRect.left - gap - panelWidth;
    }
    // Fall back to right edge of viewport
    else {
      left = viewportWidth - panelWidth - 8;
    }

    top = elRect.top;
  }

  // Keep panel fully on screen
  if (top + effectivePanelHeight > viewportHeight) {
    top = viewportHeight - effectivePanelHeight - 8;
  }
  if (top < 8) top = 8;
  if (left + panelWidth > viewportWidth) {
    left = viewportWidth - panelWidth - 8;
  }
  if (left < 8) left = 8;

  return { left, top };
}

/**
 * Format a raw spacing input value, appending 'px' if no unit is present.
 */
export function formatSpacingValue(rawInput) {
  const val = rawInput.trim();
  if (/\d$/.test(val)) return val + 'px';
  return val;
}

/**
 * Build a change message for the WebSocket protocol.
 */
export function buildChangeMessage(sourceData, property, value) {
  if (!sourceData || !sourceData.selector) return null;
  return {
    type: 'change',
    file: sourceData.file,
    selector: sourceData.selector,
    property: property,
    value: value,
    line: sourceData.line || undefined,
  };
}
