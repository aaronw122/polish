import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';

import { parseInlineStyles, serializeInlineStyles } from './css-utils.js';

// ── Shorthand / Longhand Relationship Map ───────────────────────────

/**
 * Data-driven map: shorthand property → array of longhand properties it governs.
 *
 * This powers `declAffectsProperty()` and `findGoverningDeclaration()`.
 * When a shorthand is the governing declaration for a longhand, the writer
 * inserts the longhand after the shorthand rather than trying to rewrite
 * the shorthand value (which is lossy for complex shorthands like background/font).
 */
const SHORTHAND_MAP = {
  // Spacing
  padding: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
  margin: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'],

  // Border radius
  'border-radius': [
    'border-top-left-radius', 'border-top-right-radius',
    'border-bottom-right-radius', 'border-bottom-left-radius',
  ],

  // Border (top-level shorthand)
  border: [
    'border-width', 'border-style', 'border-color',
    'border-top-width', 'border-top-style', 'border-top-color',
    'border-right-width', 'border-right-style', 'border-right-color',
    'border-bottom-width', 'border-bottom-style', 'border-bottom-color',
    'border-left-width', 'border-left-style', 'border-left-color',
    'border-top', 'border-right', 'border-bottom', 'border-left',
  ],

  // Border directional shorthands
  'border-top': ['border-top-width', 'border-top-style', 'border-top-color'],
  'border-right': ['border-right-width', 'border-right-style', 'border-right-color'],
  'border-bottom': ['border-bottom-width', 'border-bottom-style', 'border-bottom-color'],
  'border-left': ['border-left-width', 'border-left-style', 'border-left-color'],

  // Border component shorthands
  'border-color': ['border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'],
  'border-width': ['border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width'],
  'border-style': ['border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style'],

  // Background
  background: [
    'background-color', 'background-image', 'background-position',
    'background-size', 'background-repeat', 'background-attachment',
    'background-origin', 'background-clip',
  ],

  // Font
  font: [
    'font-family', 'font-size', 'font-weight', 'font-style',
    'font-variant', 'font-stretch', 'line-height',
  ],

  // Outline
  outline: ['outline-color', 'outline-style', 'outline-width'],

  // Overflow
  overflow: ['overflow-x', 'overflow-y'],

  // Flex
  flex: ['flex-grow', 'flex-shrink', 'flex-basis'],

  // Gap
  gap: ['row-gap', 'column-gap'],

  // Place shorthands
  'place-items': ['align-items', 'justify-items'],
  'place-content': ['align-content', 'justify-content'],
  'place-self': ['align-self', 'justify-self'],

  // Text decoration
  'text-decoration': ['text-decoration-color', 'text-decoration-style', 'text-decoration-line', 'text-decoration-thickness'],

  // Transition
  transition: ['transition-property', 'transition-duration', 'transition-timing-function', 'transition-delay'],

  // Animation
  animation: [
    'animation-name', 'animation-duration', 'animation-timing-function',
    'animation-delay', 'animation-iteration-count', 'animation-direction',
    'animation-fill-mode', 'animation-play-state',
  ],

  // Inset
  inset: ['top', 'right', 'bottom', 'left'],

  // Grid gap (alias)
  'grid-gap': ['grid-row-gap', 'grid-column-gap'],

  // List style
  'list-style': ['list-style-type', 'list-style-position', 'list-style-image'],

  // Columns
  columns: ['column-width', 'column-count'],

  // Flex flow
  'flex-flow': ['flex-direction', 'flex-wrap'],

  // Grid template
  'grid-template': ['grid-template-rows', 'grid-template-columns', 'grid-template-areas'],

  // Grid
  grid: [
    'grid-template-rows', 'grid-template-columns', 'grid-template-areas',
    'grid-auto-rows', 'grid-auto-columns', 'grid-auto-flow',
  ],
};

/**
 * Returns true if `declProp` affects `targetProp`:
 * - exact match (declProp === targetProp)
 * - declProp is a shorthand that contains targetProp as a longhand
 */
function declAffectsProperty(declProp, targetProp) {
  if (declProp === targetProp) return true;
  const longhands = SHORTHAND_MAP[declProp];
  return longhands != null && longhands.includes(targetProp);
}

