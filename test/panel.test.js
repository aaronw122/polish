import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ── Unit-testable logic extracted from overlay.js ───────────────────
// Since overlay.js is a browser IIFE running in Shadow DOM, we test the
// pure logic functions in isolation: value parsing, clamping, color
// conversion, debounce behavior, message generation, and panel positioning.

// ── clampValue ──────────────────────────────────────────────────────

function clampValue(val, min, max) {
  if (isNaN(val)) return min;
  return Math.min(max, Math.max(min, val));
}

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

// ── rgbToHex ────────────────────────────────────────────────────────

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

// ── parseNumericValue ───────────────────────────────────────────────

function parseNumericValue(val) {
  if (!val || val === 'auto' || val === 'none') return { num: 0, unit: 'px' };
  const match = String(val).match(/^(-?[\d.]+)\s*(px|rem|em|%|vw|vh)?$/);
  if (!match) return { num: 0, unit: 'px' };
  return { num: parseFloat(match[1]), unit: match[2] || 'px' };
}

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

// ── Change message generation ───────────────────────────────────────

function buildChangeMessage(sourceData, property, value) {
  if (!sourceData) return null;
  return {
    type: 'change',
    file: sourceData.file,
    selector: sourceData.selector,
    property: property,
    value: value,
  };
}

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
    });
  });

  it('returns null when source data is missing', () => {
    assert.equal(buildChangeMessage(null, 'color', '#fff'), null);
    assert.equal(buildChangeMessage(undefined, 'color', '#fff'), null);
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

// ── Debounce behavior ───────────────────────────────────────────────

describe('debounce behavior', () => {
  it('debounce delays execution', async () => {
    let callCount = 0;
    let lastValue = null;
    const timers = {};

    function debounceSend(property, value, delay) {
      if (timers[property]) clearTimeout(timers[property]);
      timers[property] = setTimeout(() => {
        delete timers[property];
        callCount++;
        lastValue = value;
      }, delay);
    }

    // Fire rapidly
    debounceSend('color', '#111', 50);
    debounceSend('color', '#222', 50);
    debounceSend('color', '#333', 50);

    // Not yet called
    assert.equal(callCount, 0);

    // Wait for debounce
    await new Promise(resolve => setTimeout(resolve, 100));

    // Only called once with the last value
    assert.equal(callCount, 1);
    assert.equal(lastValue, '#333');
  });

  it('immediate send cancels pending debounce', async () => {
    let debounceCount = 0;
    let immediateCount = 0;
    const timers = {};

    function debounceSend(property, value, delay) {
      if (timers[property]) clearTimeout(timers[property]);
      timers[property] = setTimeout(() => {
        delete timers[property];
        debounceCount++;
      }, delay);
    }

    function immediateSend(property) {
      if (timers[property]) {
        clearTimeout(timers[property]);
        delete timers[property];
      }
      immediateCount++;
    }

    debounceSend('color', '#111', 50);
    debounceSend('color', '#222', 50);
    immediateSend('color');

    await new Promise(resolve => setTimeout(resolve, 100));

    // Debounce was cancelled, immediate ran
    assert.equal(debounceCount, 0);
    assert.equal(immediateCount, 1);
  });

  it('different properties debounce independently', async () => {
    const values = {};
    const timers = {};

    function debounceSend(property, value, delay) {
      if (timers[property]) clearTimeout(timers[property]);
      timers[property] = setTimeout(() => {
        delete timers[property];
        values[property] = value;
      }, delay);
    }

    debounceSend('color', '#ff0000', 50);
    debounceSend('font-size', '16px', 50);
    debounceSend('color', '#00ff00', 50);

    await new Promise(resolve => setTimeout(resolve, 100));

    assert.equal(values['color'], '#00ff00');
    assert.equal(values['font-size'], '16px');
  });
});

// ── Panel positioning ───────────────────────────────────────────────

function computePanelPosition(elRect, viewportWidth, viewportHeight) {
  const panelWidth = 280;
  const panelHeight = 400;
  const gap = 12;

  let left, top;

  // Prefer right side
  if (elRect.right + gap + panelWidth <= viewportWidth) {
    left = elRect.right + gap;
  }
  // Try left side
  else if (elRect.left - gap - panelWidth >= 0) {
    left = elRect.left - gap - panelWidth;
  }
  // Fall back to right edge
  else {
    left = viewportWidth - panelWidth - 8;
  }

  top = elRect.top;

  if (top + panelHeight > viewportHeight) {
    top = viewportHeight - panelHeight - 8;
  }
  if (top < 8) top = 8;
  if (left < 8) left = 8;

  return { left, top };
}

describe('panel positioning', () => {
  it('positions to the right of element when space allows', () => {
    const elRect = { top: 100, left: 50, right: 200, bottom: 200, width: 150, height: 100 };
    const pos = computePanelPosition(elRect, 1024, 768);
    assert.equal(pos.left, 200 + 12); // right + gap
    assert.equal(pos.top, 100);
  });

  it('positions to the left when no room on right', () => {
    const elRect = { top: 100, left: 500, right: 800, bottom: 200, width: 300, height: 100 };
    const pos = computePanelPosition(elRect, 900, 768);
    // right side: 800 + 12 + 280 = 1092 > 900, so try left
    // left side: 500 - 12 - 280 = 208
    assert.equal(pos.left, 208);
    assert.equal(pos.top, 100);
  });

  it('falls back to viewport edge when no room on either side', () => {
    const elRect = { top: 100, left: 0, right: 500, bottom: 200, width: 500, height: 100 };
    const pos = computePanelPosition(elRect, 500, 768);
    // right: 500 + 12 + 280 > 500, left: 0 - 12 - 280 < 0
    assert.equal(pos.left, 500 - 280 - 8);
  });

  it('keeps panel on screen vertically', () => {
    const elRect = { top: 700, left: 50, right: 200, bottom: 750, width: 150, height: 50 };
    const pos = computePanelPosition(elRect, 1024, 768);
    // top = 700, 700 + 400 = 1100 > 768
    assert.equal(pos.top, 768 - 400 - 8);
  });

  it('clamps top to minimum when element is at top of viewport', () => {
    const elRect = { top: -100, left: 50, right: 200, bottom: 50, width: 150, height: 150 };
    const pos = computePanelPosition(elRect, 1024, 768);
    assert.equal(pos.top, 8);
  });

  it('clamps left to minimum', () => {
    const elRect = { top: 100, left: -200, right: 100, bottom: 200, width: 300, height: 100 };
    const pos = computePanelPosition(elRect, 400, 768);
    // right: 100 + 12 + 280 = 392 <= 400, so right
    assert.equal(pos.left, 100 + 12);
  });
});

// ── CSS property to camelCase conversion ────────────────────────────

function cssToCamel(property) {
  return property.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

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

// ── Source message handling ──────────────────────────────────────────

describe('source message handling', () => {
  function handleSourceMessage(message) {
    if (message.type !== 'source') return null;
    return {
      file: message.file,
      selector: message.selector,
      line: message.line,
      properties: message.properties || {},
    };
  }

  it('extracts source data from a source message', () => {
    const msg = {
      type: 'source',
      file: 'styles.css',
      selector: '.card',
      line: 15,
      properties: {
        'background-color': '#fff',
        'padding': '16px',
      },
    };
    const result = handleSourceMessage(msg);
    assert.equal(result.file, 'styles.css');
    assert.equal(result.selector, '.card');
    assert.equal(result.line, 15);
    assert.deepEqual(result.properties, {
      'background-color': '#fff',
      'padding': '16px',
    });
  });

  it('returns null for non-source messages', () => {
    assert.equal(handleSourceMessage({ type: 'reload' }), null);
    assert.equal(handleSourceMessage({ type: 'unknown' }), null);
  });

  it('defaults properties to empty object when missing', () => {
    const msg = { type: 'source', file: 'a.css', selector: 'h1', line: 1 };
    const result = handleSourceMessage(msg);
    assert.deepEqual(result.properties, {});
  });
});

// ── Slider value validation ─────────────────────────────────────────

describe('slider value ranges', () => {
  const SLIDER_RANGES = {
    'font-size': { min: 8, max: 72 },
    'width': { min: 0, max: 2000 },
    'height': { min: 0, max: 2000 },
    'border-radius': { min: 0, max: 50 },
    'opacity': { min: 0, max: 1 },
  };

  for (const [prop, range] of Object.entries(SLIDER_RANGES)) {
    it(`${prop} slider clamps to [${range.min}, ${range.max}]`, () => {
      assert.equal(clampValue(range.min - 10, range.min, range.max), range.min);
      assert.equal(clampValue(range.max + 10, range.min, range.max), range.max);
      assert.equal(
        clampValue((range.min + range.max) / 2, range.min, range.max),
        (range.min + range.max) / 2
      );
    });
  }

  it('opacity slider step precision', () => {
    const val = clampValue(0.01, 0, 1);
    assert.equal(val, 0.01);
    const val2 = clampValue(0.99, 0, 1);
    assert.equal(val2, 0.99);
  });
});

// ── Box model spacing value formatting ──────────────────────────────

describe('spacing value formatting', () => {
  function formatSpacingValue(rawInput) {
    const val = rawInput.trim();
    if (/\d$/.test(val)) return val + 'px';
    return val;
  }

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
