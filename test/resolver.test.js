import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Resolver, calculateSpecificity, compareSpecificity, createResolver, detectPseudoClasses } from '../src/resolver.js';

// ── Helper: create a temp project directory with files ──────────────

function createTempProject(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'polish-test-'));
  for (const [name, content] of Object.entries(files)) {
    const filePath = path.join(dir, name);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }
  return dir;
}

function cleanupDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ── Tests ───────────────────────────────────────────────────────────

describe('calculateSpecificity', () => {
  it('type selector', () => {
    assert.deepEqual(calculateSpecificity('div'), [0, 0, 0, 1]);
  });

  it('class selector', () => {
    assert.deepEqual(calculateSpecificity('.card'), [0, 0, 1, 0]);
  });

  it('ID selector', () => {
    assert.deepEqual(calculateSpecificity('#main'), [0, 1, 0, 0]);
  });

  it('compound selector: tag + class', () => {
    assert.deepEqual(calculateSpecificity('div.card'), [0, 0, 1, 1]);
  });

  it('compound selector: tag + id + class', () => {
    assert.deepEqual(calculateSpecificity('div#main.card'), [0, 1, 1, 1]);
  });

  it('descendant combinator', () => {
    assert.deepEqual(calculateSpecificity('div .card'), [0, 0, 1, 1]);
  });

  it('multiple classes', () => {
    assert.deepEqual(calculateSpecificity('.card.active.highlight'), [0, 0, 3, 0]);
  });

  it('universal selector', () => {
    assert.deepEqual(calculateSpecificity('*'), [0, 0, 0, 0]);
  });

  it('pseudo-class', () => {
    assert.deepEqual(calculateSpecificity('a:hover'), [0, 0, 1, 1]);
  });

  it('pseudo-element', () => {
    assert.deepEqual(calculateSpecificity('p::before'), [0, 0, 0, 2]);
  });

  it('child combinator', () => {
    assert.deepEqual(calculateSpecificity('ul > li'), [0, 0, 0, 2]);
  });
});

describe('compareSpecificity', () => {
  it('id beats class', () => {
    assert.ok(compareSpecificity([0, 1, 0, 0], [0, 0, 1, 0]) > 0);
  });

  it('class beats type', () => {
    assert.ok(compareSpecificity([0, 0, 1, 0], [0, 0, 0, 1]) > 0);
  });

  it('inline beats everything', () => {
    assert.ok(compareSpecificity([1, 0, 0, 0], [0, 1, 1, 1]) > 0);
  });

  it('equal specificity returns 0', () => {
    assert.equal(compareSpecificity([0, 0, 1, 0], [0, 0, 1, 0]), 0);
  });

  it('more classes beats fewer classes', () => {
    assert.ok(compareSpecificity([0, 0, 2, 0], [0, 0, 1, 0]) > 0);
  });
});

describe('CSS file parsing', () => {
  let dir;

  beforeEach(() => {
    dir = null;
  });

  it('parses a simple CSS file and builds the rule map', () => {
    dir = createTempProject({
      'styles.css': `.card {
  padding: 16px;
  color: #333;
}

#main {
  width: 960px;
}

div {
  margin: 0;
}`,
    });

    const resolver = createResolver(dir);
    assert.equal(resolver.rules.length, 3);

    const cardRule = resolver.rules.find((r) => r.selector === '.card');
    assert.ok(cardRule);
    assert.equal(cardRule.properties.padding, '16px');
    assert.equal(cardRule.properties.color, '#333');
    assert.equal(cardRule.line, 1);
    assert.ok(cardRule.file.endsWith('styles.css'));

    const mainRule = resolver.rules.find((r) => r.selector === '#main');
    assert.ok(mainRule);
    assert.equal(mainRule.properties.width, '960px');
    assert.equal(mainRule.line, 6);

    const divRule = resolver.rules.find((r) => r.selector === 'div');
    assert.ok(divRule);
    assert.equal(divRule.properties.margin, '0');
    assert.equal(divRule.line, 10);

    cleanupDir(dir);
  });

  it('parses nested directory structure', () => {
    dir = createTempProject({
      'css/main.css': `body { font-size: 16px; }`,
      'css/components/card.css': `.card { padding: 8px; }`,
    });

    const resolver = createResolver(dir);
    assert.equal(resolver.rules.length, 2);

    const bodyRule = resolver.rules.find((r) => r.selector === 'body');
    assert.ok(bodyRule);
    assert.ok(bodyRule.file.includes('css/main.css'));

    const cardRule = resolver.rules.find((r) => r.selector === '.card');
    assert.ok(cardRule);
    assert.ok(cardRule.file.includes('css/components/card.css'));

    cleanupDir(dir);
  });
});

