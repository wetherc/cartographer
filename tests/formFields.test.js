import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captionWrapperKind, keptOrFirst } from '../src/ui/formFields.js';
import { uniqueId } from '../src/ui/dom.js';

/**
 * A caption wraps a control in a `<label>` or in a named group. The choice
 * depends only on the control's tag, so it is tested here without a DOM.
 */

test('a single form control takes a label', () => {
  for (const tag of ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'METER', 'OUTPUT', 'PROGRESS']) {
    assert.equal(captionWrapperKind(tag), 'label', tag);
  }
});

test('the tag name is matched in any case', () => {
  assert.equal(captionWrapperKind('input'), 'label');
  assert.equal(captionWrapperKind('Select'), 'label');
});

test('a container of controls takes a named group', () => {
  assert.equal(captionWrapperKind('DIV'), 'group');
  assert.equal(captionWrapperKind('LABEL'), 'group');
  assert.equal(captionWrapperKind('span'), 'group');
});

test('each generated id carries its prefix and is unique', () => {
  const first = uniqueId('caption');
  const second = uniqueId('caption');
  assert.match(first, /^caption-\d+$/);
  assert.notEqual(first, second);
});

test('keptOrFirst keeps an offered value and falls back to the first option', () => {
  const options = [{ value: 'a' }, { value: 'b' }];
  assert.equal(keptOrFirst(options, 'b'), 'b');
  // A fresh picker has no value yet, so it selects the first option.
  assert.equal(keptOrFirst(options, ''), 'a');
  // A value that a refill no longer offers, such as a deleted table.
  assert.equal(keptOrFirst(options, 'gone'), 'a');
  assert.equal(keptOrFirst([], 'a'), '');
});
