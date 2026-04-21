import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import * as htmlparser2 from 'htmlparser2';

// ── Specificity ─────────────────────────────────────────────────────

/**
 * Calculate CSS specificity for a selector string.
 * Returns [inline, ids, classes, types] tuple.
 */
export function calculateSpecificity(selector) {
  let ids = 0;
  let classes = 0;
  let types = 0;

  // Remove :not() wrapper but keep its contents for specificity
  const withoutNot = selector.replace(/:not\(([^)]*)\)/g, ' $1 ');

  // Remove attribute selectors content, count them as classes
  const withoutAttrs = withoutNot.replace(/\[[^\]]*\]/g, () => {
    classes++;
    return '';
  });

  // Remove pseudo-elements (::before, ::after, etc.) — count as type
  const withoutPseudoElements = withoutAttrs.replace(/::[a-zA-Z-]+/g, () => {
    types++;
    return '';
  });

  // Remove pseudo-classes (:hover, :focus, etc.) — count as class
  const withoutPseudoClasses = withoutPseudoElements.replace(/:[a-zA-Z-]+/g, () => {
    classes++;
    return '';
  });

  // Count ID selectors
  const idMatches = withoutPseudoClasses.match(/#[a-zA-Z_-][a-zA-Z0-9_-]*/g);
  if (idMatches) ids += idMatches.length;

  // Count class selectors
  const classMatches = withoutPseudoClasses.match(/\.[a-zA-Z_-][a-zA-Z0-9_-]*/g);
  if (classMatches) classes += classMatches.length;

  // Remove IDs and classes to count remaining type selectors
  const stripped = withoutPseudoClasses
    .replace(/#[a-zA-Z_-][a-zA-Z0-9_-]*/g, '')
    .replace(/\.[a-zA-Z_-][a-zA-Z0-9_-]*/g, '')
    .replace(/[>+~*,]/g, ' ')
    .trim();

  const typeMatches = stripped.match(/[a-zA-Z][a-zA-Z0-9-]*/g);
  if (typeMatches) types += typeMatches.length;

  return [0, ids, classes, types];
}

/**
 * Compare two specificity tuples. Returns positive if a > b, negative if a < b, 0 if equal.
 */
export function compareSpecificity(a, b) {
  for (let i = 0; i < 4; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

// ── Selector Matching ───────────────────────────────────────────────

/**
 * Parse a compound selector (no combinators) into its parts.
 * e.g. "div.card#main" => { tag: "div", id: "main", classes: ["card"] }
 */
function parseCompoundSelector(compound) {
  const result = { tag: null, id: null, classes: [] };
  const trimmed = compound.trim();
  if (!trimmed || trimmed === '*') return result;

  // Extract IDs
  const idMatch = trimmed.match(/#([a-zA-Z_-][a-zA-Z0-9_-]*)/g);
  if (idMatch) {
    result.id = idMatch[idMatch.length - 1].slice(1);
  }

  // Extract classes
  const classMatches = trimmed.match(/\.([a-zA-Z_-][a-zA-Z0-9_-]*)/g);
  if (classMatches) {
    result.classes = classMatches.map((c) => c.slice(1));
  }

  // Extract tag — must be the first thing if present, before any . or #
  const tagMatch = trimmed.match(/^([a-zA-Z][a-zA-Z0-9-]*)/);
  if (tagMatch) {
    result.tag = tagMatch[1].toLowerCase();
  }

  return result;
}

/**
 * Test if an element (described by { tag, id, classes }) matches a single compound selector.
 */
function matchesCompound(element, compound) {
  const sel = parseCompoundSelector(compound);

  if (sel.tag && sel.tag !== element.tag?.toLowerCase()) return false;
  if (sel.id && sel.id !== element.id) return false;
  for (const cls of sel.classes) {
    if (!element.classes?.includes(cls)) return false;
  }

  return true;
}

/**
 * Test if an element matches a full selector string.
 *
 * We split on commas (selector groups) and test each.
 * For descendant/child/sibling combinators, we can only reliably match
 * the rightmost compound (the key selector) since we don't have full DOM context.
 * We match the key selector and treat it as a match — specificity will rank results.
 */
function matchesSelector(element, selectorStr) {
  // Handle selector groups (comma-separated)
  const groups = selectorStr.split(',').map((s) => s.trim());

  for (const group of groups) {
    // Split by combinators to get individual compounds
    // We match against the last compound (the key selector)
    const parts = group.split(/\s*[>+~ ]\s*/).filter(Boolean);
    const keySelector = parts[parts.length - 1];

    if (matchesCompound(element, keySelector)) return true;
  }

  return false;
}

// ── CSS Rule Map ────────────────────────────────────────────────────

/**
 * Parse CSS source with PostCSS and extract all rules.
 * Returns an array of rule records.
 */
function parseCSSRules(cssContent, filePath, lineOffset = 0) {
  const rules = [];
  let root;

  try {
    root = postcss.parse(cssContent, { from: filePath });
  } catch (err) {
    console.error(`Polish: failed to parse CSS in ${filePath}:`, err.message);
    return rules;
  }

  root.walkRules((rule) => {
    const properties = {};
    rule.walkDecls((decl) => {
      properties[decl.prop] = decl.value;
    });

    const line = (rule.source?.start?.line || 1) + lineOffset;
    const selector = rule.selector;

    // Handle comma-separated selectors — store one entry per selector group
    // but keep the full selector for the record
    rules.push({
      selector,
      file: filePath,
      line,
      specificity: calculateSpecificity(selector),
      properties,
    });
  });

  return rules;
}

// ── HTML Parsing ────────────────────────────────────────────────────

/**
 * Parse an HTML file to extract:
 * - <style> block contents (parsed as CSS with correct line offsets)
 * - Inline style attributes with element info
 * - <link rel="stylesheet"> hrefs
 */
function parseHTMLFile(htmlContent, filePath) {
  const styleBlocks = [];
  const inlineStyles = [];
  const linkedStylesheets = [];

  let inStyleTag = false;
  let styleStartLine = 0;
  let styleContent = '';
  let currentLine = 1;

  const parser = new htmlparser2.Parser(
    {
      onopentag(name, attribs) {
        if (name === 'style') {
          inStyleTag = true;
          // Track the line where the <style> tag opens.
          // Content starts on the next line (or same line after the tag).
          styleStartLine = currentLine;
          styleContent = '';
        }

        if (name === 'link' && attribs.rel === 'stylesheet' && attribs.href) {
          linkedStylesheets.push(attribs.href);
        }

        if (attribs.style) {
          const tag = name.toLowerCase();
          const id = attribs.id || '';
          const classes = attribs.class ? attribs.class.split(/\s+/).filter(Boolean) : [];
          inlineStyles.push({
            tag,
            id,
            classes,
            style: attribs.style,
            file: filePath,
            line: currentLine,
          });
        }
      },
      ontext(text) {
        if (inStyleTag) {
          styleContent += text;
        }
        // Count newlines in text for line tracking
        const newlines = (text.match(/\n/g) || []).length;
        currentLine += newlines;
      },
      onclosetag(name) {
        if (name === 'style' && inStyleTag) {
          inStyleTag = false;
          styleBlocks.push({
            content: styleContent,
            file: filePath,
            startLine: styleStartLine,
          });
        }
      },
    },
    {
      decodeEntities: true,
      lowerCaseTags: true,
      lowerCaseAttributeNames: true,
      recognizeSelfClosing: true,
    }
  );

  parser.write(htmlContent);
  parser.end();

  return { styleBlocks, inlineStyles, linkedStylesheets };
}

// ── Parse Inline Style String ───────────────────────────────────────

function parseInlineStyles(styleStr) {
  const properties = {};
  if (!styleStr) return properties;

  // Wrap in a dummy rule so PostCSS can parse it
  try {
    const root = postcss.parse(`__inline__ { ${styleStr} }`);
    root.walkDecls((decl) => {
      properties[decl.prop] = decl.value;
    });
  } catch {
    // Fallback: simple split parsing
    const parts = styleStr.split(';').filter(Boolean);
    for (const part of parts) {
      const colonIdx = part.indexOf(':');
      if (colonIdx > 0) {
        const prop = part.slice(0, colonIdx).trim();
        const val = part.slice(colonIdx + 1).trim();
        if (prop) properties[prop] = val;
      }
    }
  }

  return properties;
}

// ── Resolver Class ──────────────────────────────────────────────────

export class Resolver {
  constructor(projectDir) {
    this.projectDir = path.resolve(projectDir);
    this.rules = [];
    this.inlineStyles = [];
  }

  /**
   * Scan the project directory for CSS and HTML files, building the rule map.
   */
  scan() {
    this.rules = [];
    this.inlineStyles = [];

    const files = this._collectFiles(this.projectDir);

    for (const filePath of files) {
      const ext = path.extname(filePath).toLowerCase();
      const content = fs.readFileSync(filePath, 'utf-8');

      if (ext === '.css') {
        const rules = parseCSSRules(content, filePath);
        this.rules.push(...rules);
      } else if (ext === '.html' || ext === '.htm') {
        const { styleBlocks, inlineStyles, linkedStylesheets } = parseHTMLFile(
          content,
          filePath
        );

        // Parse <style> blocks
        for (const block of styleBlocks) {
          const rules = parseCSSRules(block.content, block.file, block.startLine);
          this.rules.push(...rules);
        }

        // Store inline styles
        this.inlineStyles.push(...inlineStyles);

        // Resolve <link> stylesheet references
        for (const href of linkedStylesheets) {
          const cssPath = path.resolve(path.dirname(filePath), href);
          if (fs.existsSync(cssPath)) {
            try {
              const cssContent = fs.readFileSync(cssPath, 'utf-8');
              const rules = parseCSSRules(cssContent, cssPath);
              // Deduplicate — the CSS file might already be scanned directly
              const existing = new Set(this.rules.filter((r) => r.file === cssPath).map((r) => `${r.selector}:${r.line}`));
              for (const rule of rules) {
                if (!existing.has(`${rule.selector}:${rule.line}`)) {
                  this.rules.push(rule);
                }
              }
            } catch (err) {
              console.error(`Polish: failed to read linked stylesheet ${cssPath}:`, err.message);
            }
          }
        }
      }
    }
  }

  /**
   * Alias for scan() — M5 watcher calls this when files change.
   */
  rescan() {
    this.scan();
  }

  /**
   * Resolve an element to its matching CSS rules and source locations.
   *
   * @param {{ tag: string, id: string, classes: string[], inlineStyles: string }} elementInfo
   * @returns {{ file, line, selector, properties, matchedRules }}
   */
  resolve(elementInfo) {
    const { tag, id, classes, inlineStyles: inlineStyleStr } = elementInfo;
    const element = {
      tag: tag?.toLowerCase(),
      id: id || '',
      classes: classes || [],
    };

    const matchedRules = [];

    // Find matching CSS rules
    for (const rule of this.rules) {
      if (matchesSelector(element, rule.selector)) {
        matchedRules.push({
          selector: rule.selector,
          file: rule.file,
          line: rule.line,
          specificity: rule.specificity,
          properties: { ...rule.properties },
        });
      }
    }

    // Sort by specificity (ascending) — last one wins (CSS cascade order)
    matchedRules.sort((a, b) => compareSpecificity(a.specificity, b.specificity));

    // Build computed properties from cascade
    const properties = {};
    for (const rule of matchedRules) {
      Object.assign(properties, rule.properties);
    }

    // Handle inline styles — highest specificity
    let inlineMatch = null;
    if (inlineStyleStr) {
      const inlineProps = parseInlineStyles(inlineStyleStr);
      if (Object.keys(inlineProps).length > 0) {
        Object.assign(properties, inlineProps);

        // Check if we have a recorded inline style entry from HTML scanning
        const recorded = this.inlineStyles.find(
          (is) =>
            is.tag === element.tag &&
            is.id === element.id &&
            is.classes.length === element.classes.length &&
            is.classes.every((c) => element.classes.includes(c))
        );

        inlineMatch = {
          selector: '[inline]',
          file: recorded?.file || 'unknown',
          line: recorded?.line || 0,
          specificity: [1, 0, 0, 0],
          properties: inlineProps,
        };
        matchedRules.push(inlineMatch);
      }
    }

    // Determine the primary source (highest specificity match)
    const primary = matchedRules[matchedRules.length - 1] || null;

    return {
      file: primary?.file || null,
      line: primary?.line || 0,
      selector: primary?.selector || null,
      properties,
      matchedRules,
    };
  }

  /**
   * Recursively collect .css, .html, and .htm files from a directory.
   * Skips node_modules, .git, and hidden directories.
   */
  _collectFiles(dir) {
    const results = [];
    const SKIP = new Set(['node_modules', '.git', '.next', 'dist', 'build', '.cache']);

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return results;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.') continue;
      if (SKIP.has(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        results.push(...this._collectFiles(fullPath));
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (ext === '.css' || ext === '.html' || ext === '.htm') {
          results.push(fullPath);
        }
      }
    }

    return results;
  }
}

/**
 * Create and initialize a resolver for the given project directory.
 */
export function createResolver(projectDir) {
  const resolver = new Resolver(projectDir);
  resolver.scan();
  return resolver;
}
