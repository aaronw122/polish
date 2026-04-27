import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import * as htmlparser2 from 'htmlparser2';

import {
  calculateSpecificity,
  compareSpecificity,
  detectPseudoClasses,
  matchesSelector,
  parseInlineStyles,
} from './css-utils.js';

// Re-export for public API consumers
export { calculateSpecificity, compareSpecificity, detectPseudoClasses };

// ── Constants ───────────────────────────────────────────────────────

const SKIP_DIRECTORIES = new Set(['node_modules', '.git', '.next', 'dist', 'build', '.cache']);
const SOURCE_EXTENSIONS = new Set(['.css', '.html', '.htm']);

// ── CSS Rule Extraction ─────────────────────────────────────────────

/**
 * Parse CSS source with PostCSS and extract all rule records.
 *
 * Each record contains the selector, file origin, line number,
 * specificity, declared properties, !important flags, enclosing
 * media query (if any), pseudo-classes, and ordering indices.
 */
function extractRulesFromCSS(cssContent, filePath, lineOffset = 0, fileIndex = 0) {
  const rules = [];
  let root;

  try {
    root = postcss.parse(cssContent, { from: filePath });
  } catch (err) {
    console.error(`Polish: failed to parse CSS in ${filePath}:`, err.message);
    return rules;
  }

  let ruleIndex = 0;

  root.walkRules((rule) => {
    const properties = {};
    const importantProps = {};
    rule.walkDecls((decl) => {
      properties[decl.prop] = decl.value;
      if (decl.important) {
        importantProps[decl.prop] = true;
      }
    });

    const line = (rule.source?.start?.line || 1) + lineOffset;
    const selector = rule.selector;

    const mediaQuery = findEnclosingMediaQuery(rule);
    const pseudoClasses = detectPseudoClasses(selector);

    rules.push({
      selector,
      file: filePath,
      line,
      specificity: calculateSpecificity(selector),
      properties,
      importantProps,
      mediaQuery,
      pseudoClasses,
      fileIndex,
      ruleIndex: ruleIndex++,
    });
  });

  return rules;
}

/**
 * Walk up the PostCSS AST to find the nearest enclosing @media query.
 */
function findEnclosingMediaQuery(node) {
  let parent = node.parent;
  while (parent) {
    if (parent.type === 'atrule' && parent.name === 'media') {
      return parent.params;
    }
    parent = parent.parent;
  }
  return null;
}

// ── HTML Parsing ────────────────────────────────────────────────────

/**
 * Parse an HTML file to extract:
 * - <style> block contents (with line offsets for accurate source mapping)
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
          styleStartLine = currentLine;
          styleContent = '';
        }

        if (name === 'link' && attribs.rel === 'stylesheet' && attribs.href) {
          linkedStylesheets.push(attribs.href);
        }

        if (attribs.style) {
          inlineStyles.push({
            tag: name.toLowerCase(),
            id: attribs.id || '',
            classes: attribs.class ? attribs.class.split(/\s+/).filter(Boolean) : [],
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

// ── Source Scanning ─────────────────────────────────────────────────

/**
 * Scan a single CSS file and return its extracted rules.
 */
function scanCssFile(filePath, content, fileIndex) {
  return extractRulesFromCSS(content, filePath, 0, fileIndex);
}

/**
 * Scan a single HTML file: extract rules from <style> blocks,
 * collect inline styles, and resolve <link>ed stylesheets.
 *
 * Returns { rules, inlineStyles, linkedCssFiles } where linkedCssFiles
 * is an array of resolved absolute paths for any <link rel="stylesheet"> elements.
 */
function scanHtmlFile(filePath, content, startFileIndex) {
  const { styleBlocks, inlineStyles, linkedStylesheets } = parseHTMLFile(content, filePath);
  const rules = [];
  let fileIndex = startFileIndex;

  for (const block of styleBlocks) {
    rules.push(...extractRulesFromCSS(block.content, block.file, block.startLine, fileIndex++));
  }

  const linkedCssFiles = linkedStylesheets
    .map((href) => path.resolve(path.dirname(filePath), href))
    .filter((cssPath) => fs.existsSync(cssPath));

  return { rules, inlineStyles, linkedCssFiles, nextFileIndex: fileIndex };
}

/**
 * Merge rules from a linked stylesheet, deduplicating against rules
 * already collected from directly scanning that CSS file.
 */
function mergeLinkedStylesheetRules(cssPath, existingRules, fileIndex) {
  let cssContent;
  try {
    cssContent = fs.readFileSync(cssPath, 'utf-8');
  } catch (err) {
    console.error(`Polish: failed to read linked stylesheet ${cssPath}:`, err.message);
    return [];
  }

  const rules = extractRulesFromCSS(cssContent, cssPath, 0, fileIndex);

  const existingKeys = new Set(
    existingRules
      .filter((r) => r.file === cssPath)
      .map((r) => `${r.selector}:${r.line}`)
  );

  return rules.filter((rule) => !existingKeys.has(`${rule.selector}:${rule.line}`));
}

