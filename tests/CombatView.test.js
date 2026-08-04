import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sideOf,
  conditionsOf,
  isDowned,
  skipsTurn,
  hpOf,
  acOf,
  mayActOn,
  buildCombatView,
  fightOutcome,
} from '../src/combat/CombatView.js';
import { createCharacter, withHP, damageCharacter } from '../src/entities/Character.js';
import { createEncounter, applyDamage, effectiveStatBlock } from '../src/entities/Encounter.js';
import { armorClass } from '../src/entities/Equipment.js';
import { createNPC } from '../src/entities/NPC.js';

const HERE = { nodeId: 'n1', tileId: '0,0' };

function fixtures() {
  const hero = withHP(createCharacter('hero', 'Hero', { DEX: 14 }), 12);
  const goblin = createEncounter('goblin', 'Goblin', 10, { AC: 13 }, HERE);
  const sage = createNPC('sage', 'Sage', { location: HERE, stats: { AC: 12 } });
  const brigand = createNPC('brigand', 'Brigand', { location: HERE, disposition: 'hostile' });
  return { hero, goblin, sage, brigand };
}

/** @param {Record<string, any>} byId */
function resolver(byId) {
  return (id) => byId[id] ?? null;
}

test('sideOf puts encounters and hostile NPCs against the party', () => {
  const { hero, goblin, sage, brigand } = fixtures();
  assert.equal(sideOf({ kind: 'character', entity: hero }), 'party');
  assert.equal(sideOf({ kind: 'encounter', entity: goblin }), 'foe');
  assert.equal(sideOf({ kind: 'npc', entity: sage }), 'party');
  assert.equal(sideOf({ kind: 'npc', entity: brigand }), 'foe');
});

test('isDowned reads a defeated encounter and a 0 HP character', () => {
  const { hero, goblin, sage } = fixtures();
  assert.equal(isDowned({ kind: 'encounter', entity: goblin }), false);
  assert.equal(isDowned({ kind: 'encounter', entity: applyDamage(goblin, 99) }), true);
  assert.equal(isDowned({ kind: 'character', entity: hero }), false);
  assert.equal(isDowned({ kind: 'character', entity: damageCharacter(hero, 99) }), true);
  assert.equal(isDowned({ kind: 'npc', entity: sage }), false, 'NPCs carry no HP');
});

test('isDowned is false for a character without an HP pool', () => {
  const bare = createCharacter('bare', 'Bare');
  assert.equal(isDowned({ kind: 'character', entity: bare }), false);
});

test('hpOf projects each kind', () => {
  const { hero, goblin, sage } = fixtures();
  assert.deepEqual(hpOf({ kind: 'encounter', entity: goblin }), { current: 10, max: 10 });
  assert.deepEqual(hpOf({ kind: 'character', entity: damageCharacter(hero, 4) }), {
    current: 8,
    max: 12,
  });
  assert.equal(hpOf({ kind: 'npc', entity: sage }), null);
  assert.equal(hpOf({ kind: 'character', entity: createCharacter('b', 'B') }), null);
});

test('acOf projects each kind', () => {
  const { hero, goblin, sage } = fixtures();
  assert.equal(acOf({ kind: 'encounter', entity: goblin }), effectiveStatBlock(goblin).AC);
  assert.equal(acOf({ kind: 'character', entity: hero }), armorClass(hero));
  assert.equal(acOf({ kind: 'npc', entity: sage }), 12);
  assert.equal(acOf({ kind: 'npc', entity: createNPC('w', 'Wisp', {}) }), null);
});

test('mayActOn lets the GM drive anyone and a player only their bound character', () => {
  const { hero, goblin } = fixtures();
  const gm = { gm: true, boundCharacterId: null };
  const bound = { gm: false, boundCharacterId: 'hero' };
  const other = { gm: false, boundCharacterId: 'someone-else' };
  const heroFound = { kind: /** @type {const} */ ('character'), entity: hero };
  const goblinFound = { kind: /** @type {const} */ ('encounter'), entity: goblin };
  assert.equal(mayActOn(heroFound, gm, 'hero'), true);
  assert.equal(mayActOn(goblinFound, gm, 'goblin'), true);
  assert.equal(mayActOn(null, gm, 'gone'), true);
  assert.equal(mayActOn(heroFound, bound, 'hero'), true);
  assert.equal(mayActOn(heroFound, other, 'hero'), false);
  assert.equal(mayActOn(goblinFound, bound, 'goblin'), false, 'foes are the GM alone');
  assert.equal(mayActOn(null, bound, 'gone'), false);
});