/**
 * Walk all declarations in a rule and find the one that actually governs
 * `targetProp` — either an exact longhand match or a shorthand that contains it.
 * Uses source order and !important to pick the winner (later in source order wins
 * at equal importance; !important always beats non-important).
 *
 * Returns { decl, kind: 'longhand'|'shorthand', important: boolean } or null.
 */
function findGoverningDeclaration(rule, targetProp) {
  let winner = null;

  rule.walkDecls((decl) => {
    if (!declAffectsProperty(decl.prop, targetProp)) return;

    const candidate = {
      decl,
      kind: decl.prop === targetProp ? 'longhand' : 'shorthand',
      important: !!decl.important,
    };

    if (!winner) {
      winner = candidate;
      return;
    }

    // !important always beats non-important
    if (candidate.important && !winner.important) {
      winner = candidate;
      return;
    }
    if (!candidate.important && winner.important) {
      return;
    }

    // Same importance: later declaration in source order wins
    winner = candidate;
  });

  return winner;
}

/**
 * Insert (or update) a longhand declaration immediately after a governing
 * shorthand. Copies formatting and !important from the shorthand.
 *
 * If a longhand with the same property already exists after the shorthand,
 * update it in place instead of inserting a duplicate.
 */
function upsertLonghandAfterShorthand(rule, shorthandDecl, property, value) {
  // Check if a longhand with this property already exists after the shorthand
  let existingLonghand = null;
  let passedShorthand = false;

  rule.walkDecls((decl) => {
    if (decl === shorthandDecl) {
      passedShorthand = true;
      return;
    }
    if (passedShorthand && decl.prop === property) {
      existingLonghand = decl;
    }
  });

  if (existingLonghand) {
    existingLonghand.value = value;
    if (shorthandDecl.important) {
      existingLonghand.important = true;
    }
    return;
  }

  // Insert a new longhand immediately after the shorthand
  const newDecl = postcss.decl({ prop: property, value });
  newDecl.raws.before = shorthandDecl.raws.before;
  newDecl.raws.between = shorthandDecl.raws.between || ': ';
  if (shorthandDecl.important) {
    newDecl.important = true;
  }
  shorthandDecl.parent.insertAfter(shorthandDecl, newDecl);
}

// ── Shorthand Expansion (padding/margin/border-radius/border) ───────

const SPACING_LONGHANDS = {
  padding: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
  margin: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
};

const BORDER_RADIUS_LONGHANDS = [
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-right-radius',
  'border-bottom-left-radius',
];

const BORDER_LONGHANDS = ['border-width', 'border-style', 'border-color'];

const BORDER_STYLE_KEYWORDS = new Set([
  'none', 'hidden', 'dotted', 'dashed', 'solid',
  'double', 'groove', 'ridge', 'inset', 'outset',
]);

const BORDER_WIDTH_KEYWORDS = new Set(['thin', 'medium', 'thick']);

/**
 * Maps a longhand property to its parent shorthand for the spacing/border-radius/border
 * expansion path. This is only used by the expansion path — the generic governing-declaration
 * mechanism uses SHORTHAND_MAP instead.
 */
function shorthandFor(longhand) {
  for (const [shorthand, longhands] of Object.entries(SPACING_LONGHANDS)) {
    if (longhands.includes(longhand)) return shorthand;
  }
  if (BORDER_RADIUS_LONGHANDS.includes(longhand)) return 'border-radius';
  if (BORDER_LONGHANDS.includes(longhand)) return 'border';
  return null;
}

/**
 * Expand a spacing shorthand (padding/margin) value string into 4 longhand values.
 * Follows the CSS spec: 1->all, 2->TB/LR, 3->T/LR/B, 4->T/R/B/L.
 */
function expandSpacingValue(value) {
  const parts = value.trim().split(/\s+/);
  switch (parts.length) {
    case 1:
      return [parts[0], parts[0], parts[0], parts[0]];
    case 2:
      return [parts[0], parts[1], parts[0], parts[1]];
    case 3:
      return [parts[0], parts[1], parts[2], parts[1]];
    case 4:
      return [parts[0], parts[1], parts[2], parts[3]];
    default:
      return [parts[0], parts[0], parts[0], parts[0]];
  }
}

