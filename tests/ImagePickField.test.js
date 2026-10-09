import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KEPT_IMAGE_TEXT, NO_IMAGE_TEXT, pickedName } from '../src/ui/ImagePickField.js';

test('the name line says no image until a pick', () => {
  assert.equal(pickedName(''), NO_IMAGE_TEXT);
});

test('the name line says the stored image stays until a pick replaces it', () => {
  assert.equal(pickedName('data:image/png;base64,AAAA'), KEPT_IMAGE_TEXT);
});

test('the name line shows the picked file name', () => {
  assert.equal(pickedName('', 'map.png'), 'map.png');
  assert.equal(pickedName('data:image/png;base64,AAAA', 'map.png'), 'map.png');
});
