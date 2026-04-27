import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateSpecificity,
  compareSpecificity,
  detectPseudoClasses,
  parseCompoundSelector,
  matchesCompound,
  matchesSelector,
  parseInlineStyles,
  serializeInlineStyles,
} from '../src/css-utils.js';

// ── calculateSpecificity ─────────────────────────────────────────────

describe('calculateSpecificity (direct)', () => {
  it('type selector', () => {
    assert.deepEqual(calculateSpecificity('div'), [0, 0, 0, 1]);
  });

  it('class selector', () => {
    assert.deepEqual(calculateSpecificity('.card'), [0, 0, 1, 0]);
  });

  it('ID selector', () => {
    assert.deepEqual(calculateSpecificity('#main'), [0, 1, 0, 0]);
  });

  it('multiple classes', () => {
    assert.deepEqual(calculateSpecificity('.card.active.highlight'), [0, 0, 3, 0]);
  });

  it('compound: tag + class + id', () => {
    assert.deepEqual(calculateSpecificity('div#main.card'), [0, 1, 1, 1]);
  });

  it('descendant combinator: div .card', () => {
    assert.deepEqual(calculateSpecificity('div .card'), [0, 0, 1, 1]);
  });

  it('child combinator: ul > li', () => {
    assert.deepEqual(calculateSpecificity('ul > li'), [0, 0, 0, 2]);
  });

  it('universal selector has zero specificity', () => {
    assert.deepEqual(calculateSpecificity('*'), [0, 0, 0, 0]);
  });

  it('pseudo-class :hover counts as class-level', () => {
    assert.deepEqual(calculateSpecificity('a:hover'), [0, 0, 1, 1]);
  });

  it('pseudo-element ::before counts as type-level', () => {
    assert.deepEqual(calculateSpecificity('p::before'), [0, 0, 0, 2]);
  });

  it(':not() contents contribute but :not itself does not', () => {
    // :not(.active) -- the .active inside counts as a class
    assert.deepEqual(calculateSpecificity('.card:not(.active)'), [0, 0, 2, 0]);
  });

  it(':where() has zero specificity contribution', () => {
    // :where(.card) -- the .card inside is zeroed out
    assert.deepEqual(calculateSpecificity(':where(.card)'), [0, 0, 0, 0]);
  });

  it(':is() contents contribute', () => {
    // :is(.card) -- the .card inside counts
    assert.deepEqual(calculateSpecificity(':is(.card)'), [0, 0, 1, 0]);
  });

  it('attribute selector counts as class-level', () => {
    assert.deepEqual(calculateSpecificity('[type="text"]'), [0, 0, 1, 0]);
  });

  it('complex: #nav ul > li.active a:hover', () => {
    // #nav = 1 id, ul = 1 type, li = 1 type, .active = 1 class, a = 1 type, :hover = 1 class
    assert.deepEqual(calculateSpecificity('#nav ul > li.active a:hover'), [0, 1, 2, 3]);
  });
});

// ── compareSpecificity ───────────────────────────────────────────────

describe('compareSpecificity (direct)', () => {
  it('returns positive when a > b', () => {
    assert.ok(compareSpecificity([0, 1, 0, 0], [0, 0, 5, 0]) > 0);
  });

  it('returns negative when a < b', () => {
    assert.ok(compareSpecificity([0, 0, 1, 0], [0, 1, 0, 0]) < 0);
  });

  it('returns 0 for equal tuples', () => {
    assert.equal(compareSpecificity([0, 0, 1, 1], [0, 0, 1, 1]), 0);
  });

  it('inline dimension trumps all others', () => {
    assert.ok(compareSpecificity([1, 0, 0, 0], [0, 99, 99, 99]) > 0);
  });
});

// ── parseCompoundSelector ────────────────────────────────────────────

describe('parseCompoundSelector', () => {
  it('parses a bare tag', () => {
    assert.deepEqual(parseCompoundSelector('div'), { tag: 'div', id: null, classes: [] });
  });

  it('parses a bare class', () => {
    assert.deepEqual(parseCompoundSelector('.card'), { tag: null, id: null, classes: ['card'] });
  });

  it('parses a bare ID', () => {
    assert.deepEqual(parseCompoundSelector('#main'), { tag: null, id: 'main', classes: [] });
  });

  it('parses tag + class + id', () => {
    const result = parseCompoundSelector('div.card#main');
    assert.equal(result.tag, 'div');
    assert.equal(result.id, 'main');
    assert.deepEqual(result.classes, ['card']);
  });

  it('parses multiple classes', () => {
    const result = parseCompoundSelector('.card.active.featured');
    assert.deepEqual(result.classes, ['card', 'active', 'featured']);
  });

  it('universal selector returns empty result', () => {
    assert.deepEqual(parseCompoundSelector('*'), { tag: null, id: null, classes: [] });
  });

  it('empty string returns empty result', () => {
    assert.deepEqual(parseCompoundSelector(''), { tag: null, id: null, classes: [] });
  });

  it('whitespace-only returns empty result', () => {
    assert.deepEqual(parseCompoundSelector('   '), { tag: null, id: null, classes: [] });
  });

  it('lowercases tag name', () => {
    assert.equal(parseCompoundSelector('DIV').tag, 'div');
  });
});

