import { test } from 'node:test';
import assert from 'node:assert/strict';
import { viewerOf } from '../src/app/viewer.js';

test('viewerOf reads the role and the bound character', () => {
  const app = /** @type {any} */ ({
    state: { role: 'player' },
    actions: { getBoundCharacterId: () => 'c1' },
  });
  assert.deepEqual(viewerOf(app), { gm: false, boundCharacterId: 'c1' });
});

test('viewerOf reads a tab with no binding reader yet as unbound', () => {
  const app = /** @type {any} */ ({ state: { role: 'gm' }, actions: {} });
  assert.deepEqual(viewerOf(app), { gm: true, boundCharacterId: null });
});

test('viewerOf turns an undefined binding into null', () => {
  const app = /** @type {any} */ ({
    state: { role: 'gm' },
    actions: { getBoundCharacterId: () => undefined },
  });
  assert.equal(viewerOf(app).boundCharacterId, null);
});
