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

  it('returns #000000 for transparent', () => {
    assert.equal(rgbToHex('transparent'), '#000000');
    assert.equal(rgbToHex('rgba(0, 0, 0, 0)'), '#000000');
  });

  it('returns #000000 for null/undefined/empty', () => {
    assert.equal(rgbToHex(null), '#000000');
    assert.equal(rgbToHex(undefined), '#000000');
    assert.equal(rgbToHex(''), '#000000');
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
    assert.deepEqual(sectionIds, ['colors', 'typography', 'size', 'effects']);
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
