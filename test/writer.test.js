import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  createWriter,
  _applyChange,
  _expandSpacingValue,
  _expandBorderRadiusValue,
  _expandBorderValue,
  _shorthandFor,
  _declAffectsProperty,
  _findGoverningDeclaration,
  _upsertLonghandAfterShorthand,
  _writeCssFile,
  _writeStyleBlock,
  _writeInlineStyle,
} from '../src/writer.js';
import postcss from 'postcss';

// ── Test Fixtures ───────────────────────────────────────────────────

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'polish-writer-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeFixture(name, content) {
  const filePath = path.join(tmpDir, name);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

function readFixture(filePath) {
  return fs.readFileSync(filePath, 'utf-8');
}

// ── Unit Tests: Shorthand Expansion ─────────────────────────────────

describe('expandSpacingValue', () => {
  it('expands 1-value shorthand', () => {
    const result = _expandSpacingValue('10px');
    assert.deepEqual(result, ['10px', '10px', '10px', '10px']);
  });

  it('expands 2-value shorthand', () => {
    const result = _expandSpacingValue('10px 20px');
    assert.deepEqual(result, ['10px', '20px', '10px', '20px']);
  });

  it('expands 3-value shorthand', () => {
    const result = _expandSpacingValue('10px 20px 30px');
    assert.deepEqual(result, ['10px', '20px', '30px', '20px']);
  });

  it('expands 4-value shorthand', () => {
    const result = _expandSpacingValue('10px 20px 30px 40px');
    assert.deepEqual(result, ['10px', '20px', '30px', '40px']);
  });
});

describe('expandBorderRadiusValue', () => {
  it('expands single value', () => {
    const result = _expandBorderRadiusValue('5px');
    assert.deepEqual(result, ['5px', '5px', '5px', '5px']);
  });

  it('expands two values', () => {
    const result = _expandBorderRadiusValue('5px 10px');
    assert.deepEqual(result, ['5px', '10px', '5px', '10px']);
  });
});

describe('expandBorderValue', () => {
  it('expands full border shorthand', () => {
    const result = _expandBorderValue('1px solid red');
    assert.deepEqual(result, {
      'border-width': '1px',
      'border-style': 'solid',
      'border-color': 'red',
    });
  });

  it('expands partial border shorthand', () => {
    const result = _expandBorderValue('2px dashed');
    assert.deepEqual(result, {
      'border-width': '2px',
      'border-style': 'dashed',
      'border-color': 'currentcolor',
    });
  });
});

describe('shorthandFor', () => {
  it('maps padding-left to padding', () => {
    assert.equal(_shorthandFor('padding-left'), 'padding');
  });

  it('maps margin-top to margin', () => {
    assert.equal(_shorthandFor('margin-top'), 'margin');
  });

  it('maps border-top-left-radius to border-radius', () => {
    assert.equal(_shorthandFor('border-top-left-radius'), 'border-radius');
  });

  it('maps border-width to border', () => {
    assert.equal(_shorthandFor('border-width'), 'border');
  });

  it('returns null for non-shorthand properties', () => {
    assert.equal(_shorthandFor('color'), null);
    assert.equal(_shorthandFor('display'), null);
  });
});

// ── Unit Tests: AST Operations ──────────────────────────────────────

describe('applyChange (PostCSS AST)', () => {
  it('updates an existing declaration value', () => {
    const root = postcss.parse('.card { padding: 10px; color: red; }');
    _applyChange(root, '.card', 'color', 'blue', null);
    const output = root.toString();
    assert.ok(output.includes('color: blue'));
    assert.ok(!output.includes('color: red'));
  });

  it('adds a new declaration to an existing rule', () => {
    const root = postcss.parse('.card { color: red; }');
    _applyChange(root, '.card', 'font-size', '16px', null);
    const output = root.toString();
    assert.ok(output.includes('font-size: 16px'));
    assert.ok(output.includes('color: red'));
  });

  it('creates a new rule when selector does not exist', () => {
    const root = postcss.parse('.card { color: red; }');
    _applyChange(root, '.header', 'font-size', '24px', null);
    const output = root.toString();
    assert.ok(output.includes('.header'));
    assert.ok(output.includes('font-size: 24px'));
    assert.ok(output.includes('.card'));
  });
});

