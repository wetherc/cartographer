import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findCombatant,
  asTarget,
  describeCombatant,
  combatantsAsTargets,
  applyToTarget,
  logDefeatTransition,
} from '../src/app/combatants.js';
import { createCharacter, withHP, getHP, damageCharacter } from '../src/entities/Character.js';
import { createEncounter, applyDamage, effectiveStatBlock } from '../src/entities/Encounter.js';
import { createNPC } from '../src/entities/NPC.js';
import { stubApp as baseStubApp } from './helpers/app.js';

const HERE = { nodeId: 'n1', tileId: '0,0' };

/**
 * A stub app holding the three rosters, plus the party position these targeting
 * helpers resolve "here" against.
 * @param {{ characters?: any[], encounters?: any[], npcs?: any[] }} [rosters]
 */
function stubApp(rosters = {}) {
  return baseStubApp({
    state: rosters,
    partyTracker: /** @type {any} */ ({ getPosition: () => HERE }),
  });
}

function fixtures() {
  const hero = withHP(createCharacter('hero', 'Hero', { STR: 14 }), 12);
  const goblin = createEncounter('goblin', 'Goblin', 10, { AC: 13 }, HERE);
  const sage = createNPC('sage', 'Sage', { location: HERE, stats: { AC: 12 } });
  const farAway = createNPC('hermit', 'Hermit', {
    location: { nodeId: 'n1', tileId: '5,5' },
  });
  return { hero, goblin, sage, farAway };
}

test('findCombatant resolves each collection with the right kind', () => {
  const { hero, goblin, sage, farAway } = fixtures();
  const app = stubApp({ characters: [hero], encounters: [goblin], npcs: [sage, farAway] });
  assert.equal(findCombatant(app, 'hero')?.kind, 'character');
  assert.equal(findCombatant(app, 'goblin')?.kind, 'encounter');
  assert.equal(findCombatant(app, 'sage')?.kind, 'npc');
  assert.equal(findCombatant(app, 'hermit'), null, 'an NPC off the party tile is not a combatant');
  assert.equal(findCombatant(app, 'nobody'), null);
});

test('findCombatant store writes back to the owning collection', () => {
  const { hero, goblin, sage } = fixtures();
  const app = stubApp({ characters: [hero], encounters: [goblin], npcs: [sage] });
  const found = findCombatant(app, 'goblin');
  found.store({ ...goblin, currentHP: 3 });
  assert.equal(app.state.encounters[0].currentHP, 3);
  assert.ok(app.calls.includes('syncEncounterMarkers'), 'encounter store syncs the map markers');
  const character = findCombatant(app, 'hero');
  character.store({ ...hero, name: 'Hero II' });
  assert.equal(app.state.characters[0].name, 'Hero II');
  assert.ok(app.calls.includes('refreshSelectedCharacter'));
});

test('findCombatant store writes an NPC back to its collection', () => {
  const { sage } = fixtures();
  const app = stubApp({ npcs: [sage] });
  findCombatant(app, 'sage').store({ ...sage, name: 'Sage the Wise' });
  assert.equal(app.state.npcs[0].name, 'Sage the Wise');
});

test('combatantsAsTargets drops a downed character on the hostile side', () => {
  const { goblin } = fixtures();
  const fallen = damageCharacter(withHP(createCharacter('foe', 'Turncoat'), 8), 999);
  const app = stubApp({ characters: [fallen], encounters: [goblin] });
  const combat = {
    order: [
      { id: 'goblin', name: 'Goblin', side: 'foe' },
      { id: 'foe', name: 'Turncoat', side: 'party' },
    ],
  };
  const targets = combatantsAsTargets(app, /** @type {any} */ (combat), combat.order[0]);
  assert.deepEqual(
    targets.map((t) => t.id),
    [],
    'the only foe is a downed character and drops out',
  );
});

