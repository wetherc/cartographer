import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MapMarkers, markerAnchors, partyDot, withinMarkerRange } from '../src/map/MapMarkers.js';

test('partyDot moves to a small corner dot on a tile with art or a badge to keep clear', () => {
  const center = { x: 0.5, y: 0.5, r: 0.22 };
  const corner = { x: 0.26, y: 0.74, r: 0.15 };
  const plain = /** @type {any} */ ({ metadata: { poiType: null }, childNodeId: null });
  assert.deepEqual(partyDot(plain, false), center);
  assert.deepEqual(partyDot(undefined, false), center);
  assert.deepEqual(partyDot(plain, true), corner, 'a door or stairs out');
  assert.deepEqual(partyDot({ ...plain, metadata: { poiType: 'landmark' } }, false), corner);
  assert.deepEqual(partyDot({ ...plain, childNodeId: 'town' }, false), corner);
});

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

test('markerAnchors skips the party marker on a map above the party', () => {
  // The marker sits on the link tile toward the party, but the party is not
  // on this map. A split-off scout who stands here still anchors.
  const view = { partyTileId: '2,2', partyInNode: false, characterTokens: [{ tileId: '7,7' }] };
  assert.deepEqual(markerAnchors(view), [{ x: 7, y: 7 }]);
  assert.equal(withinMarkerRange(markerAnchors(view), 4, '2,3'), false);
  assert.deepEqual(markerAnchors({ partyTileId: '2,2', partyInNode: true }), [{ x: 2, y: 2 }]);
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

/** A renderer stub whose context counts the arcs drawn. */
function arcHost() {
  const host = { tileSize: 32, arcs: 0, ctx: /** @type {any} */ ({}) };
  host.ctx = new Proxy(
    {},
    {
      get: (_t, key) => (key === 'arc' ? () => host.arcs++ : () => {}),
      set: () => true,
    },
  );
  return host;
}

/** @param {object[]} tiles */
const partyView = (tiles) =>
  /** @type {any} */ ({
    partyTileId: '0,0',
    node: { id: 'n', width: 2, height: 2, tiles },
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  });

test('renderPartyMarker skips a map with no painted tile', () => {
  const host = arcHost();
  new MapMarkers(/** @type {any} */ (host)).renderPartyMarker(partyView([]));
  assert.equal(host.arcs, 0);
});

test('renderPartyMarker draws the dot on a painted map', () => {
  const host = arcHost();
  const tiles = [{ id: '1,1', x: 1, y: 1, imageRef: 'grass' }];
  new MapMarkers(/** @type {any} */ (host)).renderPartyMarker(partyView(tiles));
  assert.equal(host.arcs, 1);
});
