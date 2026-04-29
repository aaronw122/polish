/**
 * Color parsing, conversion, and format detection.
 *
 * Single source of truth for all color logic in Polish.
 * Uses culori internally; consumers never import culori directly.
 */

import { parse, formatHex, formatRgb, formatHsl, converter } from 'culori';

const toOklchConverter = converter('oklch');
const toOklabConverter = converter('oklab');

// ── CSS named colors (a subset used for detection) ──────────────
// We rely on culori's parse() for full named-color support.
// This set is only for detectFormat().
const NAMED_COLORS = new Set([
  'transparent', 'aliceblue', 'antiquewhite', 'aqua', 'aquamarine',
  'azure', 'beige', 'bisque', 'black', 'blanchedalmond', 'blue',
  'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse',
  'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson',
  'cyan', 'darkblue', 'darkcyan', 'darkgoldenrod', 'darkgray',
  'darkgreen', 'darkgrey', 'darkkhaki', 'darkmagenta', 'darkolivegreen',
  'darkorange', 'darkorchid', 'darkred', 'darksalmon', 'darkseagreen',
  'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise',
  'darkviolet', 'deeppink', 'deepskyblue', 'dimgray', 'dimgrey',
  'dodgerblue', 'firebrick', 'floralwhite', 'forestgreen', 'fuchsia',
  'gainsboro', 'ghostwhite', 'gold', 'goldenrod', 'gray', 'green',
  'greenyellow', 'grey', 'honeydew', 'hotpink', 'indianred', 'indigo',
  'ivory', 'khaki', 'lavender', 'lavenderblush', 'lawngreen',
  'lemonchiffon', 'lightblue', 'lightcoral', 'lightcyan',
  'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey',
  'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue',
  'lightslategray', 'lightslategrey', 'lightsteelblue', 'lightyellow',
  'lime', 'limegreen', 'linen', 'magenta', 'maroon', 'mediumaquamarine',
  'mediumblue', 'mediumorchid', 'mediumpurple', 'mediumseagreen',
  'mediumslateblue', 'mediumspringgreen', 'mediumturquoise',
  'mediumvioletred', 'midnightblue', 'mintcream', 'mistyrose',
  'moccasin', 'navajowhite', 'navy', 'oldlace', 'olive', 'olivedrab',
  'orange', 'orangered', 'orchid', 'palegoldenrod', 'palegreen',
  'paleturquoise', 'palevioletred', 'papayawhip', 'peachpuff', 'peru',
  'pink', 'plum', 'powderblue', 'purple', 'rebeccapurple', 'red',
  'rosybrown', 'royalblue', 'saddlebrown', 'salmon', 'sandybrown',
  'seagreen', 'seashell', 'sienna', 'silver', 'skyblue', 'slateblue',
  'slategray', 'slategrey', 'snow', 'springgreen', 'steelblue', 'tan',
  'teal', 'thistle', 'tomato', 'turquoise', 'violet', 'wheat', 'white',
  'whitesmoke', 'yellow', 'yellowgreen',
]);

// ── detectFormat ────────────────────────────────────────────────

/**
 * Determine the CSS color format of a string as authored.
 *
 * @param {string} cssString - A raw CSS color value
 * @returns {'hex'|'rgb'|'hsl'|'oklch'|'oklab'|'named'|null}
 */