test('buildCombatView assembles a row per participant in order', () => {
  const { hero, goblin, sage } = fixtures();
  const combat = {
    round: 3,
    index: 1,
    order: [
      { id: 'goblin', initiative: 17, modifier: 2 },
      { id: 'hero', initiative: 12, modifier: 2 },
      { id: 'sage', initiative: 8, modifier: 0 },
    ],
  };
  const resolve = resolver({
    goblin: { kind: 'encounter', entity: goblin },
    hero: { kind: 'character', entity: hero },
    sage: { kind: 'npc', entity: sage },
  });
  const view = buildCombatView(combat, resolve, { gm: true });
  assert.equal(view.round, 3);
  assert.equal(view.turnIndex, 1);
  assert.deepEqual(
    view.rows.map((r) => r.id),
    ['goblin', 'hero', 'sage'],
  );
  const [foe, character, npc] = view.rows;
  assert.equal(foe.side, 'foe');
  assert.equal(foe.name, 'Goblin');
  assert.deepEqual(foe.hp, { current: 10, max: 10 });
  assert.equal(character.side, 'party');
  assert.equal(character.initiative, 12);
  assert.equal(npc.hp, null);
  assert.ok(
    view.rows.every((r) => r.mayAct),
    'the GM may act for everyone',
  );
});

test('buildCombatView keeps a row for an id nothing resolves', () => {
  const combat = { round: 1, index: 0, order: [{ id: 'gone', initiative: 5, modifier: 0 }] };
  const view = buildCombatView(combat, resolver({}), { gm: false, boundCharacterId: 'gone' });
  const row = view.rows[0];
  assert.equal(row.name, null);
  assert.equal(row.side, 'party');
  assert.equal(row.hp, null);
  assert.equal(row.ac, null);
  assert.equal(row.defeated, false);
  assert.deepEqual(row.conditions, []);
  assert.equal(row.mayAct, false, 'an unresolved id is not actionable for a player');
  assert.equal(row.deathSaves, null);
});

test('buildCombatView carries a death-save tracker, and only from a character', () => {
  const { hero, goblin } = fixtures();
  const dying = {
    ...damageCharacter(hero, 99),
    deathSaves: { successes: 1, failures: 2, stable: false },
  };
  const combat = {
    round: 1,
    index: 0,
    order: [
      { id: 'hero', initiative: 12, modifier: 2 },
      { id: 'goblin', initiative: 9, modifier: 0 },
    ],
  };
  const view = buildCombatView(
    combat,
    resolver({
      hero: { kind: 'character', entity: dying },
      goblin: { kind: 'encounter', entity: goblin },
    }),
    { gm: true },
  );
  assert.deepEqual(view.rows[0].deathSaves, { successes: 1, failures: 2, stable: false });
  assert.equal(view.rows[1].deathSaves, null, 'an encounter rolls no death saves');
});

test('buildCombatView reads a standing character as not dying', () => {
  const { hero } = fixtures();
  const combat = { round: 1, index: 0, order: [{ id: 'hero', initiative: 12, modifier: 2 }] };
  const view = buildCombatView(combat, resolver({ hero: { kind: 'character', entity: hero } }), {
    gm: true,
  });
  assert.equal(view.rows[0].deathSaves, null);
});

test('buildCombatView carries conditions and the defeated flag', () => {
  const { hero, goblin } = fixtures();
  const poisoned = { ...hero, conditions: [{ name: 'Poisoned', rounds: null }] };
  const dead = applyDamage(goblin, 99);
  const combat = {
    round: 2,
    index: 0,
    order: [
      { id: 'hero', initiative: 10, modifier: 0 },
      { id: 'goblin', initiative: 9, modifier: 0 },
    ],
  };
  const view = buildCombatView(
    combat,
    resolver({
      hero: { kind: 'character', entity: poisoned },
      goblin: { kind: 'encounter', entity: dead },
    }),
    { gm: false, boundCharacterId: 'hero' },
  );
  assert.equal(view.rows[0].conditions[0].name, 'Poisoned');
  assert.equal(view.rows[0].mayAct, true);
  assert.equal(view.rows[0].incapacitated, false, 'Poisoned costs no turn');
  assert.equal(view.rows[1].defeated, true);
  assert.equal(view.rows[1].mayAct, false);
});