// ── matchesCompound ──────────────────────────────────────────────────

describe('matchesCompound', () => {
  it('matches by tag', () => {
    assert.ok(matchesCompound({ tag: 'div', id: '', classes: [] }, 'div'));
  });

  it('does not match wrong tag', () => {
    assert.ok(!matchesCompound({ tag: 'span', id: '', classes: [] }, 'div'));
  });

  it('matches by class', () => {
    assert.ok(matchesCompound({ tag: 'div', id: '', classes: ['card'] }, '.card'));
  });

  it('does not match missing class', () => {
    assert.ok(!matchesCompound({ tag: 'div', id: '', classes: ['btn'] }, '.card'));
  });

  it('matches by id', () => {
    assert.ok(matchesCompound({ tag: 'div', id: 'main', classes: [] }, '#main'));
  });

  it('does not match wrong id', () => {
    assert.ok(!matchesCompound({ tag: 'div', id: 'sidebar', classes: [] }, '#main'));
  });

  it('matches multi-class compound', () => {
    assert.ok(matchesCompound({ tag: 'div', id: '', classes: ['card', 'active', 'featured'] }, '.card.active'));
  });

  it('does not match when element is missing one of the compound classes', () => {
    assert.ok(!matchesCompound({ tag: 'div', id: '', classes: ['card'] }, '.card.active'));
  });

  it('matches compound with tag + class + id', () => {
    assert.ok(matchesCompound({ tag: 'div', id: 'main', classes: ['card'] }, 'div.card#main'));
  });

  it('universal selector matches anything', () => {
    assert.ok(matchesCompound({ tag: 'div', id: '', classes: [] }, '*'));
  });

  it('handles element with null classes gracefully', () => {
    assert.ok(!matchesCompound({ tag: 'div', id: '' }, '.card'));
  });
});

// ── matchesSelector: basic (no ancestors) ────────────────────────────

describe('matchesSelector (simple selectors)', () => {
  it('matches simple class selector', () => {
    assert.ok(matchesSelector({ tag: 'div', id: '', classes: ['card'] }, '.card'));
  });

  it('does not match wrong class', () => {
    assert.ok(!matchesSelector({ tag: 'div', id: '', classes: ['btn'] }, '.card'));
  });

  it('matches comma-separated groups (first group)', () => {
    assert.ok(matchesSelector({ tag: 'h1', id: '', classes: [] }, 'h1, h2, h3'));
  });

  it('matches comma-separated groups (middle group)', () => {
    assert.ok(matchesSelector({ tag: 'h2', id: '', classes: [] }, 'h1, h2, h3'));
  });

  it('matches comma-separated groups (last group)', () => {
    assert.ok(matchesSelector({ tag: 'div', id: '', classes: ['title'] }, 'h1, .title'));
  });

  it('does not match any comma-separated group', () => {
    assert.ok(!matchesSelector({ tag: 'span', id: '', classes: [] }, 'h1, h2, h3'));
  });
});

// ── matchesSelector: descendant selectors with ancestors (Issue #26) ──