// ── Integration Tests: CSS File Writes ──────────────────────────────

describe('writeCssFile', () => {
  it('writes a value to an existing declaration', async () => {
    const filePath = writeFixture('styles.css', `.card {\n  color: red;\n  padding: 10px;\n}\n`);
    await _writeCssFile(filePath, '.card', 'color', 'blue', null);
    const content = readFixture(filePath);
    assert.ok(content.includes('color: blue'));
    assert.ok(!content.includes('color: red'));
    assert.ok(content.includes('padding: 10px'));
  });

  it('adds a new declaration to an existing rule', async () => {
    const filePath = writeFixture('styles.css', `.card {\n  color: red;\n}\n`);
    await _writeCssFile(filePath, '.card', 'font-size', '16px', null);
    const content = readFixture(filePath);
    assert.ok(content.includes('font-size: 16px'));
    assert.ok(content.includes('color: red'));
  });

  it('appends a new rule when selector does not exist', async () => {
    const filePath = writeFixture('styles.css', `.card {\n  color: red;\n}\n`);
    await _writeCssFile(filePath, '.header', 'background', 'white', null);
    const content = readFixture(filePath);
    assert.ok(content.includes('.header'));
    assert.ok(content.includes('background: white'));
    assert.ok(content.includes('.card'));
  });
});

// ── Integration Tests: Shorthand Expansion ──────────────────────────

describe('shorthand expansion — padding', () => {
  it('expands padding shorthand when editing padding-left (1-value)', async () => {
    const filePath = writeFixture('styles.css', `.card {\n  padding: 10px;\n}\n`);
    await _writeCssFile(filePath, '.card', 'padding-left', '24px', null);
    const content = readFixture(filePath);

    assert.ok(content.includes('padding-top: 10px'));
    assert.ok(content.includes('padding-right: 10px'));
    assert.ok(content.includes('padding-bottom: 10px'));
    assert.ok(content.includes('padding-left: 24px'));
    assert.ok(!content.includes('padding: 10px'));
  });
});

describe('shorthand expansion — margin 2-value', () => {
  it('expands margin: 10px 20px when editing margin-top', async () => {
    const filePath = writeFixture('styles.css', `.card {\n  margin: 10px 20px;\n}\n`);
    await _writeCssFile(filePath, '.card', 'margin-top', '5px', null);
    const content = readFixture(filePath);

    assert.ok(content.includes('margin-top: 5px'));
    assert.ok(content.includes('margin-right: 20px'));
    assert.ok(content.includes('margin-bottom: 10px'));
    assert.ok(content.includes('margin-left: 20px'));
    assert.ok(!content.includes('margin: 10px 20px'));
  });
});

describe('shorthand expansion — margin 3-value', () => {
  it('expands margin: 10px 20px 30px when editing margin-left', async () => {
    const filePath = writeFixture('styles.css', `.card {\n  margin: 10px 20px 30px;\n}\n`);
    await _writeCssFile(filePath, '.card', 'margin-left', '40px', null);
    const content = readFixture(filePath);

    assert.ok(content.includes('margin-top: 10px'));
    assert.ok(content.includes('margin-right: 20px'));
    assert.ok(content.includes('margin-bottom: 30px'));
    assert.ok(content.includes('margin-left: 40px'));
    assert.ok(!content.includes('margin: 10px 20px 30px'));
  });
});

describe('shorthand expansion — margin 4-value', () => {
  it('expands margin: 1px 2px 3px 4px when editing margin-bottom', async () => {
    const filePath = writeFixture('styles.css', `.card {\n  margin: 1px 2px 3px 4px;\n}\n`);
    await _writeCssFile(filePath, '.card', 'margin-bottom', '10px', null);
    const content = readFixture(filePath);

    assert.ok(content.includes('margin-top: 1px'));
    assert.ok(content.includes('margin-right: 2px'));
    assert.ok(content.includes('margin-bottom: 10px'));
    assert.ok(content.includes('margin-left: 4px'));
    assert.ok(!content.includes('margin: 1px 2px 3px 4px'));
  });
});

// ── Integration Tests: Formatting Preservation ──────────────────────

