import postcss from 'postcss';

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

  // Remove pseudo-elements (::before, ::after, etc.) -- count as type
  const withoutPseudoElements = withoutAttrs.replace(/::[a-zA-Z-]+/g, () => {
    types++;
    return '';
  });

  // Remove pseudo-classes (:hover, :focus, etc.) -- count as class
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

// ── Pseudo-Class Detection ──────────────────────────────────────────

/**
 * Detect pseudo-class selectors in a selector string.
 * Returns a deduplicated array of pseudo-class names (e.g., [':hover', ':focus']).
 * Excludes :not() since it is a functional pseudo-class, not a state.
 */
export function detectPseudoClasses(selectorStr) {
  const pseudos = [];
  // Match pseudo-classes (single colon) but not pseudo-elements (double colon)
  const matches = selectorStr.match(/(?<!:):[a-zA-Z-]+/g);
  if (matches) {
    for (const m of matches) {
      if (m !== ':not') {
        pseudos.push(m);
      }
    }
  }
  return [...new Set(pseudos)];
}

// ── Selector Parsing ────────────────────────────────────────────────

/**
 * Parse a compound selector (no combinators) into its constituent parts.
 * e.g. "div.card#main" => { tag: "div", id: "main", classes: ["card"] }
 */
export function parseCompoundSelector(compound) {
  const result = { tag: null, id: null, classes: [] };
  const trimmed = compound.trim();
  if (!trimmed || trimmed === '*') return result;

  const idMatch = trimmed.match(/#([a-zA-Z_-][a-zA-Z0-9_-]*)/g);
  if (idMatch) {
    result.id = idMatch[idMatch.length - 1].slice(1);
  }

  const classMatches = trimmed.match(/\.([a-zA-Z_-][a-zA-Z0-9_-]*)/g);
  if (classMatches) {
    result.classes = classMatches.map((c) => c.slice(1));
  }

  // Tag must appear at the start, before any . or #
  const tagMatch = trimmed.match(/^([a-zA-Z][a-zA-Z0-9-]*)/);
  if (tagMatch) {
    result.tag = tagMatch[1].toLowerCase();
  }

  return result;
}

// ── Element Matching ────────────────────────────────────────────────

/**
 * Test if an element (described by { tag, id, classes }) matches a single compound selector.
 */
export function matchesCompound(element, compound) {
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
 * Handles comma-separated selector groups by testing each independently.
 * For descendant/child/sibling combinators, only the rightmost compound
 * (the key selector) is matched, since we lack full DOM context.
 */
export function matchesSelector(element, selectorStr) {
  const groups = selectorStr.split(',').map((s) => s.trim());

  for (const group of groups) {
    const parts = group.split(/\s*[>+~ ]\s*/).filter(Boolean);
    const keySelector = parts[parts.length - 1];

    if (matchesCompound(element, keySelector)) return true;
  }

  return false;
}

// ── Inline Style Parsing ────────────────────────────────────────────

/**
 * Parse an inline style string into a property-value map.
 * Uses PostCSS for robust parsing, with a simple-split fallback.
 */
export function parseInlineStyles(styleStr) {
  const properties = {};
  if (!styleStr) return properties;

  try {
    const root = postcss.parse(`__inline__ { ${styleStr} }`);
    root.walkDecls((decl) => {
      properties[decl.prop] = decl.value;
    });
  } catch {
    // Fallback: semicolon-delimited split
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

/**
 * Serialize a property-value map back into an inline style string.
 */
export function serializeInlineStyles(styles) {
  return Object.entries(styles)
    .map(([prop, val]) => `${prop}: ${val}`)
    .join('; ');
}