/**
 * Expand a border-radius shorthand into 4 longhand values.
 * Handles elliptical syntax (e.g., "10px / 5px") by combining horizontal
 * and vertical radii into per-corner values like "10px 5px".
 */
function expandBorderRadiusValue(value) {
  if (value.includes('/')) {
    const [horizontalPart, verticalPart] = value.split('/').map((s) => s.trim());
    const horizontals = expandSpacingValue(horizontalPart);
    const verticals = expandSpacingValue(verticalPart);
    return horizontals.map((h, i) => `${h} ${verticals[i]}`);
  }
  return expandSpacingValue(value);
}

/**
 * Split a CSS value string into tokens, keeping parenthesized groups
 * (e.g., rgb(...), hsl(...), var(...)) intact as single tokens.
 */
function tokenizeCssValue(value) {
  const tokens = [];
  const re = /[^\s(]+(\([^)]*\))?/g;
  let m;
  while ((m = re.exec(value)) !== null) {
    tokens.push(m[0]);
  }
  return tokens;
}

/**
 * Expand a `border` shorthand into width, style, color components.
 * e.g., "1px solid red" -> { border-width: "1px", border-style: "solid", border-color: "red" }
 * Handles functional colors like rgb(255, 0, 0) and hsl(120, 100%, 50%).
 */
function expandBorderValue(value) {
  const parts = tokenizeCssValue(value.trim());

  let width = '';
  let style = '';
  let color = '';

  for (const part of parts) {
    if (BORDER_STYLE_KEYWORDS.has(part)) {
      style = part;
    } else if (/^[\d.]/.test(part) || BORDER_WIDTH_KEYWORDS.has(part)) {
      width = part;
    } else {
      color = part;
    }
  }

  return {
    'border-width': width || 'medium',
    'border-style': style || 'none',
    'border-color': color || 'currentcolor',
  };
}

// ── PostCSS AST Helpers ─────────────────────────────────────────────

/**
 * Find all rules in a PostCSS AST that match the given selector.
 */
function findRules(root, selector) {
  const matches = [];
  root.walkRules((rule) => {
    if (rule.selector === selector) {
      matches.push(rule);
    }
  });
  return matches;
}

/**
 * Given multiple rules with the same selector, pick the one closest
 * to the line hint. Falls back to the last rule (highest source order).
 */
function disambiguateRule(rules, lineHint) {
  if (rules.length === 1) return rules[0];

  if (lineHint != null) {
    let best = rules[0];
    let bestDist = Math.abs((best.source?.start?.line ?? 0) - lineHint);

    for (const rule of rules) {
      const dist = Math.abs((rule.source?.start?.line ?? 0) - lineHint);
      if (dist < bestDist) {
        best = rule;
        bestDist = dist;
      }
    }
    return best;
  }

  return rules[rules.length - 1];
}

/**
 * Find a declaration within a rule by property name.
 */
function findDeclaration(rule, property) {
  let found = null;
  rule.walkDecls(property, (decl) => {
    found = decl;
  });
  return found;
}

// ── CSS AST Mutation ────────────────────────────────────────────────

/**
 * Apply a CSS property change to a PostCSS AST root.
 *
 * Flow:
 * 1. Find the target rule (or create one if none matches).
 * 2. For padding/margin, keep the existing expansion behavior (nice normalization).
 * 3. Otherwise, find the governing declaration for this property (the declaration
 *    that actually controls it, considering source order and !important).
 *    - If it is an exact longhand → update its value directly.
 *    - If it is a shorthand → insert the longhand immediately after the shorthand.
 *    - If none exists → append the property as a new declaration.
 *
 * Mutates and returns the root.
 */
