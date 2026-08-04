import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findCombatant,
  asTarget,
  describeCombatant,
  combatantsAsTargets,
  applyToTarget,
  applyConditionToTarget,
  commitEncounters,
  commitNPCs,
  endSpellEffects,
  logDefeatTransition,
  retryImposedSaves,
  spellsOf,
  targetConditions,
  targetSaveBonus,
  weaponsOf,
} from '../src/app/combatants.js';
import {
  addItem,
  createCharacter,
  learnCantrip,
  learnSpell,
  prepareSpell,
  withHP,
  getHP,
  damageCharacter,
} from '../src/entities/Character.js';
import { equip } from '../src/entities/Equipment.js';
import { createEncounter, applyDamage, effectiveStatBlock } from '../src/entities/Encounter.js';
import { createNPC } from '../src/entities/NPC.js';
import { addCondition } from '../src/entities/Conditions.js';
import { begin as beginConcentration } from '../src/entities/Concentration.js';
import { saveBonus } from '../src/entities/Checks.js';
import { stubApp as baseStubApp } from './helpers/app.js';
import { item } from './helpers/fixtures.js';

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
  assert.deepEqual(asTarget(/** @type {any} */ ({ id: 'x', name: 'Wisp' }), 'npc').conditions, []);
});

test('asTarget carries an NPC chip through to the target', () => {
  const sage = { ...fixtures().sage, conditions: [{ name: 'Prone', rounds: null }] };
  assert.deepEqual(asTarget(sage, 'npc').conditions, [{ name: 'Prone', rounds: null }]);
});

test('targetConditions reads the chips off an NPC on the tile', () => {
  const sage = { ...fixtures().sage, conditions: [{ name: 'Poisoned', rounds: 2 }] };
  const app = stubApp({ npcs: [sage] });
  assert.deepEqual(targetConditions(app, 'sage'), [{ name: 'Poisoned', rounds: 2 }]);
  assert.deepEqual(targetConditions(app, 'nobody'), []);
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
  assert.equal(app.log[1], 'Hero takes a failed death save from the hit.');
  assert.equal(
    app.log.filter((/** @type {string} */ line) => line === 'Hero drops to 0 HP.').length,
    1,
    'no re-log while already down',
  );
  applyToTarget(app, 'hero', 4, true);
  assert.equal(getHP(app.state.characters[0]).current, 4);
});

test('applyToTarget starts the death-save tracker on the drop to 0 HP', () => {
  const hero = withHP(createCharacter('hero', 'Hero'), 10);
  const app = stubApp({ characters: [hero] });
  applyToTarget(app, 'hero', 12, false);
  const down = app.state.characters[0];
  assert.deepEqual(down.deathSaves, { successes: 0, failures: 0, stable: false });
  assert.ok(
    down.conditions.some((/** @type {any} */ c) => c.name === 'Unconscious'),
    'the chip comes with the tracker',
  );
});

test('applyToTarget fails a death save per hit while down, twice on a crit', () => {
  const hero = withHP(createCharacter('hero', 'Hero'), 10);
  const app = stubApp({ characters: [hero] });
  applyToTarget(app, 'hero', 12, false);
  applyToTarget(app, 'hero', 3, false);
  assert.equal(app.state.characters[0].deathSaves.failures, 1);
  applyToTarget(app, 'hero', 3, false, { crit: true });
  assert.equal(app.state.characters[0].deathSaves.failures, 3);
  assert.deepEqual(app.log.slice(-2), [
    'Hero takes two failed death saves from the hit.',
    'Hero dies.',
  ]);
});

test('applyToTarget un-stabilizes a stable character that takes a hit', () => {
  const hero = /** @type {any} */ ({
    ...withHP(createCharacter('hero', 'Hero'), 10),
    deathSaves: { successes: 0, failures: 0, stable: true },
  });
  const app = stubApp({ characters: [damageCharacter(hero, 10)] });
  applyToTarget(app, 'hero', 4, false);
  assert.deepEqual(app.state.characters[0].deathSaves, {
    successes: 0,
    failures: 1,
    stable: false,
  });
});

test('applyToTarget clears the death-save tracker when a heal lands above 0 HP', () => {
  const hero = withHP(createCharacter('hero', 'Hero'), 10);
  const app = stubApp({ characters: [hero] });
  applyToTarget(app, 'hero', 12, false);
  applyToTarget(app, 'hero', 4, true);
  const up = app.state.characters[0];
  assert.equal(up.deathSaves, null);
  assert.ok(!up.conditions.some((/** @type {any} */ c) => c.name === 'Unconscious'));
  assert.equal(app.log.at(-1), 'Hero regains consciousness.');
});

