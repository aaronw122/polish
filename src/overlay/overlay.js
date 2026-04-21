(function () {
  'use strict';

  // Prevent double-initialization
  if (window.__polishOverlayInitialized) return;
  window.__polishOverlayInitialized = true;

  // ═══════════════════════════════════════════════════════════════════
  // 1. CONSTANTS & CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════

  const DEBOUNCE_MS = 150;

  const WEB_SAFE_FONTS = [
    'Arial', 'Verdana', 'Helvetica', 'Tahoma', 'Trebuchet MS',
    'Times New Roman', 'Georgia', 'Garamond',
    'Courier New', 'Lucida Console', 'Monaco',
    'system-ui', 'sans-serif', 'serif', 'monospace',
  ];

  const FONT_WEIGHTS = [
    { value: '100', label: '100 Thin' },
    { value: '200', label: '200' },
    { value: '300', label: '300 Light' },
    { value: '400', label: '400 Normal' },
    { value: '500', label: '500 Medium' },
    { value: '600', label: '600 Semi-Bold' },
    { value: '700', label: '700 Bold' },
    { value: '800', label: '800' },
    { value: '900', label: '900 Black' },
  ];

  // ── Control Schema ────────────────────────────────────────────────
  // Single source of truth for every panel control. Used to:
  //   - Build the DOM (createControlsFromSchema)
  //   - Read computed styles into controls (syncControlFromComputed)
  //   - Apply authored source values into controls (syncControlFromSource)

  const CONTROL_SCHEMA = [
    { section: 'Colors', id: 'colors', controls: [
      { property: 'background-color', type: 'color', label: 'Background' },
      { property: 'color',            type: 'color', label: 'Text' },
      { property: 'border-color',     type: 'color', label: 'Border' },
    ]},
    { section: 'Typography', id: 'typography', controls: [
      { property: 'font-family', type: 'select', label: 'Family',
        options: WEB_SAFE_FONTS.map(f => ({ value: f, label: f })) },
      { property: 'font-size', type: 'slider', label: 'Size',
        min: 8, max: 72, step: 1, units: ['px', 'rem', 'em'] },
      { property: 'font-weight', type: 'select', label: 'Weight',
        options: FONT_WEIGHTS },
    ]},
    { section: 'Size', id: 'size', controls: [
      { property: 'width',  type: 'slider', label: 'Width',
        min: 0, max: 2000, step: 1, units: ['px', '%', 'auto', 'vw'] },
      { property: 'height', type: 'slider', label: 'Height',
        min: 0, max: 2000, step: 1, units: ['px', '%', 'auto', 'vh'] },
    ]},
    // Spacing is built separately (box model visualization)
    { section: 'Effects', id: 'effects', controls: [
      { property: 'border-radius', type: 'slider', label: 'Radius',
        min: 0, max: 50, step: 1, units: 'px' },
      { property: 'opacity', type: 'slider', label: 'Opacity',
        min: 0, max: 1, step: 0.01, units: null },
    ]},
  ];

  // ═══════════════════════════════════════════════════════════════════
  // 2. STATE
  // ═══════════════════════════════════════════════════════════════════

  const state = {
    active: true,
    hoveredElement: null,
    selectedElement: null,
    sourceData: null,       // { file, selector, line, properties, cssFiles, matchedRules }
    panelVisible: false,
    debounceTimers: {},
    shortcutHintShown: false,
    uniformMode: false,
    panelDragState: null,
  };

  let ws = null;
  let reconnectTimer = null;

  // ═══════════════════════════════════════════════════════════════════
  // 3. PURE HELPERS (no DOM, no state mutation)
  // ═══════════════════════════════════════════════════════════════════

  function clampValue(val, min, max) {
    if (isNaN(val)) return min;
    return Math.min(max, Math.max(min, val));
  }

  function rgbToHex(rgb) {
    if (!rgb || rgb === 'transparent' || rgb === 'rgba(0, 0, 0, 0)') return '#000000';
    if (rgb.startsWith('#')) return rgb.length === 7 ? rgb : rgb;
    const match = rgb.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!match) return '#000000';
    const r = parseInt(match[1], 10);
    const g = parseInt(match[2], 10);
    const b = parseInt(match[3], 10);
    return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
  }

  function parseNumericValue(val) {
    if (!val || val === 'auto' || val === 'none') return { num: 0, unit: 'px' };
    const match = String(val).match(/^(-?[\d.]+)\s*(px|rem|em|%|vw|vh)?$/);
    if (!match) return { num: 0, unit: 'px' };
    return { num: parseFloat(match[1]), unit: match[2] || 'px' };
  }

  function cssToCamel(property) {
    return property.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  }

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

  function isPolishElement(el) {
    if (!el || el === document || el === document.documentElement) return true;
    if (el.hasAttribute && el.hasAttribute('data-polish-root')) return true;
    return false;
  }

  function buildBreadcrumbs(el) {
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

  function buildInfoHTML(el) {
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

  // ═══════════════════════════════════════════════════════════════════
  // 4. DOM CONSTRUCTION — Shadow Root, Overlays, Badge
  // ═══════════════════════════════════════════════════════════════════

  const host = document.createElement('div');
  host.setAttribute('data-polish-root', '');
  host.style.cssText = 'all:initial; position:fixed; top:0; left:0; width:0; height:0; z-index:2147483647; pointer-events:none;';
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'closed' });

  // -- Overlay highlight boxes --

  const hoverBox = document.createElement('div');
  hoverBox.className = 'polish-hover';
  shadow.appendChild(hoverBox);

  const hoverLabel = document.createElement('div');
  hoverLabel.className = 'polish-hover-label';
  shadow.appendChild(hoverLabel);

  const selectBox = document.createElement('div');
  selectBox.className = 'polish-select';
  shadow.appendChild(selectBox);

  const selectLabel = document.createElement('div');
  selectLabel.className = 'polish-select-label';
  shadow.appendChild(selectLabel);

  const infoPanel = document.createElement('div');
  infoPanel.className = 'polish-info';
  shadow.appendChild(infoPanel);

  // -- Badge --

  const badge = document.createElement('div');
  badge.className = 'polish-badge active';
  badge.textContent = 'Polish';
  badge.style.pointerEvents = 'auto';
  badge.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleOverlay();
  });
  shadow.appendChild(badge);

  // -- Overlay box positioning helpers --

  function positionBox(box, label, rect) {
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

  // ═══════════════════════════════════════════════════════════════════
  // 5. PANEL CONSTRUCTION (from schema)
  // ═══════════════════════════════════════════════════════════════════

  const panel = document.createElement('div');
  panel.className = 'polish-panel';
  panel.style.pointerEvents = 'auto';
  panel.style.display = 'none';
  shadow.appendChild(panel);

  // -- Panel header (draggable) --

  const panelHeader = document.createElement('div');
  panelHeader.className = 'polish-panel-header';
  panelHeader.innerHTML = '<span class="polish-panel-title">Properties</span><span class="polish-panel-close">\u00D7</span>';
  panel.appendChild(panelHeader);

  const panelBody = document.createElement('div');
  panelBody.className = 'polish-panel-body';
  panel.appendChild(panelBody);

  // -- Section builder --

  function createSection(title, id) {
    const section = document.createElement('div');
    section.className = 'polish-section';
    section.dataset.section = id;

    const header = document.createElement('div');
    header.className = 'polish-section-header';
    header.innerHTML = `<span class="polish-section-arrow">\u25B6</span> ${title}`;
    header.addEventListener('click', () => {
      section.classList.toggle('collapsed');
    });
    section.appendChild(header);

    const content = document.createElement('div');
    content.className = 'polish-section-content';
    section.appendChild(content);

    return { section, content };
  }

  // -- Control builders (one per type) --

  function createColorControl(label, property) {
    const row = document.createElement('div');
    row.className = 'polish-control-row';

    const lbl = document.createElement('label');
    lbl.className = 'polish-control-label';
    lbl.textContent = label;
    row.appendChild(lbl);

    const controls = document.createElement('div');
    controls.className = 'polish-control-inputs';

    const picker = document.createElement('input');
    picker.type = 'color';
    picker.className = 'polish-color-picker';
    picker.dataset.property = property;
    controls.appendChild(picker);

    const hex = document.createElement('input');
    hex.type = 'text';
    hex.className = 'polish-hex-input';
    hex.placeholder = '#000000';
    hex.maxLength = 7;
    hex.dataset.property = property;
    controls.appendChild(hex);

    bindColorEvents(picker, hex, property);

    row.appendChild(controls);
    return { row, picker, hex };
  }

  function bindColorEvents(picker, hex, property) {
    picker.addEventListener('input', () => {
      hex.value = picker.value;
      applyLivePreview(property, picker.value);
      debounceSendChange(property, picker.value);
    });

    picker.addEventListener('change', () => {
      sendChangeImmediate(property, picker.value);
    });

    hex.addEventListener('input', () => {
      const v = hex.value.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
        picker.value = v;
        applyLivePreview(property, v);
        debounceSendChange(property, v);
      }
    });

    hex.addEventListener('change', () => {
      const v = hex.value.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
        sendChangeImmediate(property, v);
      }
    });
  }

  function createSliderControl(label, property, min, max, step, defaultUnit) {
    const row = document.createElement('div');
    row.className = 'polish-control-row';

    const lbl = document.createElement('label');
    lbl.className = 'polish-control-label';
    lbl.textContent = label;
    row.appendChild(lbl);

    const controls = document.createElement('div');
    controls.className = 'polish-control-inputs';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'polish-slider';
    slider.min = min;
    slider.max = max;
    slider.step = step;
    slider.dataset.property = property;
    controls.appendChild(slider);

    const numInput = document.createElement('input');
    numInput.type = 'number';
    numInput.className = 'polish-num-input';
    numInput.min = min;
    numInput.max = max;
    numInput.step = step;
    numInput.dataset.property = property;
    controls.appendChild(numInput);

    const unitSelect = createUnitSelect(defaultUnit);
    if (unitSelect) {
      controls.appendChild(unitSelect);
    }

    function getFullValue() {
      const val = numInput.value;
      if (unitSelect) {
        const unit = unitSelect.value;
        return unit === 'auto' ? 'auto' : val + unit;
      }
      return val + (defaultUnit || '');
    }

    bindSliderEvents(slider, numInput, unitSelect, property, min, max, getFullValue);

    row.appendChild(controls);
    return { row, slider, numInput, unitSelect };
  }

  function createUnitSelect(defaultUnit) {
    if (!defaultUnit) return null;
    const units = Array.isArray(defaultUnit) ? defaultUnit : [defaultUnit];
    const unitSelect = document.createElement('select');
    unitSelect.className = 'polish-unit-select';
    units.forEach(u => {
      const opt = document.createElement('option');
      opt.value = u;
      opt.textContent = u;
      unitSelect.appendChild(opt);
    });
    return unitSelect;
  }

  function bindSliderEvents(slider, numInput, unitSelect, property, min, max, getFullValue) {
    if (unitSelect) {
      unitSelect.addEventListener('change', () => {
        const val = numInput.value;
        const unit = unitSelect.value;
        if (unit === 'auto') {
          applyLivePreview(property, 'auto');
          sendChangeImmediate(property, 'auto');
        } else {
          applyLivePreview(property, val + unit);
          sendChangeImmediate(property, val + unit);
        }
      });
    }

    slider.addEventListener('input', () => {
      numInput.value = slider.value;
      const fullVal = getFullValue();
      applyLivePreview(property, fullVal);
      debounceSendChange(property, fullVal);
    });

    slider.addEventListener('change', () => {
      numInput.value = slider.value;
      sendChangeImmediate(property, getFullValue());
    });

    numInput.addEventListener('input', () => {
      const clamped = clampValue(parseFloat(numInput.value), parseFloat(min), parseFloat(max));
      slider.value = clamped;
      const fullVal = getFullValue();
      applyLivePreview(property, fullVal);
      debounceSendChange(property, fullVal);
    });

    numInput.addEventListener('change', () => {
      const clamped = clampValue(parseFloat(numInput.value), parseFloat(min), parseFloat(max));
      numInput.value = clamped;
      slider.value = clamped;
      sendChangeImmediate(property, getFullValue());
    });
  }

  function createSelectControl(label, property, options) {
    const row = document.createElement('div');
    row.className = 'polish-control-row';

    const lbl = document.createElement('label');
    lbl.className = 'polish-control-label';
    lbl.textContent = label;
    row.appendChild(lbl);

    const controls = document.createElement('div');
    controls.className = 'polish-control-inputs';

    const select = document.createElement('select');
    select.className = 'polish-select-input';
    select.dataset.property = property;
    options.forEach(opt => {
      const o = document.createElement('option');
      o.value = opt.value !== undefined ? opt.value : opt;
      o.textContent = opt.label !== undefined ? opt.label : opt;
      select.appendChild(o);
    });
    controls.appendChild(select);

    select.addEventListener('change', () => {
      applyLivePreview(property, select.value);
      sendChangeImmediate(property, select.value);
    });

    row.appendChild(controls);
    return { row, select };
  }

  // -- Build controls from schema --

  // Map from property name to its control handle (for sync functions)
  const controlHandles = {};

  function buildControlFromDef(def) {
    switch (def.type) {
      case 'color':
        return createColorControl(def.label, def.property);
      case 'slider':
        return createSliderControl(
          def.label, def.property, def.min, def.max, def.step, def.units
        );
      case 'select':
        return createSelectControl(def.label, def.property, def.options);
      default:
        throw new Error(`Unknown control type: ${def.type}`);
    }
  }

  // Build all schema-driven sections and controls
  CONTROL_SCHEMA.forEach(sectionDef => {
    const { section, content } = createSection(sectionDef.section, sectionDef.id);

    sectionDef.controls.forEach(controlDef => {
      const handle = buildControlFromDef(controlDef);
      content.appendChild(handle.row);
      controlHandles[controlDef.property] = { def: controlDef, handle };
    });

    panelBody.appendChild(section);
  });

  // -- Spacing section (box model — built separately, not schema-driven) --

  const spacingSection = createSection('Spacing', 'spacing');
  const spacingContainer = document.createElement('div');
  spacingContainer.className = 'polish-spacing-container';

  const boxModel = document.createElement('div');
  boxModel.className = 'polish-box-model';
  boxModel.innerHTML = `
    <div class="polish-box-margin">
      <span class="polish-box-label">margin</span>
      <input class="polish-box-value top" data-property="margin-top" value="0">
      <input class="polish-box-value right" data-property="margin-right" value="0">
      <input class="polish-box-value bottom" data-property="margin-bottom" value="0">
      <input class="polish-box-value left" data-property="margin-left" value="0">
      <div class="polish-box-border">
        <span class="polish-box-label">border</span>
        <div class="polish-box-padding">
          <span class="polish-box-label">padding</span>
          <input class="polish-box-value top" data-property="padding-top" value="0">
          <input class="polish-box-value right" data-property="padding-right" value="0">
          <input class="polish-box-value bottom" data-property="padding-bottom" value="0">
          <input class="polish-box-value left" data-property="padding-left" value="0">
          <div class="polish-box-content">
            <span class="polish-box-label dim">content</span>
          </div>
        </div>
      </div>
    </div>
  `;
  spacingContainer.appendChild(boxModel);

  // Lock toggle for uniform mode
  const lockRow = document.createElement('div');
  lockRow.className = 'polish-lock-row';
  const lockBtn = document.createElement('button');
  lockBtn.className = 'polish-lock-btn';
  lockBtn.textContent = '\uD83D\uDD13';
  lockBtn.title = 'Toggle uniform spacing';
  lockBtn.addEventListener('click', () => {
    state.uniformMode = !state.uniformMode;
    lockBtn.textContent = state.uniformMode ? '\uD83D\uDD12' : '\uD83D\uDD13';
    lockBtn.classList.toggle('locked', state.uniformMode);
  });
  lockRow.appendChild(lockBtn);
  const lockLabel = document.createElement('span');
  lockLabel.className = 'polish-lock-label';
  lockLabel.textContent = 'Uniform';
  lockRow.appendChild(lockLabel);
  spacingContainer.appendChild(lockRow);

  // Shorthand indicator badges for margin/padding
  const shorthandBadgesContainer = document.createElement('div');
  shorthandBadgesContainer.className = 'polish-shorthand-badges';
  spacingContainer.appendChild(shorthandBadgesContainer);

  spacingSection.content.appendChild(spacingContainer);

  // Insert spacing section after size, before effects
  // Schema order: colors(0), typography(1), size(2), effects(3)
  // We want: colors, typography, size, spacing, effects
  const effectsSectionEl = panelBody.lastElementChild;
  panelBody.insertBefore(spacingSection.section, effectsSectionEl);

  // Wire up box model inputs
  bindBoxModelEvents(boxModel);

  function bindBoxModelEvents(boxModelEl) {
    boxModelEl.querySelectorAll('.polish-box-value').forEach(input => {
      input.addEventListener('input', () => {
        const prop = input.dataset.property;
        const val = input.value.trim();
        const fullVal = /\d$/.test(val) ? val + 'px' : val;
        applyLivePreview(prop, fullVal);
        debounceSendChange(prop, fullVal);

        if (state.uniformMode) {
          applyUniformSpacing(boxModelEl, input, prop, fullVal);
        }
      });

      input.addEventListener('change', () => {
        const prop = input.dataset.property;
        const val = input.value.trim();
        const fullVal = /\d$/.test(val) ? val + 'px' : val;
        sendChangeImmediate(prop, fullVal);

        if (state.uniformMode) {
          sendUniformSpacingImmediate(prop, fullVal);
        }
      });
    });
  }

  function applyUniformSpacing(boxModelEl, sourceInput, prop, fullVal) {
    const prefix = prop.startsWith('margin') ? 'margin' : 'padding';
    const sides = ['top', 'right', 'bottom', 'left'];
    sides.forEach(side => {
      const sibProp = `${prefix}-${side}`;
      if (sibProp !== prop) {
        const sib = boxModelEl.querySelector(`[data-property="${sibProp}"]`);
        if (sib) sib.value = sourceInput.value;
        applyLivePreview(sibProp, fullVal);
        debounceSendChange(sibProp, fullVal);
      }
    });
  }

  function sendUniformSpacingImmediate(prop, fullVal) {
    const prefix = prop.startsWith('margin') ? 'margin' : 'padding';
    const sides = ['top', 'right', 'bottom', 'left'];
    sides.forEach(side => {
      const sibProp = `${prefix}-${side}`;
      if (sibProp !== prop) {
        sendChangeImmediate(sibProp, fullVal);
      }
    });
  }

  // -- Panel close --

  panelHeader.querySelector('.polish-panel-close').addEventListener('click', (e) => {
    e.stopPropagation();
    deselectElement();
  });

  // -- Panel dragging --

  panelHeader.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('polish-panel-close')) return;
    e.preventDefault();
    const panelRect = panel.getBoundingClientRect();
    state.panelDragState = {
      startX: e.clientX,
      startY: e.clientY,
      startLeft: panelRect.left,
      startTop: panelRect.top,
    };
  });

  function onPanelDrag(e) {
    if (!state.panelDragState) return;
    const dx = e.clientX - state.panelDragState.startX;
    const dy = e.clientY - state.panelDragState.startY;
    let newLeft = state.panelDragState.startLeft + dx;
    let newTop = state.panelDragState.startTop + dy;

    newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - panel.offsetWidth));
    newTop = Math.max(0, Math.min(newTop, window.innerHeight - 40));

    panel.style.left = newLeft + 'px';
    panel.style.top = newTop + 'px';
  }

  function onPanelDragEnd() {
    state.panelDragState = null;
  }

  // -- Keyboard shortcut hint --

  const shortcutHint = document.createElement('div');
  shortcutHint.className = 'polish-shortcut-hint';
  const isMacHint = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  shortcutHint.innerHTML = [
    '<strong>Shortcuts:</strong>',
    (isMacHint ? 'Cmd' : 'Ctrl') + '+Shift+P \u2014 Toggle overlay',
    'Click \u2014 Select element',
    'Esc \u2014 Deselect',
    'Tab / Shift+Tab \u2014 Cycle siblings',
  ].join('<br>');
  shortcutHint.style.display = 'none';
  shadow.appendChild(shortcutHint);

  // ── Inject Shadow DOM stylesheet ──────────────────────────────────
  // The __PANEL_STYLES__ placeholder is replaced at serve time by the
  // proxy with the contents of panel-styles.css.

  const style = document.createElement('style');
  style.textContent = `__PANEL_STYLES__`;
  shadow.appendChild(style);

  // ═══════════════════════════════════════════════════════════════════
  // 6. PANEL VALUE SYNC (computed styles + authored source)
  // ═══════════════════════════════════════════════════════════════════

  // Set a <select> element to the option matching `value`, return true if found.
  function setSelectValue(selectEl, value) {
    for (let i = 0; i < selectEl.options.length; i++) {
      if (selectEl.options[i].value === value) {
        selectEl.selectedIndex = i;
        return true;
      }
    }
    return false;
  }

  // Sync a slider control from a parsed numeric value.
  function syncSlider(handle, numVal, def) {
    const clamped = clampValue(numVal.num, def.min, def.max);
    handle.slider.value = clamped;
    handle.numInput.value = clamped;
    if (handle.unitSelect && numVal.unit) {
      setSelectValue(handle.unitSelect, numVal.unit);
    }
  }

  // Sync a single control from a computed style value.
  function syncControlFromComputed(property, computedValue) {
    const entry = controlHandles[property];
    if (!entry) return;

    const { def, handle } = entry;

    switch (def.type) {
      case 'color': {
        const hexVal = rgbToHex(computedValue);
        handle.picker.value = hexVal;
        handle.hex.value = hexVal;
        break;
      }
      case 'slider': {
        const numVal = parseNumericValue(computedValue);
        syncSlider(handle, numVal, def);
        break;
      }
      case 'select': {
        // Font family needs special handling to strip quotes and match
        if (property === 'font-family') {
          const currentFont = computedValue.split(',')[0].trim().replace(/['"]/g, '');
          if (!setSelectValue(handle.select, currentFont)) {
            // Add current font as first option
            const opt = document.createElement('option');
            opt.value = currentFont;
            opt.textContent = currentFont + ' (current)';
            handle.select.insertBefore(opt, handle.select.firstChild);
            handle.select.selectedIndex = 0;
          }
        } else {
          setSelectValue(handle.select, computedValue);
        }
        break;
      }
    }
  }

  // Sync a single control from an authored source value.
  function syncControlFromSource(property, sourceValue) {
    const entry = controlHandles[property];
    if (!entry) return;

    const { def, handle } = entry;

    if (def.type === 'slider') {
      const numVal = parseNumericValue(sourceValue);
      if (numVal.num > 0 || property !== 'font-size') {
        syncSlider(handle, numVal, def);
      }
    }
    // Colors and selects are already accurate from computed values
  }

  // Initialize all panel controls from an element's computed styles.
  function initPanelValues(el) {
    const computed = window.getComputedStyle(el);

    // Schema-driven controls
    for (const [property, entry] of Object.entries(controlHandles)) {
      const computedProp = entry.def.type === 'select' && property === 'font-family'
        ? computed.fontFamily
        : computed.getPropertyValue(property);
      syncControlFromComputed(property, computedProp);
    }

    // Spacing (box model — not schema-driven)
    const spacingProps = [
      'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
      'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    ];
    spacingProps.forEach(prop => {
      const input = boxModel.querySelector(`[data-property="${prop}"]`);
      if (input) {
        const val = parseNumericValue(computed.getPropertyValue(prop));
        input.value = Math.round(val.num);
      }
    });
  }

  // Update panel controls from authored source properties.
  function updatePanelFromSource(properties) {
    for (const [property, value] of Object.entries(properties)) {
      syncControlFromSource(property, value);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // 7. PANEL SHOW / HIDE / POSITIONING
  // ═══════════════════════════════════════════════════════════════════

  function positionPanel(elRect) {
    const panelWidth = 280;
    const panelHeight = Math.min(panel.offsetHeight || 400, window.innerHeight * 0.8);
    const gap = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left, top;

    // Check if element takes most of the viewport (large element)
    const elCoversViewport = (
      elRect.width > vw * 0.7 && elRect.height > vh * 0.7
    );

    if (elCoversViewport) {
      left = vw - panelWidth - 12;
      top = 12;
    } else {
      // Prefer right side if there's room
      if (elRect.right + gap + panelWidth <= vw) {
        left = elRect.right + gap;
      }
      // Try left side
      else if (elRect.left - gap - panelWidth >= 0) {
        left = elRect.left - gap - panelWidth;
      }
      // Fall back to right edge of viewport
      else {
        left = vw - panelWidth - 8;
      }

      top = elRect.top;
    }

    // Keep panel fully on screen
    if (top + panelHeight > vh) {
      top = vh - panelHeight - 8;
    }
    if (top < 8) top = 8;
    if (left + panelWidth > vw) {
      left = vw - panelWidth - 8;
    }
    if (left < 8) left = 8;

    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
  }

  function showPanel(el) {
    const rect = el.getBoundingClientRect();
    initPanelValues(el);
    panel.setAttribute('data-opening', '');
    panel.style.display = 'block';
    positionPanel(rect);
    // Trigger reflow for transition
    panel.offsetHeight;
    panel.removeAttribute('data-opening');
    state.panelVisible = true;
  }

  function hidePanel() {
    panel.style.display = 'none';
    state.panelVisible = false;
    state.sourceData = null;
    // Clear all debounce timers
    Object.keys(state.debounceTimers).forEach(key => {
      clearTimeout(state.debounceTimers[key]);
      delete state.debounceTimers[key];
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // 8. LIVE PREVIEW & CHANGE MESSAGING
  // ═══════════════════════════════════════════════════════════════════

  function applyLivePreview(property, value) {
    if (!state.selectedElement) return;
    state.selectedElement.style[cssToCamel(property)] = value;
  }

  function debounceSendChange(property, value) {
    if (state.debounceTimers[property]) {
      clearTimeout(state.debounceTimers[property]);
    }
    state.debounceTimers[property] = setTimeout(() => {
      delete state.debounceTimers[property];
      sendChangeMessage(property, value);
    }, DEBOUNCE_MS);
  }

  function sendChangeImmediate(property, value) {
    if (state.debounceTimers[property]) {
      clearTimeout(state.debounceTimers[property]);
      delete state.debounceTimers[property];
    }
    sendChangeMessage(property, value);
  }

  function sendChangeMessage(property, value) {
    if (!state.sourceData || !state.sourceData.selector) return;
    sendMessage({
      type: 'change',
      file: state.sourceData.file,
      selector: state.sourceData.selector,
      property: property,
      value: value,
      line: state.sourceData.line || undefined,
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // 9. EVENT HANDLERS (hover, click, keyboard, drag, scroll)
  // ═══════════════════════════════════════════════════════════════════

  function onMouseMove(e) {
    if (!state.active) return;

    const target = e.target;
    if (isPolishElement(target)) {
      hideBox(hoverBox, hoverLabel);
      state.hoveredElement = null;
      return;
    }

    if (target === state.hoveredElement) return;
    state.hoveredElement = target;

    const rect = target.getBoundingClientRect();
    hoverLabel.textContent = formatLabel(target);
    positionBox(hoverBox, hoverLabel, rect);
  }

  function onMouseOut(e) {
    if (!e.relatedTarget || e.relatedTarget === document) {
      hideBox(hoverBox, hoverLabel);
      state.hoveredElement = null;
    }
  }

  function onClick(e) {
    if (!state.active) return;

    const target = e.target;
    if (isPolishElement(target)) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    if (state.selectedElement === target) {
      deselectElement();
      return;
    }

    selectElement(target);
  }

  function selectElement(el) {
    state.selectedElement = el;
    const rect = el.getBoundingClientRect();

    selectLabel.textContent = formatLabel(el);
    positionBox(selectBox, selectLabel, rect);
    infoPanel.innerHTML = buildInfoHTML(el);
    positionInfoPanel(rect);

    showPanel(el);

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
    state.selectedElement = null;
    hideBox(selectBox, selectLabel);
    infoPanel.style.display = 'none';
    hidePanel();
    sendMessage({ type: 'deselect' });
  }

  function onScroll() {
    if (state.hoveredElement && state.active) {
      const rect = state.hoveredElement.getBoundingClientRect();
      hoverLabel.textContent = formatLabel(state.hoveredElement);
      positionBox(hoverBox, hoverLabel, rect);
    }
    if (state.selectedElement) {
      const rect = state.selectedElement.getBoundingClientRect();
      selectLabel.textContent = formatLabel(state.selectedElement);
      positionBox(selectBox, selectLabel, rect);
      positionInfoPanel(rect);
      if (state.panelVisible && !state.panelDragState) {
        positionPanel(rect);
      }
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

    if (state.active && state.selectedElement && e.key === 'Escape') {
      e.preventDefault();
      deselectElement();
    }

    // Tab / Shift+Tab: cycle to sibling elements
    if (state.active && state.selectedElement && e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      const parent = state.selectedElement.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (c) => !isPolishElement(c) && c.nodeType === 1
        );
        const currentIdx = siblings.indexOf(state.selectedElement);
        if (currentIdx !== -1) {
          let nextIdx;
          if (e.shiftKey) {
            nextIdx = (currentIdx - 1 + siblings.length) % siblings.length;
          } else {
            nextIdx = (currentIdx + 1) % siblings.length;
          }
          selectElement(siblings[nextIdx]);
        }
      }
    }
  }

  // Check if a click target is inside the panel
  function isPanelElement(el) {
    if (!el) return false;
    let node = el;
    while (node) {
      if (node === panel) return true;
      node = node.parentNode;
    }
    return false;
  }

  function showShortcutHint() {
    if (state.shortcutHintShown) return;
    state.shortcutHintShown = true;
    shortcutHint.style.display = 'block';
    setTimeout(() => {
      shortcutHint.style.opacity = '0';
      setTimeout(() => {
        shortcutHint.style.display = 'none';
        shortcutHint.style.opacity = '';
      }, 500);
    }, 4000);
  }

  function toggleOverlay() {
    state.active = !state.active;

    if (state.active) {
      badge.className = 'polish-badge active';
      badge.textContent = 'Polish';
      showShortcutHint();
    } else {
      badge.className = 'polish-badge inactive';
      badge.textContent = 'Polish';
      hideBox(hoverBox, hoverLabel);
      hideBox(selectBox, selectLabel);
      infoPanel.style.display = 'none';
      hidePanel();
      state.selectedElement = null;
      state.hoveredElement = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // 10. WEBSOCKET CLIENT
  // ═══════════════════════════════════════════════════════════════════

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

  // ── Server message dispatch ───────────────────────────────────────

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

    // If no rules match and no selector, build a fallback source target.
    // The panel will still work with getComputedStyle values. When the user
    // makes a change, we write a new rule to the first CSS file (or create one).
    let file = message.file;
    let selector = message.selector;
    if (!selector && state.selectedElement) {
      const desc = describeElement(state.selectedElement);
      if (desc.id) {
        selector = '#' + desc.id;
      } else if (desc.classes.length) {
        selector = '.' + desc.classes.join('.');
      } else {
        selector = desc.tag;
      }
      file = cssFiles[0] || 'polish-overrides.css';
    }

    state.sourceData = {
      file: file,
      selector: selector,
      line: message.line,
      properties: message.properties || {},
      cssFiles: cssFiles,
      matchedRules: matchedRules,
    };

    // Re-initialize panel values from source properties if available
    if (state.selectedElement && message.properties) {
      updatePanelFromSource(message.properties);
    }

    updateShorthandBadges(matchedRules);
    updatePseudoClassIndicators(matchedRules);
  }

  function handleReloadMessage(message) {
    if (message.cssOnly && message.files) {
      reloadCSS(message.files);
    } else {
      location.reload();
    }
  }

  // ── Badge / indicator updates ─────────────────────────────────────

  function updateShorthandBadges(matchedRules) {
    shorthandBadgesContainer.innerHTML = '';
    const shorthandProps = new Set();

    for (const rule of matchedRules) {
      const props = rule.properties || {};
      if (props['padding']) shorthandProps.add('padding');
      if (props['margin']) shorthandProps.add('margin');
    }

    for (const prop of shorthandProps) {
      const badgeEl = document.createElement('span');
      badgeEl.className = 'polish-shorthand-badge';
      badgeEl.textContent = prop + ' (shorthand)';
      badgeEl.title = 'This value was expanded from a shorthand declaration';
      shorthandBadgesContainer.appendChild(badgeEl);
    }
  }

  function updatePseudoClassIndicators(matchedRules) {
    // Remove existing pseudo badges
    const existing = panel.querySelectorAll('.polish-pseudo-badge');
    existing.forEach((b) => b.remove());

    const pseudos = new Set();
    for (const rule of matchedRules) {
      if (rule.pseudoClasses && rule.pseudoClasses.length > 0) {
        for (const pc of rule.pseudoClasses) {
          pseudos.add(pc);
        }
      }
    }

    if (pseudos.size > 0) {
      const container = document.createElement('div');
      container.className = 'polish-pseudo-badges';
      for (const pc of pseudos) {
        const badgeEl = document.createElement('span');
        badgeEl.className = 'polish-pseudo-badge';
        badgeEl.textContent = 'Has ' + pc + ' styles';
        container.appendChild(badgeEl);
      }
      panelHeader.insertAdjacentElement('afterend', container);
    }
  }

  // ── CSS hot-reload ────────────────────────────────────────────────

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

  // ═══════════════════════════════════════════════════════════════════
  // 11. INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════

  // Intercept clicks within the shadow root on the panel
  panel.addEventListener('mousedown', (e) => {
    e.stopPropagation();
  });
  panel.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  function init() {
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('mouseout', onMouseOut, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);

    // Panel drag listeners on the shadow root level
    shadow.addEventListener('mousemove', onPanelDrag);
    shadow.addEventListener('mouseup', onPanelDragEnd);
    document.addEventListener('mousemove', onPanelDrag, true);
    document.addEventListener('mouseup', onPanelDragEnd, true);

    connectWebSocket();

    // Show shortcut hint on first activation
    showShortcutHint();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
