import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captureFocus, controlSignature, restoreFocus } from '../src/ui/focusMemory.js';

/**
 * The module reads a small part of the DOM surface, so these tests run
 * against stub nodes. A stub answers `tagName`, `className`,
 * `getAttribute`, `textContent`, and `focus`. The stub root answers
 * `contains` and `querySelectorAll`, and it returns whatever list the
 * test gave it, because the selector matching itself belongs to the
 * browser.
 */
function node(tagName, attrs = {}, extra = {}) {
  const { className = '', text = '', ...rest } = attrs;
  return {
    tagName,
    className,
    textContent: text,
    focused: 0,
    selectionStart: null,
    selectionEnd: null,
    range: null,
    getAttribute(name) {
      return name in rest ? rest[name] : null;
    },
    focus() {
      this.focused += 1;
    },
    setSelectionRange(start, end) {
      this.range = [start, end];
    },
    ...extra,
  };
}

function root(children) {
  return {
    querySelectorAll: () => children,
    contains: (target) => children.includes(target),
  };
}

/** A labeled icon button, the shape listPanel builds for a row action. */
function rowButton(label) {
  return node('BUTTON', { className: 'icon-btn', 'aria-label': label });
}

test('controlSignature reads the accessible name first', () => {
  const button = rowButton('Damage Goblin Scout');
  assert.equal(controlSignature(button), 'BUTTON||icon-btn|Damage Goblin Scout');
});

test('controlSignature falls back to the title, then to the text', () => {
  assert.equal(controlSignature(node('BUTTON', { title: 'Edit' })), 'BUTTON|||Edit');
  assert.equal(controlSignature(node('BUTTON', { text: '  New quest  ' })), 'BUTTON|||New quest');
});

test('controlSignature keeps the input type apart from the tag', () => {
  const amount = node('INPUT', { className: 'amount', type: 'number', 'aria-label': 'Amount' });
  assert.equal(controlSignature(amount), 'INPUT|number|amount|Amount');
});

test('controlSignature truncates a long label', () => {
  const long = node('BUTTON', { text: 'x'.repeat(80) });
  assert.equal(controlSignature(long), `BUTTON|||${'x'.repeat(60)}`);
});

test('captureFocus returns null when focus is outside the root', () => {
  const inside = rowButton('Damage Goblin Scout');
  const outside = rowButton('Save campaign');
  assert.equal(captureFocus(root([inside]), outside), null);
  assert.equal(captureFocus(root([inside]), null), null);
});

test('captureFocus returns null when focus is the root itself', () => {
  const shell = root([]);
  assert.equal(captureFocus(shell, shell), null);
});

test('captureFocus returns null for a focused element that is not a control', () => {
  // A contenteditable region is inside the root but outside the
  // focusable list, so there is nothing to match on restore.
  const label = node('SPAN', {});
  const shell = { querySelectorAll: () => [], contains: () => true };
  assert.equal(captureFocus(shell, label), null);
});

test('restoreFocus finds the rebuilt control with the same signature', () => {
  const before = rowButton('Damage Goblin Scout');
  const memo = captureFocus(root([rowButton('Heal Goblin Scout'), before]), before);
  const after = rowButton('Damage Goblin Scout');
  assert.equal(restoreFocus(root([rowButton('Heal Goblin Scout'), after]), memo), true);
  assert.equal(after.focused, 1);
});

test('restoreFocus follows a control that moved to another index', () => {
  const before = rowButton('Damage Goblin Scout');
  const memo = captureFocus(root([before, rowButton('Damage Orc')]), before);
  const after = rowButton('Damage Goblin Scout');
  assert.equal(restoreFocus(root([rowButton('Damage Orc'), after]), memo), true);
  assert.equal(after.focused, 1);
});

test('restoreFocus does nothing when the row is gone', () => {
  const before = rowButton('Damage Goblin Scout');
  const memo = captureFocus(root([before]), before);
  assert.equal(restoreFocus(root([rowButton('Damage Orc')]), memo), false);
});

test('restoreFocus does nothing without a memo', () => {
  assert.equal(restoreFocus(root([]), null), false);
});

test('an unlabeled control is matched by its index among its equals', () => {
  const plain = () => node('BUTTON', { className: 'chip' });
  const before = plain();
  const memo = captureFocus(root([plain(), before, plain()]), before);
  assert.equal(memo.index, 1);
  const rebuilt = [plain(), plain(), plain()];
  assert.equal(restoreFocus(root(rebuilt), memo), true);
  assert.equal(rebuilt[1].focused, 1);
  assert.equal(rebuilt[0].focused, 0);
});

test('an index past the rebuilt controls restores nothing', () => {
  const plain = () => node('BUTTON', { className: 'chip' });
  const before = plain();
  const memo = captureFocus(root([plain(), plain(), before]), before);
  assert.equal(restoreFocus(root([plain()]), memo), false);
});

test('the caret position survives a repaint of a text field', () => {
  const field = (start, end) =>
    node(
      'INPUT',
      { type: 'text', className: 'field', 'aria-label': 'Quest title' },
      { selectionStart: start, selectionEnd: end },
    );
  const before = field(3, 5);
  const memo = captureFocus(root([before]), before);
  assert.equal(memo.selectionStart, 3);
  assert.equal(memo.selectionEnd, 5);
  const after = field(0, 0);
  restoreFocus(root([after]), memo);
  assert.deepEqual(after.range, [3, 5]);
});

test('a textarea carries its caret the same way', () => {
  const box = (start) =>
    node('TEXTAREA', { className: 'body' }, { selectionStart: start, selectionEnd: start });
  const before = box(7);
  const memo = captureFocus(root([before]), before);
  const after = box(0);
  restoreFocus(root([after]), memo);
  assert.deepEqual(after.range, [7, 7]);
});

// setSelectionRange throws on a number input, so the memo must not carry a
// caret for one. The encounter amount field is a number input.
test('a number input carries no caret', () => {
  const amount = (start) =>
    node(
      'INPUT',
      { type: 'number', className: 'amount', 'aria-label': 'Damage/heal amount for Goblin Scout' },
      { selectionStart: start, selectionEnd: start },
    );
  const before = amount(1);
  const memo = captureFocus(root([before]), before);
  assert.equal(memo.selectionStart, undefined);
  const after = amount(0);
  restoreFocus(root([after]), memo);
  assert.equal(after.range, null);
  assert.equal(after.focused, 1);
});

test('a text field with no readable caret carries none', () => {
  const before = node('INPUT', { type: 'text' }, { selectionStart: null });
  const memo = captureFocus(root([before]), before);
  assert.equal(memo.selectionStart, undefined);
});