function applyChange(root, selector, property, value, lineHint) {
  const rules = findRules(root, selector);

  if (rules.length === 0) {
    const newRule = postcss.rule({ selector });
    newRule.append(postcss.decl({ prop: property, value }));
    root.append(newRule);
    return root;
  }

  const rule = disambiguateRule(rules, lineHint);

  // For padding/margin, keep the existing expansion behavior
  const parentShorthand = shorthandFor(property);
  if (parentShorthand && SPACING_LONGHANDS[parentShorthand]) {
    const shorthandDecl = findDeclaration(rule, parentShorthand);
    if (shorthandDecl) {
      return expandShorthandAndSet(rule, shorthandDecl, parentShorthand, property, value);
    }
  }

  // Generic: find the governing declaration for this property
  const gov = findGoverningDeclaration(rule, property);

  if (!gov) {
    // No declaration affects this property — append it
    rule.append(postcss.decl({ prop: property, value }));
    return root;
  }

  if (gov.kind === 'longhand') {
    // Exact property exists — update it
    gov.decl.value = value;
    return root;
  }

  // Governing declaration is a shorthand — insert longhand after it
  upsertLonghandAfterShorthand(rule, gov.decl, property, value);
  return root;
}

/**
 * Expand a shorthand declaration into individual longhands,
 * setting the target longhand to the new value.
 */
function expandShorthandAndSet(rule, shorthandDecl, shorthandProp, targetProp, targetValue) {
  const longhands = buildLonghandList(shorthandProp, shorthandDecl.value);
  if (!longhands) return rule.root();

  // Override the target longhand value
  for (const lh of longhands) {
    if (lh.prop === targetProp) {
      lh.value = targetValue;
    }
  }

  // Preserve raw formatting from the original shorthand declaration
  const raws = {
    before: shorthandDecl.raws.before,
    between: shorthandDecl.raws.between || ': ',
  };

  // Preserve !important from the shorthand on all expanded longhands
  const isImportant = !!shorthandDecl.important;

  // Replace the shorthand with the individual longhands
  for (let i = longhands.length - 1; i >= 0; i--) {
    const newDecl = postcss.decl({ prop: longhands[i].prop, value: longhands[i].value });
    newDecl.raws.before = raws.before;
    newDecl.raws.between = raws.between;
    if (isImportant) {
      newDecl.important = true;
    }
    shorthandDecl.parent.insertAfter(shorthandDecl, newDecl);
  }

  shorthandDecl.remove();
  return rule.root();
}

/**
 * Build the list of longhand { prop, value } pairs for a given shorthand.
 * Returns null if the shorthand is unrecognized.
 */
function buildLonghandList(shorthandProp, shorthandValue) {
  if (SPACING_LONGHANDS[shorthandProp]) {
    const names = SPACING_LONGHANDS[shorthandProp];
    const values = expandSpacingValue(shorthandValue);
    return names.map((name, i) => ({ prop: name, value: values[i] }));
  }

  if (shorthandProp === 'border-radius') {
    const values = expandBorderRadiusValue(shorthandValue);
    return BORDER_RADIUS_LONGHANDS.map((name, i) => ({ prop: name, value: values[i] }));
  }

  if (shorthandProp === 'border') {
    const expanded = expandBorderValue(shorthandValue);
    return BORDER_LONGHANDS.map((name) => ({ prop: name, value: expanded[name] }));
  }

  return null;
}

// ── Line Ending Preservation ────────────────────────────────────────

function detectLineEnding(content) {
  return content.includes('\r\n') ? '\r\n' : '\n';
}

function toLF(content, originalEnding) {
  return originalEnding === '\r\n' ? content.replace(/\r\n/g, '\n') : content;
}

function fromLF(content, originalEnding) {
  return originalEnding === '\r\n' ? content.replace(/\n/g, '\r\n') : content;
}

// ── File Writers ────────────────────────────────────────────────────

/**
 * Read a file, normalize line endings to LF for processing,
 * and return both the normalized content and the original ending.
 */
function readAndNormalize(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lineEnding = detectLineEnding(raw);
  const content = toLF(raw, lineEnding);
  return { content, lineEnding };
}

/**
 * Write content to a file, restoring the original line ending style.
 */
function writeWithEnding(filePath, content, lineEnding) {
  const output = fromLF(content, lineEnding);
  fs.writeFileSync(filePath, output, 'utf-8');
}

/**
 * Write a CSS change to a .css file.
 */
async function writeCssFile(filePath, selector, property, value, lineHint) {
  const { content, lineEnding } = readAndNormalize(filePath);

  const root = postcss.parse(content, { from: filePath });
  applyChange(root, selector, property, value, lineHint);

  writeWithEnding(filePath, root.toString(), lineEnding);
}

