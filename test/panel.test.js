import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ── Import pure logic from the Svelte overlay modules ─────────────
import {
  clampValue,
  rgbToHex,
  parseNumericValue,
  cssToCamel,
  computePanelPosition,
  formatSpacingValue,
  buildChangeMessage,
  isOverlayToggleShortcut,
  DEBOUNCE_MS,
} from '../src/overlay/lib/utils.js';

import {
  CONTROL_SCHEMA,
  WEB_SAFE_FONTS,
  FONT_WEIGHTS,
  SPACING_PROPS,
  BORDER_PROPS,
  LAYOUT_PROPS,
  SIZE_CONTROLS,
  isTextElement,
  SECTION_PROPS_MAP,
  computeCollapsedSections,
} from '../src/overlay/lib/schema.js';

// ═══════════════════════════════════════════════════════════════════
// clampValue
// ═══════════════════════════════════════════════════════════════════

describe('clampValue', () => {
  it('returns the value when within range', () => {
    assert.equal(clampValue(10, 0, 100), 10);
  });

  it('clamps to min when value is below', () => {
    assert.equal(clampValue(-5, 0, 100), 0);
  });

  it('clamps to max when value is above', () => {
    assert.equal(clampValue(150, 0, 100), 100);
  });

  it('returns min for NaN', () => {
    assert.equal(clampValue(NaN, 0, 100), 0);
  });

  it('handles float ranges correctly', () => {
    assert.equal(clampValue(0.5, 0, 1), 0.5);
    assert.equal(clampValue(-0.1, 0, 1), 0);
    assert.equal(clampValue(1.5, 0, 1), 1);
  });

  it('handles edge values exactly at min and max', () => {
    assert.equal(clampValue(0, 0, 100), 0);
    assert.equal(clampValue(100, 0, 100), 100);
  });
});

// ═══════════════════════════════════════════════════════════════════
// rgbToHex
// ═══════════════════════════════════════════════════════════════════

describe('rgbToHex', () => {
  it('converts rgb() to hex', () => {
    assert.equal(rgbToHex('rgb(255, 0, 0)'), '#ff0000');
    assert.equal(rgbToHex('rgb(0, 128, 255)'), '#0080ff');
    assert.equal(rgbToHex('rgb(0, 0, 0)'), '#000000');
    assert.equal(rgbToHex('rgb(255, 255, 255)'), '#ffffff');
  });

  it('converts rgba() to hex (ignoring alpha)', () => {
    assert.equal(rgbToHex('rgba(255, 0, 0, 0.5)'), '#ff0000');
    assert.equal(rgbToHex('rgba(0, 128, 255, 1)'), '#0080ff');
  });

  it('returns transparent for transparent values', () => {
    assert.equal(rgbToHex('transparent'), 'transparent');
    assert.equal(rgbToHex('rgba(0, 0, 0, 0)'), 'transparent');
  });

  it('returns transparent for null/undefined/empty', () => {
    assert.equal(rgbToHex(null), 'transparent');
    assert.equal(rgbToHex(undefined), 'transparent');
    assert.equal(rgbToHex(''), 'transparent');
  });

  it('passes through hex values', () => {
    assert.equal(rgbToHex('#ff0000'), '#ff0000');
    assert.equal(rgbToHex('#abc'), '#abc');
  });

  it('returns #000000 for unrecognized formats', () => {
    assert.equal(rgbToHex('hsl(0, 100%, 50%)'), '#000000');
    assert.equal(rgbToHex('red'), '#000000');
  });
});

// ═══════════════════════════════════════════════════════════════════
// parseNumericValue
// ═══════════════════════════════════════════════════════════════════