describe('HTML file parsing', () => {
  it('parses <style> blocks with correct line offsets', () => {
    const dir = createTempProject({
      'index.html': `<!DOCTYPE html>
<html>
<head>
<style>
.hero {
  background: blue;
}
</style>
</head>
<body></body>
</html>`,
    });

    const resolver = createResolver(dir);
    const heroRule = resolver.rules.find((r) => r.selector === '.hero');
    assert.ok(heroRule);
    assert.ok(heroRule.file.endsWith('index.html'));
    assert.equal(heroRule.properties.background, 'blue');
    // Line should be offset from the <style> tag position
    assert.equal(heroRule.line, 6);

    cleanupDir(dir);
  });

  it('tracks inline styles from HTML elements', () => {
    const dir = createTempProject({
      'page.html': `<html>
<body>
<div id="box" class="card featured" style="color: red; margin: 10px;">Hello</div>
</body>
</html>`,
    });

    const resolver = createResolver(dir);
    assert.equal(resolver.inlineStyles.length, 1);
    assert.equal(resolver.inlineStyles[0].tag, 'div');
    assert.equal(resolver.inlineStyles[0].id, 'box');
    assert.deepEqual(resolver.inlineStyles[0].classes, ['card', 'featured']);
    assert.ok(resolver.inlineStyles[0].file.endsWith('page.html'));

    cleanupDir(dir);
  });

  it('resolves <link> stylesheet references', () => {
    const dir = createTempProject({
      'index.html': `<html>
<head>
<link rel="stylesheet" href="styles.css">
</head>
<body></body>
</html>`,
      'styles.css': `.btn { padding: 8px 16px; }`,
    });

    const resolver = createResolver(dir);
    const btnRule = resolver.rules.find((r) => r.selector === '.btn');
    assert.ok(btnRule);
    assert.ok(btnRule.file.endsWith('styles.css'));

    cleanupDir(dir);
  });
});