/**
 * Write a CSS change to a <style> block inside an HTML file.
 *
 * Searches for the style block containing a matching rule (constrained
 * by the line hint if provided), then applies the change within that block.
 * Falls back to appending to the first style block if no match is found.
 */
async function writeStyleBlock(filePath, selector, property, value, lineHint) {
  const { content, lineEnding } = readAndNormalize(filePath);

  const modified = applyToMatchingStyleBlock(content, filePath, selector, property, value, lineHint)
    || applyToFirstStyleBlock(content, filePath, selector, property, value);

  writeWithEnding(filePath, modified, lineEnding);
}

/**
 * Search all <style> blocks for one containing a matching rule
 * within the line-hint range. Returns the modified HTML, or null if not found.
 */
function applyToMatchingStyleBlock(html, filePath, selector, property, value, lineHint) {
  const styleRegex = /(<style[^>]*>)([\s\S]*?)(<\/style>)/gi;
  let match;

  while ((match = styleRegex.exec(html)) !== null) {
    const openTag = match[1];
    const cssContent = match[2];
    const closeTag = match[3];
    const blockStartLine = html.substring(0, match.index).split('\n').length;

    const root = postcss.parse(cssContent, { from: filePath });
    const rules = findRules(root, selector);
    const blockEndLine = blockStartLine + cssContent.split('\n').length - 1;
    const lineInBlock = lineHint == null || (lineHint >= blockStartLine && lineHint <= blockEndLine);

    if (rules.length > 0 && lineInBlock) {
      const adjustedHint = lineHint != null ? lineHint - blockStartLine : null;
      applyChange(root, selector, property, value, adjustedHint);

      return html.substring(0, match.index)
        + openTag + root.toString() + closeTag
        + html.substring(match.index + match[0].length);
    }
  }

  return null;
}

/**
 * Append a change to the first <style> block in the HTML.
 * Used as a fallback when no existing block contains the target selector.
 * If no <style> block exists (e.g., SPA builds), creates a <style data-polish> block.
 */
function applyToFirstStyleBlock(html, filePath, selector, property, value) {
  const firstMatch = /(<style[^>]*>)([\s\S]*?)(<\/style>)/i.exec(html);

  if (firstMatch) {
    const root = postcss.parse(firstMatch[2], { from: filePath });
    applyChange(root, selector, property, value, null);

    return html.substring(0, firstMatch.index)
      + firstMatch[1] + root.toString() + firstMatch[3]
      + html.substring(firstMatch.index + firstMatch[0].length);
  }

  // No <style> block exists — create one (common for SPA builds)
  const newRule = `${selector} { ${property}: ${value}; }`;
  const newBlock = `<style data-polish>\n${newRule}\n  </style>`;

  const headClose = html.lastIndexOf('</head>');
  if (headClose !== -1) {
    return html.substring(0, headClose) + '  ' + newBlock + '\n  ' + html.substring(headClose);
  }
  const bodyClose = html.lastIndexOf('</body>');
  if (bodyClose !== -1) {
    return html.substring(0, bodyClose) + '  ' + newBlock + '\n  ' + html.substring(bodyClose);
  }
  return html + '\n' + newBlock;
}

/**
 * Write an inline style change to an HTML element's style attribute.
 */
async function writeInlineStyle(filePath, selector, property, value, lineHint) {
  const { content, lineEnding } = readAndNormalize(filePath);
  const lines = content.split('\n');

  let targetLineIndex;

  // When the selector is the synthetic [inline] marker, we cannot parse it
  // for tag/id/class matching. Instead, use the line hint directly to find
  // the target element line.
  if (selector === '[inline]' && lineHint != null) {
    // lineHint is 1-based; find the closest line with a style="" attribute
    const hintIdx = lineHint - 1;
    const candidates = [];
    for (let i = 0; i < lines.length; i++) {
      if (/style\s*=\s*"[^"]*"/i.test(lines[i]) || /<\w[^>]*?\s*\/?>/.test(lines[i])) {
        candidates.push(i);
      }
    }
    targetLineIndex = pickClosestCandidate(candidates.length > 0 ? candidates : [hintIdx], lineHint);
  } else {
    const selectorInfo = parseSelectorForLineMatching(selector);
    const candidates = findMatchingLineIndices(lines, selectorInfo);
    if (candidates.length === 0) {
      console.warn(`Polish: writeInlineStyle found no element matching selector "${selector}" in ${filePath}`);
      return;
    }
    targetLineIndex = pickClosestCandidate(candidates, lineHint);
  }

  lines[targetLineIndex] = updateInlineStyleOnLine(lines[targetLineIndex], property, value);

  writeWithEnding(filePath, lines.join('\n'), lineEnding);
}