test('findCombatant sees an updated entity after the collection is replaced', () => {
  const { goblin } = fixtures();
  const app = stubApp({ encounters: [goblin] });
  findCombatant(app, 'goblin').store(applyDamage(goblin, 4));
  assert.equal(findCombatant(app, 'goblin').entity.currentHP, 6);
});

test('asTarget projects AC by kind', () => {
  const { hero, goblin, sage } = fixtures();
  assert.equal(asTarget(goblin, 'encounter').ac, effectiveStatBlock(goblin).AC);
  assert.equal(asTarget(sage, 'npc').ac, 12);
  const heroTarget = asTarget(hero, 'character');
  assert.equal(heroTarget.name, 'Hero');
  assert.equal(typeof heroTarget.ac, 'number');
});

test('asTarget defaults an NPC with no stat block to AC 10', () => {
  assert.equal(asTarget(/** @type {any} */ ({ id: 'x', name: 'Wisp' }), 'npc').ac, 10);
});

test('combatantsAsTargets skips a participant absent from every roster', () => {
  const { hero, goblin } = fixtures();
  const app = stubApp({ characters: [hero], encounters: [goblin] });
  const combat = {
    order: [{ id: 'hero' }, { id: 'ghost' }, { id: 'goblin' }],
  };
  const targets = combatantsAsTargets(app, /** @type {any} */ (combat), combat.order[0]);
  assert.deepEqual(
    targets.map((t) => t.id),
    ['goblin'],
    'the id nothing resolves is no target',
  );
});

test('combatantsAsTargets gives an actor nobody resolves nothing to target', () => {
  const { goblin } = fixtures();
  const app = stubApp({ encounters: [goblin] });
  const combat = { order: [{ id: 'ghost' }, { id: 'goblin' }] };
  assert.deepEqual(
    combatantsAsTargets(app, /** @type {any} */ (combat), combat.order[0]),
    [],
    'a deleted actor has no side, so it has no foes',
  );
});

test('applyToTarget damages an HP-less character without logging a drop', () => {
  const ghost = createCharacter('ghost', 'Ghost');
  const app = stubApp({ characters: [ghost] });
  applyToTarget(app, 'ghost', 5, false);
  assert.equal(app.log.length, 0, 'no HP pool means no drop-to-0 line');
  assert.equal(app.dirty, 1, 'the write still lands');
});

test('combatantsAsTargets lists foes and drops downed ones', () => {
  const { hero, goblin, sage } = fixtures();
  const downed = applyDamage(createEncounter('orc', 'Orc', 8, {}, HERE), 8);
  const brute = createNPC('brute', 'Brute', { location: HERE, disposition: 'hostile' });
  const app = stubApp({
    characters: [hero],
    encounters: [goblin, downed],
    npcs: [sage, brute],
  });
  const combat = {
    order: [{ id: 'hero' }, { id: 'goblin' }, { id: 'orc' }, { id: 'sage' }, { id: 'brute' }],
  };
  const targets = combatantsAsTargets(app, /** @type {any} */ (combat), combat.order[0]);
  assert.deepEqual(
    targets.map((t) => t.id),
    ['goblin', 'brute'],
    'the defeated orc drops out, the hostile NPC is a foe, the neutral sage is not',
  );
});

test('describeCombatant reads the name and side off the live entity', () => {
  const { hero, goblin, sage } = fixtures();
  const brute = createNPC('brute', 'Brute', { location: HERE, disposition: 'hostile' });
  const app = stubApp({ characters: [hero], encounters: [goblin], npcs: [sage, brute] });
  assert.deepEqual(describeCombatant(app, 'hero'), { name: 'Hero', side: 'party' });
  assert.deepEqual(describeCombatant(app, 'goblin'), { name: 'Goblin', side: 'foe' });
  assert.deepEqual(describeCombatant(app, 'sage'), { name: 'Sage', side: 'party' });
  assert.deepEqual(describeCombatant(app, 'brute'), { name: 'Brute', side: 'foe' });
  assert.equal(describeCombatant(app, 'nobody'), null);
  // A rename lands on the next read rather than being frozen into the order.
  findCombatant(app, 'goblin').store({ ...goblin, name: 'Goblin Chief' });
  assert.equal(describeCombatant(app, 'goblin')?.name, 'Goblin Chief');
});