describe('matchesSelector (ancestor matching)', () => {
  it('.parent .child matches when .parent is in ancestors', () => {
    const element = { tag: 'span', id: '', classes: ['child'] };
    const ancestors = [
      { tag: 'div', id: '', classes: ['parent'] },
    ];
    assert.ok(matchesSelector(element, '.parent .child', ancestors));
  });

  it('.parent .child does NOT match when .parent is NOT in ancestors', () => {
    const element = { tag: 'span', id: '', classes: ['child'] };
    const ancestors = [
      { tag: 'div', id: '', classes: ['other'] },
    ];
    assert.ok(!matchesSelector(element, '.parent .child', ancestors));
  });

  it('.grandparent .parent .child matches with correct ancestor chain', () => {
    const element = { tag: 'span', id: '', classes: ['child'] };
    // ancestors are ordered nearest-first: parent, then grandparent
    const ancestors = [
      { tag: 'div', id: '', classes: ['parent'] },
      { tag: 'section', id: '', classes: ['grandparent'] },
    ];
    assert.ok(matchesSelector(element, '.grandparent .parent .child', ancestors));
  });

  it('.grandparent .parent .child does NOT match with reversed ancestor order', () => {
    const element = { tag: 'span', id: '', classes: ['child'] };
    // Wrong order: grandparent is nearest, parent is further up
    const ancestors = [
      { tag: 'section', id: '', classes: ['grandparent'] },
      { tag: 'div', id: '', classes: ['parent'] },
    ];
    assert.ok(!matchesSelector(element, '.grandparent .parent .child', ancestors));
  });

  it('descendant selector matches when ancestor is not immediate parent', () => {
    const element = { tag: 'span', id: '', classes: ['child'] };
    const ancestors = [
      { tag: 'div', id: '', classes: [] },          // immediate parent (not .wrapper)
      { tag: 'section', id: '', classes: ['wrapper'] }, // grandparent matches .wrapper
    ];
    assert.ok(matchesSelector(element, '.wrapper .child', ancestors));
  });

  it('deep nesting matches correctly', () => {
    const element = { tag: 'a', id: '', classes: ['link'] };
    const ancestors = [
      { tag: 'li', id: '', classes: [] },
      { tag: 'ul', id: '', classes: ['nav'] },
      { tag: 'div', id: '', classes: ['sidebar'] },
      { tag: 'body', id: '', classes: [] },
    ];
    assert.ok(matchesSelector(element, '.sidebar .nav .link', ancestors));
  });

  it('deep nesting fails when intermediate ancestor is missing', () => {
    const element = { tag: 'a', id: '', classes: ['link'] };
    const ancestors = [
      { tag: 'li', id: '', classes: [] },
      { tag: 'ul', id: '', classes: [] },       // missing .nav class
      { tag: 'div', id: '', classes: ['sidebar'] },
      { tag: 'body', id: '', classes: [] },
    ];
    assert.ok(!matchesSelector(element, '.sidebar .nav .link', ancestors));
  });

  it('descendant selector with no ancestors falls back to key-selector match', () => {
    // When no ancestors provided, matchesSelector falls back to matching only the key selector
    const element = { tag: 'div', id: '', classes: ['card'] };
    assert.ok(matchesSelector(element, '.wrapper .card'));
    assert.ok(matchesSelector(element, '.wrapper .card', []));
  });

  it('comma-separated selectors with ancestors: matches if any group matches', () => {
    const element = { tag: 'div', id: '', classes: ['card'] };
    const ancestors = [
      { tag: 'section', id: '', classes: ['wrapper'] },
    ];
    // First group has wrong ancestor, second group matches
    assert.ok(matchesSelector(element, '.missing .card, .wrapper .card', ancestors));
  });

  it('comma-separated selectors with ancestors: fails if no group matches', () => {
    const element = { tag: 'div', id: '', classes: ['card'] };
    const ancestors = [
      { tag: 'section', id: '', classes: ['wrapper'] },
    ];
    assert.ok(!matchesSelector(element, '.missing .card, .absent .card', ancestors));
  });

  it('ancestor matching with id selectors', () => {
    const element = { tag: 'span', id: '', classes: ['text'] };
    const ancestors = [
      { tag: 'div', id: 'main', classes: [] },
    ];
    assert.ok(matchesSelector(element, '#main .text', ancestors));
  });

  it('ancestor matching with tag selectors', () => {
    const element = { tag: 'span', id: '', classes: [] };
    const ancestors = [
      { tag: 'div', id: '', classes: [] },
    ];
    assert.ok(matchesSelector(element, 'div span', ancestors));
  });
});

// ── matchesSelector: child combinator (>) with ancestors ─────────────

describe('matchesSelector (child combinator)', () => {
  it('> matches immediate parent', () => {
    const element = { tag: 'span', id: '', classes: ['child'] };
    const ancestors = [
      { tag: 'div', id: '', classes: ['parent'] },
    ];
    assert.ok(matchesSelector(element, '.parent > .child', ancestors));
  });

  it('> does NOT match non-immediate ancestor', () => {
    const element = { tag: 'span', id: '', classes: ['child'] };
    const ancestors = [
      { tag: 'p', id: '', classes: [] },                  // immediate parent
      { tag: 'div', id: '', classes: ['parent'] },         // grandparent
    ];
    assert.ok(!matchesSelector(element, '.parent > .child', ancestors));
  });

  it('mixed combinators: .grandparent > .parent .child', () => {
    const element = { tag: 'span', id: '', classes: ['child'] };
    const ancestors = [
      { tag: 'div', id: '', classes: ['parent'] },
      { tag: 'section', id: '', classes: ['grandparent'] },
    ];
    // .child has descendant combinator from .parent, .parent has > from .grandparent
    assert.ok(matchesSelector(element, '.grandparent > .parent .child', ancestors));
  });

  it('mixed combinators: .grandparent .parent > .child', () => {
    const element = { tag: 'span', id: '', classes: ['child'] };
    const ancestors = [
      { tag: 'div', id: '', classes: ['parent'] },         // immediate parent
      { tag: 'section', id: '', classes: ['grandparent'] }, // grandparent
    ];
    // .child > .parent means .parent must be immediate parent of .child
    assert.ok(matchesSelector(element, '.grandparent .parent > .child', ancestors));
  });

  it('fails mixed combinators when > relationship not immediate', () => {
    const element = { tag: 'span', id: '', classes: ['child'] };
    const ancestors = [
      { tag: 'p', id: '', classes: [] },                   // immediate parent (not .parent)
      { tag: 'div', id: '', classes: ['parent'] },
      { tag: 'section', id: '', classes: ['grandparent'] },
    ];
    // .parent > .child requires .parent as immediate parent, but p is in between
    assert.ok(!matchesSelector(element, '.grandparent .parent > .child', ancestors));
  });
});