describe('formatting preservation', () => {
  it('preserves indentation and spacing', async () => {
    const original = `.card {\n    color: red;\n    padding: 10px;\n}\n`;
    const filePath = writeFixture('styles.css', original);
    await _writeCssFile(filePath, '.card', 'color', 'blue', null);
    const content = readFixture(filePath);

    // Should maintain 4-space indentation
    assert.ok(content.includes('    color: blue'));
    assert.ok(content.includes('    padding: 10px'));
  });

  it('preserves CRLF line endings', async () => {
    const original = `.card {\r\n  color: red;\r\n}\r\n`;
    const filePath = writeFixture('styles.css', original);
    await _writeCssFile(filePath, '.card', 'color', 'blue', null);
    const content = readFixture(filePath);

    assert.ok(content.includes('\r\n'));
    assert.ok(content.includes('color: blue'));
  });
});

// ── Integration Tests: Inline Style Writes ──────────────────────────

describe('writeInlineStyle', () => {
  it('modifies an existing inline style property', async () => {
    const html = `<div class="card" style="color: red; padding: 10px">Hello</div>\n`;
    const filePath = writeFixture('index.html', html);
    await _writeInlineStyle(filePath, '.card', 'color', 'blue', null);
    const content = readFixture(filePath);

    assert.ok(content.includes('color: blue'));
    assert.ok(content.includes('padding: 10px'));
    assert.ok(!content.includes('color: red'));
  });

  it('adds a new property to an existing style attribute', async () => {
    const html = `<div class="card" style="color: red">Hello</div>\n`;
    const filePath = writeFixture('index.html', html);
    await _writeInlineStyle(filePath, '.card', 'font-size', '16px', null);
    const content = readFixture(filePath);

    assert.ok(content.includes('color: red'));
    assert.ok(content.includes('font-size: 16px'));
  });

  it('adds a style attribute when none exists', async () => {
    const html = `<div class="card">Hello</div>\n`;
    const filePath = writeFixture('index.html', html);
    await _writeInlineStyle(filePath, '.card', 'color', 'blue', null);
    const content = readFixture(filePath);

    assert.ok(content.includes('style="color: blue"'));
  });
});

// ── Integration Tests: Style Block Writes ───────────────────────────

describe('writeStyleBlock', () => {
  it('modifies CSS inside a <style> tag', async () => {
    const html = `<html>\n<head>\n<style>\n.card {\n  color: red;\n  padding: 10px;\n}\n</style>\n</head>\n<body></body>\n</html>\n`;
    const filePath = writeFixture('index.html', html);
    await _writeStyleBlock(filePath, '.card', 'color', 'blue', null);
    const content = readFixture(filePath);

    assert.ok(content.includes('color: blue'));
    assert.ok(!content.includes('color: red'));
    assert.ok(content.includes('padding: 10px'));
    // Surrounding HTML preserved
    assert.ok(content.includes('<html>'));
    assert.ok(content.includes('</html>'));
    assert.ok(content.includes('<style>'));
    assert.ok(content.includes('</style>'));
  });

  it('adds a new declaration to a style block rule', async () => {
    const html = `<html>\n<head>\n<style>\n.card {\n  color: red;\n}\n</style>\n</head>\n<body></body>\n</html>\n`;
    const filePath = writeFixture('index.html', html);
    await _writeStyleBlock(filePath, '.card', 'font-size', '20px', null);
    const content = readFixture(filePath);

    assert.ok(content.includes('font-size: 20px'));
    assert.ok(content.includes('color: red'));
  });

  it('creates a new rule in a style block', async () => {
    const html = `<html>\n<head>\n<style>\n.card {\n  color: red;\n}\n</style>\n</head>\n<body></body>\n</html>\n`;
    const filePath = writeFixture('index.html', html);
    await _writeStyleBlock(filePath, '.header', 'background', 'white', null);
    const content = readFixture(filePath);

    assert.ok(content.includes('.header'));
    assert.ok(content.includes('background: white'));
  });
});

// ── Integration Tests: Duplicate Selectors ──────────────────────────