describe('Element resolution', () => {
  it('resolves an element with class .card to the correct rule', () => {
    const dir = createTempProject({
      'styles.css': `.card {
  padding: 16px;
  color: #333;
}

div {
  margin: 0;
}`,
    });

    const resolver = createResolver(dir);
    const result = resolver.resolve({
      tag: 'div',
      id: '',
      classes: ['card'],
      inlineStyles: '',
    });

    assert.equal(result.selector, '.card');
    assert.ok(result.file.endsWith('styles.css'));
    assert.equal(result.line, 1);
    assert.equal(result.properties.padding, '16px');
    assert.equal(result.properties.color, '#333');
    // Should also get div rule's margin
    assert.equal(result.properties.margin, '0');
    assert.equal(result.matchedRules.length, 2);

    cleanupDir(dir);
  });

  it('resolves by ID with higher specificity than class', () => {
    const dir = createTempProject({
      'styles.css': `.card { color: blue; }
#main { color: red; }`,
    });

    const resolver = createResolver(dir);
    const result = resolver.resolve({
      tag: 'div',
      id: 'main',
      classes: ['card'],
      inlineStyles: '',
    });

    // ID rule wins — it has higher specificity
    assert.equal(result.selector, '#main');
    assert.equal(result.properties.color, 'red');

    cleanupDir(dir);
  });

  it('inline styles win over all CSS rules', () => {
    const dir = createTempProject({
      'styles.css': `#main { color: red; font-size: 20px; }`,
    });

    const resolver = createResolver(dir);
    const result = resolver.resolve({
      tag: 'div',
      id: 'main',
      classes: [],
      inlineStyles: 'color: green; padding: 5px;',
    });

    // Inline wins for color
    assert.equal(result.properties.color, 'green');
    // CSS rule still provides font-size
    assert.equal(result.properties['font-size'], '20px');
    // Inline also adds padding
    assert.equal(result.properties.padding, '5px');
    // Primary match should be the inline style
    assert.equal(result.selector, '[inline]');

    cleanupDir(dir);
  });

  it('returns empty result when no rules match', () => {
    const dir = createTempProject({
      'styles.css': `.card { padding: 16px; }`,
    });

    const resolver = createResolver(dir);
    const result = resolver.resolve({
      tag: 'span',
      id: '',
      classes: ['unknown'],
      inlineStyles: '',
    });

    assert.equal(result.file, null);
    assert.equal(result.line, 0);
    assert.equal(result.selector, null);
    assert.deepEqual(result.properties, {});
    assert.equal(result.matchedRules.length, 0);
    assert.equal(result.styleType, null);
    assert.equal(result.cssRule, null);

    cleanupDir(dir);
  });

  it('matches compound selectors (.card.active)', () => {
    const dir = createTempProject({
      'styles.css': `.card.active { background: yellow; }
.card { background: white; }`,
    });

    const resolver = createResolver(dir);
    const result = resolver.resolve({
      tag: 'div',
      id: '',
      classes: ['card', 'active'],
      inlineStyles: '',
    });

    // .card.active has higher specificity (0,0,2,0) than .card (0,0,1,0)
    assert.equal(result.selector, '.card.active');
    assert.equal(result.properties.background, 'yellow');

    cleanupDir(dir);
  });

  it('matches descendant selectors by key selector', () => {
    const dir = createTempProject({
      'styles.css': `div .card { padding: 20px; }`,
    });

    const resolver = createResolver(dir);
    const result = resolver.resolve({
      tag: 'section',
      id: '',
      classes: ['card'],
      inlineStyles: '',
    });

    // Should match via the key selector .card
    assert.ok(result.matchedRules.length >= 1);
    assert.equal(result.properties.padding, '20px');

    cleanupDir(dir);
  });

  it('handles comma-separated selectors', () => {
    const dir = createTempProject({
      'styles.css': `h1, h2, .title { font-weight: bold; }`,
    });

    const resolver = createResolver(dir);

    const h1Result = resolver.resolve({ tag: 'h1', id: '', classes: [], inlineStyles: '' });
    assert.equal(h1Result.properties['font-weight'], 'bold');

    const titleResult = resolver.resolve({ tag: 'div', id: '', classes: ['title'], inlineStyles: '' });
    assert.equal(titleResult.properties['font-weight'], 'bold');

    cleanupDir(dir);
  });
});

describe('Rescan', () => {
  it('updates rules when rescan is called after file changes', () => {
    const dir = createTempProject({
      'styles.css': `.card { padding: 16px; }`,
    });

    const resolver = createResolver(dir);
    assert.equal(resolver.rules.length, 1);

    // Modify the CSS file
    fs.writeFileSync(
      path.join(dir, 'styles.css'),
      `.card { padding: 16px; }\n.btn { margin: 8px; }`
    );

    resolver.rescan();
    assert.equal(resolver.rules.length, 2);

    const btnRule = resolver.rules.find((r) => r.selector === '.btn');
    assert.ok(btnRule);
    assert.equal(btnRule.properties.margin, '8px');

    cleanupDir(dir);
  });
});

describe('Skipping directories', () => {
  it('skips node_modules', () => {
    const dir = createTempProject({
      'styles.css': `.app { color: red; }`,
      'node_modules/lib/styles.css': `.lib { color: blue; }`,
    });

    const resolver = createResolver(dir);
    assert.equal(resolver.rules.length, 1);
    assert.equal(resolver.rules[0].selector, '.app');

    cleanupDir(dir);
  });
});

// ── M6 Tests: !important handling ──────────────────────────────────

