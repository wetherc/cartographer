import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  GROUP_LIMIT,
  excerpt,
  fold,
  highlight,
  queryTerms,
  searchCampaign,
} from '../src/view/CampaignSearch.js';

const gm = { gm: true, boundCharacterId: null };
const player = { gm: false, boundCharacterId: 'pc-1' };

/** @param {string} id @param {boolean} revealed @param {string} [notes] */
const tile = (id, revealed, notes = '') => ({
  id,
  imageRef: 'grass',
  overlayRef: null,
  revealed,
  childNodeId: null,
  metadata: { poiType: null, discoverable: false, discovered: false, notes },
});

const node = (id, name, parentId, tiles) => ({
  id,
  name,
  parentId,
  width: 4,
  height: 2,
  tiles,
  kind: 'region',
  environ: null,
});

const quest = (over) => ({
  id: 'q1',
  title: 'Rumors at the Waystation',
  notes: 'The silver ship docks at dusk.',
  status: 'active',
  revealed: true,
  objectives: [
    { id: 'o1', text: 'Ask the innkeeper', done: false, hidden: false },
    { id: 'o2', text: 'Find the smuggler cave', done: false, hidden: true },
  ],
  links: [],
  unlocks: [],
  ...over,
});

const creature = (over) => ({
  id: 'c1',
  name: 'Maren',
  disposition: 'neutral',
  location: { nodeId: 'town', tileId: '1,0' },
  met: true,
  role: 'Innkeeper',
  notes: 'Knows about the silver ship.',
  ...over,
});

const handout = (over) => ({
  id: 'h1',
  title: 'A torn letter',
  body: 'Meet me by the silver ship at dusk.',
  nodeId: null,
  tileId: null,
  revealed: true,
  image: null,
  audience: null,
  ...over,
});

function sources(over = {}) {
  return {
    quests: [quest()],
    creatures: [creature()],
    handouts: [handout()],
    travelog: [
      { id: 'l1', at: 0, kind: 'travel', message: 'The party reached Corby.' },
      {
        id: 'l2',
        at: 1,
        kind: 'combat',
        message: 'Wolf takes 7.',
        gm: true,
        player: 'Wolf is hurt.',
      },
      { id: 'l3', at: 2, kind: 'note', message: 'Secret: the wolf den.', gm: true },
    ],
    nodes: [
      node('world', 'World', null, [tile('0,0', true), tile('1,0', false, 'Silver ship wreck')]),
      node('town', 'Corby', 'world', [tile('0,0', false), tile('1,0', false)]),
    ],
    ...over,
  };
}

/** @param {ReturnType<typeof searchCampaign>} groups */
const kinds = (groups) => groups.map((g) => g.kind);
/** @param {ReturnType<typeof searchCampaign>} groups @param {string} kind */
const titles = (groups, kind) =>
  groups.find((g) => g.kind === kind)?.results.map((r) => r.title) ?? [];

test('fold drops case and accents, and queryTerms splits on white space', () => {
  assert.equal(fold('Ærendil Éowyn'), 'ærendil eowyn');
  assert.deepEqual(queryTerms('  Silver   SHIP '), ['silver', 'ship']);
  assert.deepEqual(queryTerms('   '), []);
});

test('an empty query finds nothing', () => {
  assert.deepEqual(searchCampaign(sources(), '  ', gm), []);
});

test('the GM finds every kind, in the fixed group order', () => {
  const groups = searchCampaign(sources(), 'silver', gm);
  assert.deepEqual(kinds(groups), ['quest', 'handout', 'tileNote', 'creatureNote']);
  const tileNote = groups.find((g) => g.kind === 'tileNote')?.results[0];
  assert.equal(tileNote?.title, 'World, column 2, row 1');
  assert.deepEqual(tileNote?.target, { type: 'tile', nodeId: 'world', tileId: '1,0' });
});

test('a Player tab never matches quest notes, creature notes, or tile notes', () => {
  assert.deepEqual(kinds(searchCampaign(sources(), 'silver', player)), ['handout']);
});

test('a hidden quest and a hidden objective stay out of a Player tab', () => {
  assert.deepEqual(titles(searchCampaign(sources(), 'smuggler', gm), 'quest'), [
    'Rumors at the Waystation',
  ]);
  assert.deepEqual(searchCampaign(sources(), 'smuggler', player), []);
  const hidden = sources({ quests: [quest({ revealed: false })] });
  assert.deepEqual(searchCampaign(hidden, 'rumors', player), []);
  assert.equal(searchCampaign(sources(), 'innkeeper ask', player)[0].kind, 'quest');
});

test('a quest detail shows its status for a title match and the text for a step match', () => {
  const byTitle = searchCampaign(sources(), 'rumors', gm)[0].results[0];
  assert.equal(byTitle.detail, 'Active');
  assert.deepEqual(byTitle.target, { type: 'panel', panel: 'quest', id: 'q1' });
  const done = sources({ quests: [quest({ status: 'completed' })] });
  assert.equal(searchCampaign(done, 'rumors', gm)[0].results[0].detail, 'Completed');
  assert.equal(
    searchCampaign(sources(), 'innkeeper', gm)[0].results[0].detail,
    'Ask the innkeeper',
  );
});

test('words may match across the fields of one record', () => {
  const groups = searchCampaign(sources(), 'maren innkeeper', gm);
  assert.deepEqual(titles(groups, 'creature'), ['Maren']);
  assert.deepEqual(searchCampaign(sources(), 'maren dragon', gm), []);
});

