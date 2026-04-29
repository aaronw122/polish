/**
 * CONTROL_SCHEMA — single source of truth for every panel control.
 * Drives DOM construction, computed style sync, and source value sync.
 */

export const WEB_SAFE_FONTS = [
  'Arial', 'Verdana', 'Helvetica', 'Tahoma', 'Trebuchet MS',
  'Times New Roman', 'Georgia', 'Garamond',
  'Courier New', 'Lucida Console', 'Monaco',
  'system-ui', 'sans-serif', 'serif', 'monospace',
];

export const FONT_WEIGHTS = [
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

export const CONTROL_SCHEMA = [
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

/**
 * Spacing properties used in the box model (not schema-driven).
 */
export const SPACING_PROPS = [
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
];

/**
 * Layout properties for flexbox controls (not schema-driven).
 */
export const LAYOUT_PROPS = [
  'flex-direction', 'align-items', 'justify-content', 'gap',
];
