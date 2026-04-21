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
  let sourceData = null;       // { file, selector, line, properties }
  let panelVisible = false;
  let debounceTimers = {};
  const DEBOUNCE_MS = 150;

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

  // ── Manipulation Panel ─────────────────────────────────────────────

  const panel = document.createElement('div');
  panel.className = 'polish-panel';
  panel.style.pointerEvents = 'auto';
  panel.style.display = 'none';
  shadow.appendChild(panel);

  // Panel header (draggable)
  const panelHeader = document.createElement('div');
  panelHeader.className = 'polish-panel-header';
  panelHeader.innerHTML = '<span class="polish-panel-title">Properties</span><span class="polish-panel-close">\u00D7</span>';
  panel.appendChild(panelHeader);

  const panelBody = document.createElement('div');
  panelBody.className = 'polish-panel-body';
  panel.appendChild(panelBody);

  // -- Panel section builder --
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

  function createColorRow(label, property) {
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

    row.appendChild(controls);
    return { row, picker, hex };
  }

  function createSliderRow(label, property, min, max, step, defaultUnit) {
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

    let unitSelect = null;
    if (defaultUnit) {
      const units = Array.isArray(defaultUnit) ? defaultUnit : [defaultUnit];
      unitSelect = document.createElement('select');
      unitSelect.className = 'polish-unit-select';
      units.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u;
        opt.textContent = u;
        unitSelect.appendChild(opt);
      });
      controls.appendChild(unitSelect);

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

    function getFullValue() {
      const val = numInput.value;
      if (unitSelect) {
        const unit = unitSelect.value;
        return unit === 'auto' ? 'auto' : val + unit;
      }
      return val + (defaultUnit || '');
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

    row.appendChild(controls);
    return { row, slider, numInput, unitSelect };
  }

  function createSelectRow(label, property, options) {
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

  // -- Build sections --

  // Colors section
  const colorsSection = createSection('Colors', 'colors');
  const bgColor = createColorRow('Background', 'background-color');
  const textColor = createColorRow('Text', 'color');
  const borderColor = createColorRow('Border', 'border-color');
  colorsSection.content.appendChild(bgColor.row);
  colorsSection.content.appendChild(textColor.row);
  colorsSection.content.appendChild(borderColor.row);
  panelBody.appendChild(colorsSection.section);

  // Typography section
  const typographySection = createSection('Typography', 'typography');

  const WEB_SAFE_FONTS = [
    'Arial', 'Verdana', 'Helvetica', 'Tahoma', 'Trebuchet MS',
    'Times New Roman', 'Georgia', 'Garamond',
    'Courier New', 'Lucida Console', 'Monaco',
    'system-ui', 'sans-serif', 'serif', 'monospace'
  ];
  const fontFamily = createSelectRow('Family', 'font-family',
    WEB_SAFE_FONTS.map(f => ({ value: f, label: f }))
  );

  const fontSize = createSliderRow('Size', 'font-size', 8, 72, 1, ['px', 'rem', 'em']);

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
  const fontWeight = createSelectRow('Weight', 'font-weight', FONT_WEIGHTS);

  typographySection.content.appendChild(fontFamily.row);
  typographySection.content.appendChild(fontSize.row);
  typographySection.content.appendChild(fontWeight.row);
  panelBody.appendChild(typographySection.section);

  // Size section
  const sizeSection = createSection('Size', 'size');
  const widthCtrl = createSliderRow('Width', 'width', 0, 2000, 1, ['px', '%', 'auto', 'vw']);
  const heightCtrl = createSliderRow('Height', 'height', 0, 2000, 1, ['px', '%', 'auto', 'vh']);
  sizeSection.content.appendChild(widthCtrl.row);
  sizeSection.content.appendChild(heightCtrl.row);
  panelBody.appendChild(sizeSection.section);

  // Spacing section (box model)
  const spacingSection = createSection('Spacing', 'spacing');
  const spacingContainer = document.createElement('div');
  spacingContainer.className = 'polish-spacing-container';

  // Box model visualization
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
  let uniformMode = false;
  lockBtn.addEventListener('click', () => {
    uniformMode = !uniformMode;
    lockBtn.textContent = uniformMode ? '\uD83D\uDD12' : '\uD83D\uDD13';
    lockBtn.classList.toggle('locked', uniformMode);
  });
  lockRow.appendChild(lockBtn);
  const lockLabel = document.createElement('span');
  lockLabel.className = 'polish-lock-label';
  lockLabel.textContent = 'Uniform';
  lockRow.appendChild(lockLabel);
  spacingContainer.appendChild(lockRow);

  spacingSection.content.appendChild(spacingContainer);
  panelBody.appendChild(spacingSection.section);

  // Wire up box model inputs
  boxModel.querySelectorAll('.polish-box-value').forEach(input => {
    input.addEventListener('input', () => {
      const prop = input.dataset.property;
      const val = input.value.trim();
      const fullVal = /\d$/.test(val) ? val + 'px' : val;
      applyLivePreview(prop, fullVal);
      debounceSendChange(prop, fullVal);

      if (uniformMode) {
        const prefix = prop.startsWith('margin') ? 'margin' : 'padding';
        const sides = ['top', 'right', 'bottom', 'left'];
        sides.forEach(side => {
          const sibProp = `${prefix}-${side}`;
          if (sibProp !== prop) {
            const sib = boxModel.querySelector(`[data-property="${sibProp}"]`);
            if (sib) sib.value = input.value;
            applyLivePreview(sibProp, fullVal);
            debounceSendChange(sibProp, fullVal);
          }
        });
      }
    });

    input.addEventListener('change', () => {
      const prop = input.dataset.property;
      const val = input.value.trim();
      const fullVal = /\d$/.test(val) ? val + 'px' : val;
      sendChangeImmediate(prop, fullVal);

      if (uniformMode) {
        const prefix = prop.startsWith('margin') ? 'margin' : 'padding';
        const sides = ['top', 'right', 'bottom', 'left'];
        sides.forEach(side => {
          const sibProp = `${prefix}-${side}`;
          if (sibProp !== prop) {
            sendChangeImmediate(sibProp, fullVal);
          }
        });
      }
    });
  });

  // Effects section
  const effectsSection = createSection('Effects', 'effects');
  const borderRadius = createSliderRow('Radius', 'border-radius', 0, 50, 1, 'px');
  const opacity = createSliderRow('Opacity', 'opacity', 0, 1, 0.01, null);
  effectsSection.content.appendChild(borderRadius.row);
  effectsSection.content.appendChild(opacity.row);
  panelBody.appendChild(effectsSection.section);

  // Panel close button
  panelHeader.querySelector('.polish-panel-close').addEventListener('click', (e) => {
    e.stopPropagation();
    deselectElement();
  });

  // Panel dragging
  let panelDragState = null;

  panelHeader.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('polish-panel-close')) return;
    e.preventDefault();
    const panelRect = panel.getBoundingClientRect();
    panelDragState = {
      startX: e.clientX,
      startY: e.clientY,
      startLeft: panelRect.left,
      startTop: panelRect.top,
    };
  });

  function onPanelDrag(e) {
    if (!panelDragState) return;
    const dx = e.clientX - panelDragState.startX;
    const dy = e.clientY - panelDragState.startY;
    let newLeft = panelDragState.startLeft + dx;
    let newTop = panelDragState.startTop + dy;

    newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - panel.offsetWidth));
    newTop = Math.max(0, Math.min(newTop, window.innerHeight - 40));

    panel.style.left = newLeft + 'px';
    panel.style.top = newTop + 'px';
  }

  function onPanelDragEnd() {
    panelDragState = null;
  }

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

    /* ── Manipulation Panel ─────────────────────────────────────────── */

    .polish-panel {
      position: fixed;
      width: 280px;
      max-height: 80vh;
      background: rgba(30, 30, 30, 0.95);
      color: #e0e0e0;
      font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace;
      font-size: 11px;
      line-height: 1.4;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      z-index: 10;
      overflow: hidden;
      backdrop-filter: blur(12px);
      transition: opacity 0.15s ease, transform 0.15s ease;
    }

    .polish-panel[data-opening] {
      opacity: 0;
      transform: translateY(4px);
    }

    .polish-panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 10px;
      background: rgba(255, 255, 255, 0.05);
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      cursor: grab;
      user-select: none;
    }

    .polish-panel-header:active {
      cursor: grabbing;
    }

    .polish-panel-title {
      font-weight: 600;
      color: #fff;
      font-size: 11px;
    }

    .polish-panel-close {
      cursor: pointer;
      color: #888;
      font-size: 16px;
      line-height: 1;
      padding: 0 2px;
      transition: color 0.1s;
    }

    .polish-panel-close:hover {
      color: #fff;
    }

    .polish-panel-body {
      overflow-y: auto;
      max-height: calc(80vh - 36px);
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.15) transparent;
    }

    .polish-panel-body::-webkit-scrollbar {
      width: 4px;
    }

    .polish-panel-body::-webkit-scrollbar-track {
      background: transparent;
    }

    .polish-panel-body::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.15);
      border-radius: 2px;
    }

    /* ── Sections ─────────────────────────────────────────────────── */

    .polish-section {
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }

    .polish-section:last-child {
      border-bottom: none;
    }

    .polish-section-header {
      padding: 6px 10px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #999;
      cursor: pointer;
      user-select: none;
      transition: color 0.1s;
    }

    .polish-section-header:hover {
      color: #ccc;
    }

    .polish-section-arrow {
      display: inline-block;
      font-size: 8px;
      margin-right: 4px;
      transition: transform 0.15s ease;
      transform: rotate(90deg);
    }

    .polish-section.collapsed .polish-section-arrow {
      transform: rotate(0deg);
    }

    .polish-section-content {
      padding: 4px 10px 8px;
    }

    .polish-section.collapsed .polish-section-content {
      display: none;
    }

    /* ── Control Rows ─────────────────────────────────────────────── */

    .polish-control-row {
      margin-bottom: 6px;
    }

    .polish-control-label {
      display: block;
      font-size: 10px;
      color: #888;
      margin-bottom: 3px;
    }

    .polish-control-inputs {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    /* ── Color Controls ────────────────────────────────────────────── */

    .polish-color-picker {
      width: 28px;
      height: 22px;
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 3px;
      padding: 0;
      cursor: pointer;
      background: none;
      -webkit-appearance: none;
    }

    .polish-color-picker::-webkit-color-swatch-wrapper {
      padding: 1px;
    }

    .polish-color-picker::-webkit-color-swatch {
      border: none;
      border-radius: 2px;
    }

    .polish-hex-input {
      flex: 1;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 3px;
      color: #e0e0e0;
      font-family: inherit;
      font-size: 11px;
      padding: 3px 6px;
      outline: none;
    }

    .polish-hex-input:focus {
      border-color: #4A9EFF;
    }

    /* ── Sliders ───────────────────────────────────────────────────── */

    .polish-slider {
      flex: 1;
      height: 4px;
      -webkit-appearance: none;
      appearance: none;
      background: rgba(255, 255, 255, 0.12);
      border-radius: 2px;
      outline: none;
    }

    .polish-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #4A9EFF;
      cursor: pointer;
      border: none;
    }

    .polish-slider::-moz-range-thumb {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #4A9EFF;
      cursor: pointer;
      border: none;
    }

    /* ── Numeric / Select Inputs ───────────────────────────────────── */

    .polish-num-input {
      width: 44px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 3px;
      color: #e0e0e0;
      font-family: inherit;
      font-size: 11px;
      padding: 3px 4px;
      outline: none;
      text-align: right;
    }

    .polish-num-input:focus {
      border-color: #4A9EFF;
    }

    .polish-num-input::-webkit-inner-spin-button,
    .polish-num-input::-webkit-outer-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }

    .polish-unit-select,
    .polish-select-input {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 3px;
      color: #e0e0e0;
      font-family: inherit;
      font-size: 10px;
      padding: 3px 4px;
      outline: none;
      cursor: pointer;
    }

    .polish-unit-select:focus,
    .polish-select-input:focus {
      border-color: #4A9EFF;
    }

    .polish-select-input {
      flex: 1;
      font-size: 11px;
    }

    .polish-unit-select option,
    .polish-select-input option {
      background: #2a2a2a;
      color: #e0e0e0;
    }

    /* ── Box Model ─────────────────────────────────────────────────── */

    .polish-spacing-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
    }

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

    /* ── Lock Button ───────────────────────────────────────────────── */

    .polish-lock-row {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .polish-lock-btn {
      background: none;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 3px;
      color: #888;
      cursor: pointer;
      font-size: 12px;
      padding: 2px 4px;
      transition: color 0.1s, border-color 0.1s;
    }

    .polish-lock-btn:hover {
      color: #ccc;
      border-color: rgba(255, 255, 255, 0.2);
    }

    .polish-lock-btn.locked {
      color: #4A9EFF;
      border-color: rgba(74, 158, 255, 0.3);
    }

    .polish-lock-label {
      font-size: 10px;
      color: #777;
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

  // ── Panel Helpers ─────────────────────────────────────────────────

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

  function positionPanel(elRect) {
    const panelWidth = 280;
    const panelHeight = Math.min(panel.offsetHeight || 400, window.innerHeight * 0.8);
    const gap = 12;

    let left, top;

    // Prefer right side if there's room
    if (elRect.right + gap + panelWidth <= window.innerWidth) {
      left = elRect.right + gap;
    }
    // Try left side
    else if (elRect.left - gap - panelWidth >= 0) {
      left = elRect.left - gap - panelWidth;
    }
    // Fall back to right edge of viewport
    else {
      left = window.innerWidth - panelWidth - 8;
    }

    // Vertically align to the top of the element
    top = elRect.top;

    // Keep panel on screen
    if (top + panelHeight > window.innerHeight) {
      top = window.innerHeight - panelHeight - 8;
    }
    if (top < 8) top = 8;
    if (left < 8) left = 8;

    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
  }

  function initPanelValues(el) {
    const computed = window.getComputedStyle(el);

    // Colors
    bgColor.picker.value = rgbToHex(computed.backgroundColor);
    bgColor.hex.value = bgColor.picker.value;

    textColor.picker.value = rgbToHex(computed.color);
    textColor.hex.value = textColor.picker.value;

    borderColor.picker.value = rgbToHex(computed.borderColor);
    borderColor.hex.value = borderColor.picker.value;

    // Typography
    const currentFont = computed.fontFamily.split(',')[0].trim().replace(/['"]/g, '');
    const fontOptions = fontFamily.select.options;
    let fontFound = false;
    for (let i = 0; i < fontOptions.length; i++) {
      if (fontOptions[i].value === currentFont) {
        fontFamily.select.selectedIndex = i;
        fontFound = true;
        break;
      }
    }
    if (!fontFound) {
      // Add current font as first option
      const opt = document.createElement('option');
      opt.value = currentFont;
      opt.textContent = currentFont + ' (current)';
      fontFamily.select.insertBefore(opt, fontFamily.select.firstChild);
      fontFamily.select.selectedIndex = 0;
    }

    const fsVal = parseNumericValue(computed.fontSize);
    fontSize.slider.value = clampValue(fsVal.num, 8, 72);
    fontSize.numInput.value = clampValue(fsVal.num, 8, 72);
    if (fontSize.unitSelect) {
      for (let i = 0; i < fontSize.unitSelect.options.length; i++) {
        if (fontSize.unitSelect.options[i].value === fsVal.unit) {
          fontSize.unitSelect.selectedIndex = i;
          break;
        }
      }
    }

    const fwVal = computed.fontWeight;
    for (let i = 0; i < fontWeight.select.options.length; i++) {
      if (fontWeight.select.options[i].value === fwVal) {
        fontWeight.select.selectedIndex = i;
        break;
      }
    }

    // Size
    const wVal = parseNumericValue(computed.width);
    widthCtrl.slider.value = clampValue(wVal.num, 0, 2000);
    widthCtrl.numInput.value = clampValue(wVal.num, 0, 2000);
    if (widthCtrl.unitSelect) {
      for (let i = 0; i < widthCtrl.unitSelect.options.length; i++) {
        if (widthCtrl.unitSelect.options[i].value === wVal.unit) {
          widthCtrl.unitSelect.selectedIndex = i;
          break;
        }
      }
    }

    const hVal = parseNumericValue(computed.height);
    heightCtrl.slider.value = clampValue(hVal.num, 0, 2000);
    heightCtrl.numInput.value = clampValue(hVal.num, 0, 2000);
    if (heightCtrl.unitSelect) {
      for (let i = 0; i < heightCtrl.unitSelect.options.length; i++) {
        if (heightCtrl.unitSelect.options[i].value === hVal.unit) {
          heightCtrl.unitSelect.selectedIndex = i;
          break;
        }
      }
    }

    // Spacing (box model)
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

    // Effects
    const brVal = parseNumericValue(computed.borderRadius);
    borderRadius.slider.value = clampValue(brVal.num, 0, 50);
    borderRadius.numInput.value = clampValue(brVal.num, 0, 50);

    const opVal = parseFloat(computed.opacity);
    opacity.slider.value = isNaN(opVal) ? 1 : opVal;
    opacity.numInput.value = isNaN(opVal) ? 1 : opVal;
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
    panelVisible = true;
  }

  function hidePanel() {
    panel.style.display = 'none';
    panelVisible = false;
    sourceData = null;
    // Clear all debounce timers
    Object.keys(debounceTimers).forEach(key => {
      clearTimeout(debounceTimers[key]);
      delete debounceTimers[key];
    });
  }

  function applyLivePreview(property, value) {
    if (!selectedElement) return;
    // Convert property name to camelCase for style assignment
    const camelProp = property.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    selectedElement.style[camelProp] = value;
  }

  function debounceSendChange(property, value) {
    if (debounceTimers[property]) {
      clearTimeout(debounceTimers[property]);
    }
    debounceTimers[property] = setTimeout(() => {
      delete debounceTimers[property];
      sendChangeMessage(property, value);
    }, DEBOUNCE_MS);
  }

  function sendChangeImmediate(property, value) {
    if (debounceTimers[property]) {
      clearTimeout(debounceTimers[property]);
      delete debounceTimers[property];
    }
    sendChangeMessage(property, value);
  }

  function sendChangeMessage(property, value) {
    if (!sourceData) return;
    sendMessage({
      type: 'change',
      file: sourceData.file,
      selector: sourceData.selector,
      property: property,
      value: value,
    });
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

    // Show manipulation panel
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
    selectedElement = null;
    hideBox(selectBox, selectLabel);
    infoPanel.style.display = 'none';
    hidePanel();
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
      if (panelVisible && !panelDragState) {
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
      hidePanel();
      selectedElement = null;
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
        // Store source resolution data for change messages
        sourceData = {
          file: message.file,
          selector: message.selector,
          line: message.line,
          properties: message.properties || {},
        };
        // Re-initialize panel values from source properties if available
        if (selectedElement && message.properties) {
          updatePanelFromSource(message.properties);
        }
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

  function updatePanelFromSource(properties) {
    // If the source resolution provides authored property values, use them
    // to set controls more accurately than computed styles alone.
    // Authored values may differ from computed (e.g., 'auto', percentages, em units).
    if (properties['font-size']) {
      const fsVal = parseNumericValue(properties['font-size']);
      if (fsVal.num > 0) {
        fontSize.slider.value = clampValue(fsVal.num, 8, 72);
        fontSize.numInput.value = clampValue(fsVal.num, 8, 72);
        if (fontSize.unitSelect) {
          for (let i = 0; i < fontSize.unitSelect.options.length; i++) {
            if (fontSize.unitSelect.options[i].value === fsVal.unit) {
              fontSize.unitSelect.selectedIndex = i;
              break;
            }
          }
        }
      }
    }
    if (properties['width']) {
      const wVal = parseNumericValue(properties['width']);
      widthCtrl.slider.value = clampValue(wVal.num, 0, 2000);
      widthCtrl.numInput.value = clampValue(wVal.num, 0, 2000);
      if (widthCtrl.unitSelect && wVal.unit) {
        for (let i = 0; i < widthCtrl.unitSelect.options.length; i++) {
          if (widthCtrl.unitSelect.options[i].value === wVal.unit) {
            widthCtrl.unitSelect.selectedIndex = i;
            break;
          }
        }
      }
    }
    if (properties['height']) {
      const hVal = parseNumericValue(properties['height']);
      heightCtrl.slider.value = clampValue(hVal.num, 0, 2000);
      heightCtrl.numInput.value = clampValue(hVal.num, 0, 2000);
      if (heightCtrl.unitSelect && hVal.unit) {
        for (let i = 0; i < heightCtrl.unitSelect.options.length; i++) {
          if (heightCtrl.unitSelect.options[i].value === hVal.unit) {
            heightCtrl.unitSelect.selectedIndex = i;
            break;
          }
        }
      }
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

  // Panel click handler — intercept clicks within the shadow root on the panel
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
