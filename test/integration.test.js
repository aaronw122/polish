import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createResolver } from '../src/resolver.js';
import { _writeCssFile, _writeStyleBlock } from '../src/writer.js';

// ── Helpers ────────────────────────────────────────────────────────

let tmpDir;

function setup(files) {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'polish-integration-'));
  for (const [name, content] of Object.entries(files)) {
    const filePath = path.join(tmpDir, name);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
  }
  return tmpDir;
}

function cleanup() {
  if (tmpDir) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  }
}

function readFile(name) {
  return fs.readFileSync(path.join(tmpDir, name), 'utf-8');
}

// ── Integration Tests ──────────────────────────────────────────────

describe('Integration: resolve + write-back pipeline', () => {
  afterEach(cleanup);

  it('resolves an element, gets source info, and writes back a change', async () => {
    setup({
      'styles.css': `.card {\n  color: red;\n  padding: 16px;\n}\n`,
      'index.html': `<!DOCTYPE html>
<html>
<head>
<link rel="stylesheet" href="styles.css">
</head>
<body>
<div class="card">Hello</div>
</body>
</html>`,
    });

    // Step 1: Resolve the element
    const resolver = createResolver(tmpDir);
    const result = resolver.resolve({
      tag: 'div',
      id: '',
      classes: ['card'],
      inlineStyles: '',
    });

    // Verify resolution
    assert.equal(result.selector, '.card');
    assert.ok(result.file.endsWith('styles.css'));
    assert.equal(result.properties.color, 'red');
    assert.equal(result.properties.padding, '16px');

    // Step 2: Write a change
    await _writeCssFile(result.file, result.selector, 'color', 'blue', result.line);

    // Step 3: Verify the file was updated
    const content = readFile('styles.css');
    assert.ok(content.includes('color: blue'));
    assert.ok(!content.includes('color: red'));
    assert.ok(content.includes('padding: 16px'));

    // Step 4: Re-resolve and verify the change is reflected
    resolver.rescan();
    const result2 = resolver.resolve({
      tag: 'div',
      id: '',
      classes: ['card'],
      inlineStyles: '',
    });
    assert.equal(result2.properties.color, 'blue');
  });

  it('resolves across multiple CSS files with correct specificity', async () => {
    setup({
      'base.css': `div { color: green; padding: 10px; }\n`,
      'theme.css': `.card { color: blue; }\n`,
    });

    const resolver = createResolver(tmpDir);
    const result = resolver.resolve({
      tag: 'div',
      id: '',
      classes: ['card'],
      inlineStyles: '',
    });

    // .card has higher specificity than div, so color should be blue
    assert.equal(result.properties.color, 'blue');
    // padding comes from the div rule (no override from .card)
    assert.equal(result.properties.padding, '10px');
    assert.equal(result.matchedRules.length, 2);

    // Write to the higher-specificity rule
    const cardRule = result.matchedRules.find((r) => r.selector === '.card');
    assert.ok(cardRule);
    await _writeCssFile(cardRule.file, '.card', 'color', '#ff0000', cardRule.line);

    const content = readFile('theme.css');
    assert.ok(content.includes('color: #ff0000'));
  });

  it('handles !important in resolve-then-write flow', async () => {
    setup({
      'styles.css': `.card { color: red !important; font-size: 14px; }\n#main { color: blue; font-size: 20px; }\n`,
    });

    const resolver = createResolver(tmpDir);
    const result = resolver.resolve({
      tag: 'div',
      id: 'main',
      classes: ['card'],
      inlineStyles: '',
    });

    // !important wins for color
    assert.equal(result.properties.color, 'red');
    // font-size: #main wins by specificity
    assert.equal(result.properties['font-size'], '20px');

    // Write to the font-size property of the #main rule
    const mainRule = result.matchedRules.find((r) => r.selector === '#main');
    assert.ok(mainRule);
    await _writeCssFile(mainRule.file, '#main', 'font-size', '24px', mainRule.line);

    const content = readFile('styles.css');
    assert.ok(content.includes('font-size: 24px'));
    // The !important declaration should be untouched
    assert.ok(content.includes('color: red !important'));
  });

  it('handles media query rules alongside normal rules', async () => {
    setup({
      'styles.css': `.card { padding: 16px; }\n@media (max-width: 768px) {\n  .card { padding: 8px; }\n}\n`,
    });

    const resolver = createResolver(tmpDir);
    const result = resolver.resolve({
      tag: 'div',
      id: '',
      classes: ['card'],
      inlineStyles: '',
    });

    assert.equal(result.matchedRules.length, 2);

    const normalRule = result.matchedRules.find((r) => r.mediaQuery === null);
    assert.ok(normalRule);

    const mediaRule = result.matchedRules.find((r) => r.mediaQuery !== null);
    assert.ok(mediaRule);
    assert.equal(mediaRule.mediaQuery, '(max-width: 768px)');
  });

  it('resolves element with no explicit CSS rules (empty match)', async () => {
    setup({
      'styles.css': `.card { padding: 16px; }\n`,
      'index.html': `<html><body><span class="orphan">no styles</span></body></html>`,
    });

    const resolver = createResolver(tmpDir);
    const result = resolver.resolve({
      tag: 'span',
      id: '',
      classes: ['orphan'],
      inlineStyles: '',
    });

    // No rules match
    assert.equal(result.matchedRules.length, 0);
    assert.equal(result.file, null);
    assert.equal(result.selector, null);

    // But cssFiles is available for the client to pick a write target
    assert.ok(Array.isArray(result.cssFiles));
    assert.ok(result.cssFiles.length >= 1);
  });

  it('round-trip: resolve, write, rescan, re-resolve for style block', async () => {
    setup({
      'page.html': `<!DOCTYPE html>
<html>
<head>
<style>
.hero {
  background: blue;
  font-size: 32px;
}
</style>
</head>
<body>
<div class="hero">Welcome</div>
</body>
</html>`,
    });

    const resolver = createResolver(tmpDir);
    const result = resolver.resolve({
      tag: 'div',
      id: '',
      classes: ['hero'],
      inlineStyles: '',
    });

    assert.equal(result.properties.background, 'blue');
    assert.equal(result.properties['font-size'], '32px');

    // Write a change to the style block
    await _writeStyleBlock(
      result.file,
      '.hero',
      'background',
      'green',
      result.line
    );

    // Re-scan and re-resolve
    resolver.rescan();
    const result2 = resolver.resolve({
      tag: 'div',
      id: '',
      classes: ['hero'],
      inlineStyles: '',
    });

    assert.equal(result2.properties.background, 'green');
    assert.equal(result2.properties['font-size'], '32px');
  });

  it('write-back to a new selector creates the rule', async () => {
    setup({
      'styles.css': `.card { padding: 16px; }\n`,
    });

    const filePath = path.join(tmpDir, 'styles.css');
    await _writeCssFile(filePath, '.orphan', 'color', 'red', null);

    const content = readFile('styles.css');
    assert.ok(content.includes('.orphan'));
    assert.ok(content.includes('color: red'));
    // Original rule still intact
    assert.ok(content.includes('.card'));
    assert.ok(content.includes('padding: 16px'));
  });
});