// ── Inline Style Line Matching ──────────────────────────────────────

/**
 * Parse a CSS selector into tag/id/classes for line-level HTML matching.
 * This is a lightweight parse used only by the inline-style writer.
 */
function parseSelectorForLineMatching(selector) {
  // Only use the last simple selector (the target element, not ancestors)
  const parts = selector.trim().split(/\s+/);
  const target = parts[parts.length - 1];

  const info = { tag: null, id: null, classes: [] };

  const idMatch = target.match(/#([\w-]+)/);
  if (idMatch) info.id = idMatch[1];

  const classMatches = target.matchAll(/\.([\w-]+)/g);
  for (const m of classMatches) {
    info.classes.push(m[1]);
  }

  const tagMatch = target.match(/^([\w-]+)/);
  if (tagMatch) info.tag = tagMatch[1];

  return info;
}

/**
 * Check if an HTML line contains an opening tag matching the selector info.
 */
function lineMatchesSelectorInfo(line, { tag, id, classes }) {
  if (tag && !new RegExp(`<${tag}[\\s>]`, 'i').test(line)) return false;
  if (id && !line.includes(`id="${id}"`)) return false;
  for (const cls of classes) {
    if (!new RegExp(`class\\s*=\\s*"[^"]*\\b${cls}\\b[^"]*"`, 'i').test(line)) return false;
  }

  return tag || id || classes.length > 0;
}

/**
 * Return indices of all lines whose HTML tags match the selector.
 */
function findMatchingLineIndices(lines, selectorInfo) {
  const indices = [];
  for (let i = 0; i < lines.length; i++) {
    if (lineMatchesSelectorInfo(lines[i], selectorInfo)) {
      indices.push(i);
    }
  }
  return indices;
}

/**
 * From a set of candidate line indices, pick the one closest to the line hint.
 * Falls back to the first candidate if no hint is provided.
 */
function pickClosestCandidate(candidates, lineHint) {
  if (lineHint != null && candidates.length > 1) {
    return candidates.reduce((best, idx) =>
      Math.abs(idx + 1 - lineHint) < Math.abs(best + 1 - lineHint) ? idx : best
    );
  }
  return candidates[0];
}

/**
 * Update or add an inline style property on a single HTML line.
 */
function updateInlineStyleOnLine(line, property, value) {
  const styleMatch = line.match(/style\s*=\s*"([^"]*)"/);

  if (styleMatch) {
    const existingStyles = parseInlineStyles(styleMatch[1]);
    existingStyles[property] = value;
    const newStyleValue = serializeInlineStyles(existingStyles);
    return line.replace(/style\s*=\s*"[^"]*"/, `style="${newStyleValue}"`);
  }

  // No style attribute -- add one before the closing >
  const newStyleValue = `${property}: ${value}`;
  return line.replace(
    /(<\w[^>]*?)(\s*\/?>)/,
    `$1 style="${newStyleValue}"$2`
  );
}

// ── Debounce Layer ──────────────────────────────────────────────────

const DEBOUNCE_MS = 100;

/**
 * Determine the write strategy based on the file extension.
 */
function resolveWriteStrategy(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.css') return 'css';
  if (ext === '.html' || ext === '.htm') return 'html';
  return 'css';
}

/**
 * Creates a writer instance with debounce support.
 *
 * @param {string} projectDir - Root directory of the user's project
 * @returns {{ applyChange: Function, flushAll: Function, _pending: Map }}
 */