describe('duplicate selectors with line hint', () => {
  it('disambiguates rules by line hint', async () => {
    const css = `.card {\n  color: red;\n}\n\n.card {\n  background: white;\n}\n`;
    const filePath = writeFixture('styles.css', css);

    // The second .card rule starts around line 5
    await _writeCssFile(filePath, '.card', 'background', 'black', 5);
    const content = readFixture(filePath);

    // First rule should still have color: red
    assert.ok(content.includes('color: red'));
    // Second rule should have the updated background
    assert.ok(content.includes('background: black'));
    assert.ok(!content.includes('background: white'));
  });

  it('targets the first rule when line hint matches it', async () => {
    const css = `.card {\n  color: red;\n}\n\n.card {\n  background: white;\n}\n`;
    const filePath = writeFixture('styles.css', css);

    // The first .card rule starts around line 1
    await _writeCssFile(filePath, '.card', 'color', 'green', 1);
    const content = readFixture(filePath);

    assert.ok(content.includes('color: green'));
    assert.ok(!content.includes('color: red'));
    // Second rule untouched
    assert.ok(content.includes('background: white'));
  });
});

// ── Integration Tests: Debounce ─────────────────────────────────────

// ── Security Tests: Path Traversal Prevention ─────────────────────

describe('path traversal prevention', () => {
  it('rejects file paths with ../ that escape project root', () => {
    writeFixture('styles.css', `.card {\n  color: red;\n}\n`);
    const writer = createWriter(tmpDir);

    assert.throws(
      () => writer.applyChange({ file: '../outside.css', selector: '.card', property: 'color', value: 'blue' }),
      { message: /Path traversal blocked/ }
    );
  });

  it('rejects absolute paths outside project root', () => {
    writeFixture('styles.css', `.card {\n  color: red;\n}\n`);
    const writer = createWriter(tmpDir);

    assert.throws(
      () => writer.applyChange({ file: '/etc/passwd', selector: '.card', property: 'color', value: 'blue' }),
      { message: /Path traversal blocked/ }
    );
  });

  it('rejects nested traversal like subdir/../../outside.css', () => {
    writeFixture('styles.css', `.card {\n  color: red;\n}\n`);
    const writer = createWriter(tmpDir);

    assert.throws(
      () => writer.applyChange({ file: 'subdir/../../outside.css', selector: '.card', property: 'color', value: 'blue' }),
      { message: /Path traversal blocked/ }
    );
  });

  it('allows valid relative paths within project root', async () => {
    writeFixture('styles.css', `.card {\n  color: red;\n}\n`);
    const writer = createWriter(tmpDir);

    // Should not throw
    writer.applyChange({ file: 'styles.css', selector: '.card', property: 'color', value: 'blue' });
    await writer.flushAll();

    const content = readFixture(path.join(tmpDir, 'styles.css'));
    assert.ok(content.includes('color: blue'));
  });
});

describe('debounce', () => {
  it('multiple rapid writes result in a single file write with the final value', async () => {
    const filePath = writeFixture('styles.css', `.card {\n  color: red;\n}\n`);
    const writer = createWriter(tmpDir);

    // Send multiple rapid changes
    writer.applyChange({ file: 'styles.css', selector: '.card', property: 'color', value: 'blue' });
    writer.applyChange({ file: 'styles.css', selector: '.card', property: 'color', value: 'green' });
    writer.applyChange({ file: 'styles.css', selector: '.card', property: 'color', value: 'purple' });

    // Only one entry should be pending
    assert.equal(writer._pending.size, 1);

    // Flush and verify only the final value is written
    await writer.flushAll();
    const content = readFixture(filePath);

    assert.ok(content.includes('color: purple'));
    assert.ok(!content.includes('color: red'));
    assert.ok(!content.includes('color: blue'));
    assert.ok(!content.includes('color: green'));
  });

  it('flushAll clears all pending writes', async () => {
    const filePath = writeFixture('styles.css', `.card {\n  color: red;\n  padding: 10px;\n}\n`);
    const writer = createWriter(tmpDir);

    writer.applyChange({ file: 'styles.css', selector: '.card', property: 'color', value: 'blue' });
    writer.applyChange({ file: 'styles.css', selector: '.card', property: 'padding', value: '20px' });

    assert.equal(writer._pending.size, 2);

    await writer.flushAll();

    assert.equal(writer._pending.size, 0);
    const content = readFixture(filePath);
    assert.ok(content.includes('color: blue'));
    assert.ok(content.includes('padding: 20px'));
  });
});

