import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handoutFields, patchHandout } from '../src/app/handoutWiring.js';
import { createHandout } from '../src/handout/Handouts.js';
import { parsePlace, placeValue } from '../src/handout/HandoutForm.js';
import { stubApp } from './helpers/app.js';

/** A stub app with the party on tile 1,1 of the world, and two characters. */
function app() {
  const names = /** @type {Record<string, string>} */ ({ world: 'World', cave: 'Cave' });
  return stubApp({
    partyTracker: /** @type {any} */ ({ getPosition: () => ({ nodeId: 'world', tileId: '1,1' }) }),
    grid: /** @type {any} */ ({ getNode: (/** @type {string} */ id) => ({ name: names[id] }) }),
    state: /** @type {any} */ ({
      characters: [
        { id: 'aria', name: 'Aria' },
        { id: 'bram', name: 'Bram' },
      ],
    }),
  });
}

/** @param {import('../src/types/modal.js').ModalField[]} fields @param {string} name */
const field = (fields, name) => /** @type {any} */ (fields.find((f) => f.name === name));

test('a new handout starts on the whole node where the party stands', () => {
  const fields = handoutFields(app(), null, null);
  const where = field(fields, 'where');
  assert.deepEqual(parsePlace(where.value), { nodeId: 'world', tileId: null });
  assert.deepEqual(
    where.options.map((/** @type {any} */ o) => o.label),
    [
      'Everywhere (campaign-wide)',
      'Anywhere in World',
      "Column 2, row 2 of World (the party's tile)",
    ],
  );
  const audience = field(fields, 'audience');
  assert.equal(audience.value, '');
  assert.deepEqual(
    audience.options.map((/** @type {any} */ o) => o.value),
    ['aria', 'bram'],
  );
});

test('a handout added from the tile inspector starts on that tile', () => {
  const fields = handoutFields(app(), null, { nodeId: 'cave', tileId: '3,0' });
  const where = field(fields, 'where');
  assert.deepEqual(parsePlace(where.value), { nodeId: 'cave', tileId: '3,0' });
  assert.ok(where.options.some((/** @type {any} */ o) => o.label === 'Anywhere in Cave'));
});

test('patchHandout folds the dialog into the handout and keeps the reveal flag', () => {
  const before = createHandout('h', 'Old', 'old', 'world', true, 'data:image/png;base64,x');
  const after = patchHandout(before, 'New', {
    body: '  read this  ',
    image: '',
    where: placeValue({ nodeId: 'cave', tileId: '0,1' }),
    audience: 'aria',
  });
  assert.deepEqual(after, {
    id: 'h',
    title: 'New',
    body: 'read this',
    nodeId: 'cave',
    tileId: '0,1',
    revealed: true,
    image: null,
    audience: ['aria'],
  });
  const wide = patchHandout(before, 'New', { body: '', image: 'data:x', where: '', audience: '' });
  assert.equal(wide.nodeId, null);
  assert.equal(wide.audience, null);
  assert.equal(wide.image, 'data:x');
});

test('an edited handout starts on its own place and audience', () => {
  const handout = createHandout('h', 'H', 'body', 'cave', true, null, {
    tileId: '2,2',
    audience: ['bram'],
  });
  const fields = handoutFields(app(), handout, null);
  assert.deepEqual(parsePlace(field(fields, 'where').value), { nodeId: 'cave', tileId: '2,2' });
  assert.equal(field(fields, 'audience').value, 'bram');
  assert.equal(field(fields, 'title').value, 'H');
});

test('the handout dialog marks its title required and takes prose in a text area', () => {
  const fields = handoutFields(app(), null, null);
  assert.equal(field(fields, 'title').label, 'Title (required)');
  const body = field(fields, 'body');
  assert.equal(body.type, 'textarea');
  assert.ok(body.rows > 1, 'the text area shows several lines');
});