// ── File Collection ─────────────────────────────────────────────────

/**
 * Recursively collect source files (.css, .html, .htm) from a directory.
 * Skips common non-source directories (node_modules, .git, etc.).
 */
function collectSourceFiles(dir) {
  const results = [];

  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.') continue;
    if (SKIP_DIRECTORIES.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      results.push(...collectSourceFiles(fullPath));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (SOURCE_EXTENSIONS.has(ext)) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

// ── Cascade Resolution ──────────────────────────────────────────────

/**
 * Collect all rules that match the given element description.
 */
function collectMatchingRules(element, allRules, ancestors) {
  const matched = [];

  for (const rule of allRules) {
    if (matchesSelector(element, rule.selector, ancestors)) {
      matched.push({
        selector: rule.selector,
        file: rule.file,
        line: rule.line,
        specificity: rule.specificity,
        properties: { ...rule.properties },
        importantProps: { ...(rule.importantProps || {}) },
        mediaQuery: rule.mediaQuery || null,
        pseudoClasses: rule.pseudoClasses || [],
        fileIndex: rule.fileIndex || 0,
        ruleIndex: rule.ruleIndex || 0,
      });
    }
  }

  return matched;
}

/**
 * Sort matched rules by the CSS cascade:
 * specificity first, then source order (file index, then rule index).
 */
function sortByCascade(matchedRules) {
  matchedRules.sort((a, b) => {
    const specCmp = compareSpecificity(a.specificity, b.specificity);
    if (specCmp !== 0) return specCmp;
    if (a.fileIndex !== b.fileIndex) return a.fileIndex - b.fileIndex;
    return a.ruleIndex - b.ruleIndex;
  });
}

/**
 * Walk the sorted rules and compute the winning value for each property,
 * respecting !important declarations.
 *
 * Returns { properties, propertyWinner } where propertyWinner maps
 * each property name to the index of its winning rule in matchedRules.
 */
function computeWinningProperties(matchedRules) {
  const properties = {};
  const propertyWinner = {};

  for (let i = 0; i < matchedRules.length; i++) {
    const rule = matchedRules[i];
    for (const [prop, val] of Object.entries(rule.properties)) {
      const isImportant = rule.importantProps[prop] || false;
      const currentWinnerIdx = propertyWinner[prop];

      if (currentWinnerIdx === undefined) {
        properties[prop] = val;
        propertyWinner[prop] = i;
        continue;
      }

      const currentIsImportant = matchedRules[currentWinnerIdx].importantProps[prop] || false;

      // !important always beats non-important; non-important never beats !important.
      // Within the same importance level, later in cascade wins (array is sorted).
      if (isImportant && !currentIsImportant) {
        properties[prop] = val;
        propertyWinner[prop] = i;
      } else if (!isImportant && currentIsImportant) {
        // Non-important cannot override !important -- skip
      } else {
        properties[prop] = val;
        propertyWinner[prop] = i;
      }
    }
  }

  return { properties, propertyWinner };
}

/**
 * Apply inline styles as the highest-specificity layer.
 * Inline styles override everything except CSS !important declarations.
 */
function applyInlineStyleOverrides(matchedRules, properties, propertyWinner, inlineStyleStr, inlineStyles, element) {
  if (!inlineStyleStr) return;

  const inlineProps = parseInlineStyles(inlineStyleStr);
  if (Object.keys(inlineProps).length === 0) return;

  // Try to find a matching recorded inline style entry from HTML scanning
  const recorded = inlineStyles.find(
    (is) =>
      is.tag === element.tag &&
      is.id === element.id &&
      is.classes.length === element.classes.length &&
      is.classes.every((c) => element.classes.includes(c))
  );

  const inlineIdx = matchedRules.length;
  matchedRules.push({
    selector: '[inline]',
    file: recorded?.file || 'unknown',
    line: recorded?.line || 0,
    specificity: [1, 0, 0, 0],
    properties: inlineProps,
    importantProps: {},
    mediaQuery: null,
    pseudoClasses: [],
    fileIndex: Infinity,
    ruleIndex: 0,
  });

  for (const [prop, val] of Object.entries(inlineProps)) {
    const currentWinnerIdx = propertyWinner[prop];
    if (currentWinnerIdx === undefined) {
      properties[prop] = val;
      propertyWinner[prop] = inlineIdx;
    } else {
      const currentIsImportant = matchedRules[currentWinnerIdx].importantProps[prop] || false;
      if (!currentIsImportant) {
        properties[prop] = val;
        propertyWinner[prop] = inlineIdx;
      }
      // CSS !important beats inline styles
    }
  }
}

/**
 * Annotate each property in each matched rule with its cascade outcome:
 * - value: the declared value
 * - important: whether the declaration uses !important
 * - overridden: whether a higher-priority rule wins for this property
 *
 * Also strips internal bookkeeping fields (importantProps, fileIndex, ruleIndex)
 * from the response.
 */
function annotateMatchedRules(matchedRules, propertyWinner) {
  for (let i = 0; i < matchedRules.length; i++) {
    const rule = matchedRules[i];
    const annotatedProps = {};

    for (const [prop, val] of Object.entries(rule.properties)) {
      annotatedProps[prop] = {
        value: val,
        important: rule.importantProps[prop] || false,
        overridden: propertyWinner[prop] !== i,
      };
    }
    rule.annotatedProperties = annotatedProps;

    delete rule.importantProps;
    delete rule.fileIndex;
    delete rule.ruleIndex;
  }
}

/**
 * Extract the key selector (rightmost compound) from a full selector string.
 * For comma-separated groups, returns the key selector of the first group.
 */
function extractKeySelector(selectorStr) {
  const group = selectorStr.split(',')[0].trim();
  const parts = group.split(/\s*[>+~ ]\s*/).filter(Boolean);
  return parts[parts.length - 1] || selectorStr;
}

/**
 * Detect ambiguity among matched rules.
 *
 * For each CSS property, if two or more matched rules declare it with
 * different full selectors but the *same* key selector (rightmost compound),
 * the resolution is ambiguous — the resolver only matched the key selector
 * and cannot distinguish ancestor context.
 *
 * Returns { ambiguous: boolean, ambiguousProperties: string[] }.
 */
function detectAmbiguity(matchedRules) {
  // Build a map: property -> Set of full selector strings that declare it
  const propToSelectors = {};
  const propToKeySelectors = {};

  for (const rule of matchedRules) {
    // Skip inline styles — they are unambiguous
    if (rule.selector === '[inline]') continue;

    const fullSel = rule.selector;
    const keySel = extractKeySelector(fullSel);

    for (const prop of Object.keys(rule.properties || rule.annotatedProperties || {})) {
      if (!propToSelectors[prop]) {
        propToSelectors[prop] = new Set();
        propToKeySelectors[prop] = new Set();
      }
      propToSelectors[prop].add(fullSel);
      propToKeySelectors[prop].add(keySel);
    }
  }

  const ambiguousProperties = [];

  for (const [prop, fullSelectors] of Object.entries(propToSelectors)) {
    // Ambiguous when: multiple different full selectors, but they share
    // at least one key selector (meaning the resolver couldn't distinguish
    // them by key selector alone).
    if (fullSelectors.size < 2) continue;

    // Check if any key selector appears in more than one full selector
    const keyToFulls = {};
    for (const rule of matchedRules) {
      if (rule.selector === '[inline]') continue;
      const props = rule.properties || rule.annotatedProperties || {};
      if (!(prop in props)) continue;

      const keySel = extractKeySelector(rule.selector);
      if (!keyToFulls[keySel]) keyToFulls[keySel] = new Set();
      keyToFulls[keySel].add(rule.selector);
    }

    for (const fulls of Object.values(keyToFulls)) {
      if (fulls.size > 1) {
        ambiguousProperties.push(prop);
        break;
      }
    }
  }

  return {
    ambiguous: ambiguousProperties.length > 0,
    ambiguousProperties,
  };
}

// ── Resolver Class ──────────────────────────────────────────────────

export class Resolver {
  constructor(projectDir) {
    this.projectDir = path.resolve(projectDir);
    this.rules = [];
    this.inlineStyles = [];
    this.cssFiles = [];
  }

  /**
   * Scan the project directory for CSS and HTML files, building the rule map.
   */
  scan() {
    this.rules = [];
    this.inlineStyles = [];
    this.cssFiles = [];

    const files = collectSourceFiles(this.projectDir);

    // Partition source files by type
    const cssFilePaths = [];
    const htmlFilePaths = [];
    for (const filePath of files) {
      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.css') {
        cssFilePaths.push(filePath);
      } else if (ext === '.html' || ext === '.htm') {
        htmlFilePaths.push(filePath);
      }
    }

    // Track CSS files that are linked from HTML pages
    const linkedCssPaths = new Set();
    let fileIndex = 0;

    // Pass 1: Process HTML files — extract <style> rules, inline styles,
    //         and discover which CSS files are actually linked.
    for (const filePath of htmlFilePaths) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const result = scanHtmlFile(filePath, content, fileIndex);
      fileIndex = result.nextFileIndex;

      this.rules.push(...result.rules);
      this.inlineStyles.push(...result.inlineStyles);

      for (const cssPath of result.linkedCssFiles) {
        linkedCssPaths.add(cssPath);
      }
    }

    // Pass 2: Process CSS files.
    // If HTML files exist, only include CSS files that are linked via <link> tags.
    // If no HTML files exist (CSS-only project), include all CSS files as fallback.
    const hasHtmlFiles = htmlFilePaths.length > 0;
    const cssToInclude = hasHtmlFiles
      ? cssFilePaths.filter((fp) => linkedCssPaths.has(fp))
      : cssFilePaths;

    for (const filePath of cssToInclude) {
      const content = fs.readFileSync(filePath, 'utf-8');
      this.cssFiles.push(filePath);
      this.rules.push(...scanCssFile(filePath, content, fileIndex++));
    }

    // Pass 3: Merge linked stylesheets that were NOT found on disk during
    //         the directory scan (e.g., referenced via a path outside the
    //         project tree, or only reachable through the HTML href).
    for (const cssPath of linkedCssPaths) {
      if (!this.cssFiles.includes(cssPath)) {
        this.cssFiles.push(cssPath);
        const deduped = mergeLinkedStylesheetRules(cssPath, this.rules, fileIndex++);
        this.rules.push(...deduped);
      }
    }
  }

  /**
   * Alias for scan() -- the watcher calls this when files change.
   */
  rescan() {
    this.scan();
  }

  /**
   * Resolve an element to its matching CSS rules and source locations.
   *
   * Pipeline: collect matching rules -> sort by cascade -> compute winners
   *   -> overlay inline styles -> annotate overrides -> shape response.
   *
   * @param {{ tag: string, id: string, classes: string[], inlineStyles: string }} elementInfo
   * @returns {{ file, line, selector, properties, matchedRules, cssFiles }}
   */
  resolve(elementInfo) {
    const { tag, id, classes, inlineStyles: inlineStyleStr, ancestors } = elementInfo;
    const element = {
      tag: tag?.toLowerCase(),
      id: id || '',
      classes: classes || [],
    };

    // 1. Collect all rules whose selector matches this element (with ancestor context)
    const allMatched = collectMatchingRules(element, this.rules, ancestors);

    // 2. Split into base rules (no pseudo-classes) and pseudo-class rules
    const baseRules = allMatched.filter(r => r.pseudoClasses.length === 0);
    const pseudoRulesByState = {};
    for (const rule of allMatched) {
      for (const pseudo of rule.pseudoClasses) {
        if (!pseudoRulesByState[pseudo]) pseudoRulesByState[pseudo] = [];
        pseudoRulesByState[pseudo].push(rule);
      }
    }

    // 3. Resolve base (normal) state
    const matchedRules = baseRules;
    sortByCascade(matchedRules);
    const { properties, propertyWinner } = computeWinningProperties(matchedRules);

    // 4. Overlay inline styles (highest specificity except !important CSS)
    applyInlineStyleOverrides(
      matchedRules, properties, propertyWinner,
      inlineStyleStr, this.inlineStyles, element
    );

    // 5. Annotate each rule's properties with override/important status
    annotateMatchedRules(matchedRules, propertyWinner);

    // 6. Shape the response: primary match is the highest-specificity base rule
    const primary = matchedRules[matchedRules.length - 1] || null;

    // 7. Determine styleType based on the primary match
    let styleType = null;
    let cssRule = null;

    if (primary) {
      if (primary.selector === '[inline]') {
        styleType = 'inline';
        for (let i = matchedRules.length - 2; i >= 0; i--) {
          if (matchedRules[i].selector !== '[inline]') {
            cssRule = {
              file: matchedRules[i].file,
              line: matchedRules[i].line,
              selector: matchedRules[i].selector,
              properties: matchedRules[i].properties,
            };
            break;
          }
        }
      } else {
        const ext = path.extname(primary.file || '').toLowerCase();
        if (ext === '.html' || ext === '.htm') {
          styleType = 'style-block';
        } else {
          styleType = 'css';
        }
      }
    }

    // 8. Build pseudo-state info for each detected state (:hover, :focus, :active)
    const pseudoStates = {};
    for (const [state, rules] of Object.entries(pseudoRulesByState)) {
      sortByCascade(rules);
      const winning = rules[rules.length - 1];
      pseudoStates[state] = {
        file: winning.file,
        line: winning.line,
        selector: winning.selector,
        properties: winning.properties,
      };
    }

    // 9. Detect ambiguity
    const { ambiguous, ambiguousProperties } = detectAmbiguity(matchedRules);

    return {
      file: primary?.file || null,
      line: primary?.line || 0,
      selector: primary?.selector || null,
      styleType,
      cssRule,
      properties,
      matchedRules,
      pseudoStates,
      cssFiles: this.cssFiles,
      ambiguous,
      ambiguousProperties,
    };
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