describe('!important handling', () => {
  it('!important declaration overrides higher specificity', () => {
    const dir = createTempProject({
      'styles.css': `
.card { color: blue !important; }
#main { color: red; }`,
    });

    const resolver = createResolver(dir);
    const result = resolver.resolve({
      tag: 'div',
      id: 'main',
      classes: ['card'],
      inlineStyles: '',
    });

    // .card has !important on color, so it wins despite #main having higher specificity
    assert.equal(result.properties.color, 'blue');

    // Check annotated properties show important flag
    const cardRule = result.matchedRules.find((r) => r.selector === '.card');
    assert.ok(cardRule);
    assert.equal(cardRule.annotatedProperties.color.important, true);
    assert.equal(cardRule.annotatedProperties.color.overridden, false);

    const mainRule = result.matchedRules.find((r) => r.selector === '#main');
    assert.ok(mainRule);
    assert.equal(mainRule.annotatedProperties.color.important, false);
    assert.equal(mainRule.annotatedProperties.color.overridden, true);

    cleanupDir(dir);
  });

  it('!important in CSS beats inline styles', () => {
    const dir = createTempProject({
      'styles.css': `.card { color: blue !important; }`,
    });

    const resolver = createResolver(dir);
    const result = resolver.resolve({
      tag: 'div',
      id: '',
      classes: ['card'],
      inlineStyles: 'color: red;',
    });

    // CSS !important beats inline styles
    assert.equal(result.properties.color, 'blue');

    cleanupDir(dir);
  });

  it('non-important properties still use normal cascade order', () => {
    const dir = createTempProject({
      'styles.css': `
.card { color: blue !important; font-size: 14px; }
#main { color: red; font-size: 20px; }`,
    });

    const resolver = createResolver(dir);
    const result = resolver.resolve({
      tag: 'div',
      id: 'main',
      classes: ['card'],
      inlineStyles: '',
    });

    // color: !important wins for .card
    assert.equal(result.properties.color, 'blue');
    // font-size: #main wins by specificity (no !important involved)
    assert.equal(result.properties['font-size'], '20px');

    cleanupDir(dir);
  });
});

// ── M6 Tests: Media queries ────────────────────────────────────────

describe('Media queries', () => {
  it('includes media query condition in matched rule', () => {
    const dir = createTempProject({
      'styles.css': `
.card { padding: 16px; }
@media (max-width: 768px) {
  .card { padding: 8px; }
}`,
    });

    const resolver = createResolver(dir);
    const result = resolver.resolve({
      tag: 'div',
      id: '',
      classes: ['card'],
      inlineStyles: '',
    });

    // Should have 2 matched rules
    assert.equal(result.matchedRules.length, 2);

    // One without media query
    const normalRule = result.matchedRules.find((r) => r.mediaQuery === null);
    assert.ok(normalRule);
    assert.equal(normalRule.annotatedProperties.padding.value, '16px');

    // One with media query
    const mediaRule = result.matchedRules.find((r) => r.mediaQuery !== null);
    assert.ok(mediaRule);
    assert.equal(mediaRule.mediaQuery, '(max-width: 768px)');
    assert.equal(mediaRule.annotatedProperties.padding.value, '8px');

    cleanupDir(dir);
  });

  it('primary rule carries mediaQuery when media-conditional rule wins by cascade', () => {
    const dir = createTempProject({
      'styles.css': `
.card { padding: 16px; }
@media (max-width: 768px) {
  .card { padding: 8px; }
}`,
    });

    const resolver = createResolver(dir);
    const result = resolver.resolve({
      tag: 'div',
      id: '',
      classes: ['card'],
      inlineStyles: '',
    });

    // The media query rule appears later in source order with equal specificity,
    // so it wins and becomes the primary (last) matched rule.
    const primary = result.matchedRules[result.matchedRules.length - 1];
    assert.equal(primary.mediaQuery, '(max-width: 768px)');
    assert.equal(primary.annotatedProperties.padding.value, '8px');

    cleanupDir(dir);
  });

  it('includes all matching rules regardless of media query', () => {
    const dir = createTempProject({
      'styles.css': `
.card { color: red; }
@media (min-width: 1024px) {
  .card { color: blue; }
}
@media print {
  .card { color: black; }
}`,
    });

    const resolver = createResolver(dir);
    const result = resolver.resolve({
      tag: 'div',
      id: '',
      classes: ['card'],
      inlineStyles: '',
    });

    assert.equal(result.matchedRules.length, 3);

    const mediaQueries = result.matchedRules.map((r) => r.mediaQuery);
    assert.ok(mediaQueries.includes(null));
    assert.ok(mediaQueries.includes('(min-width: 1024px)'));
    assert.ok(mediaQueries.includes('print'));

    cleanupDir(dir);
  });
});