// ── parseInlineStyles ────────────────────────────────────────────────

describe('parseInlineStyles', () => {
  it('parses normal style string', () => {
    const result = parseInlineStyles('color: red; margin: 10px;');
    assert.equal(result.color, 'red');
    assert.equal(result.margin, '10px');
  });

  it('returns empty object for empty string', () => {
    assert.deepEqual(parseInlineStyles(''), {});
  });

  it('returns empty object for null/undefined', () => {
    assert.deepEqual(parseInlineStyles(null), {});
    assert.deepEqual(parseInlineStyles(undefined), {});
  });

  it('handles single property', () => {
    const result = parseInlineStyles('color: blue');
    assert.equal(result.color, 'blue');
  });

  it('handles properties with complex values', () => {
    const result = parseInlineStyles('font-family: "Helvetica Neue", Arial, sans-serif; background: linear-gradient(to right, red, blue)');
    assert.ok(result['font-family']);
    assert.ok(result.background);
  });

  it('handles trailing semicolons and extra whitespace', () => {
    const result = parseInlineStyles('  color:  red  ;  margin:  10px  ;  ');
    assert.equal(result.color, 'red');
    assert.equal(result.margin, '10px');
  });
});

// ── serializeInlineStyles ────────────────────────────────────────────

describe('serializeInlineStyles', () => {
  it('serializes property map to style string', () => {
    const result = serializeInlineStyles({ color: 'red', margin: '10px' });
    assert.ok(result.includes('color: red'));
    assert.ok(result.includes('margin: 10px'));
  });

  it('returns empty string for empty map', () => {
    assert.equal(serializeInlineStyles({}), '');
  });

  it('round-trips with parseInlineStyles', () => {
    const original = { color: 'red', margin: '10px', padding: '5px' };
    const serialized = serializeInlineStyles(original);
    const parsed = parseInlineStyles(serialized);
    assert.deepEqual(parsed, original);
  });
});

// ── detectPseudoClasses ──────────────────────────────────────────────

describe('detectPseudoClasses (direct)', () => {
  it('detects :hover', () => {
    assert.deepEqual(detectPseudoClasses('a:hover'), [':hover']);
  });

  it('detects :focus', () => {
    assert.deepEqual(detectPseudoClasses('input:focus'), [':focus']);
  });

  it('detects :active', () => {
    assert.deepEqual(detectPseudoClasses('button:active'), [':active']);
  });

  it('detects multiple pseudo-classes', () => {
    const result = detectPseudoClasses('.btn:hover:focus');
    assert.ok(result.includes(':hover'));
    assert.ok(result.includes(':focus'));
    assert.equal(result.length, 2);
  });

  it('excludes :not', () => {
    const result = detectPseudoClasses('.card:not(.active)');
    assert.ok(!result.includes(':not'));
  });

  it('excludes pseudo-elements (::before)', () => {
    const result = detectPseudoClasses('p::before');
    assert.deepEqual(result, []);
  });

  it('excludes pseudo-elements (::after)', () => {
    const result = detectPseudoClasses('p::after');
    assert.deepEqual(result, []);
  });

  it('returns empty for selectors without pseudo-classes', () => {
    assert.deepEqual(detectPseudoClasses('.card'), []);
  });

  it('deduplicates repeated pseudo-classes', () => {
    // Contrived: same pseudo on different parts of a selector group
    const result = detectPseudoClasses('a:hover, .btn:hover');
    assert.deepEqual(result, [':hover']);
  });

  it('detects :first-child', () => {
    const result = detectPseudoClasses('li:first-child');
    assert.deepEqual(result, [':first-child']);
  });

  it('detects :last-child', () => {
    const result = detectPseudoClasses('li:last-child');
    assert.deepEqual(result, [':last-child']);
  });
});