test('a Player tab finds only the creatures the party met', () => {
  const cast = [
    creature(),
    creature({ id: 'c2', name: 'Marek', met: false }),
    creature({ id: 'c3', name: 'Mara', location: null, met: false }),
    creature({ id: 'c4', name: 'Marrow Wolf', disposition: 'hostile', location: null, met: false }),
  ];
  const groups = searchCampaign(sources({ creatures: cast }), 'mar', player);
  assert.deepEqual(titles(groups, 'creature'), ['Maren', 'Mara']);
  const gmGroups = searchCampaign(sources({ creatures: cast }), 'mar', gm);
  assert.equal(gmGroups[0].total, 4);
});

test('a placed creature leads to its tile and an unplaced one to the NPC list', () => {
  const cast = [creature(), creature({ id: 'c3', name: 'Mara', location: null, role: '' })];
  const [group] = searchCampaign(sources({ creatures: cast }), 'mar', gm);
  assert.deepEqual(group.results[0].target, { type: 'tile', nodeId: 'town', tileId: '1,0' });
  assert.deepEqual(group.results[1].target, { type: 'panel', panel: 'npc', id: 'c3' });
  assert.equal(group.results[0].detail, 'Innkeeper · Corby');
  assert.equal(group.results[1].detail, 'Neutral');
});

test('handouts follow the reveal flag and the audience on a Player tab', () => {
  const list = [
    handout(),
    handout({ id: 'h2', title: 'Sealed orders', body: 'silver', revealed: false }),
    handout({ id: 'h3', title: 'For Bo', body: 'silver', audience: ['pc-2'] }),
    handout({ id: 'h4', title: 'For me', body: 'silver', audience: ['pc-1'] }),
  ];
  const mine = searchCampaign(sources({ handouts: list }), 'silver', player);
  assert.deepEqual(titles(mine, 'handout'), ['A torn letter', 'For me']);
  const all = searchCampaign(sources({ handouts: list }), 'silver', gm);
  assert.equal(all.find((g) => g.kind === 'handout')?.total, 4);
  const byTitle = searchCampaign(sources(), 'torn', gm)[0].results[0];
  assert.equal(byTitle.detail, 'Meet me by the silver ship at dusk.');
});

test('the travelogue reads as each role reads it, newest first', () => {
  const gmLog = searchCampaign(sources(), 'wolf', gm)[0];
  assert.equal(gmLog.kind, 'log');
  assert.deepEqual(
    gmLog.results.map((r) => r.title),
    ['Secret: the wolf den.', 'Wolf takes 7.'],
  );
  assert.equal(gmLog.results[0].detail, 'Note');
  const playerLog = searchCampaign(sources(), 'wolf', player)[0];
  assert.deepEqual(
    playerLog.results.map((r) => r.title),
    ['Wolf is hurt.'],
  );
  assert.deepEqual(playerLog.results[0].target, { type: 'panel', panel: 'log', id: 'l2' });
});

test('a Player tab finds only maps with a revealed tile, and centers that tile', () => {
  assert.deepEqual(
    searchCampaign(sources(), 'corby', player).map((g) => g.kind),
    ['log'],
  );
  const world = searchCampaign(sources(), 'world', player)[0].results[0];
  assert.deepEqual(world.target, { type: 'tile', nodeId: 'world', tileId: '0,0' });
  assert.equal(world.detail, 'Top map');
  const town = searchCampaign(sources(), 'corby', gm)[0].results[0];
  assert.deepEqual(town.target, { type: 'tile', nodeId: 'town', tileId: '2,1' });
  assert.equal(town.detail, 'In World');
});

test('a group lists at most GROUP_LIMIT results, title-start matches first', () => {
  const cast = Array.from({ length: GROUP_LIMIT + 2 }, (_, i) =>
    creature({ id: `c${i}`, name: i === 6 ? 'Wolf' : `Dire wolf ${i}`, role: '' }),
  );
  const [group] = searchCampaign(sources({ creatures: cast, travelog: [] }), 'wolf', gm);
  assert.equal(group.total, GROUP_LIMIT + 2);
  assert.equal(group.results.length, GROUP_LIMIT);
  assert.equal(group.results[0].title, 'Wolf');
});

test('excerpt cuts around the first match with ellipses', () => {
  const long = `${'a'.repeat(60)} needle ${'b'.repeat(80)}`;
  const cut = excerpt(long, ['needle']);
  assert.ok(cut.startsWith('…'));
  assert.ok(cut.endsWith('…'));
  assert.ok(cut.includes('needle'));
  assert.equal(excerpt('short  text', ['zzz']), 'short text');
});

test('highlight marks every occurrence of every term', () => {
  assert.deepEqual(highlight('Wolf and wolf den', ['wolf', 'den']), [
    { text: 'Wolf', hit: true },
    { text: ' and ', hit: false },
    { text: 'wolf', hit: true },
    { text: ' ', hit: false },
    { text: 'den', hit: true },
  ]);
  assert.deepEqual(highlight('ﬁre', ['fi']), [{ text: 'ﬁre', hit: false }]);
  assert.deepEqual(highlight('text', []), [{ text: 'text', hit: false }]);
});

test('highlight keeps positions after an ellipsis, and excerpt starts on a word', () => {
  assert.deepEqual(highlight('…the Silver ship', ['silver']), [
    { text: '…the ', hit: false },
    { text: 'Silver', hit: true },
    { text: ' ship', hit: false },
  ]);
  assert.deepEqual(highlight('Éowyn', ['eo']), [
    { text: 'Éo', hit: true },
    { text: 'wyn', hit: false },
  ]);
  const cut = excerpt(`${'word '.repeat(12)}needle`, ['needle']);
  assert.equal(cut, '…word word word word word word needle');
});