describe('parseNumericValue', () => {
  it('parses px values', () => {
    assert.deepEqual(parseNumericValue('16px'), { num: 16, unit: 'px' });
    assert.deepEqual(parseNumericValue('0px'), { num: 0, unit: 'px' });
  });

  it('parses rem values', () => {
    assert.deepEqual(parseNumericValue('1.5rem'), { num: 1.5, unit: 'rem' });
  });

  it('parses em values', () => {
    assert.deepEqual(parseNumericValue('2em'), { num: 2, unit: 'em' });
  });

  it('parses percentage values', () => {
    assert.deepEqual(parseNumericValue('50%'), { num: 50, unit: '%' });
    assert.deepEqual(parseNumericValue('100%'), { num: 100, unit: '%' });
  });

  it('parses vw/vh values', () => {
    assert.deepEqual(parseNumericValue('100vw'), { num: 100, unit: 'vw' });
    assert.deepEqual(parseNumericValue('50vh'), { num: 50, unit: 'vh' });
  });

  it('parses bare numbers as px', () => {
    assert.deepEqual(parseNumericValue('24'), { num: 24, unit: 'px' });
  });

  it('returns defaults for auto/none', () => {
    assert.deepEqual(parseNumericValue('auto'), { num: 0, unit: 'px' });
    assert.deepEqual(parseNumericValue('none'), { num: 0, unit: 'px' });
  });

  it('returns defaults for null/undefined/empty', () => {
    assert.deepEqual(parseNumericValue(null), { num: 0, unit: 'px' });
    assert.deepEqual(parseNumericValue(undefined), { num: 0, unit: 'px' });
    assert.deepEqual(parseNumericValue(''), { num: 0, unit: 'px' });
  });

  it('returns defaults for unrecognized formats', () => {
    assert.deepEqual(parseNumericValue('calc(100% - 20px)'), { num: 0, unit: 'px' });
  });

  it('handles negative values', () => {
    assert.deepEqual(parseNumericValue('-10px'), { num: -10, unit: 'px' });
  });

  it('handles decimal values', () => {
    assert.deepEqual(parseNumericValue('1.25rem'), { num: 1.25, unit: 'rem' });
    assert.deepEqual(parseNumericValue('0.5em'), { num: 0.5, unit: 'em' });
  });
});

// ═══════════════════════════════════════════════════════════════════
// buildChangeMessage
// ═══════════════════════════════════════════════════════════════════

describe('buildChangeMessage', () => {
  const mockSource = {
    file: 'styles.css',
    selector: '.card',
    line: 10,
    properties: {},
  };

  it('creates a properly structured change message', () => {
    const msg = buildChangeMessage(mockSource, 'padding-left', '24px');
    assert.deepEqual(msg, {
      type: 'change',
      file: 'styles.css',
      selector: '.card',
      property: 'padding-left',
      value: '24px',
      line: 10,
    });
  });

  it('returns null when source data is missing', () => {
    assert.equal(buildChangeMessage(null, 'color', '#fff'), null);
    assert.equal(buildChangeMessage(undefined, 'color', '#fff'), null);
  });

  it('returns null when source data has no selector', () => {
    assert.equal(buildChangeMessage({ file: 'a.css' }, 'color', '#fff'), null);
  });

  it('handles various property types', () => {
    const colorMsg = buildChangeMessage(mockSource, 'background-color', '#ff0000');
    assert.equal(colorMsg.property, 'background-color');
    assert.equal(colorMsg.value, '#ff0000');

    const fontMsg = buildChangeMessage(mockSource, 'font-family', 'Arial');
    assert.equal(fontMsg.property, 'font-family');
    assert.equal(fontMsg.value, 'Arial');

    const opacityMsg = buildChangeMessage(mockSource, 'opacity', '0.5');
    assert.equal(opacityMsg.property, 'opacity');
    assert.equal(opacityMsg.value, '0.5');
  });

  it('preserves the file and selector from source resolution', () => {
    const customSource = {
      file: 'components/header.css',
      selector: '.nav-link:first-child',
      line: 42,
      properties: {},
    };
    const msg = buildChangeMessage(customSource, 'color', '#333');
    assert.equal(msg.file, 'components/header.css');
    assert.equal(msg.selector, '.nav-link:first-child');
  });
});

// ═══════════════════════════════════════════════════════════════════
// keyboard shortcuts
// ═══════════════════════════════════════════════════════════════════

describe('isOverlayToggleShortcut', () => {
  it('matches Cmd+Shift+P on macOS', () => {
    assert.equal(
      isOverlayToggleShortcut({ metaKey: true, ctrlKey: false, shiftKey: true, code: 'KeyP', key: 'P' }, 'MacIntel'),
      true
    );
  });

  it('matches Ctrl+Shift+P off macOS', () => {
    assert.equal(
      isOverlayToggleShortcut({ metaKey: false, ctrlKey: true, shiftKey: true, code: 'KeyP', key: 'P' }, 'Win32'),
      true
    );
  });

  it('falls back to key when code is unavailable', () => {
    assert.equal(
      isOverlayToggleShortcut({ metaKey: true, ctrlKey: false, shiftKey: true, code: '', key: 'p' }, 'MacIntel'),
      true
    );
  });

  it('ignores missing modifier or shift keys', () => {
    assert.equal(
      isOverlayToggleShortcut({ metaKey: true, ctrlKey: false, shiftKey: false, code: 'KeyP', key: 'P' }, 'MacIntel'),
      false
    );
    assert.equal(
      isOverlayToggleShortcut({ metaKey: false, ctrlKey: false, shiftKey: true, code: 'KeyP', key: 'P' }, 'MacIntel'),
      false
    );
  });
});

