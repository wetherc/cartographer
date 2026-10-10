import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createHandout,
  cleanAudience,
  withDefaults,
  toggleRevealed,
  handoutRevealLine,
  handoutsAt,
  handoutsFor,
  revealedFor,
  handoutsCued,
  hiddenHandoutTiles,
  inAudience,
  unbindFrom,
  bindingsIn,
  tileBindingsLost,
  unbindTiles,
  restoreBindings,
} from '../src/handout/Handouts.js';

test('createHandout defaults to hidden, empty body, campaign-wide, every player', () => {
  const h = createHandout('h1', 'The Prophecy');
  assert.deepEqual(h, {
    id: 'h1',
    title: 'The Prophecy',
    body: '',
    nodeId: null,
    tileId: null,
    revealed: false,
    image: null,
    audience: null,
  });
});

test('createHandout keeps supplied body/nodeId/revealed/tile/audience', () => {
  const h = createHandout('h1', 'Note', 'read aloud', 'world', true, null, {
    tileId: '2,3',
    audience: ['aria'],
  });
  assert.equal(h.body, 'read aloud');
  assert.equal(h.nodeId, 'world');
  assert.equal(h.revealed, true);
  assert.equal(h.tileId, '2,3');
  assert.deepEqual(h.audience, ['aria']);
});

test('createHandout drops a tile from a campaign-wide handout', () => {
  assert.equal(createHandout('h', 'H', '', null, false, null, { tileId: '1,1' }).tileId, null);
});

test('cleanAudience keeps unique ids, and turns anything else into every player', () => {
  assert.deepEqual(cleanAudience(['a', 'b', 'a', '', 7]), ['a', 'b']);
  assert.equal(cleanAudience([]), null);
  assert.equal(cleanAudience(['']), null);
  assert.equal(cleanAudience('a'), null);
  assert.equal(cleanAudience(undefined), null);
});

test('withDefaults backfills a legacy handout missing fields', () => {
  const filled = withDefaults(/** @type {any} */ ({ id: 'h1', title: 'Old' }));
  assert.deepEqual(filled, {
    id: 'h1',
    title: 'Old',
    body: '',
    nodeId: null,
    tileId: null,
    revealed: false,
    image: null,
    audience: null,
  });
});

test('withDefaults keeps a tile only on a node-bound handout, and cleans the audience', () => {
  const bound = withDefaults(
    /** @type {any} */ ({ id: 'h', title: 'H', nodeId: 'world', tileId: '1,2', audience: ['x'] }),
  );
  assert.equal(bound.tileId, '1,2');
  assert.deepEqual(bound.audience, ['x']);
  const loose = withDefaults(
    /** @type {any} */ ({ id: 'h', title: 'H', nodeId: null, tileId: '1,2', audience: [] }),
  );
  assert.equal(loose.tileId, null);
  assert.equal(loose.audience, null);
  const junk = withDefaults(/** @type {any} */ ({ id: 'h', title: 'H', nodeId: 'w', tileId: 4 }));
  assert.equal(junk.tileId, null);
});

test('toggleRevealed flips the reveal flag without touching other fields', () => {
  const h = createHandout('h1', 'Note', 'body', 'world', false);
  const shown = toggleRevealed(h);
  assert.equal(shown.revealed, true);
  assert.equal(shown.title, 'Note');
  assert.equal(toggleRevealed(shown).revealed, false);
});

test('handoutsAt returns node-bound plus campaign-wide handouts, in order', () => {
  const list = [
    createHandout('a', 'A', '', 'world'),
    createHandout('b', 'B', '', 'region1'),
    createHandout('c', 'C', '', null),
    createHandout('d', 'D', '', 'world', false, null, { tileId: '5,5' }),
  ];
  assert.deepEqual(
    handoutsAt(list, 'world').map((h) => h.id),
    ['a', 'c', 'd'],
  );
  assert.deepEqual(
    handoutsAt(list, 'region1').map((h) => h.id),
    ['b', 'c'],
  );
});

test('inAudience admits every tab without a list, and only chosen characters with one', () => {
  const open = createHandout('a', 'A');
  const closed = createHandout('b', 'B', '', null, true, null, { audience: ['aria'] });
  assert.equal(inAudience(open, null), true);
  assert.equal(inAudience(open, 'bram'), true);
  assert.equal(inAudience(closed, 'aria'), true);
  assert.equal(inAudience(closed, 'bram'), false);
  assert.equal(inAudience(closed, null), false, 'a spectator tab is not a chosen player');
});

/** A revealed handout for the filter tests. */
const shown = (id, nodeId, extra = {}) =>
  createHandout(id, id, `${id} body`, nodeId, true, `data:image/png;base64,${id}`, extra);

const party = { nodeId: 'world', tileId: '2,2' };
const player = (boundCharacterId) => ({ gm: false, boundCharacterId });