export function detectFormat(cssString) {
  if (cssString == null) return null;
  const s = String(cssString).trim().toLowerCase();
  if (s === '') return null;

  if (s.startsWith('#')) return 'hex';
  if (/^rgba?\s*\(/.test(s)) return 'rgb';
  if (/^hsla?\s*\(/.test(s)) return 'hsl';
  if (/^oklch\s*\(/.test(s)) return 'oklch';
  if (/^oklab\s*\(/.test(s)) return 'oklab';
  if (NAMED_COLORS.has(s)) return 'named';

  return null;
}

// ── isTransparent ───────────────────────────────────────────────

/**
 * Returns true when the color is fully transparent (alpha === 0).
 *
 * @param {string} cssString
 * @returns {boolean}
 */
export function isTransparent(cssString) {
  if (cssString == null) return false;
  const s = String(cssString).trim().toLowerCase();
  if (s === 'transparent') return true;

  const parsed = parse(s);
  if (!parsed) return false;

  // culori uses `alpha` property; defaults to 1 when absent
  return (parsed.alpha ?? 1) === 0;
}

// ── toOklch ─────────────────────────────────────────────────────

/**
 * Convert any CSS color string to an OKLCH object for picker sliders.
 *
 * @param {string} cssString
 * @returns {{ l: number, c: number, h: number } | null}
 */
export function toOklch(cssString) {
  if (cssString == null) return null;
  const s = String(cssString).trim().toLowerCase();
  if (s === '' || s === 'transparent') return null;

  const parsed = parse(s);
  if (!parsed) return null;

  // Skip fully transparent colors
  if ((parsed.alpha ?? 1) === 0) return null;

  const oklch = toOklchConverter(parsed);
  if (!oklch) return null;

  return {
    l: round(oklch.l, 4),
    c: round(oklch.c, 4),
    h: round(oklch.h ?? 0, 2),   // achromatic colors have undefined hue
  };
}

// ── fromOklch ───────────────────────────────────────────────────

/**
 * Convert OKLCH values back to a CSS string in the target format.
 *
 * @param {{ l: number, c: number, h: number }} oklch
 * @param {'hex'|'rgb'|'hsl'|'oklch'|'oklab'|'named'} format
 * @returns {string}
 */
export function fromOklch(oklch, format) {
  if (!oklch) return '#000000';

  const color = { mode: 'oklch', l: oklch.l, c: oklch.c, h: oklch.h };

  switch (format) {
    case 'oklch': {
      const l = round(oklch.l, 4);
      const c = round(oklch.c, 4);
      const h = round(oklch.h ?? 0, 2);
      return `oklch(${l} ${c} ${h})`;
    }

    case 'oklab': {
      // Convert to oklab then format manually
      const lab = toOklabConverter(color);
      const l = round(lab.l, 4);
      const a = round(lab.a, 4);
      const b = round(lab.b, 4);
      return `oklab(${l} ${a} ${b})`;
    }

    case 'rgb': {
      const raw = formatRgb(color);
      // culori outputs "rgb(r, g, b)" — clamp values
      return clampRgbString(raw);
    }

    case 'hsl': {
      const raw = formatHsl(color);
      // culori outputs modern syntax "hsl(h, s%, l%)" — normalise
      return normaliseHslString(raw);
    }

    case 'named':
    case 'hex':
    default: {
      return formatHex(color);
    }
  }
}

// ── fallbackFormat ──────────────────────────────────────────────

/**
 * Scan CSS file contents and determine the most common color format.
 *
 * @param {string[]} cssFiles - Array of CSS file content strings
 * @returns {string} The dominant format, defaulting to 'hex'
 */
export function fallbackFormat(cssFiles) {
  if (!Array.isArray(cssFiles) || cssFiles.length === 0) return 'hex';

  const counts = { hex: 0, rgb: 0, hsl: 0, oklch: 0 };

  for (const content of cssFiles) {
    if (typeof content !== 'string') continue;

    // Count hex colors (#xxx or #xxxxxx, not inside url() or other contexts)
    const hexMatches = content.match(/#(?:[0-9a-fA-F]{3}){1,2}\b/g);
    if (hexMatches) counts.hex += hexMatches.length;

    // Count rgb/rgba
    const rgbMatches = content.match(/\brgba?\s*\(/g);
    if (rgbMatches) counts.rgb += rgbMatches.length;

    // Count hsl/hsla
    const hslMatches = content.match(/\bhsla?\s*\(/g);
    if (hslMatches) counts.hsl += hslMatches.length;

    // Count oklch
    const oklchMatches = content.match(/\boklch\s*\(/g);
    if (oklchMatches) counts.oklch += oklchMatches.length;
  }

  // Find the format with the highest count
  let best = 'hex';
  let max = 0;
  for (const [fmt, count] of Object.entries(counts)) {
    if (count > max) {
      max = count;
      best = fmt;
    }
  }

  return best;
}

// ── Helpers ─────────────────────────────────────────────────────

function round(n, decimals) {
  if (n == null || isNaN(n)) return 0;
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

/**
 * Clamp RGB values in an "rgb(...)" string to 0-255.
 */
function clampRgbString(rgbStr) {
  if (!rgbStr) return 'rgb(0, 0, 0)';
  const match = rgbStr.match(/rgba?\(([^)]+)\)/);
  if (!match) return rgbStr;
  const parts = match[1].split(/[,/\s]+/).filter(Boolean);
  const r = clamp(Math.round(parseFloat(parts[0])), 0, 255);
  const g = clamp(Math.round(parseFloat(parts[1])), 0, 255);
  const b = clamp(Math.round(parseFloat(parts[2])), 0, 255);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Normalise an HSL string to "hsl(h, s%, l%)" format.
 */
function normaliseHslString(hslStr) {
  if (!hslStr) return 'hsl(0, 0%, 0%)';
  const match = hslStr.match(/hsla?\(([^)]+)\)/);
  if (!match) return hslStr;
  const parts = match[1].split(/[,/\s]+/).filter(Boolean);
  const h = Math.round(parseFloat(parts[0]));
  // culori may output s and l as decimals (0-100) or with %
  let s = parseFloat(parts[1]);
  let l = parseFloat(parts[2]);
  // If culori outputs without %, values are 0-100 already
  s = Math.round(clamp(s, 0, 100));
  l = Math.round(clamp(l, 0, 100));
  return `hsl(${h}, ${s}%, ${l}%)`;
}

function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val));
}