// ── Unit Tests: declAffectsProperty ────────────────────────────────

describe('declAffectsProperty', () => {
  it('returns true for exact property match', () => {
    assert.equal(_declAffectsProperty('color', 'color'), true);
  });

  it('returns true when shorthand governs the longhand', () => {
    assert.equal(_declAffectsProperty('background', 'background-color'), true);
    assert.equal(_declAffectsProperty('padding', 'padding-left'), true);
    assert.equal(_declAffectsProperty('margin', 'margin-top'), true);
    assert.equal(_declAffectsProperty('font', 'font-size'), true);
    assert.equal(_declAffectsProperty('flex', 'flex-grow'), true);
    assert.equal(_declAffectsProperty('border', 'border-top-width'), true);
  });

  it('returns false when property is unrelated', () => {
    assert.equal(_declAffectsProperty('color', 'font-size'), false);
    assert.equal(_declAffectsProperty('padding', 'margin-top'), false);
    assert.equal(_declAffectsProperty('background', 'font-size'), false);
  });

  it('returns false for longhand checking against another longhand', () => {
    assert.equal(_declAffectsProperty('padding-left', 'padding-right'), false);
    assert.equal(_declAffectsProperty('background-color', 'background-image'), false);
  });
});

// ── Unit Tests: findGoverningDeclaration ───────────────────────────

describe('findGoverningDeclaration', () => {
  it('finds an exact longhand declaration', () => {
    const root = postcss.parse('.a { color: red; }');
    const rule = root.first;
    const gov = _findGoverningDeclaration(rule, 'color');
    assert.ok(gov);
    assert.equal(gov.kind, 'longhand');
    assert.equal(gov.decl.prop, 'color');
    assert.equal(gov.decl.value, 'red');
  });

  it('finds a shorthand governing a longhand (background)', () => {
    const root = postcss.parse('.a { background: url(bg.png) no-repeat center; }');
    const rule = root.first;
    const gov = _findGoverningDeclaration(rule, 'background-color');
    assert.ok(gov);
    assert.equal(gov.kind, 'shorthand');
    assert.equal(gov.decl.prop, 'background');
  });

  it('finds a shorthand governing a longhand (font)', () => {
    const root = postcss.parse('.a { font: bold 16px/1.5 Arial; }');
    const rule = root.first;
    const gov = _findGoverningDeclaration(rule, 'font-weight');
    assert.ok(gov);
    assert.equal(gov.kind, 'shorthand');
    assert.equal(gov.decl.prop, 'font');
  });

  it('finds a shorthand governing a longhand (flex)', () => {
    const root = postcss.parse('.a { flex: 1 0 auto; }');
    const rule = root.first;
    const gov = _findGoverningDeclaration(rule, 'flex-basis');
    assert.ok(gov);
    assert.equal(gov.kind, 'shorthand');
    assert.equal(gov.decl.prop, 'flex');
  });

  it('finds a shorthand governing a longhand (border)', () => {
    const root = postcss.parse('.a { border: 1px solid black; }');
    const rule = root.first;
    const gov = _findGoverningDeclaration(rule, 'border-top-color');
    assert.ok(gov);
    assert.equal(gov.kind, 'shorthand');
    assert.equal(gov.decl.prop, 'border');
  });

  it('finds a shorthand governing a longhand (padding)', () => {
    const root = postcss.parse('.a { padding: 10px 20px; }');
    const rule = root.first;
    const gov = _findGoverningDeclaration(rule, 'padding-left');
    assert.ok(gov);
    assert.equal(gov.kind, 'shorthand');
    assert.equal(gov.decl.prop, 'padding');
  });

  it('finds a shorthand governing a longhand (margin)', () => {
    const root = postcss.parse('.a { margin: 5px; }');
    const rule = root.first;
    const gov = _findGoverningDeclaration(rule, 'margin-bottom');
    assert.ok(gov);
    assert.equal(gov.kind, 'shorthand');
    assert.equal(gov.decl.prop, 'margin');
  });

  it('returns null when no declaration affects the property', () => {
    const root = postcss.parse('.a { color: red; }');
    const rule = root.first;
    const gov = _findGoverningDeclaration(rule, 'font-size');
    assert.equal(gov, null);
  });

  it('later longhand overrides shorthand in source order', () => {
    const root = postcss.parse('.a { background: red; background-color: blue; }');
    const rule = root.first;
    const gov = _findGoverningDeclaration(rule, 'background-color');
    assert.ok(gov);
    assert.equal(gov.kind, 'longhand');
    assert.equal(gov.decl.value, 'blue');
  });

  it('later shorthand overrides earlier longhand in source order', () => {
    const root = postcss.parse('.a { background-color: blue; background: red; }');
    const rule = root.first;
    const gov = _findGoverningDeclaration(rule, 'background-color');
    assert.ok(gov);
    assert.equal(gov.kind, 'shorthand');
    assert.equal(gov.decl.prop, 'background');
  });

  it('!important longhand beats later non-important shorthand', () => {
    const root = postcss.parse('.a { background-color: blue !important; background: red; }');
    const rule = root.first;
    const gov = _findGoverningDeclaration(rule, 'background-color');
    assert.ok(gov);
    assert.equal(gov.kind, 'longhand');
    assert.equal(gov.important, true);
    assert.equal(gov.decl.value, 'blue');
  });

  it('!important shorthand beats earlier non-important longhand', () => {
    const root = postcss.parse('.a { background-color: blue; background: red !important; }');
    const rule = root.first;
    const gov = _findGoverningDeclaration(rule, 'background-color');
    assert.ok(gov);
    assert.equal(gov.kind, 'shorthand');
    assert.equal(gov.important, true);
  });

  it('handles multiple shorthands — last one wins at same importance', () => {
    const root = postcss.parse('.a { border: 1px solid red; border: 2px dashed blue; }');
    const rule = root.first;
    const gov = _findGoverningDeclaration(rule, 'border-style');
    assert.ok(gov);
    assert.equal(gov.kind, 'shorthand');
    assert.equal(gov.decl.value, '2px dashed blue');
  });
});

