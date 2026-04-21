import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';

import { parseInlineStyles, serializeInlineStyles } from './css-utils.js';

// ── Shorthand Expansion ─────────────────────────────────────────────

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
 * Maps a longhand property to its shorthand parent, if any.
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
 * Strips slash-based syntax (e.g., "10px / 5px") and uses the first half.
 */
function expandBorderRadiusValue(value) {
  const mainPart = value.split('/')[0].trim();
  return expandSpacingValue(mainPart);
}

/**
 * Expand a `border` shorthand into width, style, color components.
 * e.g., "1px solid red" -> { border-width: "1px", border-style: "solid", border-color: "red" }
 */
function expandBorderValue(value) {
  const parts = value.trim().split(/\s+/);

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
 * Handles shorthand expansion, updating existing declarations,
 * adding new declarations, and appending new rules.
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
  const parentShorthand = shorthandFor(property);

  // If the source uses a shorthand containing our target longhand, expand it
  if (parentShorthand) {
    const shorthandDecl = findDeclaration(rule, parentShorthand);
    if (shorthandDecl) {
      return expandShorthandAndSet(rule, shorthandDecl, parentShorthand, property, value);
    }
  }

  // Direct write: update existing or append new declaration
  const decl = findDeclaration(rule, property);
  if (decl) {
    decl.value = value;
  } else {
    rule.append(postcss.decl({ prop: property, value }));
  }

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

  // Replace the shorthand with the individual longhands
  for (let i = longhands.length - 1; i >= 0; i--) {
    const newDecl = postcss.decl({ prop: longhands[i].prop, value: longhands[i].value });
    newDecl.raws.before = raws.before;
    newDecl.raws.between = raws.between;
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
 */
function applyToFirstStyleBlock(html, filePath, selector, property, value) {
  const firstMatch = /(<style[^>]*>)([\s\S]*?)(<\/style>)/i.exec(html);
  if (!firstMatch) return html;

  const root = postcss.parse(firstMatch[2], { from: filePath });
  applyChange(root, selector, property, value, null);

  return html.substring(0, firstMatch.index)
    + firstMatch[1] + root.toString() + firstMatch[3]
    + html.substring(firstMatch.index + firstMatch[0].length);
}

/**
 * Write an inline style change to an HTML element's style attribute.
 */
async function writeInlineStyle(filePath, selector, property, value, lineHint) {
  const { content, lineEnding } = readAndNormalize(filePath);
  const lines = content.split('\n');

  const selectorInfo = parseSelectorForLineMatching(selector);
  const candidates = findMatchingLineIndices(lines, selectorInfo);
  if (candidates.length === 0) return;

  const targetLineIndex = pickClosestCandidate(candidates, lineHint);
  lines[targetLineIndex] = updateInlineStyleOnLine(lines[targetLineIndex], property, value);

  writeWithEnding(filePath, lines.join('\n'), lineEnding);
}

// ── Inline Style Line Matching ──────────────────────────────────────

/**
 * Parse a CSS selector into tag/id/classes for line-level HTML matching.
 * This is a lightweight parse used only by the inline-style writer.
 */
function parseSelectorForLineMatching(selector) {
  const info = { tag: null, id: null, classes: [] };

  const idMatch = selector.match(/#([\w-]+)/);
  if (idMatch) info.id = idMatch[1];

  const classMatches = selector.matchAll(/\.([\w-]+)/g);
  for (const m of classMatches) {
    info.classes.push(m[1]);
  }

  const tagMatch = selector.match(/^([\w-]+)/);
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

  async function flush(key) {
    const entry = pending.get(key);
    if (!entry) return;
    pending.delete(key);

    const { filePath, selector, property, value, lineHint, styleType } = entry;

    try {
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
   */
  async function flushAll() {
    const keys = [...pending.keys()];
    for (const key of keys) {
      const entry = pending.get(key);
      if (entry?.timer) clearTimeout(entry.timer);
    }
    await Promise.all(keys.map((key) => flush(key)));
  }

  return {
    applyChange: applyChangeMessage,
    flushAll,
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
  writeCssFile as _writeCssFile,
  writeStyleBlock as _writeStyleBlock,
  writeInlineStyle as _writeInlineStyle,
  parseInlineStyles as _parseInlineStyles,
  serializeInlineStyles as _serializeInlineStyles,
};
