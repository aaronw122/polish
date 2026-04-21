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