// ── Unit Tests: upsertLonghandAfterShorthand ───────────────────────

describe('upsertLonghandAfterShorthand', () => {
  it('inserts a new longhand after the shorthand', () => {
    const root = postcss.parse('.a { background: red; color: blue; }');
    const rule = root.first;
    const shorthandDecl = rule.first; // background: red
    _upsertLonghandAfterShorthand(rule, shorthandDecl, 'background-color', 'green');
    const output = root.toString();
    // background-color should appear after background and before color
    const bgIdx = output.indexOf('background: red');
    const bgcIdx = output.indexOf('background-color: green');
    const colorIdx = output.indexOf('color: blue');
    assert.ok(bgcIdx > bgIdx, 'longhand should appear after shorthand');
    assert.ok(bgcIdx < colorIdx, 'longhand should appear before subsequent declarations');
  });

  it('updates an existing longhand after the shorthand instead of duplicating', () => {
    const root = postcss.parse('.a { background: red; background-color: yellow; color: blue; }');
    const rule = root.first;
    const shorthandDecl = rule.first; // background: red
    _upsertLonghandAfterShorthand(rule, shorthandDecl, 'background-color', 'green');
    const output = root.toString();
    assert.ok(output.includes('background-color: green'));
    assert.ok(!output.includes('background-color: yellow'));
    // Should not have duplicate background-color declarations
    const count = (output.match(/background-color/g) || []).length;
    assert.equal(count, 1, 'should have exactly one background-color declaration');
  });

  it('copies !important from shorthand to new longhand', () => {
    const root = postcss.parse('.a { background: red !important; }');
    const rule = root.first;
    const shorthandDecl = rule.first;
    _upsertLonghandAfterShorthand(rule, shorthandDecl, 'background-color', 'green');
    const output = root.toString();
    assert.ok(output.includes('background-color: green !important'));
  });

  it('copies !important from shorthand when updating existing longhand', () => {
    const root = postcss.parse('.a { background: red !important; background-color: yellow; }');
    const rule = root.first;
    const shorthandDecl = rule.first;
    _upsertLonghandAfterShorthand(rule, shorthandDecl, 'background-color', 'green');
    const output = root.toString();
    assert.ok(output.includes('background-color: green !important'));
  });

  it('works with font shorthand', () => {
    const root = postcss.parse('.a { font: bold 16px Arial; }');
    const rule = root.first;
    const shorthandDecl = rule.first;
    _upsertLonghandAfterShorthand(rule, shorthandDecl, 'font-size', '20px');
    const output = root.toString();
    assert.ok(output.includes('font: bold 16px Arial'));
    assert.ok(output.includes('font-size: 20px'));
  });

  it('works with flex shorthand', () => {
    const root = postcss.parse('.a { flex: 1 0 auto; }');
    const rule = root.first;
    const shorthandDecl = rule.first;
    _upsertLonghandAfterShorthand(rule, shorthandDecl, 'flex-basis', '50%');
    const output = root.toString();
    assert.ok(output.includes('flex: 1 0 auto'));
    assert.ok(output.includes('flex-basis: 50%'));
  });

  it('works with border shorthand', () => {
    const root = postcss.parse('.a { border: 1px solid black; }');
    const rule = root.first;
    const shorthandDecl = rule.first;
    _upsertLonghandAfterShorthand(rule, shorthandDecl, 'border-color', 'red');
    const output = root.toString();
    assert.ok(output.includes('border: 1px solid black'));
    assert.ok(output.includes('border-color: red'));
  });

  it('works with padding shorthand', () => {
    const root = postcss.parse('.a { padding: 10px 20px; }');
    const rule = root.first;
    const shorthandDecl = rule.first;
    _upsertLonghandAfterShorthand(rule, shorthandDecl, 'padding-top', '5px');
    const output = root.toString();
    assert.ok(output.includes('padding: 10px 20px'));
    assert.ok(output.includes('padding-top: 5px'));
  });

  it('works with margin shorthand', () => {
    const root = postcss.parse('.a { margin: 8px; }');
    const rule = root.first;
    const shorthandDecl = rule.first;
    _upsertLonghandAfterShorthand(rule, shorthandDecl, 'margin-left', '16px');
    const output = root.toString();
    assert.ok(output.includes('margin: 8px'));
    assert.ok(output.includes('margin-left: 16px'));
  });
});