describe('Integration: overridden annotation accuracy', () => {
  afterEach(cleanup);

  it('annotates all properties correctly across 3 rules', () => {
    setup({
      'styles.css': `
div { color: green; padding: 10px; margin: 5px; }
.card { color: blue; padding: 20px; }
#special { color: red; }`,
    });

    const resolver = createResolver(tmpDir);
    const result = resolver.resolve({
      tag: 'div',
      id: 'special',
      classes: ['card'],
      inlineStyles: '',
    });

    // Final computed properties
    assert.equal(result.properties.color, 'red');
    assert.equal(result.properties.padding, '20px');
    assert.equal(result.properties.margin, '5px');

    // div rule: color overridden (by .card, then #special), padding overridden (by .card), margin active
    const divRule = result.matchedRules.find((r) => r.selector === 'div');
    assert.equal(divRule.annotatedProperties.color.overridden, true);
    assert.equal(divRule.annotatedProperties.padding.overridden, true);
    assert.equal(divRule.annotatedProperties.margin.overridden, false);

    // .card rule: color overridden (by #special), padding active
    const cardRule = result.matchedRules.find((r) => r.selector === '.card');
    assert.equal(cardRule.annotatedProperties.color.overridden, true);
    assert.equal(cardRule.annotatedProperties.padding.overridden, false);

    // #special rule: color active
    const specialRule = result.matchedRules.find((r) => r.selector === '#special');
    assert.equal(specialRule.annotatedProperties.color.overridden, false);
  });
});

describe('Integration: cssFiles tracking', () => {
  afterEach(cleanup);

  it('tracks all CSS files in the project', () => {
    setup({
      'styles.css': `.card { padding: 16px; }`,
      'theme.css': `.btn { color: blue; }`,
      'components/header.css': `.header { height: 60px; }`,
    });

    const resolver = createResolver(tmpDir);
    assert.ok(resolver.cssFiles.length >= 3);
    assert.ok(resolver.cssFiles.some((f) => f.endsWith('styles.css')));
    assert.ok(resolver.cssFiles.some((f) => f.endsWith('theme.css')));
    assert.ok(resolver.cssFiles.some((f) => f.endsWith('header.css')));
  });

  it('includes cssFiles in resolve result', () => {
    setup({
      'styles.css': `.card { padding: 16px; }`,
    });

    const resolver = createResolver(tmpDir);
    const result = resolver.resolve({
      tag: 'div',
      id: '',
      classes: ['card'],
      inlineStyles: '',
    });

    assert.ok(Array.isArray(result.cssFiles));
    assert.ok(result.cssFiles.length >= 1);
  });
});