// ═══════════════════════════════════════════════════════════════════
// Panel positioning
// ═══════════════════════════════════════════════════════════════════

describe('panel positioning', () => {
  it('positions to the right of element when space allows', () => {
    const elRect = { top: 100, left: 50, right: 200, bottom: 200, width: 150, height: 100 };
    const pos = computePanelPosition(elRect, 1024, 768);
    assert.equal(pos.left, 200 + 12); // right + gap
    // Vertically centered: (768 - 400) / 2 = 184
    assert.equal(pos.top, 184);
  });

  it('positions to the left when no room on right', () => {
    const elRect = { top: 100, left: 500, right: 800, bottom: 200, width: 300, height: 100 };
    const pos = computePanelPosition(elRect, 900, 768);
    assert.equal(pos.left, 208);
    assert.equal(pos.top, 184);
  });

  it('falls back to viewport edge when no room on either side', () => {
    const elRect = { top: 100, left: 0, right: 500, bottom: 200, width: 500, height: 100 };
    const pos = computePanelPosition(elRect, 500, 768);
    assert.equal(pos.left, 500 - 280 - 8);
  });

  it('keeps panel on screen vertically', () => {
    // With a small viewport (400px), centered panel (400px tall) would overflow
    const elRect = { top: 100, left: 50, right: 200, bottom: 150, width: 150, height: 50 };
    const pos = computePanelPosition(elRect, 1024, 400);
    // (400 - 400) / 2 = 0, but clamped: won't go below 8
    assert.ok(pos.top >= 0);
    assert.ok(pos.top + 400 <= 400 + 8);
  });

  it('clamps top to minimum', () => {
    const elRect = { top: -100, left: 50, right: 200, bottom: 50, width: 150, height: 150 };
    const pos = computePanelPosition(elRect, 1024, 768);
    assert.ok(pos.top >= 0);
  });

  it('clamps left to minimum', () => {
    const elRect = { top: 100, left: -200, right: 100, bottom: 200, width: 300, height: 100 };
    const pos = computePanelPosition(elRect, 400, 768);
    assert.equal(pos.left, 100 + 12);
  });

  it('handles large elements covering the viewport', () => {
    const elRect = { top: 0, left: 0, right: 1024, bottom: 768, width: 1024, height: 768 };
    const pos = computePanelPosition(elRect, 1024, 768);
    assert.equal(pos.left, 1024 - 280 - 12);
    assert.equal(pos.top, 12);
  });
});

// ═══════════════════════════════════════════════════════════════════
// CSS property to camelCase conversion
// ═══════════════════════════════════════════════════════════════════