// ── M6 Tests: Overridden properties ────────────────────────────────

describe('Overridden properties', () => {
  it('marks overridden properties correctly in multi-rule cascade', () => {
    const dir = createTempProject({
      'styles.css': `
div { color: green; padding: 10px; }
.card { color: blue; }`,
    });

    const resolver = createResolver(dir);
    const result = resolver.resolve({
      tag: 'div',
      id: '',
      classes: ['card'],
      inlineStyles: '',
    });

    assert.equal(result.matchedRules.length, 2);

    // div rule: color is overridden by .card, padding is not overridden
    const divRule = result.matchedRules.find((r) => r.selector === 'div');
    assert.ok(divRule);
    assert.equal(divRule.annotatedProperties.color.overridden, true);
    assert.equal(divRule.annotatedProperties.padding.overridden, false);

    // .card rule: color is the winner
    const cardRule = result.matchedRules.find((r) => r.selector === '.card');
    assert.ok(cardRule);
    assert.equal(cardRule.annotatedProperties.color.overridden, false);

    cleanupDir(dir);
  });

  it('source order tiebreaks equal specificity', () => {
    const dir = createTempProject({
      'styles.css': `
.card { color: red; }
.card { color: blue; }`,
    });

    const resolver = createResolver(dir);
    const result = resolver.resolve({
      tag: 'div',
      id: '',
      classes: ['card'],
      inlineStyles: '',
    });

    // The second .card rule wins by source order
    assert.equal(result.properties.color, 'blue');

    // First .card rule's color should be overridden
    const rules = result.matchedRules.filter((r) => r.selector === '.card');
    assert.equal(rules.length, 2);
    assert.equal(rules[0].annotatedProperties.color.overridden, true);
    assert.equal(rules[1].annotatedProperties.color.overridden, false);

    cleanupDir(dir);
  });

  it('multiple CSS files: later file wins for equal specificity', () => {
    const dir = createTempProject({
      'a.css': `.card { color: red; }`,
      'b.css': `.card { color: blue; }`,
    });

    const resolver = createResolver(dir);
    const result = resolver.resolve({
      tag: 'div',
      id: '',
      classes: ['card'],
      inlineStyles: '',
    });

    // b.css comes after a.css alphabetically; both have same specificity
    // The one with higher fileIndex wins
    assert.equal(result.matchedRules.length, 2);
    // One rule's color is overridden, the other is active
    const overriddenCount = result.matchedRules.filter(
      (r) => r.annotatedProperties.color?.overridden
    ).length;
    assert.equal(overriddenCount, 1);
    // The later file (b.css) should win
    assert.equal(result.properties.color, 'blue');

    cleanupDir(dir);
  });
});

// ── M6 Tests: No-match case ────────────────────────────────────────

describe('No-match case', () => {
  it('provides cssFiles list even when no rules match', () => {
    const dir = createTempProject({
      'styles.css': `.card { padding: 16px; }`,
    });

    const resolver = createResolver(dir);
    const result = resolver.resolve({
      tag: 'span',
      id: '',
      classes: ['unknown'],
      inlineStyles: '',
    });

    assert.ok(Array.isArray(result.cssFiles));
    assert.ok(result.cssFiles.length >= 1);
    assert.ok(result.cssFiles[0].endsWith('styles.css'));

    cleanupDir(dir);
  });
});

// ── M6 Tests: Pseudo-class detection ───────────────────────────────