test('buildCombatView carries an NPC chip and marks who cannot act', () => {
  const { hero, sage } = fixtures();
  const stunned = { ...sage, conditions: [{ name: 'Stunned', rounds: 2 }] };
  const combat = {
    round: 1,
    index: 0,
    order: [
      { id: 'sage', initiative: 11, modifier: 0 },
      { id: 'hero', initiative: 8, modifier: 0 },
    ],
  };
  const view = buildCombatView(
    combat,
    resolver({
      sage: { kind: 'npc', entity: stunned },
      hero: { kind: 'character', entity: hero },
    }),
    { gm: true },
  );
  assert.deepEqual(view.rows[0].conditions, [{ name: 'Stunned', rounds: 2 }]);
  assert.equal(view.rows[0].incapacitated, true);
  assert.equal(view.rows[0].defeated, false, 'a chip takes the turn, not the fight');
  assert.equal(view.rows[1].incapacitated, false);
});

test('skipsTurn steps past the downed, the unresolved, and those who cannot act', () => {
  const { hero, goblin, sage } = fixtures();
  assert.equal(skipsTurn(null), true, 'a deleted combatant has no turn');
  assert.equal(skipsTurn({ kind: 'character', entity: hero }), false);
  assert.equal(skipsTurn({ kind: 'character', entity: damageCharacter(hero, 99) }), true);
  assert.equal(skipsTurn({ kind: 'encounter', entity: applyDamage(goblin, 99) }), true);
  const stunned = { ...sage, conditions: [{ name: 'Stunned', rounds: 1 }] };
  assert.equal(skipsTurn({ kind: 'npc', entity: stunned }), true);
  const poisoned = { ...sage, conditions: [{ name: 'Poisoned', rounds: 1 }] };
  assert.equal(skipsTurn({ kind: 'npc', entity: poisoned }), false, 'Poisoned still takes a turn');
});

test('conditionsOf reads the chips off every kind and empties an older save', () => {
  const { hero, goblin, sage } = fixtures();
  const chip = [{ name: 'Prone', rounds: null }];
  assert.deepEqual(
    conditionsOf({ kind: 'character', entity: { ...hero, conditions: chip } }),
    chip,
  );
  assert.deepEqual(
    conditionsOf({ kind: 'encounter', entity: { ...goblin, conditions: chip } }),
    chip,
  );
  assert.deepEqual(conditionsOf({ kind: 'npc', entity: { ...sage, conditions: chip } }), chip);
  assert.deepEqual(
    conditionsOf(/** @type {any} */ ({ kind: 'npc', entity: { id: 'x', name: 'Wisp' } })),
    [],
  );
});

test('fightOutcome settles only once a whole side is down', () => {
  /** @param {{ side: 'party' | 'foe', defeated: boolean }[]} rows */
  const view = (rows) => ({ round: 1, turnIndex: 0, rows });

  assert.equal(fightOutcome(view([])), null);
  assert.equal(
    fightOutcome(view([{ side: 'party', defeated: false }])),
    null,
    'no foe in the order is not a won fight',
  );
  assert.equal(
    fightOutcome(
      view([
        { side: 'party', defeated: false },
        { side: 'foe', defeated: true },
        { side: 'foe', defeated: false },
      ]),
    ),
    null,
    'one foe still standing keeps the fight on',
  );
  assert.equal(
    fightOutcome(
      view([
        { side: 'party', defeated: false },
        { side: 'foe', defeated: true },
        { side: 'foe', defeated: true },
      ]),
    ),
    'victory',
  );
  assert.equal(
    fightOutcome(
      view([
        { side: 'party', defeated: true },
        { side: 'foe', defeated: false },
      ]),
    ),
    'defeat',
  );
  assert.equal(
    fightOutcome(
      view([
        { side: 'party', defeated: true },
        { side: 'foe', defeated: true },
      ]),
    ),
    'defeat',
    'a mutual wipe reads as a defeat',
  );
});

test('fightOutcome leaves unresolved rows out of the reckoning', () => {
  /** @param {{ side: 'party' | 'foe', defeated: boolean, name: string | null }[]} rows */
  const view = (rows) => ({ round: 1, turnIndex: 0, rows });
  // An unresolved row projects side 'party' and defeated false as
  // placeholders; counting it as a standing party member would hold the
  // outcome open after every real member is down.
  assert.equal(
    fightOutcome(
      view([
        { side: 'party', defeated: true, name: 'Hero' },
        { side: 'party', defeated: false, name: null },
        { side: 'foe', defeated: false, name: 'Goblin' },
      ]),
    ),
    'defeat',
  );
  assert.equal(
    fightOutcome(view([{ side: 'party', defeated: false, name: null }])),
    null,
    'a side with only ghosts on it settles nothing',
  );
});