test('handoutsFor gives the GM every handout of the node, hidden and tile-bound ones too', () => {
  const list = [
    createHandout('hidden', 'Hidden', 'secret', 'world'),
    shown('far-tile', 'world', { tileId: '9,9' }),
    shown('only-aria', 'world', { audience: ['aria'] }),
    shown('elsewhere', 'cave'),
  ];
  assert.deepEqual(
    handoutsFor(list, party, { gm: true, boundCharacterId: null }).map((h) => h.id),
    ['hidden', 'far-tile', 'only-aria'],
  );
});

test('handoutsFor gives a player tab only revealed handouts', () => {
  const list = [createHandout('hidden', 'Hidden', 'secret', 'world'), shown('open', 'world')];
  assert.deepEqual(
    handoutsFor(list, party, player('aria')).map((h) => h.id),
    ['open'],
  );
});

test('handoutsFor lists a tile-bound handout only while the party stands on that tile', () => {
  const list = [
    shown('here', 'world', { tileId: '2,2' }),
    shown('there', 'world', { tileId: '3,2' }),
  ];
  assert.deepEqual(
    handoutsFor(list, party, player(null)).map((h) => h.id),
    ['here'],
  );
  assert.deepEqual(
    handoutsFor(list, { nodeId: 'world', tileId: '3,2' }, player(null)).map((h) => h.id),
    ['there'],
  );
  assert.deepEqual(handoutsFor(list, { nodeId: 'cave', tileId: '2,2' }, player(null)), []);
});

test('handoutsFor keeps a chosen-audience handout off every other player tab', () => {
  const secret = shown('for-aria', 'world', { audience: ['aria', 'cleo'] });
  const list = [secret, shown('for-all', null)];
  const ids = (/** @type {string | null} */ bound) =>
    handoutsFor(list, party, player(bound)).map((h) => h.id);
  assert.deepEqual(ids('aria'), ['for-aria', 'for-all']);
  assert.deepEqual(ids('cleo'), ['for-aria', 'for-all']);
  assert.deepEqual(ids('bram'), ['for-all']);
  assert.deepEqual(ids(null), ['for-all'], 'a spectator tab is not in a chosen audience');
});

test("an unchosen player's list contains neither the body nor the image of the handout", () => {
  const secret = shown('for-aria', 'world', { audience: ['aria'] });
  const list = [secret, shown('for-all', 'world')];
  for (const bound of ['bram', null]) {
    const text = JSON.stringify(handoutsFor(list, party, player(bound)));
    assert.equal(text.includes(secret.body), false);
    assert.equal(text.includes(/** @type {string} */ (secret.image)), false);
  }
  const aria = JSON.stringify(handoutsFor(list, party, player('aria')));
  assert.equal(aria.includes(secret.body), true);
});

test('unbindFrom makes the handouts on the given nodes campaign-wide, tile and all', () => {
  const list = [
    createHandout('a', 'A', '', 'cellar', false, null, { tileId: '1,1' }),
    createHandout('b', 'B', '', 'world'),
    createHandout('c', 'C', '', null),
  ];
  const loose = unbindFrom(list, new Set(['cellar']));
  assert.equal(loose[0].nodeId, null);
  assert.equal(loose[0].tileId, null);
  assert.equal(loose[1], list[1], 'a handout bound elsewhere keeps its identity');
  assert.equal(loose[2], list[2]);
});

test('unbindFrom returns the same list when no handout is bound there', () => {
  const list = [createHandout('a', 'A', '', 'world'), createHandout('c', 'C')];
  assert.equal(unbindFrom(list, new Set(['cellar'])), list);
  assert.equal(unbindFrom(list, new Set()), list);
});

test('bindingsIn records the node and tile of each handout bound to the given nodes', () => {
  const list = [
    createHandout('a', 'A', '', 'cellar', false, null, { tileId: '0,1' }),
    createHandout('b', 'B', '', 'world'),
    createHandout('c', 'C'),
  ];
  assert.deepEqual(bindingsIn(list, new Set(['cellar'])), [
    { handoutId: 'a', nodeId: 'cellar', tileId: '0,1' },
  ]);
  assert.deepEqual(bindingsIn(list, new Set(['nowhere'])), []);
});

test('tileBindingsLost names the tile-bound handouts of the node whose tile goes', () => {
  const list = [
    createHandout('gone', 'G', '', 'world', false, null, { tileId: '4,4' }),
    createHandout('kept', 'K', '', 'world', false, null, { tileId: '1,1' }),
    createHandout('whole', 'W', '', 'world'),
    createHandout('other', 'O', '', 'cave', false, null, { tileId: '4,4' }),
    /** @type {any} */ ({ id: 'legacy', title: 'L', nodeId: 'world' }),
  ];
  assert.deepEqual(
    tileBindingsLost(list, 'world', (id) => id !== '4,4'),
    [{ handoutId: 'gone', nodeId: 'world', tileId: '4,4' }],
  );
});

