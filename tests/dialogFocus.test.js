import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dialogPartId, pickReturnFocus } from '../src/ui/dialogFocus.js';

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