describe('CSS property to camelCase', () => {
  it('converts hyphenated properties to camelCase', () => {
    assert.equal(cssToCamel('background-color'), 'backgroundColor');
    assert.equal(cssToCamel('font-size'), 'fontSize');
    assert.equal(cssToCamel('border-top-left-radius'), 'borderTopLeftRadius');
    assert.equal(cssToCamel('margin-left'), 'marginLeft');
  });

  it('passes through non-hyphenated properties', () => {
    assert.equal(cssToCamel('color'), 'color');
    assert.equal(cssToCamel('opacity'), 'opacity');
    assert.equal(cssToCamel('width'), 'width');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Box model spacing value formatting
// ═══════════════════════════════════════════════════════════════════

describe('spacing value formatting', () => {
  it('appends px to bare numbers', () => {
    assert.equal(formatSpacingValue('10'), '10px');
    assert.equal(formatSpacingValue('0'), '0px');
    assert.equal(formatSpacingValue('24'), '24px');
  });

  it('preserves values that already have units', () => {
    assert.equal(formatSpacingValue('10px'), '10px');
    assert.equal(formatSpacingValue('1rem'), '1rem');
    assert.equal(formatSpacingValue('50%'), '50%');
  });

  it('handles whitespace', () => {
    assert.equal(formatSpacingValue('  10  '), '10px');
    assert.equal(formatSpacingValue(' 10px '), '10px');
  });
});

// ═══════════════════════════════════════════════════════════════════
// CONTROL_SCHEMA structure validation
// ═══════════════════════════════════════════════════════════════════

describe('CONTROL_SCHEMA', () => {
  it('has the expected sections', () => {
    const sectionIds = CONTROL_SCHEMA.map(s => s.id);
    assert.deepEqual(sectionIds, ['colors', 'text', 'effects']);
  });

  it('every control has required fields', () => {
    for (const section of CONTROL_SCHEMA) {
      for (const control of section.controls) {
        assert.ok(control.property, `Missing property in ${section.id}`);
        assert.ok(control.type, `Missing type for ${control.property}`);
        assert.ok(control.label, `Missing label for ${control.property}`);
        assert.ok(['color', 'slider', 'select'].includes(control.type),
          `Invalid type '${control.type}' for ${control.property}`);
      }
    }
  });

  it('slider controls have min/max/step', () => {
    for (const section of CONTROL_SCHEMA) {
      for (const control of section.controls) {
        if (control.type === 'slider') {
          assert.ok(typeof control.min === 'number', `Missing min for ${control.property}`);
          assert.ok(typeof control.max === 'number', `Missing max for ${control.property}`);
          assert.ok(typeof control.step === 'number', `Missing step for ${control.property}`);
        }
      }
    }
  });

  it('select controls have options array', () => {
    for (const section of CONTROL_SCHEMA) {
      for (const control of section.controls) {
        if (control.type === 'select') {
          assert.ok(Array.isArray(control.options), `Missing options for ${control.property}`);
          assert.ok(control.options.length > 0, `Empty options for ${control.property}`);
        }
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// SPACING_PROPS
// ═══════════════════════════════════════════════════════════════════

describe('SPACING_PROPS', () => {
  it('has all 8 margin/padding sides', () => {
    assert.equal(SPACING_PROPS.length, 8);
    assert.ok(SPACING_PROPS.includes('margin-top'));
    assert.ok(SPACING_PROPS.includes('padding-bottom'));
  });
});

// ═══════════════════════════════════════════════════════════════════
// SIZE_CONTROLS
// ═══════════════════════════════════════════════════════════════════

describe('SIZE_CONTROLS', () => {
  it('has width and height controls', () => {
    const props = SIZE_CONTROLS.map(c => c.property);
    assert.deepEqual(props, ['width', 'height']);
  });

  it('controls have slider type with required fields', () => {
    for (const control of SIZE_CONTROLS) {
      assert.equal(control.type, 'slider');
      assert.ok(typeof control.min === 'number');
      assert.ok(typeof control.max === 'number');
      assert.ok(typeof control.step === 'number');
      assert.ok(control.label);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// isTextElement
// ═══════════════════════════════════════════════════════════════════

describe('isTextElement', () => {
  it('returns true for text elements', () => {
    assert.ok(isTextElement('p'));
    assert.ok(isTextElement('h1'));
    assert.ok(isTextElement('span'));
    assert.ok(isTextElement('a'));
    assert.ok(isTextElement('label'));
    assert.ok(isTextElement('li'));
    assert.ok(isTextElement('blockquote'));
    assert.ok(isTextElement('code'));
    assert.ok(isTextElement('pre'));
    assert.ok(isTextElement('td'));
    assert.ok(isTextElement('summary'));
  });

  it('returns false for container elements', () => {
    assert.ok(!isTextElement('div'));
    assert.ok(!isTextElement('section'));
    assert.ok(!isTextElement('main'));
    assert.ok(!isTextElement('header'));
    assert.ok(!isTextElement('footer'));
    assert.ok(!isTextElement('nav'));
    assert.ok(!isTextElement('article'));
    assert.ok(!isTextElement('aside'));
    assert.ok(!isTextElement('ul'));
    assert.ok(!isTextElement('ol'));
    assert.ok(!isTextElement('form'));
  });

  it('is case-insensitive', () => {
    assert.ok(isTextElement('P'));
    assert.ok(isTextElement('H1'));
    assert.ok(isTextElement('SPAN'));
    assert.ok(isTextElement('DIV') === false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════

describe('constants', () => {
  it('DEBOUNCE_MS is 150ms', () => {
    assert.equal(DEBOUNCE_MS, 150);
  });

  it('WEB_SAFE_FONTS has expected fonts', () => {
    assert.ok(WEB_SAFE_FONTS.includes('Arial'));
    assert.ok(WEB_SAFE_FONTS.includes('monospace'));
    assert.ok(WEB_SAFE_FONTS.length >= 10);
  });

  it('FONT_WEIGHTS covers standard range', () => {
    assert.equal(FONT_WEIGHTS.length, 9);
    assert.equal(FONT_WEIGHTS[0].value, '100');
    assert.equal(FONT_WEIGHTS[8].value, '900');
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION_PROPS_MAP
// ═══════════════════════════════════════════════════════════════════

describe('SECTION_PROPS_MAP', () => {
  it('has entries for all six panel sections', () => {
    const ids = Object.keys(SECTION_PROPS_MAP);
    assert.deepEqual(ids.sort(), ['border', 'colors', 'effects', 'layout', 'spacing', 'text']);
  });

  it('text section has font-family, font-size, font-weight', () => {
    assert.deepEqual(SECTION_PROPS_MAP.text, ['font-family', 'font-size', 'font-weight']);
  });

  it('layout section matches LAYOUT_PROPS', () => {
    assert.deepEqual(SECTION_PROPS_MAP.layout, LAYOUT_PROPS);
  });

  it('spacing section matches SPACING_PROPS', () => {
    assert.deepEqual(SECTION_PROPS_MAP.spacing, SPACING_PROPS);
  });

  it('border section matches BORDER_PROPS', () => {
    assert.deepEqual(SECTION_PROPS_MAP.border, BORDER_PROPS);
  });

  it('colors section has background-color and color', () => {
    assert.deepEqual(SECTION_PROPS_MAP.colors, ['background-color', 'color']);
  });

  it('effects section has border-radius and opacity', () => {
    assert.deepEqual(SECTION_PROPS_MAP.effects, ['border-radius', 'opacity']);
  });
});

// ═══════════════════════════════════════════════════════════════════
// computeCollapsedSections
// ═══════════════════════════════════════════════════════════════════

describe('computeCollapsedSections', () => {
  const allSections = ['text', 'layout', 'spacing', 'border', 'colors', 'effects'];

  it('collapses all sections when no authored properties', () => {
    const result = computeCollapsedSections({}, allSections);
    for (const id of allSections) {
      assert.equal(result[id], true, `${id} should be collapsed`);
    }
  });

  it('collapses all sections when properties is null/undefined', () => {
    const result = computeCollapsedSections(null, allSections);
    for (const id of allSections) {
      assert.equal(result[id], true, `${id} should be collapsed`);
    }
  });

  it('expands section with authored property', () => {
    const result = computeCollapsedSections({ 'font-size': '16px' }, allSections);
    assert.equal(result.text, false, 'text should be expanded');
    assert.equal(result.layout, true, 'layout should be collapsed');
    assert.equal(result.colors, true, 'colors should be collapsed');
  });

  it('expands colors section when background-color is authored', () => {
    const result = computeCollapsedSections({ 'background-color': '#fff' }, allSections);
    assert.equal(result.colors, false, 'colors should be expanded');
    assert.equal(result.text, true, 'text should be collapsed');
  });

  it('expands multiple sections with authored properties', () => {
    const result = computeCollapsedSections({
      'font-size': '16px',
      'color': '#333',
      'padding-top': '10px',
    }, allSections);
    assert.equal(result.text, false, 'text expanded (font-size)');
    assert.equal(result.colors, false, 'colors expanded (color)');
    assert.equal(result.spacing, false, 'spacing expanded (padding-top)');
    assert.equal(result.layout, true, 'layout collapsed');
    assert.equal(result.border, true, 'border collapsed');
    assert.equal(result.effects, true, 'effects collapsed');
  });

  it('expands layout section when width is authored', () => {
    const result = computeCollapsedSections({ 'width': '100px' }, allSections);
    assert.equal(result.layout, false, 'layout should be expanded');
  });

  it('expands border section when any border prop is authored', () => {
    const result = computeCollapsedSections({ 'border-top-width': '1px' }, allSections);
    assert.equal(result.border, false, 'border should be expanded');
  });

  it('expands effects section when border-radius is authored', () => {
    const result = computeCollapsedSections({ 'border-radius': '8px' }, allSections);
    assert.equal(result.effects, false, 'effects should be expanded');
  });

  it('only computes for requested section ids', () => {
    const result = computeCollapsedSections({ 'font-size': '16px' }, ['text', 'colors']);
    assert.equal(result.text, false);
    assert.equal(result.colors, true);
    assert.equal(result.layout, undefined, 'layout not requested');
  });
});

// ═══════════════════════════════════════════════════════════════════
// getPanelSections logic (replicated from Panel.svelte for testing)
// ═══════════════════════════════════════════════════════════════════

/**
 * Replicate the pure logic of getPanelSections from Panel.svelte.
 * This mirrors the exact implementation so we can test section ordering
 * without needing a Svelte runtime.
 */
function getPanelSections(tagName) {
  const sectionMap = {};
  for (const s of CONTROL_SCHEMA) {
    sectionMap[s.id] = s;
  }
  sectionMap['layout'] = { section: 'Layout', id: 'layout', controls: null };
  sectionMap['spacing'] = { section: 'Position', id: 'spacing', controls: null };
  sectionMap['border'] = { section: 'Border', id: 'border', controls: null };

  const isText = isTextElement(tagName);

  const order = isText
    ? ['text', 'layout', 'spacing', 'border', 'colors', 'effects']
    : ['layout', 'spacing', 'border', 'colors', 'text', 'effects'];

  return order.map(id => sectionMap[id]).filter(Boolean);
}

describe('getPanelSections — section ordering by element type', () => {
  it('returns Text first for text elements (h1)', () => {
    const sections = getPanelSections('h1');
    assert.equal(sections[0].id, 'text');
  });

  it('returns Layout first for container elements (div)', () => {
    const sections = getPanelSections('div');
    assert.equal(sections[0].id, 'layout');
  });

  it('returns correct order for text elements', () => {
    const ids = getPanelSections('p').map(s => s.id);
    assert.deepEqual(ids, ['text', 'layout', 'spacing', 'border', 'colors', 'effects']);
  });

  it('returns correct order for container elements', () => {
    const ids = getPanelSections('section').map(s => s.id);
    assert.deepEqual(ids, ['layout', 'spacing', 'border', 'colors', 'text', 'effects']);
  });

  it('always returns exactly 6 sections', () => {
    assert.equal(getPanelSections('span').length, 6);
    assert.equal(getPanelSections('div').length, 6);
    assert.equal(getPanelSections('nav').length, 6);
    assert.equal(getPanelSections('h3').length, 6);
  });

  it('Effects section is always last', () => {
    const textSections = getPanelSections('a');
    const containerSections = getPanelSections('main');
    assert.equal(textSections[5].id, 'effects');
    assert.equal(containerSections[5].id, 'effects');
  });

  it('handles various text element tags', () => {
    const textTags = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'a', 'button', 'label', 'li', 'blockquote', 'code', 'pre', 'td', 'summary'];
    for (const tag of textTags) {
      const ids = getPanelSections(tag).map(s => s.id);
      assert.equal(ids[0], 'text', `${tag} should have Text first`);
      assert.equal(ids[1], 'layout', `${tag} should have Layout second`);
    }
  });

  it('handles various container element tags', () => {
    const containerTags = ['div', 'section', 'main', 'header', 'footer', 'nav', 'article', 'aside', 'ul', 'ol', 'form'];
    for (const tag of containerTags) {
      const ids = getPanelSections(tag).map(s => s.id);
      assert.equal(ids[0], 'layout', `${tag} should have Layout first`);
      assert.equal(ids[4], 'text', `${tag} should have Text fifth`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section names — verify renamed sections
// ═══════════════════════════════════════════════════════════════════

describe('section names — renamed sections', () => {
  it('uses "Text" not "Typography" as section name', () => {
    const textSection = CONTROL_SCHEMA.find(s => s.id === 'text');
    assert.ok(textSection, 'text section exists in CONTROL_SCHEMA');
    assert.equal(textSection.section, 'Text');
  });

  it('uses "Position" not "Spacing" as the spacing section label', () => {
    const sections = getPanelSections('div');
    const spacingSection = sections.find(s => s.id === 'spacing');
    assert.ok(spacingSection, 'spacing section exists');
    assert.equal(spacingSection.section, 'Position');
  });

  it('uses "Layout" as the layout section label', () => {
    const sections = getPanelSections('div');
    const layoutSection = sections.find(s => s.id === 'layout');
    assert.ok(layoutSection, 'layout section exists');
    assert.equal(layoutSection.section, 'Layout');
  });

  it('no section is named "Typography"', () => {
    const allSections = getPanelSections('div');
    for (const s of allSections) {
      assert.notEqual(s.section, 'Typography', `Found section named "Typography" (id: ${s.id})`);
    }
  });

  it('no section is named "Size"', () => {
    const allSections = getPanelSections('div');
    for (const s of allSections) {
      assert.notEqual(s.section, 'Size', `Found section named "Size" (id: ${s.id})`);
    }
  });

  it('CONTROL_SCHEMA has no "Typography" or "Size" section names', () => {
    for (const s of CONTROL_SCHEMA) {
      assert.notEqual(s.section, 'Typography');
      assert.notEqual(s.section, 'Size');
    }
  });

  it('section labels for all six sections are correct', () => {
    const sections = getPanelSections('h1');
    const labels = sections.map(s => s.section);
    assert.deepEqual(labels, ['Text', 'Layout', 'Position', 'Border', 'Colors', 'Effects']);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Size controls in Layout section
// ═══════════════════════════════════════════════════════════════════

describe('size controls in Layout section', () => {
  it('LAYOUT_PROPS includes width and height', () => {
    assert.ok(LAYOUT_PROPS.includes('width'), 'LAYOUT_PROPS should include width');
    assert.ok(LAYOUT_PROPS.includes('height'), 'LAYOUT_PROPS should include height');
  });

  it('LAYOUT_PROPS includes flexbox properties alongside size', () => {
    assert.ok(LAYOUT_PROPS.includes('flex-direction'));
    assert.ok(LAYOUT_PROPS.includes('align-items'));
    assert.ok(LAYOUT_PROPS.includes('justify-content'));
    assert.ok(LAYOUT_PROPS.includes('gap'));
    assert.ok(LAYOUT_PROPS.includes('width'));
    assert.ok(LAYOUT_PROPS.includes('height'));
    assert.equal(LAYOUT_PROPS.length, 6);
  });

  it('SIZE_CONTROLS properties are a subset of LAYOUT_PROPS', () => {
    for (const ctrl of SIZE_CONTROLS) {
      assert.ok(
        LAYOUT_PROPS.includes(ctrl.property),
        `SIZE_CONTROLS property "${ctrl.property}" should be in LAYOUT_PROPS`
      );
    }
  });

  it('SECTION_PROPS_MAP.layout includes width and height', () => {
    assert.ok(SECTION_PROPS_MAP.layout.includes('width'));
    assert.ok(SECTION_PROPS_MAP.layout.includes('height'));
  });
});

// ═══════════════════════════════════════════════════════════════════
// Integration: section ordering + auto-collapse
// ═══════════════════════════════════════════════════════════════════

describe('integration: section ordering + auto-collapse', () => {
  const ALL_SECTION_IDS = ['text', 'layout', 'spacing', 'border', 'colors', 'effects'];

  it('text element with font-size authored: Text expanded and first', () => {
    const sections = getPanelSections('h1');
    const collapsed = computeCollapsedSections({ 'font-size': '16px' }, ALL_SECTION_IDS);

    assert.equal(sections[0].id, 'text', 'Text section is first for h1');
    assert.equal(collapsed.text, false, 'Text section is expanded');
    assert.equal(collapsed.layout, true, 'Layout section is collapsed');
    assert.equal(collapsed.colors, true, 'Colors section is collapsed');
  });

  it('container element with width authored: Layout expanded and first', () => {
    const sections = getPanelSections('div');
    const collapsed = computeCollapsedSections({ 'width': '300px' }, ALL_SECTION_IDS);

    assert.equal(sections[0].id, 'layout', 'Layout section is first for div');
    assert.equal(collapsed.layout, false, 'Layout section is expanded');
    assert.equal(collapsed.text, true, 'Text section is collapsed');
  });

  it('text element with no text properties: Text collapsed but still first', () => {
    const sections = getPanelSections('p');
    const collapsed = computeCollapsedSections({ 'background-color': '#fff' }, ALL_SECTION_IDS);

    assert.equal(sections[0].id, 'text', 'Text section is first for p');
    assert.equal(collapsed.text, true, 'Text section is collapsed (no text props)');
    assert.equal(collapsed.colors, false, 'Colors section expanded (background-color)');
  });

  it('empty properties: all sections collapsed regardless of order', () => {
    const collapsed = computeCollapsedSections({}, ALL_SECTION_IDS);
    for (const id of ALL_SECTION_IDS) {
      assert.equal(collapsed[id], true, `${id} should be collapsed when no properties authored`);
    }
  });

  it('switching from text element to container recomputes collapse and order', () => {
    // Simulate selecting an h1 with font-size
    const textSections = getPanelSections('h1');
    const textCollapsed = computeCollapsedSections({ 'font-size': '24px' }, ALL_SECTION_IDS);
    assert.equal(textSections[0].id, 'text');
    assert.equal(textCollapsed.text, false);

    // Simulate switching to a div with padding
    const containerSections = getPanelSections('div');
    const containerCollapsed = computeCollapsedSections({ 'padding-top': '10px' }, ALL_SECTION_IDS);
    assert.equal(containerSections[0].id, 'layout');
    assert.equal(containerCollapsed.text, true, 'Text collapsed after switching to div');
    assert.equal(containerCollapsed.spacing, false, 'Spacing expanded for padding');
  });

  it('switching from container to text element recomputes both order and collapse', () => {
    // Start with div, width authored
    const divSections = getPanelSections('div');
    const divCollapsed = computeCollapsedSections({ 'width': '100%' }, ALL_SECTION_IDS);
    assert.equal(divSections[0].id, 'layout');
    assert.equal(divCollapsed.layout, false);

    // Switch to span, font-family authored
    const spanSections = getPanelSections('span');
    const spanCollapsed = computeCollapsedSections({ 'font-family': 'Arial' }, ALL_SECTION_IDS);
    assert.equal(spanSections[0].id, 'text');
    assert.equal(spanCollapsed.text, false, 'Text expanded for font-family');
    assert.equal(spanCollapsed.layout, true, 'Layout collapsed (no layout props)');
  });

  it('multiple authored properties expand multiple sections', () => {
    const sections = getPanelSections('button');
    const collapsed = computeCollapsedSections({
      'font-size': '14px',
      'background-color': '#333',
      'border-top-width': '1px',
      'opacity': '0.8',
    }, ALL_SECTION_IDS);

    // button is a text element
    assert.equal(sections[0].id, 'text');
    assert.equal(collapsed.text, false, 'Text expanded');
    assert.equal(collapsed.colors, false, 'Colors expanded');
    assert.equal(collapsed.border, false, 'Border expanded');
    assert.equal(collapsed.effects, false, 'Effects expanded');
    assert.equal(collapsed.layout, true, 'Layout collapsed (no layout props)');
    assert.equal(collapsed.spacing, true, 'Spacing collapsed (no spacing props)');
  });

  it('height authored expands Layout section for containers', () => {
    const collapsed = computeCollapsedSections({ 'height': '500px' }, ALL_SECTION_IDS);
    assert.equal(collapsed.layout, false, 'Layout expanded via height');
  });

  it('gap authored expands Layout section', () => {
    const collapsed = computeCollapsedSections({ 'gap': '16px' }, ALL_SECTION_IDS);
    assert.equal(collapsed.layout, false, 'Layout expanded via gap');
  });

  it('flex-direction authored expands Layout section', () => {
    const collapsed = computeCollapsedSections({ 'flex-direction': 'column' }, ALL_SECTION_IDS);
    assert.equal(collapsed.layout, false, 'Layout expanded via flex-direction');
  });

  it('margin authored expands spacing/Position section', () => {
    const collapsed = computeCollapsedSections({ 'margin-left': '20px' }, ALL_SECTION_IDS);
    assert.equal(collapsed.spacing, false, 'Spacing expanded via margin-left');
  });

  it('border color authored expands border section', () => {
    const collapsed = computeCollapsedSections({ 'border-top-color': '#000' }, ALL_SECTION_IDS);
    assert.equal(collapsed.border, false, 'Border expanded via border-top-color');
  });

  it('border style authored expands border section', () => {
    const collapsed = computeCollapsedSections({ 'border-bottom-style': 'solid' }, ALL_SECTION_IDS);
    assert.equal(collapsed.border, false, 'Border expanded via border-bottom-style');
  });

  it('font-weight authored expands text section', () => {
    const collapsed = computeCollapsedSections({ 'font-weight': '700' }, ALL_SECTION_IDS);
    assert.equal(collapsed.text, false, 'Text expanded via font-weight');
  });

  it('color (text color) authored expands colors section', () => {
    const collapsed = computeCollapsedSections({ 'color': '#333' }, ALL_SECTION_IDS);
    assert.equal(collapsed.colors, false, 'Colors expanded via color');
  });
});