test('unbindTiles binds the named handouts to their whole node', () => {
  const list = [
    createHandout('a', 'A', '', 'world', false, null, { tileId: '4,4' }),
    createHandout('b', 'B', '', 'world', false, null, { tileId: '1,1' }),
  ];
  const next = unbindTiles(list, [{ handoutId: 'a', nodeId: 'world', tileId: '4,4' }]);
  assert.equal(next[0].tileId, null);
  assert.equal(next[0].nodeId, 'world');
  assert.equal(next[1], list[1]);
  assert.equal(unbindTiles(list, []), list, 'nothing to unbind keeps the array');
});

test('restoreBindings binds the recorded handouts back to their nodes and tiles', () => {
  const list = [
    createHandout('a', 'A'),
    createHandout('b', 'B', '', 'world'),
    createHandout('c', 'C', '', 'world'),
  ];
  const restored = restoreBindings(list, [
    { handoutId: 'a', nodeId: 'cellar', tileId: null },
    { handoutId: 'c', nodeId: 'world', tileId: '3,3' },
  ]);
  assert.equal(restored[0].nodeId, 'cellar');
  assert.equal(restored[0].tileId, null);
  assert.equal(restored[1], list[1]);
  assert.equal(restored[2].tileId, '3,3');
});

test('restoreBindings drops a tile from a binding that restores campaign-wide', () => {
  const list = [createHandout('a', 'A', '', 'world')];
  const restored = restoreBindings(list, [{ handoutId: 'a', nodeId: null, tileId: '1,1' }]);
  assert.equal(restored[0].tileId, null);
});

test('restoreBindings skips a handout that is gone, and no bindings at all', () => {
  const list = [createHandout('a', 'A')];
  assert.equal(restoreBindings(list, []), list, 'nothing to do keeps the array');
  assert.deepEqual(
    restoreBindings(list, [{ handoutId: 'deleted', nodeId: 'world', tileId: null }]),
    list,
  );
});

test('handoutRevealLine hides the title of a hidden or targeted handout', () => {
  const open = { ...createHandout('h1', 'Map'), revealed: true };
  assert.deepEqual(handoutRevealLine(open), ['The party receives the handout Map.', undefined]);
  assert.deepEqual(handoutRevealLine({ ...open, audience: ['c1'] }), [
    'The party receives the handout Map.',
    { gm: true },
  ]);
  assert.deepEqual(handoutRevealLine({ ...open, revealed: false }), [
    'The handout Map is hidden from players.',
    { gm: true },
  ]);
});

test('revealedFor lists the spot first, then every other revealed handout of the audience', () => {
  const at = (id, extra = {}) => ({ ...createHandout(id, id), revealed: true, ...extra });
  const here = at('here', { nodeId: 'world', tileId: '2,2' });
  const far = at('far', { nodeId: 'cave', tileId: '1,1' });
  const hidden = at('hidden', { revealed: false });
  const other = at('other', { audience: ['c2'] });
  const wide = at('wide');
  const all = [far, here, hidden, other, wide];
  const ids = (/** @type {{ id: string }[]} */ list) => list.map((h) => h.id);
  const c1 = revealedFor(all, party, 'c1');
  assert.deepEqual(ids(c1.here), ['here', 'wide']);
  assert.deepEqual(ids(c1.earlier), ['far']);
  const c2 = revealedFor(all, { nodeId: 'cave', tileId: '9,9' }, 'c2');
  assert.deepEqual(ids(c2.here), ['other', 'wide']);
  assert.deepEqual(ids(c2.earlier), ['far', 'here']);
  assert.deepEqual(ids(revealedFor(all, party, null).earlier), ['far']);
});

test('handoutsCued lists the hidden handouts bound to the party tile', () => {
  const on = (id, extra = {}) => ({
    ...createHandout(id, id),
    nodeId: 'world',
    tileId: '2,2',
    ...extra,
  });
  const all = [
    on('cue'),
    on('open', { revealed: true }),
    on('elsewhere', { tileId: '3,3' }),
    on('node', { tileId: null }),
    on('cave', { nodeId: 'cave' }),
  ];
  assert.deepEqual(
    handoutsCued(all, party).map((h) => h.id),
    ['cue'],
  );
});

test('hiddenHandoutTiles lists each tile of the node with a hidden handout once', () => {
  const on = (id, tileId, extra = {}) => ({
    ...createHandout(id, id),
    nodeId: 'world',
    tileId,
    ...extra,
  });
  const all = [
    on('a', '1,1'),
    on('b', '1,1'),
    on('c', '2,2', { revealed: true }),
    on('d', null),
    on('e', '4,4', { nodeId: 'cave' }),
  ];
  assert.deepEqual(hiddenHandoutTiles(all, 'world'), ['1,1']);
});

test('withDefaults reveals a handout only when the flag is exactly true', () => {
  for (const flag of ['false', 'true', 1, {}, null]) {
    const filled = withDefaults(/** @type {any} */ ({ id: 'h', title: 'T', revealed: flag }));
    assert.equal(filled.revealed, false, `flag ${JSON.stringify(flag)}`);
  }
  assert.equal(
    withDefaults(/** @type {any} */ ({ id: 'h', title: 'T', revealed: true })).revealed,
    true,
  );
});