test('applyToTarget stays quiet healing a character who was not dying', () => {
  const hero = damageCharacter(withHP(createCharacter('hero', 'Hero'), 10), 4);
  const app = stubApp({ characters: [hero] });
  applyToTarget(app, 'hero', 2, true);
  assert.equal(getHP(app.state.characters[0]).current, 8);
  assert.deepEqual(app.log, [], 'no consciousness line for an ordinary heal');
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

test('commitEncounters skips the panel and the dirty mark when told to', () => {
  const app = stubApp();
  commitEncounters(app, { panel: false, dirty: false });
  assert.ok(!app.refreshes.includes('encounterPanel'), 'the caller re-renders its own rows');
  assert.equal(app.dirty, 0, 'the caller marks the campaign dirty itself');
  assert.ok(app.refreshes.includes('initiativePanel'), 'the running order still refreshes');
  assert.ok(app.calls.includes('syncEncounterMarkers'));
  assert.ok(app.calls.includes('syncCombatLocation'));
});

test('commitEncounters refreshes the panel and marks dirty by default', () => {
  const app = stubApp();
  commitEncounters(app);
  assert.ok(app.refreshes.includes('encounterPanel'));
  assert.equal(app.dirty, 1);
});

test('commitNPCs refreshes the markers and the story panel, leaving the order alone', () => {
  const app = stubApp();
  commitNPCs(app);
  assert.ok(app.calls.includes('syncNPCMarkers'));
  assert.ok(app.refreshes.includes('npcPanel'));
  assert.ok(!app.refreshes.includes('initiativePanel'), 'an NPC edit leaves the fight running');
  assert.equal(app.dirty, 1);
});

test('targetSaveBonus reads a character save and reports nothing for anyone else', () => {
  const { hero, goblin, sage } = fixtures();
  const app = stubApp({ characters: [hero], encounters: [goblin], npcs: [sage] });
  assert.equal(targetSaveBonus(app, 'hero', 'STR'), saveBonus(hero, 'STR'));
  assert.equal(targetSaveBonus(app, 'goblin', 'STR'), undefined, 'a foe records no saves');
  assert.equal(targetSaveBonus(app, 'sage', 'STR'), undefined);
  assert.equal(targetSaveBonus(app, 'nobody', 'STR'), undefined);
});

/** A character holding an equipped, damage-carrying sword. */
function swordBearer() {
  const armed = addItem(
    createCharacter('hero', 'Hero'),
    item('sword', 'Sword', {
      type: 'weapon',
      handling: 'melee',
      damage: [{ count: 1, sides: 8, damageType: 'slashing' }],
    }),
  );
  return equip(armed, 'mainHand', 'sword');
}

test('weaponsOf lists what each kind of combatant can swing', () => {
  const club = { name: 'Club', handling: 'melee', damage: [{ count: 1, sides: 4 }] };
  const armedFoe = createEncounter('ogre', 'Ogre', 20, {}, HERE, {
    weapon: /** @type {any} */ (club),
  });
  const barehanded = createEncounter('slime', 'Slime', 8, {}, HERE, { weapon: null });
  const { sage } = fixtures();
  const app = stubApp({
    characters: [swordBearer()],
    encounters: [armedFoe, barehanded],
    npcs: [sage],
  });
  assert.deepEqual(
    weaponsOf(app, 'hero').map((w) => w.name),
    ['Sword'],
  );
  assert.deepEqual(
    weaponsOf(app, 'ogre').map((w) => w.name),
    ['Club'],
  );
  assert.deepEqual(weaponsOf(app, 'slime'), [], 'a foe with no assigned weapon has nothing');
  assert.deepEqual(weaponsOf(app, 'sage'), [], 'NPCs carry no weapons');
  assert.deepEqual(weaponsOf(app, 'nobody'), []);
});

test('spellsOf lists a character cantrip plus what its known-rule makes castable', () => {
  const mage = {
    ...createCharacter('hero', 'Hero', { INT: 16 }),
    classes: [{ classId: 'wizard', level: 3 }],
    level: 3,
  };
  let hero = learnCantrip(mage, 'fire-bolt', 'wizard');
  hero = learnSpell(hero, 'hold-person', 'wizard');
  const app = stubApp({ characters: [hero] });
  assert.deepEqual(
    spellsOf(app, 'hero').map((s) => s.id),
    ['fire-bolt'],
    'a wizard prepares before it casts, so the known spell stays off the list',
  );
  const prepared = stubApp({ characters: [prepareSpell(hero, 'hold-person')] });
  assert.deepEqual(
    spellsOf(prepared, 'hero')
      .map((s) => s.id)
      .sort(),
    ['fire-bolt', 'hold-person'],
  );
});

test('spellsOf reads a foe or NPC spellbook whole and an unknown id as nothing', () => {
  const caster = createEncounter('lich', 'Lich', 40, {}, HERE, {
    class: 'wizard',
    casterLevel: 9,
    spellbook: { cantrips: ['fire-bolt'], known: ['hold-person'], prepared: [] },
  });
  const npcCaster = createNPC('seer', 'Seer', {
    location: HERE,
    class: 'wizard',
    spellbook: { cantrips: [], known: ['hold-person'], prepared: [] },
  });
  const app = stubApp({ encounters: [caster], npcs: [npcCaster] });
  assert.deepEqual(
    spellsOf(app, 'lich')
      .map((s) => s.id)
      .sort(),
    ['fire-bolt', 'hold-person'],
    'a foe dialog marks every picked spell castable, prepared list or not',
  );
  assert.deepEqual(
    spellsOf(app, 'seer').map((s) => s.id),
    ['hold-person'],
  );
  assert.deepEqual(spellsOf(app, 'nobody'), []);
});

/** The source stamp a cast leaves on a chip it imposes. */
function heldBy(extra = {}) {
  return {
    spellId: 'hold-person',
    spellName: 'Hold Person',
    casterId: 'mage',
    saveAbility: 'WIS',
    saveDC: 13,
    ...extra,
  };
}

test('applyConditionToTarget chips a character, a foe, and an NPC', () => {
  const { hero, goblin, sage } = fixtures();
  const app = stubApp({ characters: [hero], encounters: [goblin], npcs: [sage] });
  assert.equal(applyConditionToTarget(app, 'hero', 'Paralyzed', 10, heldBy()), true);
  assert.deepEqual(app.state.characters[0].conditions, [
    { name: 'Paralyzed', rounds: 10, source: heldBy() },
  ]);
  assert.equal(applyConditionToTarget(app, 'goblin', 'Blinded', null), true);
  assert.deepEqual(app.state.encounters[0].conditions, [{ name: 'Blinded', rounds: null }]);
  assert.equal(applyConditionToTarget(app, 'sage', 'Blinded', null), true);
  assert.deepEqual(app.state.npcs[0].conditions, [{ name: 'Blinded', rounds: null }]);
  assert.equal(applyConditionToTarget(app, 'nobody', 'Blinded', null), false);
  assert.equal(app.dirty, 3, 'only the three that landed wrote');
});

test('endSpellEffects takes one cast off every target and names each one freed', () => {
  const source = heldBy();
  const hero = { ...fixtures().hero, conditions: addCondition([], 'Paralyzed', 10, { source }) };
  const goblin = {
    ...fixtures().goblin,
    conditions: addCondition([], 'Paralyzed', 10, { source }),
  };
  const app = stubApp({ characters: [hero], encounters: [goblin] });
  endSpellEffects(app, 'mage', 'hold-person');
  assert.deepEqual(app.state.characters[0].conditions, []);
  assert.deepEqual(app.state.encounters[0].conditions, []);
  assert.deepEqual(app.log, ['Hero is no longer Paralyzed.', 'Goblin is no longer Paralyzed.']);
  assert.equal(app.dirty, 1);
  assert.ok(app.calls.includes('refreshSelectedCharacter'));
  assert.ok(app.calls.includes('syncEncounterMarkers'));
});

test('endSpellEffects frees an NPC the cast had held', () => {
  const source = heldBy();
  const sage = { ...fixtures().sage, conditions: addCondition([], 'Paralyzed', 10, { source }) };
  const app = stubApp({ npcs: [sage] });
  endSpellEffects(app, 'mage', 'hold-person');
  assert.deepEqual(app.state.npcs[0].conditions, []);
  assert.deepEqual(app.log, ['Sage is no longer Paralyzed.']);
  assert.ok(app.refreshes.includes('npcPanel'));
});

test('endSpellEffects leaves the other roster untouched when only one holds a chip', () => {
  const goblin = {
    ...fixtures().goblin,
    conditions: addCondition([], 'Paralyzed', 10, { source: heldBy() }),
  };
  const { hero } = fixtures();
  const app = stubApp({ characters: [hero], encounters: [goblin] });
  const before = app.state.characters;
  endSpellEffects(app, 'mage', 'hold-person');
  assert.equal(app.state.characters, before, 'an untouched roster keeps its array identity');
  assert.ok(!app.calls.includes('refreshSelectedCharacter'));
  assert.deepEqual(app.log, ['Goblin is no longer Paralyzed.']);
});

test('endSpellEffects does nothing when no chip carries that cast', () => {
  const hero = {
    ...fixtures().hero,
    conditions: addCondition([], 'Paralyzed', 10, { source: heldBy() }),
  };
  const app = stubApp({ characters: [hero] });
  endSpellEffects(app, 'mage', 'bless');
  endSpellEffects(app, 'cleric', 'hold-person');
  assert.equal(app.dirty, 0);
  assert.equal(app.log.length, 0);
  assert.deepEqual(app.state.characters[0].conditions, hero.conditions);
});

test('retryImposedSaves shakes a chip loose on a success and logs the roll', () => {
  // DC 1 is under the floor of a d20 plus any bonus, so the retry always
  // succeeds and the outcome does not depend on the roll.
  const source = heldBy({ saveEnds: true, saveDC: 1 });
  const hero = { ...fixtures().hero, conditions: addCondition([], 'Paralyzed', 10, { source }) };
  const app = stubApp({ characters: [hero] });
  retryImposedSaves(app, 'hero');
  assert.deepEqual(app.state.characters[0].conditions, []);
  assert.equal(app.log.length, 1);
  assert.match(app.log[0], /^Hero shakes off Paralyzed \(WIS save \d+ vs DC 1\)\.$/);
  assert.equal(app.dirty, 1);
});

test('retryImposedSaves keeps the chip on a failure and writes nothing', () => {
  // DC 99 is over the ceiling of a d20 plus any bonus, so the retry always
  // fails.
  const source = heldBy({ saveEnds: true, saveDC: 99 });
  const goblin = {
    ...fixtures().goblin,
    conditions: addCondition([], 'Paralyzed', 10, { source }),
  };
  const app = stubApp({ encounters: [goblin] });
  retryImposedSaves(app, 'goblin');
  assert.deepEqual(app.state.encounters[0].conditions.length, 1);
  assert.equal(app.dirty, 0, 'a failed retry changes nothing to store');
  assert.match(app.log[0], /^Goblin is still Paralyzed \(WIS save \d+ vs DC 99\)\.$/);
});

test('retryImposedSaves writes a freed foe back to the encounter roster', () => {
  const source = heldBy({ saveEnds: true, saveDC: 1 });
  const goblin = {
    ...fixtures().goblin,
    conditions: addCondition([], 'Paralyzed', 10, { source }),
  };
  const app = stubApp({ encounters: [goblin] });
  retryImposedSaves(app, 'goblin');
  assert.deepEqual(app.state.encounters[0].conditions, []);
  assert.equal(app.dirty, 1);
  assert.match(app.log[0], /^Goblin shakes off Paralyzed \(WIS save \d+ vs DC 1\)\.$/);
});

test('retryImposedSaves rolls a foe chip against the bonus the cast recorded', () => {
  const source = heldBy({ saveEnds: true, saveDC: 99, saveBonus: 4, saveAbility: undefined });
  const goblin = {
    ...fixtures().goblin,
    conditions: addCondition([], 'Stunned', null, { source }),
  };
  const app = stubApp({ encounters: [goblin] });
  retryImposedSaves(app, 'goblin');
  assert.match(app.log[0], /^Goblin is still Stunned \(save \d+ vs DC 99\)\.$/);
});

test('retryImposedSaves frees an NPC that shakes its chip off', () => {
  const source = heldBy({ saveEnds: true, saveDC: 1 });
  const sage = { ...fixtures().sage, conditions: addCondition([], 'Stunned', 10, { source }) };
  const app = stubApp({ npcs: [sage] });
  retryImposedSaves(app, 'sage');
  assert.deepEqual(app.state.npcs[0].conditions, []);
  assert.equal(app.dirty, 1);
  assert.match(app.log[0], /^Sage shakes off Stunned \(WIS save \d+ vs DC 1\)\.$/);
});

test('retryImposedSaves rolls nothing for an unknown id or a chip with no retry', () => {
  const { sage } = fixtures();
  const hero = {
    ...fixtures().hero,
    conditions: addCondition([], 'Paralyzed', 10, { source: heldBy() }),
  };
  const app = stubApp({ characters: [hero], npcs: [sage] });
  retryImposedSaves(app, 'sage');
  retryImposedSaves(app, 'nobody');
  retryImposedSaves(app, 'hero');
  assert.equal(app.log.length, 0, 'a chip whose source allows no retry is never rolled');
  assert.equal(app.dirty, 0);
});

/** A spell object shaped the way the concentration model reads one. */
const HOLD_PERSON = {
  id: 'hold-person',
  name: 'Hold Person',
  duration: { kind: 'minutes', amount: 1 },
};

test('damage makes a concentrating character save for the spell and holds it', () => {
  // A CON of 30 puts the floor of the save above the DC 10 that light damage
  // sets, so the character always holds.
  const stout = withHP(createCharacter('hero', 'Hero', { CON: 30 }), 60);
  const { character } = beginConcentration(stout, /** @type {any} */ (HOLD_PERSON), 2);
  const app = stubApp({ characters: [character] });
  applyToTarget(app, 'hero', 4, false);
  assert.equal(app.state.characters[0].concentration?.spellId, 'hold-person');
  assert.equal(app.log.length, 1);
  assert.match(app.log[0], /^Hero holds concentration on Hold Person \(CON save \d+ vs DC 10\)\.$/);
});

test('damage a concentrating character cannot save against ends the spell and sweeps it', () => {
  // 80 damage sets DC 40, above the ceiling of any d20 save here, so the
  // character always loses the spell while staying on its feet.
  const source = heldBy({ spellId: 'hold-person', casterId: 'hero' });
  const tough = withHP(createCharacter('hero', 'Hero'), 200);
  const { character } = beginConcentration(tough, /** @type {any} */ (HOLD_PERSON), 2);
  const goblin = {
    ...fixtures().goblin,
    conditions: addCondition([], 'Paralyzed', 10, { source }),
  };
  const app = stubApp({ characters: [character], encounters: [goblin] });
  applyToTarget(app, 'hero', 80, false);
  assert.equal(app.state.characters[0].concentration, null);
  assert.deepEqual(app.state.encounters[0].conditions, [], 'the target walks free with the spell');
  assert.match(app.log[0], /^Hero loses concentration on Hold Person \(CON save \d+ vs DC 40\)\.$/);
  assert.equal(app.log[1], 'Goblin is no longer Paralyzed.');
});

test('a concentrating character dropped to 0 HP loses the spell without a save', () => {
  const hero = withHP(createCharacter('hero', 'Hero'), 10);
  const { character } = beginConcentration(hero, /** @type {any} */ (HOLD_PERSON), 2);
  const app = stubApp({ characters: [character] });
  applyToTarget(app, 'hero', 999, false);
  assert.equal(app.state.characters[0].concentration, null);
  assert.deepEqual(app.log, [
    'Hero drops to 0 HP.',
    'Hero falls and loses concentration on Hold Person.',
  ]);
});

test('healing a concentrating character never touches the spell', () => {
  const hero = damageCharacter(withHP(createCharacter('hero', 'Hero'), 20), 8);
  const { character } = beginConcentration(hero, /** @type {any} */ (HOLD_PERSON), 2);
  const app = stubApp({ characters: [character] });
  applyToTarget(app, 'hero', 5, true);
  assert.equal(app.state.characters[0].concentration?.spellId, 'hold-person');
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

test('a repeated save names the rider that changed it', () => {
  const source = heldBy({ saveEnds: true, saveDC: 99 });
  const goblin = {
    ...fixtures().goblin,
    conditions: [
      ...addCondition([], 'Paralyzed', 10, { source }),
      { name: 'Bane', rounds: 10, rider: { rolls: ['attack', 'save'], dice: -1, die: 'd4' } },
    ],
  };
  const app = stubApp({ encounters: [goblin] });
  retryImposedSaves(app, 'goblin');
  assert.match(app.log[0], /Bane -1d4 \[\d\]/);
});
