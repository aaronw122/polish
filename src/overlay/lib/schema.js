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
  ]},
  { section: 'Text', id: 'text', controls: [
    { property: 'font-family', type: 'select', label: 'Family',
      options: WEB_SAFE_FONTS.map(f => ({ value: f, label: f })) },
    { property: 'font-size', type: 'slider', label: 'Size',
      min: 8, max: 72, step: 1, units: ['px', 'rem', 'em'] },
    { property: 'font-weight', type: 'select', label: 'Weight',
      options: FONT_WEIGHTS },
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
 * Border properties for per-side border controls (not schema-driven).
 */
export const BORDER_PROPS = [
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
];

/**
 * Layout properties for flexbox controls (not schema-driven).
 */
export const LAYOUT_PROPS = [
  'flex-direction', 'align-items', 'justify-content', 'gap',
  'width', 'height',
];

/**
 * Size controls displayed inside the Layout section (slider-driven).
 */
export const SIZE_CONTROLS = [
  { property: 'width',  type: 'slider', label: 'Width',
    min: 0, max: 2000, step: 1, units: ['px', '%', 'auto', 'vw'] },
  { property: 'height', type: 'slider', label: 'Height',
    min: 0, max: 2000, step: 1, units: ['px', '%', 'auto', 'vh'] },
];

/**
 * Element classification — text elements get Text section prioritized.
 */
const TEXT_ELEMENTS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'a',
  'label', 'li', 'blockquote', 'em', 'strong', 'small',
  'code', 'pre', 'q', 'cite', 'figcaption', 'dt', 'dd',
  'th', 'td', 'caption', 'abbr', 'time', 'mark', 'b', 'i', 'u', 's',
  'sub', 'sup', 'button', 'legend', 'summary',
]);

export function isTextElement(tagName) {
  return TEXT_ELEMENTS.has(tagName.toLowerCase());
}

/**
 * Map of section id → CSS property names used by that section.
 * Used by auto-collapse to determine if a section has authored values.
 */
export const SECTION_PROPS_MAP = {
  text: CONTROL_SCHEMA.find(s => s.id === 'text').controls.map(c => c.property),
  layout: [...LAYOUT_PROPS],
  spacing: [...SPACING_PROPS],
  border: [...BORDER_PROPS],
  colors: CONTROL_SCHEMA.find(s => s.id === 'colors').controls.map(c => c.property),
  effects: CONTROL_SCHEMA.find(s => s.id === 'effects').controls.map(c => c.property),
};

/**
 * Compute collapsed state for each section based on authored properties.
 * Sections with no authored properties start collapsed (true);
 * those with any authored property start expanded (false).
 */
export function computeCollapsedSections(sourceProperties, sectionIds) {
  const result = {};
  const authored = sourceProperties || {};
  for (const id of sectionIds) {
    const props = SECTION_PROPS_MAP[id] || [];
    const hasAuthored = props.some(prop => prop in authored);
    result[id] = !hasAuthored;
  }
  return result;
}
