import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  detectFormat,
  toOklch,
  fromOklch,
  isTransparent,
  fallbackFormat,
} from '../src/overlay/lib/color.js';

// ═══════════════════════════════════════════════════════════════════
// detectFormat
// ═══════════════════════════════════════════════════════════════════

describe('detectFormat', () => {
  it('detects hex colors', () => {
    assert.equal(detectFormat('#f00'), 'hex');
    assert.equal(detectFormat('#ff0000'), 'hex');
    assert.equal(detectFormat('#FF0000'), 'hex');
    assert.equal(detectFormat('#abc'), 'hex');
  });

  it('detects rgb/rgba colors', () => {
    assert.equal(detectFormat('rgb(255, 0, 0)'), 'rgb');
    assert.equal(detectFormat('rgba(255, 0, 0, 0.5)'), 'rgb');
    assert.equal(detectFormat('RGB(255, 0, 0)'), 'rgb');
    assert.equal(detectFormat('rgb( 255 , 0 , 0 )'), 'rgb');
  });

  it('detects hsl/hsla colors', () => {
    assert.equal(detectFormat('hsl(0, 100%, 50%)'), 'hsl');
    assert.equal(detectFormat('hsla(0, 100%, 50%, 1)'), 'hsl');
    assert.equal(detectFormat('HSL(0, 100%, 50%)'), 'hsl');
  });

  it('detects oklch colors', () => {
    assert.equal(detectFormat('oklch(0.63 0.26 29)'), 'oklch');
    assert.equal(detectFormat('OKLCH(0.63 0.26 29)'), 'oklch');
  });

  it('detects oklab colors', () => {
    assert.equal(detectFormat('oklab(0.63 0.12 0.05)'), 'oklab');
    assert.equal(detectFormat('OKLAB(0.63 0.12 0.05)'), 'oklab');
  });

  it('detects named colors', () => {
    assert.equal(detectFormat('red'), 'named');
    assert.equal(detectFormat('transparent'), 'named');
    assert.equal(detectFormat('rebeccapurple'), 'named');
    assert.equal(detectFormat('Blue'), 'named');
    assert.equal(detectFormat('WHITE'), 'named');
  });

  it('returns null for invalid/empty/null inputs', () => {
    assert.equal(detectFormat(null), null);
    assert.equal(detectFormat(undefined), null);
    assert.equal(detectFormat(''), null);
    assert.equal(detectFormat('notacolor'), null);
    assert.equal(detectFormat('123'), null);
  });

  it('handles extra whitespace', () => {
    assert.equal(detectFormat('  #ff0000  '), 'hex');
    assert.equal(detectFormat('  rgb(0,0,0)  '), 'rgb');
  });
});

// ═══════════════════════════════════════════════════════════════════
// isTransparent
// ═══════════════════════════════════════════════════════════════════