export function createWriter(projectDir) {
  const pending = new Map();
  /** Per-file promise chains to serialize flushes targeting the same file. */
  const fileChains = new Map();
  /** Files recently written by Polish — watcher should ignore these. */
  const recentWrites = new Set();

  /**
   * Execute a flush within the per-file serialization chain so that
   * concurrent flushes to the same file never race each other.
   */
  function enqueueFlush(filePath, fn) {
    const prev = fileChains.get(filePath) || Promise.resolve();
    const next = prev.then(fn, fn); // always chain, even after rejection
    fileChains.set(filePath, next);
    return next;
  }

  async function flush(key) {
    const entry = pending.get(key);
    if (!entry) return;
    pending.delete(key);

    const { filePath, selector, property, value, lineHint, styleType } = entry;

    return enqueueFlush(filePath, async () => {
      try {
        // Mark this file as a self-write so the watcher can skip its reload
        recentWrites.add(filePath);
        setTimeout(() => recentWrites.delete(filePath), 2000);

        if (styleType === 'inline') {
          await writeInlineStyle(filePath, selector, property, value, lineHint);
        } else if (styleType === 'style-block') {
          await writeStyleBlock(filePath, selector, property, value, lineHint);
        } else {
          await writeCssFile(filePath, selector, property, value, lineHint);
        }
      } catch (err) {
        console.error(`Polish: write-back error for ${filePath}:`, err.message);
      }
    });
  }

  /**
   * Schedule a write. Debounces by file+selector+property key.
   *
   * @param {object} message - The change message from the overlay
   * @param {string} message.file - Relative or absolute file path
   * @param {string} message.selector - CSS selector
   * @param {string} message.property - CSS property name
   * @param {string} message.value - New value
   * @param {number} [message.line] - Line hint from resolver
   * @param {string} [message.styleType] - "inline", "style-block", or "css" (default)
   */
  function applyChangeMessage(message) {
    const { file, selector, property, value, line: lineHint, styleType } = message;

    const filePath = path.isAbsolute(file) ? file : path.resolve(projectDir, file);

    // Path traversal guard: resolved path must stay under projectDir
    const normalizedProject = projectDir.endsWith(path.sep) ? projectDir : projectDir + path.sep;
    if (filePath !== projectDir && !filePath.startsWith(normalizedProject)) {
      throw new Error(`Path traversal blocked: ${file} resolves outside project root`);
    }

    const resolvedType = styleType || resolveWriteStrategy(file);
    const key = `${filePath}::${selector}::${property}`;

    const existing = pending.get(key);
    if (existing?.timer) {
      clearTimeout(existing.timer);
    }

    pending.set(key, {
      filePath,
      selector,
      property,
      value,
      lineHint,
      styleType: resolvedType,
      timer: setTimeout(() => flush(key), DEBOUNCE_MS),
    });
  }

  /**
   * Immediately flush all pending writes (e.g., on "flush" signal).
   * Flushes are serialized per-file via enqueueFlush, so concurrent
   * writes to the same file execute sequentially.
   */
  async function flushAll() {
    const keys = [...pending.keys()];
    for (const key of keys) {
      const entry = pending.get(key);
      if (entry?.timer) clearTimeout(entry.timer);
    }
    // Kick off all flushes — enqueueFlush serializes per-file internally
    keys.forEach((key) => flush(key));
    // Wait for all per-file chains to settle
    await Promise.all([...fileChains.values()]);
  }

  return {
    applyChange: applyChangeMessage,
    flushAll,
    recentWrites,
    _pending: pending,
  };
}

// Exported for unit testing
export {
  applyChange as _applyChange,
  expandSpacingValue as _expandSpacingValue,
  expandBorderRadiusValue as _expandBorderRadiusValue,
  expandBorderValue as _expandBorderValue,
  shorthandFor as _shorthandFor,
  declAffectsProperty as _declAffectsProperty,
  findGoverningDeclaration as _findGoverningDeclaration,
  upsertLonghandAfterShorthand as _upsertLonghandAfterShorthand,
  writeCssFile as _writeCssFile,
  writeStyleBlock as _writeStyleBlock,
  writeInlineStyle as _writeInlineStyle,
  parseInlineStyles as _parseInlineStyles,
  serializeInlineStyles as _serializeInlineStyles,
};
