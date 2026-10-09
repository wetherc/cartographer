import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coordLabelRoom, fitForLabels } from '../src/map/CoordLabels.js';

test('coordLabelRoom keeps two label paddings, up to 64 CSS px', () => {
  assert.deepEqual(coordLabelRoom(14, 1), { lead: 1.8 * 14, labelDepth: 21 });
  assert.equal(coordLabelRoom(42, 1).lead, 64);
  assert.equal(coordLabelRoom(42, 2).lead, 1.8 * 42);
});

test('fitForLabels refits with the smaller font of the first fit', () => {
  // Less room for labels gives a larger scale; the font tracks the scale.
  const fitAt = (font) => ({ scale: 100 - font });
  const fontAt = (scale) => (scale < 90 ? 14 : 20);
  assert.deepEqual(fitForLabels(fitAt, fontAt, 42), { scale: 86 });
});

test('fitForLabels keeps the last fit whose own font fits its room', () => {
  const fitAt = (font) => ({ scale: 100 - font });
  // The refit at font 14 zooms to a font of 30, past the room it kept.
  const fontAt = (scale) => (scale < 70 ? 14 : 30);
  assert.deepEqual(fitForLabels(fitAt, fontAt, 42), { scale: 58 });
});

test('fitForLabels keeps the first fit at the font cap', () => {
  assert.deepEqual(
    fitForLabels(
      () => ({ scale: 2 }),
      () => 42,
      42,
    ),
    { scale: 2 },
  );
});