describe('detectPseudoClasses', () => {
  it('detects :hover', () => {
    const result = detectPseudoClasses('a:hover');
    assert.deepEqual(result, [':hover']);
  });

  it('detects multiple pseudo-classes', () => {
    const result = detectPseudoClasses('.btn:hover:focus');
    assert.ok(result.includes(':hover'));
    assert.ok(result.includes(':focus'));
  });

  it('returns empty array for selectors without pseudo-classes', () => {
    const result = detectPseudoClasses('.card');
    assert.deepEqual(result, []);
  });

  it('does not include :not as a pseudo-class', () => {
    const result = detectPseudoClasses('.card:not(.active)');
    assert.ok(!result.includes(':not'));
  });

  it('does not detect pseudo-elements as pseudo-classes', () => {
    const result = detectPseudoClasses('p::before');
    assert.deepEqual(result, []);
  });

  it('detects :active', () => {
    const result = detectPseudoClasses('button:active');
    assert.deepEqual(result, [':active']);
  });
});

describe('Pseudo-classes in resolved rules', () => {
  it('includes pseudo-class info in matched rules', () => {
    const dir = createTempProject({
      'styles.css': `
.btn { color: blue; }
.btn:hover { color: red; }
.btn:focus { outline: 2px solid blue; }`,
    });

    const resolver = createResolver(dir);
    const result = resolver.resolve({
      tag: 'button',
      id: '',
      classes: ['btn'],
      inlineStyles: '',
    });

    // All 3 rules match (key selector is .btn in each case)
    assert.equal(result.matchedRules.length, 3);

    const hoverRule = result.matchedRules.find(
      (r) => r.pseudoClasses && r.pseudoClasses.includes(':hover')
    );
    assert.ok(hoverRule);
    assert.equal(hoverRule.selector, '.btn:hover');

    const focusRule = result.matchedRules.find(
      (r) => r.pseudoClasses && r.pseudoClasses.includes(':focus')
    );
    assert.ok(focusRule);

    const normalRule = result.matchedRules.find(
      (r) => r.pseudoClasses && r.pseudoClasses.length === 0
    );
    assert.ok(normalRule);

    cleanupDir(dir);
  });
});

// ── Unlinked CSS file filtering ───────────────────────────────────

