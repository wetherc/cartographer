import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markerAnchors, withinMarkerRange } from '../src/map/MapMarkers.js';

test('markerAnchors parses the party tile and every character token', () => {
  assert.deepEqual(
    markerAnchors({
      characterTokens: [{ tileId: '3,4' }, { tileId: 'nonsense' }],
      partyTileId: '0,0',
    }),
    [
      { x: 3, y: 4 },
      { x: 0, y: 0 },
    ],
  );
  assert.deepEqual(markerAnchors({}), []);
  assert.deepEqual(markerAnchors({ partyTileId: null }), []);
});

test('withinMarkerRange measures Euclidean distance to the nearest anchor', () => {
  const anchors = [{ x: 5, y: 5 }];
  assert.equal(withinMarkerRange(anchors, 2, '5,7'), true, 'straight along an axis');
  assert.equal(withinMarkerRange(anchors, 2, '5,8'), false, 'one cell past the range');
  assert.equal(withinMarkerRange(anchors, 2, '6,6'), true, 'a diagonal inside the circle');
  assert.equal(withinMarkerRange(anchors, 2, '7,7'), false, 'a diagonal outside the circle');
});

test('withinMarkerRange takes the closest of several anchors, and rejects a bad id', () => {
  const anchors = [
    { x: 0, y: 0 },
    { x: 9, y: 9 },
  ];
  assert.equal(withinMarkerRange(anchors, 1, '9,8'), true, 'the far scout senses it');
  assert.equal(withinMarkerRange(anchors, 1, '4,4'), false, 'between the two, out of reach');
  assert.equal(withinMarkerRange(anchors, 99, 'nonsense'), false);
  assert.equal(withinMarkerRange([], 99, '0,0'), false, 'no anchors, nothing detected');
});