describe('isTransparent', () => {
  it('returns true for "transparent"', () => {
    assert.equal(isTransparent('transparent'), true);
    assert.equal(isTransparent('TRANSPARENT'), true);
    assert.equal(isTransparent('  transparent  '), true);
  });

  it('returns true for rgba with alpha 0', () => {
    assert.equal(isTransparent('rgba(0, 0, 0, 0)'), true);
    assert.equal(isTransparent('rgba(255, 128, 64, 0)'), true);
  });

  it('returns false for opaque colors', () => {
    assert.equal(isTransparent('red'), false);
    assert.equal(isTransparent('#ff0000'), false);
    assert.equal(isTransparent('rgb(255, 0, 0)'), false);
    assert.equal(isTransparent('rgba(0, 0, 0, 0.5)'), false);
    assert.equal(isTransparent('rgba(0, 0, 0, 1)'), false);
  });

  it('returns false for null/undefined', () => {
    assert.equal(isTransparent(null), false);
    assert.equal(isTransparent(undefined), false);
  });

  it('returns false for unparseable strings', () => {
    assert.equal(isTransparent('notacolor'), false);
    assert.equal(isTransparent(''), false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// toOklch
// ═══════════════════════════════════════════════════════════════════

describe('toOklch', () => {
  it('converts hex to oklch', () => {
    const result = toOklch('#ff0000');
    assert.ok(result);
    assert.ok(result.l > 0.5 && result.l < 0.7, `expected l near 0.63, got ${result.l}`);
    assert.ok(result.c > 0.2, `expected c > 0.2, got ${result.c}`);
    assert.ok(result.h > 20 && result.h < 35, `expected h near 29, got ${result.h}`);
  });

  it('converts rgb to oklch', () => {
    const result = toOklch('rgb(0, 128, 255)');
    assert.ok(result);
    assert.ok(result.l > 0, 'expected positive lightness');
    assert.ok(result.c > 0, 'expected positive chroma');
  });

  it('converts hsl to oklch', () => {
    const result = toOklch('hsl(120, 100%, 50%)');
    assert.ok(result);
    assert.ok(result.l > 0.8, `expected l near 0.87 for pure green, got ${result.l}`);
  });

  it('converts named colors', () => {
    const result = toOklch('red');
    assert.ok(result);
    assert.ok(result.l > 0.5);
  });

  it('returns null for transparent', () => {
    assert.equal(toOklch('transparent'), null);
  });

  it('returns null for fully transparent rgba', () => {
    assert.equal(toOklch('rgba(0,0,0,0)'), null);
  });

  it('returns null for null/undefined/empty', () => {
    assert.equal(toOklch(null), null);
    assert.equal(toOklch(undefined), null);
    assert.equal(toOklch(''), null);
  });

  it('returns values with correct precision', () => {
    const result = toOklch('#ff0000');
    assert.ok(result);
    // l should have at most 4 decimal places
    const lStr = String(result.l);
    const lDecimals = lStr.includes('.') ? lStr.split('.')[1].length : 0;
    assert.ok(lDecimals <= 4, `l has ${lDecimals} decimals`);
    // h should have at most 2 decimal places
    const hStr = String(result.h);
    const hDecimals = hStr.includes('.') ? hStr.split('.')[1].length : 0;
    assert.ok(hDecimals <= 2, `h has ${hDecimals} decimals`);
  });

  it('handles achromatic colors (black, white)', () => {
    const black = toOklch('#000000');
    assert.ok(black);
    assert.ok(black.l < 0.01, `expected near-zero lightness for black, got ${black.l}`);

    const white = toOklch('#ffffff');
    assert.ok(white);
    assert.ok(white.l > 0.99, `expected near-1 lightness for white, got ${white.l}`);
  });
});

// ═══════════════════════════════════════════════════════════════════
// fromOklch
// ═══════════════════════════════════════════════════════════════════

describe('fromOklch', () => {
  it('outputs hex format', () => {
    const hex = fromOklch({ l: 0.6279, c: 0.2577, h: 29.23 }, 'hex');
    assert.ok(hex.startsWith('#'), `expected hex, got ${hex}`);
    assert.ok(hex.length === 7, `expected 7-char hex, got ${hex}`);
  });

  it('outputs rgb format', () => {
    const rgb = fromOklch({ l: 0.6279, c: 0.2577, h: 29.23 }, 'rgb');
    assert.ok(rgb.startsWith('rgb('), `expected rgb(...), got ${rgb}`);
    assert.ok(rgb.endsWith(')'));
    // Verify values are clamped integers
    const match = rgb.match(/rgb\((\d+), (\d+), (\d+)\)/);
    assert.ok(match, `expected rgb(r, g, b), got ${rgb}`);
    const [, r, g, b] = match.map(Number);
    assert.ok(r >= 0 && r <= 255);
    assert.ok(g >= 0 && g <= 255);
    assert.ok(b >= 0 && b <= 255);
  });

  it('outputs hsl format', () => {
    const hsl = fromOklch({ l: 0.6279, c: 0.2577, h: 29.23 }, 'hsl');
    assert.ok(hsl.startsWith('hsl('), `expected hsl(...), got ${hsl}`);
    const match = hsl.match(/hsl\((\d+), (\d+)%, (\d+)%\)/);
    assert.ok(match, `expected hsl(h, s%, l%), got ${hsl}`);
  });

  it('outputs oklch format', () => {
    const oklch = fromOklch({ l: 0.63, c: 0.26, h: 29 }, 'oklch');
    assert.equal(oklch, 'oklch(0.63 0.26 29)');
  });

  it('outputs oklab format', () => {
    const oklab = fromOklch({ l: 0.63, c: 0.26, h: 29 }, 'oklab');
    assert.ok(oklab.startsWith('oklab('), `expected oklab(...), got ${oklab}`);
  });

  it('falls back to hex for named format', () => {
    const result = fromOklch({ l: 0.63, c: 0.26, h: 29 }, 'named');
    assert.ok(result.startsWith('#'));
  });

  it('falls back to hex for unknown format', () => {
    const result = fromOklch({ l: 0.63, c: 0.26, h: 29 }, 'whatever');
    assert.ok(result.startsWith('#'));
  });

  it('returns #000000 for null input', () => {
    assert.equal(fromOklch(null, 'hex'), '#000000');
  });

  it('round-trips through oklch accurately', () => {
    // Red: parse -> toOklch -> fromOklch -> should be close to original
    const oklch = toOklch('#ff0000');
    const hex = fromOklch(oklch, 'hex');
    // Allow slight rounding differences
    assert.ok(
      hex === '#ff0000' || hex === '#ff0100' || hex === '#fe0000',
      `expected close to #ff0000, got ${hex}`
    );
  });

  it('clamps out-of-gamut RGB values', () => {
    // Extreme oklch values that could produce out-of-range RGB
    const rgb = fromOklch({ l: 1, c: 0.4, h: 120 }, 'rgb');
    const match = rgb.match(/rgb\((\d+), (\d+), (\d+)\)/);
    assert.ok(match, `expected valid rgb, got ${rgb}`);
    const [, r, g, b] = match.map(Number);
    assert.ok(r >= 0 && r <= 255, `r=${r} out of range`);
    assert.ok(g >= 0 && g <= 255, `g=${g} out of range`);
    assert.ok(b >= 0 && b <= 255, `b=${b} out of range`);
  });
});

// ═══════════════════════════════════════════════════════════════════
// fallbackFormat
// ═══════════════════════════════════════════════════════════════════

describe('fallbackFormat', () => {
  it('returns hex when hex colors dominate', () => {
    const css = ['body { color: #fff; background: #000; border: #abc; }'];
    assert.equal(fallbackFormat(css), 'hex');
  });

  it('returns rgb when rgb colors dominate', () => {
    const css = [
      '.a { color: rgb(255,0,0); } .b { color: rgba(0,0,0,0.5); } .c { background: rgb(10,20,30); }',
    ];
    assert.equal(fallbackFormat(css), 'rgb');
  });

  it('returns hsl when hsl colors dominate', () => {
    const css = [
      '.a { color: hsl(0, 100%, 50%); } .b { background: hsla(120, 50%, 50%, 1); } .c { border-color: hsl(240, 80%, 60%); }',
    ];
    assert.equal(fallbackFormat(css), 'hsl');
  });

  it('returns oklch when oklch colors dominate', () => {
    const css = [
      '.a { color: oklch(0.63 0.26 29); } .b { background: oklch(0.5 0.1 200); } .c { border: oklch(0.8 0.15 90); }',
    ];
    assert.equal(fallbackFormat(css), 'oklch');
  });

  it('returns hex for empty input', () => {
    assert.equal(fallbackFormat([]), 'hex');
    assert.equal(fallbackFormat(null), 'hex');
    assert.equal(fallbackFormat(undefined), 'hex');
  });

  it('returns hex when no colors found', () => {
    assert.equal(fallbackFormat(['.a { width: 100px; }']), 'hex');
  });

  it('handles mixed formats across multiple files', () => {
    const files = [
      '.a { color: #fff; background: #000; }',             // 2 hex
      '.b { color: rgb(0,0,0); background: rgb(1,1,1); border: rgb(2,2,2); }', // 3 rgb
    ];
    assert.equal(fallbackFormat(files), 'rgb');
  });

  it('handles non-string entries gracefully', () => {
    const files = [null, undefined, 42, '.a { color: #fff; }'];
    assert.equal(fallbackFormat(files), 'hex');
  });
});