// ── Integration Test: Concurrent Writes (Issue #30) ────────────────

describe('concurrent writes — per-file serialization', () => {
  it('both changes survive when two applyChange calls flush concurrently on the same file', async () => {
    const filePath = writeFixture('styles.css', `.card {\n  display: block;\n}\n`);
    const writer = createWriter(tmpDir);

    // Schedule two changes to different properties on the same selector/file
    writer.applyChange({ file: 'styles.css', selector: '.card', property: 'color', value: 'red' });
    writer.applyChange({ file: 'styles.css', selector: '.card', property: 'font-size', value: '18px' });

    // Both are pending (different keys because different properties)
    assert.equal(writer._pending.size, 2);

    // flushAll triggers both flushes — the per-file chain serializes them
    await writer.flushAll();

    const content = readFixture(filePath);
    assert.ok(content.includes('color: red'), 'first change (color) must be present');
    assert.ok(content.includes('font-size: 18px'), 'second change (font-size) must be present');
    assert.ok(content.includes('display: block'), 'original declaration must be preserved');
  });

  it('rapid sequential applyChange calls on the same file do not lose writes', async () => {
    const filePath = writeFixture('app.css', `.btn {\n  cursor: pointer;\n}\n`);
    const writer = createWriter(tmpDir);

    // Simulate rapid-fire changes to different properties
    writer.applyChange({ file: 'app.css', selector: '.btn', property: 'background', value: 'blue' });
    writer.applyChange({ file: 'app.css', selector: '.btn', property: 'color', value: 'white' });
    writer.applyChange({ file: 'app.css', selector: '.btn', property: 'border-radius', value: '4px' });

    await writer.flushAll();

    const content = readFixture(filePath);
    assert.ok(content.includes('cursor: pointer'), 'original declaration preserved');
    assert.ok(content.includes('background: blue'), 'background change present');
    assert.ok(content.includes('color: white'), 'color change present');
    assert.ok(content.includes('border-radius: 4px'), 'border-radius change present');
  });
});
