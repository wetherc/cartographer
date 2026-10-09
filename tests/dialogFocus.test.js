import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dialogPartId, noteFocus, pickReturnFocus, repairFocus } from '../src/ui/dialogFocus.js';

/**
 * `openDialog` decides where focus lands after a dialog closes, and what id
 * its heading gets, without the DOM. These tests use plain objects that carry
 * only `isConnected`, the one property the choice reads.
 */

const connected = { isConnected: true };
const detached = { isConnected: false };

test('the opener takes focus back when it is still in the document', () => {
  const opener = { isConnected: true };
  assert.equal(pickReturnFocus([opener, connected, connected]), opener);
});

test('a detached opener yields to the caller fallback', () => {
  const fallback = { isConnected: true };
  assert.equal(pickReturnFocus([detached, fallback, connected]), fallback);
});

test('a missing opener and fallback yield to the main landmark', () => {
  const main = { isConnected: true };
  assert.equal(pickReturnFocus([null, undefined, main]), main);
});

test('a detached fallback is skipped like a detached opener', () => {
  const main = { isConnected: true };
  assert.equal(pickReturnFocus([detached, detached, main]), main);
});

test('no connected candidate resolves to null so focus is left alone', () => {
  assert.equal(pickReturnFocus([detached, null, undefined]), null);
  assert.equal(pickReturnFocus([]), null);
});

test('each dialog part id is unique and names its part', () => {
  const first = dialogPartId('title');
  const second = dialogPartId('title');
  const message = dialogPartId('message');
  assert.match(first, /^dialog-title-\d+$/);
  assert.notEqual(first, second);
  assert.match(message, /^dialog-message-\d+$/);
  assert.notEqual(second, message);
});

test('a return target the caller named wins over the opener', () => {
  // openDialog puts spec.returnFocus first. A control that owns the whole
  // interaction takes focus back even when something else had it at open
  // time, which is what Safari leaves behind on a button click.
  const stated = { isConnected: true };
  const opener = { isConnected: true };
  assert.equal(pickReturnFocus([stated, opener, connected]), stated);
});

/**
 * A stub page for `noteFocus` and `repairFocus`. Each control is a button
 * with an accessible name. `focus()` moves the page's active element, and a
 * control that leaves the page (`isConnected` false) refuses focus, as the
 * browser does.
 */
function page() {
  /** @type {any} */
  const doc = { activeElement: null, body: null };
  /** @type {any[]} */
  let controls = [];
  /** @param {string} label @param {any} [parentElement] */
  const button = (label, parentElement = null) => ({
    tagName: 'BUTTON',
    className: 'btn',
    textContent: label,
    isConnected: true,
    parentElement,
    getAttribute: (/** @type {string} */ name) => (name === 'aria-label' ? label : null),
    focus() {
      if (this.isConnected) doc.activeElement = this;
    },
  });
  const panel = {
    isConnected: true,
    parentElement: null,
    querySelector: () => controls.find((c) => c.isConnected) ?? null,
  };
  doc.body = {
    isConnected: true,
    querySelectorAll: () => controls.filter((c) => c.isConnected),
    contains: (/** @type {any} */ target) => controls.includes(target),
  };
  panel.parentElement = doc.body;
  /** @param {string[]} labels */
  const render = (labels) => {
    for (const c of controls) c.isConnected = false;
    controls = labels.map((label) => button(label, panel));
    return controls;
  };
  return { doc, panel, render, button };
}

test('repairFocus leaves focus alone when the caller moved it', () => {
  const { doc, render } = page();
  const [opener, other] = render(['Complete A', 'Edit A']);
  const note = noteFocus(opener, doc.body);
  doc.activeElement = other;
  assert.equal(repairFocus(doc, note, null), null);
  assert.equal(doc.activeElement, other);
});

test('repairFocus finds the rebuilt control by the opener signature', () => {
  const { doc, render } = page();
  const [opener] = render(['Complete A', 'Complete B']);
  const note = noteFocus(opener, doc.body);
  const [again] = render(['Complete A', 'Complete B']);
  doc.activeElement = doc.body;
  assert.equal(repairFocus(doc, note, null), again);
  assert.equal(doc.activeElement, again);
});

test('repairFocus focuses the opener when it is still in the page', () => {
  const { doc, render } = page();
  const [opener] = render(['Complete A']);
  const note = noteFocus(opener, doc.body);
  assert.equal(repairFocus(doc, note, null), opener);
});

test('repairFocus falls back to the first control of the nearest live ancestor', () => {
  const { doc, render } = page();
  const [opener] = render(['Complete A', 'Complete B']);
  const note = noteFocus(opener, doc.body);
  const [first] = render(['Group Active', 'Complete B']);
  assert.equal(repairFocus(doc, note, null), first);
});

test('repairFocus ends on the fallback when the ancestors are gone too', () => {
  const { doc, render, panel, button } = page();
  const [opener] = render(['Complete A']);
  const note = noteFocus(opener, doc.body);
  render([]);
  panel.isConnected = false;
  const main = button('Main');
  assert.equal(repairFocus(doc, note, /** @type {any} */ (main)), main);
  assert.equal(repairFocus(doc, noteFocus(null, doc.body), null), null);
});