describe('Unlinked CSS file filtering', () => {
  it('excludes unlinked CSS files when HTML files exist', () => {
    const dir = createTempProject({
      'index.html': `<html>
<head><link rel="stylesheet" href="styles.css"></head>
<body><div class="card">Hello</div></body>
</html>`,
      'styles.css': `.card { padding: 16px; }`,
      'admin.css': `.card { padding: 32px; color: red; }`,
    });

    const resolver = createResolver(dir);

    // Only styles.css rules should be in the pool — admin.css is not linked
    const result = resolver.resolve({
      tag: 'div',
      id: '',
      classes: ['card'],
      inlineStyles: '',
    });

    assert.equal(result.properties.padding, '16px');
    assert.equal(result.properties.color, undefined);
    assert.equal(result.matchedRules.length, 1);
    assert.ok(result.matchedRules[0].file.endsWith('styles.css'));

    // cssFiles should only contain the linked stylesheet
    assert.equal(resolver.cssFiles.length, 1);
    assert.ok(resolver.cssFiles[0].endsWith('styles.css'));

    cleanupDir(dir);
  });

  it('includes all CSS files when no HTML files exist (CSS-only fallback)', () => {
    const dir = createTempProject({
      'styles.css': `.card { padding: 16px; }`,
      'admin.css': `.card { color: red; }`,
      'theme.css': `body { font-size: 14px; }`,
    });

    const resolver = createResolver(dir);

    // All CSS files should be included as fallback
    assert.equal(resolver.cssFiles.length, 3);
    assert.ok(resolver.rules.length >= 3);

    const result = resolver.resolve({
      tag: 'div',
      id: '',
      classes: ['card'],
      inlineStyles: '',
    });

    // Both .card rules should match
    assert.equal(result.matchedRules.length, 2);

    cleanupDir(dir);
  });

  it('includes CSS from multiple HTML files linking different stylesheets', () => {
    const dir = createTempProject({
      'index.html': `<html>
<head><link rel="stylesheet" href="main.css"></head>
<body></body>
</html>`,
      'about.html': `<html>
<head><link rel="stylesheet" href="about.css"></head>
<body></body>
</html>`,
      'main.css': `.hero { color: blue; }`,
      'about.css': `.bio { color: green; }`,
      'unused.css': `.orphan { color: red; }`,
    });

    const resolver = createResolver(dir);

    // Both linked CSS files should be present
    assert.ok(resolver.cssFiles.some((f) => f.endsWith('main.css')));
    assert.ok(resolver.cssFiles.some((f) => f.endsWith('about.css')));
    // Unlinked file should NOT be present
    assert.ok(!resolver.cssFiles.some((f) => f.endsWith('unused.css')));

    // Rules from linked files should be resolvable
    const heroResult = resolver.resolve({ tag: 'div', id: '', classes: ['hero'], inlineStyles: '' });
    assert.equal(heroResult.properties.color, 'blue');

    const bioResult = resolver.resolve({ tag: 'div', id: '', classes: ['bio'], inlineStyles: '' });
    assert.equal(bioResult.properties.color, 'green');

    // Rules from unlinked file should NOT be resolvable
    const orphanResult = resolver.resolve({ tag: 'div', id: '', classes: ['orphan'], inlineStyles: '' });
    assert.equal(orphanResult.matchedRules.length, 0);

    cleanupDir(dir);
  });

  it('resolves CSS linked via relative path (./css/styles.css)', () => {
    const dir = createTempProject({
      'index.html': `<html>
<head><link rel="stylesheet" href="./css/styles.css"></head>
<body></body>
</html>`,
      'css/styles.css': `.container { max-width: 960px; }`,
      'css/admin.css': `.container { max-width: 1200px; }`,
    });

    const resolver = createResolver(dir);

    // The linked file via relative path should be included
    assert.ok(resolver.cssFiles.some((f) => f.endsWith(path.join('css', 'styles.css'))));
    // The unlinked sibling should NOT be included
    assert.ok(!resolver.cssFiles.some((f) => f.endsWith(path.join('css', 'admin.css'))));

    const result = resolver.resolve({
      tag: 'div',
      id: '',
      classes: ['container'],
      inlineStyles: '',
    });

    assert.equal(result.properties['max-width'], '960px');
    assert.equal(result.matchedRules.length, 1);

    cleanupDir(dir);
  });
});

// ── Ambiguity detection ──────────────────────────────────────────

describe('Ambiguity detection', () => {
  it('flags ambiguous when .wrapper .card and .card both declare color', () => {
    const dir = createTempProject({
      'styles.css': `.wrapper .card { color: red; }
.card { color: blue; }`,
    });

    const resolver = createResolver(dir);
    const result = resolver.resolve({
      tag: 'div',
      id: '',
      classes: ['card'],
      inlineStyles: '',
    });

    assert.equal(result.ambiguous, true);
    assert.ok(result.ambiguousProperties.includes('color'));

    cleanupDir(dir);
  });

  it('single rule is not ambiguous', () => {
    const dir = createTempProject({
      'styles.css': `.card { color: red; }`,
    });

    const resolver = createResolver(dir);
    const result = resolver.resolve({
      tag: 'div',
      id: '',
      classes: ['card'],
      inlineStyles: '',
    });

    assert.equal(result.ambiguous, false);
    assert.deepEqual(result.ambiguousProperties, []);

    cleanupDir(dir);
  });

  it('two rules with SAME full selector are NOT ambiguous', () => {
    const dir = createTempProject({
      'styles.css': `.card { color: red; }
.card { padding: 10px; }`,
    });

    const resolver = createResolver(dir);
    const result = resolver.resolve({
      tag: 'div',
      id: '',
      classes: ['card'],
      inlineStyles: '',
    });

    // Same selector for both rules — different properties, no ambiguity
    assert.equal(result.ambiguous, false);
    assert.deepEqual(result.ambiguousProperties, []);

    cleanupDir(dir);
  });

  it('flags only the properties that are ambiguous, not all', () => {
    const dir = createTempProject({
      'styles.css': `.wrapper .card { color: red; padding: 10px; }
.card { color: blue; }`,
    });

    const resolver = createResolver(dir);
    const result = resolver.resolve({
      tag: 'div',
      id: '',
      classes: ['card'],
      inlineStyles: '',
    });

    assert.equal(result.ambiguous, true);
    // color is declared in both rules with different full selectors
    assert.ok(result.ambiguousProperties.includes('color'));
    // padding is only in .wrapper .card — not ambiguous
    assert.ok(!result.ambiguousProperties.includes('padding'));

    cleanupDir(dir);
  });

  it('different key selectors are not ambiguous', () => {
    const dir = createTempProject({
      'styles.css': `.card { color: red; }
div { color: blue; }`,
    });

    const resolver = createResolver(dir);
    const result = resolver.resolve({
      tag: 'div',
      id: '',
      classes: ['card'],
      inlineStyles: '',
    });

    // Different key selectors (.card vs div), not ambiguous
    assert.equal(result.ambiguous, false);
    assert.deepEqual(result.ambiguousProperties, []);

    cleanupDir(dir);
  });
});

