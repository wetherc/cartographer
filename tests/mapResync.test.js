import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resyncMapViews } from '../src/app/mapResync.js';

/**
 * A recording stand-in for the map wiring's shared context and the app around
 * it. Every view call the helper can make appends its name to one list, so a
 * test asserts the whole sequence rather than one call at a time.
 * @param {string} currentNodeId which node the navigator reports as current
 */
function recordingEnv(currentNodeId = 'node-a') {
  /** @type {string[]} */
  const calls = [];
  const node = { id: currentNodeId };
  const crumb = [node];
  const app = /** @type {any} */ ({
    navigator: {
      getCurrentNode: () => node,
      getBreadcrumb: () => crumb,
    },
  });
  /** @type {{ node: unknown }[]} */
  const canvasNodes = [];
  const env = /** @type {any} */ ({
    mapCanvas: {
      setNode: (n) => {
        calls.push('setNode');
        canvasNodes.push({ node: n });
      },
      refreshNode: (n) => {
        calls.push('refreshNode');
        canvasNodes.push({ node: n });
      },
    },
    clearSelection: () => calls.push('clearSelection'),
    syncPartyMarker: () => calls.push('syncPartyMarker'),
    syncPaletteKind: () => calls.push('syncPaletteKind'),
    syncExits: () => calls.push('syncExits'),
    breadcrumb: {
      update: (c) => calls.push(`breadcrumb:${c.length}`),
    },
    worldTree: { update: () => calls.push('worldTree') },
    regionTree: { update: () => calls.push('regionTree') },
  });
  return { app, env, calls, node, canvasNodes };
}

test('reframe re-frames the canvas, drops the selection, and re-syncs party and palette', () => {
  const { app, env, calls } = recordingEnv();
  resyncMapViews(app, env, { reframe: true });
  assert.deepEqual(calls, [
    'setNode',
    'clearSelection',
    'syncPartyMarker',
    'syncPaletteKind',
    'breadcrumb:1',
    'worldTree',
    'regionTree',
  ]);
});

test('without reframe the canvas redraws in place, keeping the selection and framing', () => {
  const { app, env, calls } = recordingEnv();
  resyncMapViews(app, env, { reframe: false });
  assert.deepEqual(calls, ['refreshNode', 'syncExits', 'breadcrumb:1', 'worldTree', 'regionTree']);
});

test('omitting the options behaves like reframe: false', () => {
  const { app, env, calls } = recordingEnv();
  resyncMapViews(app, env);
  assert.deepEqual(calls, ['refreshNode', 'syncExits', 'breadcrumb:1', 'worldTree', 'regionTree']);
});

test('a redraw never clears the selection, re-filters the palette, or moves the party marker', () => {
  const { app, env, calls } = recordingEnv();
  resyncMapViews(app, env);
  for (const name of ['clearSelection', 'syncPaletteKind', 'syncPartyMarker', 'setNode']) {
    assert.ok(!calls.includes(name), `${name} should not run without reframe`);
  }
});

test('the canvas is handed the node the navigator currently reports, either way', () => {
  const reframed = recordingEnv('node-current');
  resyncMapViews(reframed.app, reframed.env, { reframe: true });
  assert.equal(reframed.canvasNodes.length, 1);
  assert.equal(reframed.canvasNodes[0].node, reframed.node);

  const redrawn = recordingEnv('node-other');
  resyncMapViews(redrawn.app, redrawn.env);
  assert.equal(redrawn.canvasNodes.length, 1);
  assert.equal(redrawn.canvasNodes[0].node, redrawn.node);
});
