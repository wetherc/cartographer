import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectImageRefs, exportFilename } from '../src/map/MapExport.js';
import { createMapNode, createTile, setTile } from '../src/map/TileGrid.js';

test('collectImageRefs dedupes bases and includes overlays', () => {
  let node = createMapNode('n', 'Node', null, 3, 1);
  node = setTile(node, createTile('0,0', 'tiles/grass-1.png'));
  node = setTile(node, createTile('1,0', 'tiles/grass-1.png', { overlayRef: 'tiles/road-h.png' }));
  node = setTile(node, createTile('2,0', 'tiles/water-1.png'));

  assert.deepEqual(collectImageRefs(node).sort(), [
    'tiles/grass-1.png',
    'tiles/road-h.png',
    'tiles/water-1.png',
  ]);
});

test('collectImageRefs skips empty refs', () => {
  let node = createMapNode('n', 'Node', null, 1, 1);
  node = setTile(node, createTile('0,0', ''));
  assert.deepEqual(collectImageRefs(node), []);
});

test('exportFilename slugs the node name and always ends in .png', () => {
  assert.equal(exportFilename('Northmarch Region'), 'northmarch-region.png');
  assert.equal(exportFilename('Crypt (level 2)'), 'crypt-level-2.png');
  assert.equal(exportFilename('***'), 'map.png');
});