test('combatantsAsTargets with allies keeps downed allies targetable', () => {
  const { hero, goblin } = fixtures();
  const fallen = damageCharacter(withHP(createCharacter('mage', 'Mage'), 8), 999);
  const app = stubApp({ characters: [hero, fallen], encounters: [goblin] });
  const combat = {
    order: [
      { id: 'hero', name: 'Hero', side: 'party' },
      { id: 'mage', name: 'Mage', side: 'party' },
      { id: 'goblin', name: 'Goblin', side: 'foe' },
    ],
  };
  const allies = combatantsAsTargets(app, /** @type {any} */ (combat), combat.order[0], {
    allies: true,
  });
  assert.deepEqual(
    allies.map((t) => t.id),
    ['hero', 'mage'],
    'a heal reaches the caster and the downed ally, never the foe',
  );
});

test('applyToTarget damages an encounter and logs its defeat exactly once', () => {
  const { goblin } = fixtures();
  const app = stubApp({ encounters: [goblin] });
  applyToTarget(app, 'goblin', 4, false);
  assert.equal(app.state.encounters[0].currentHP, 6);
  assert.equal(app.log.length, 0);
  applyToTarget(app, 'goblin', 10, false);
  assert.deepEqual(app.log, ['Defeated Goblin.']);
  applyToTarget(app, 'goblin', 5, false);
  assert.deepEqual(app.log, ['Defeated Goblin.'], 'damage on a downed encounter stays quiet');
  assert.equal(app.dirty, 3, 'one write per hit');
});

test('applyToTarget heals an encounter without a defeat log', () => {
  const { goblin } = fixtures();
  const hurt = applyDamage(goblin, 6);
  const app = stubApp({ encounters: [hurt] });
  applyToTarget(app, 'goblin', 3, true);
  assert.equal(app.state.encounters[0].currentHP, 7);
  assert.equal(app.log.length, 0);
});

test('applyToTarget logs a character dropping to 0 HP exactly once and heals back', () => {
  const hero = withHP(createCharacter('hero', 'Hero'), 10);
  const app = stubApp({ characters: [hero] });
  applyToTarget(app, 'hero', 999, false);
  assert.equal(getHP(app.state.characters[0]).current, 0);
  assert.deepEqual(app.log, ['Hero drops to 0 HP.']);
  applyToTarget(app, 'hero', 5, false);
  assert.deepEqual(app.log, ['Hero drops to 0 HP.'], 'no re-log while already down');
  applyToTarget(app, 'hero', 4, true);
  assert.equal(getHP(app.state.characters[0]).current, 4);
});

test('applyToTarget ignores non-positive amounts, unknown ids, and HP-less NPCs', () => {
  const { sage } = fixtures();
  const app = stubApp({ npcs: [sage] });
  applyToTarget(app, 'sage', 5, false);
  applyToTarget(app, 'nobody', 5, false);
  applyToTarget(app, 'sage', 0, false);
  assert.equal(app.dirty, 0);
  assert.equal(app.log.length, 0);
});

test('logDefeatTransition fires only on the standing-to-defeated edge', () => {
  const { goblin } = fixtures();
  const down = applyDamage(goblin, 99);
  const app = stubApp();
  logDefeatTransition(app, goblin, applyDamage(goblin, 2));
  assert.equal(app.log.length, 0, 'still standing');
  logDefeatTransition(app, down, down);
  assert.equal(app.log.length, 0, 'already down');
  logDefeatTransition(app, goblin, down);
  assert.deepEqual(app.log, ['Defeated Goblin.']);
});