// ── styleType classification ──────────────────────────────────────

describe('styleType classification', () => {
  it('element with inline styles + CSS rule returns styleType "inline"', () => {
    const dir = createTempProject({
      'styles.css': `.card { padding: 16px; }`,
    });

    const resolver = createResolver(dir);
    const result = resolver.resolve({
      tag: 'div',
      id: '',
      classes: ['card'],
      inlineStyles: 'color: green;',
    });

    // Primary match is [inline] because inline specificity is highest
    assert.equal(result.selector, '[inline]');
    assert.equal(result.styleType, 'inline');

    cleanupDir(dir);
  });

  it('element with CSS rule only returns styleType "css"', () => {
    const dir = createTempProject({
      'styles.css': `.card { padding: 16px; color: red; }`,
    });

    const resolver = createResolver(dir);
    const result = resolver.resolve({
      tag: 'div',
      id: '',
      classes: ['card'],
      inlineStyles: '',
    });

    assert.equal(result.selector, '.card');
    assert.equal(result.styleType, 'css');

    cleanupDir(dir);
  });

  it('element with <style> block rule returns styleType "style-block"', () => {
    const dir = createTempProject({
      'index.html': `<!DOCTYPE html>
<html>
<head>
<style>
.hero {
  background: blue;
}
</style>
</head>
<body><div class="hero">Hello</div></body>
</html>`,
    });

    const resolver = createResolver(dir);
    const result = resolver.resolve({
      tag: 'div',
      id: '',
      classes: ['hero'],
      inlineStyles: '',
    });

    assert.equal(result.selector, '.hero');
    assert.equal(result.styleType, 'style-block');

    cleanupDir(dir);
  });

  it('element with inline styles includes cssRule fallback', () => {
    const dir = createTempProject({
      'styles.css': `.card { padding: 16px; color: blue; }`,
    });

    const resolver = createResolver(dir);
    const result = resolver.resolve({
      tag: 'div',
      id: '',
      classes: ['card'],
      inlineStyles: 'color: green;',
    });

    assert.equal(result.styleType, 'inline');

    // cssRule should point to the .card CSS rule
    assert.ok(result.cssRule);
    assert.equal(result.cssRule.selector, '.card');
    assert.ok(result.cssRule.file.endsWith('styles.css'));
    assert.ok(result.cssRule.properties);
    // The CSS rule has padding, so editing padding should route there
    assert.equal(result.cssRule.properties.padding, '16px');

    cleanupDir(dir);
  });

  it('element with only inline styles has null cssRule', () => {
    const dir = createTempProject({
      'styles.css': `.other { padding: 16px; }`,
    });

    const resolver = createResolver(dir);
    const result = resolver.resolve({
      tag: 'span',
      id: '',
      classes: [],
      inlineStyles: 'color: green;',
    });

    assert.equal(result.styleType, 'inline');
    assert.equal(result.cssRule, null);

    cleanupDir(dir);
  });

});
