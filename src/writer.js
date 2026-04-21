import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';

// ── Shorthand Expansion Tables ──────────────────────────────────────

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
 * Follows the CSS spec: 1→all, 2→TB/LR, 3→T/LR/B, 4→T/R/B/L.
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
 * Same 1/2/3/4-value pattern as spacing.
 */
function expandBorderRadiusValue(value) {
  // Strip any slash-based syntax for now (e.g., "10px / 5px"), take first half
  const mainPart = value.split('/')[0].trim();
  return expandSpacingValue(mainPart);
}

/**
 * Expand a `border` shorthand into width, style, color components.
 * e.g., "1px solid red" → { border-width: "1px", border-style: "solid", border-color: "red" }
 */
function expandBorderValue(value) {
  const parts = value.trim().split(/\s+/);
  const styles = [
    'none', 'hidden', 'dotted', 'dashed', 'solid',
    'double', 'groove', 'ridge', 'inset', 'outset',
  ];

  let width = '';
  let style = '';
  let color = '';

  for (const part of parts) {
    if (styles.includes(part)) {
      style = part;
    } else if (/^[\d.]/.test(part) || part === 'thin' || part === 'medium' || part === 'thick') {
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

// ── AST Helpers ─────────────────────────────────────────────────────

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
 * Given multiple rules with the same selector, pick the best one using the line hint.
 * If no line hint or no close match, return the last rule (highest specificity in source order).
 */
function disambiguateRule(rules, lineHint) {
  if (rules.length === 1) return rules[0];

  if (lineHint != null) {
    // Find the rule whose source start line is closest to the hint
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

  // Default: last rule in source order
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

// ── CSS Write Logic ─────────────────────────────────────────────────

/**
 * Apply a CSS change to a PostCSS AST root.
 * Handles shorthand expansion, adding new declarations, and adding new rules.
 *
 * Returns the modified root (same object, mutated in place).
 */
function applyChange(root, selector, property, value, lineHint) {
  const rules = findRules(root, selector);

  if (rules.length === 0) {
    // No matching rule — append a new one
    const newRule = postcss.rule({ selector });
    newRule.append(postcss.decl({ prop: property, value }));
    root.append(newRule);
    return root;
  }

  const rule = disambiguateRule(rules, lineHint);
  const parentShorthand = shorthandFor(property);

  // Check if the source uses a shorthand that contains our target longhand
  if (parentShorthand) {
    const shorthandDecl = findDeclaration(rule, parentShorthand);

    if (shorthandDecl) {
      // Expand the shorthand, then set the target longhand
      return expandShorthandAndSet(rule, shorthandDecl, parentShorthand, property, value);
    }
  }

  // Direct write: find the declaration by property name
  const decl = findDeclaration(rule, property);

  if (decl) {
    decl.value = value;
  } else {
    rule.append(postcss.decl({ prop: property, value }));
  }

  return root;
}

/**
 * Expand a shorthand declaration into individual longhands, then set the target value.
 */
function expandShorthandAndSet(rule, shorthandDecl, shorthandProp, targetProp, targetValue) {
  let longhands;
  let longhandNames;

  if (SPACING_LONGHANDS[shorthandProp]) {
    longhandNames = SPACING_LONGHANDS[shorthandProp];
    const values = expandSpacingValue(shorthandDecl.value);
    longhands = longhandNames.map((name, i) => ({ prop: name, value: values[i] }));
  } else if (shorthandProp === 'border-radius') {
    longhandNames = BORDER_RADIUS_LONGHANDS;
    const values = expandBorderRadiusValue(shorthandDecl.value);
    longhands = longhandNames.map((name, i) => ({ prop: name, value: values[i] }));
  } else if (shorthandProp === 'border') {
    longhandNames = BORDER_LONGHANDS;
    const expanded = expandBorderValue(shorthandDecl.value);
    longhands = longhandNames.map((name) => ({ prop: name, value: expanded[name] }));
  } else {
    return rule.root();
  }

  // Override the target longhand value
  for (const lh of longhands) {
    if (lh.prop === targetProp) {
      lh.value = targetValue;
    }
  }

  // Preserve raw formatting from the shorthand declaration
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

// ── File I/O ────────────────────────────────────────────────────────

/**
 * Detect line ending style used in a string.
 */
function detectLineEnding(content) {
  if (content.includes('\r\n')) return '\r\n';
  return '\n';
}

/**
 * Normalize line endings to LF for processing, then restore original.
 */
function normalizeLineEndings(content, originalEnding) {
  if (originalEnding === '\r\n') {
    return content.replace(/\r\n/g, '\n');
  }
  return content;
}

function restoreLineEndings(content, originalEnding) {
  if (originalEnding === '\r\n') {
    return content.replace(/\n/g, '\r\n');
  }
  return content;
}

/**
 * Write a CSS change to a .css file.
 */
async function writeCssFile(filePath, selector, property, value, lineHint) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lineEnding = detectLineEnding(raw);
  const content = normalizeLineEndings(raw, lineEnding);

  const root = postcss.parse(content, { from: filePath });
  applyChange(root, selector, property, value, lineHint);

  let output = root.toString();
  output = restoreLineEndings(output, lineEnding);

  fs.writeFileSync(filePath, output, 'utf-8');
}

/**
 * Write a CSS change to a <style> block inside an HTML file.
 */
async function writeStyleBlock(filePath, selector, property, value, lineHint) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lineEnding = detectLineEnding(raw);
  const content = normalizeLineEndings(raw, lineEnding);

  // Find <style> blocks
  const styleRegex = /(<style[^>]*>)([\s\S]*?)(<\/style>)/gi;
  let match;
  let modified = content;
  let found = false;

  while ((match = styleRegex.exec(content)) !== null) {
    const openTag = match[1];
    const cssContent = match[2];
    const closeTag = match[3];
    const blockStartLine = content.substring(0, match.index).split('\n').length;

    // Parse the CSS inside this style block
    const root = postcss.parse(cssContent, { from: filePath });

    // Check if this block contains a matching rule, or if lineHint falls within it
    const rules = findRules(root, selector);
    const blockEndLine = blockStartLine + cssContent.split('\n').length - 1;
    const lineInBlock = lineHint == null || (lineHint >= blockStartLine && lineHint <= blockEndLine);

    if (rules.length > 0 && lineInBlock) {
      // Adjust line hint relative to the style block
      const adjustedHint = lineHint != null ? lineHint - blockStartLine : null;
      applyChange(root, selector, property, value, adjustedHint);

      const newCss = root.toString();
      modified = content.substring(0, match.index) + openTag + newCss + closeTag +
        content.substring(match.index + match[0].length);
      found = true;
      break;
    }
  }

  if (!found) {
    // No matching rule in any style block — append to the first style block
    const firstMatch = /(<style[^>]*>)([\s\S]*?)(<\/style>)/i.exec(content);
    if (firstMatch) {
      const openTag = firstMatch[1];
      const cssContent = firstMatch[2];
      const closeTag = firstMatch[3];

      const root = postcss.parse(cssContent, { from: filePath });
      applyChange(root, selector, property, value, null);

      const newCss = root.toString();
      modified = content.substring(0, firstMatch.index) + openTag + newCss + closeTag +
        content.substring(firstMatch.index + firstMatch[0].length);
    }
  }

  let output = modified;
  output = restoreLineEndings(output, lineEnding);

  fs.writeFileSync(filePath, output, 'utf-8');
}

/**
 * Write an inline style change to an HTML element's style attribute.
 */
async function writeInlineStyle(filePath, selector, property, value, lineHint) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lineEnding = detectLineEnding(raw);
  const content = normalizeLineEndings(raw, lineEnding);

  const lines = content.split('\n');

  // Parse the selector to extract tag, id, class for matching
  const selectorInfo = parseSelector(selector);

  // Find matching elements by scanning lines
  const candidates = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (matchesElement(line, selectorInfo)) {
      candidates.push(i);
    }
  }

  if (candidates.length === 0) return;

  // Use line hint to disambiguate, or take the first match
  let targetLineIndex;
  if (lineHint != null && candidates.length > 1) {
    // Line hints are 1-based
    targetLineIndex = candidates.reduce((best, idx) =>
      Math.abs(idx + 1 - lineHint) < Math.abs(best + 1 - lineHint) ? idx : best
    );
  } else {
    targetLineIndex = candidates[0];
  }

  const targetLine = lines[targetLineIndex];

  // Parse existing style attribute
  const styleMatch = targetLine.match(/style\s*=\s*"([^"]*)"/);
  let newStyleValue;

  if (styleMatch) {
    const existingStyles = parseInlineStyles(styleMatch[1]);
    existingStyles[property] = value;
    newStyleValue = serializeInlineStyles(existingStyles);
    lines[targetLineIndex] = targetLine.replace(
      /style\s*=\s*"[^"]*"/,
      `style="${newStyleValue}"`
    );
  } else {
    // No style attribute — add one
    newStyleValue = `${property}: ${value}`;
    // Insert style attribute before the closing > of the tag
    lines[targetLineIndex] = targetLine.replace(
      /(<\w[^>]*?)(\s*\/?>)/,
      `$1 style="${newStyleValue}"$2`
    );
  }

  let output = lines.join('\n');
  output = restoreLineEndings(output, lineEnding);

  fs.writeFileSync(filePath, output, 'utf-8');
}

