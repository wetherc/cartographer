import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captionWrapperKind } from '../src/ui/formFields.js';
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