/**
 * Parse a CSS selector into parts for element matching.
 */
function parseSelector(selector) {
  const info = { tag: null, id: null, classes: [] };
  // e.g., "div#main.card.active"
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
 * Check if an HTML line contains an element matching the selector info.
 */
function matchesElement(line, selectorInfo) {
  // Basic heuristic: check if the line contains an opening tag with matching attributes
  const { tag, id, classes } = selectorInfo;

  if (tag && !new RegExp(`<${tag}[\\s>]`, 'i').test(line)) return false;
  if (id && !line.includes(`id="${id}"`)) return false;
  for (const cls of classes) {
    if (!new RegExp(`class\\s*=\\s*"[^"]*\\b${cls}\\b[^"]*"`, 'i').test(line)) return false;
  }

  // At least one selector part must be present
  return tag || id || classes.length > 0;
}

/**
 * Parse an inline style string into a key-value object.
 */
function parseInlineStyles(styleStr) {
  const styles = {};
  const parts = styleStr.split(';').filter(Boolean);
  for (const part of parts) {
    const colonIndex = part.indexOf(':');
    if (colonIndex === -1) continue;
    const prop = part.substring(0, colonIndex).trim();
    const val = part.substring(colonIndex + 1).trim();
    if (prop) styles[prop] = val;
  }
  return styles;
}

/**
 * Serialize a style object back into an inline style string.
 */
function serializeInlineStyles(styles) {
  return Object.entries(styles)
    .map(([prop, val]) => `${prop}: ${val}`)
    .join('; ');
}

// ── Debounce Layer ──────────────────────────────────────────────────

/**
 * Creates a writer instance with debounce support.
 *
 * @param {string} projectDir - Root directory of the user's project
 * @returns {object} Writer API
 */
export function createWriter(projectDir) {
  const pending = new Map(); // key → { filePath, selector, property, value, lineHint, timer }
  const DEBOUNCE_MS = 100;

  /**
   * Determine the write strategy based on the file path and message hints.
   */
  function resolveStrategy(file) {
    const ext = path.extname(file).toLowerCase();
    if (ext === '.css') return 'css';
    if (ext === '.html' || ext === '.htm') return 'html';
    return 'css'; // default
  }

  /**
   * Actually flush a buffered write to disk.
   */
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
    const resolvedType = styleType || resolveStrategy(file);

    const key = `${filePath}::${selector}::${property}`;

    // Cancel any pending timer for this key
    const existing = pending.get(key);
    if (existing?.timer) {
      clearTimeout(existing.timer);
    }

    const entry = {
      filePath,
      selector,
      property,
      value,
      lineHint,
      styleType: resolvedType,
      timer: setTimeout(() => flush(key), DEBOUNCE_MS),
    };

    pending.set(key, entry);
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
    // Exposed for testing
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
