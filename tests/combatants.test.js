import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findCombatant,
  asTarget,
  describeCombatant,
  combatantsAsTargets,
  applyToTarget,
  applyConditionToTarget,
  commitCreatures,
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
import { createCreature, applyDamage, effectiveStatBlock } from '../src/entities/Creature.js';
import { addCondition } from '../src/entities/Conditions.js';
import { begin as beginConcentration } from '../src/entities/Concentration.js';
import { saveBonus } from '../src/entities/Checks.js';
import { stubApp as baseStubApp } from './helpers/app.js';
import { item } from './helpers/fixtures.js';

const HERE = { nodeId: 'n1', tileId: '0,0' };

/**
 * A stub app holding both rosters, plus the party position these targeting
 * helpers resolve "here" against.
 * @param {{ characters?: any[], creatures?: any[] }} [rosters]
 */
function stubApp(rosters = {}) {
  return baseStubApp({
    state: rosters,
    partyTracker: /** @type {any} */ ({ getPosition: () => HERE }),
  });
}

function fixtures() {
  const hero = withHP(createCharacter('hero', 'Hero', { STR: 14 }), 12);
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 10,
    stats: { AC: 13 },
    location: HERE,
    level: 1,
  });
  const sage = createCreature('sage', 'Sage', { location: HERE, stats: { AC: 12 } });
  const farAway = createCreature('hermit', 'Hermit', {
    location: { nodeId: 'n1', tileId: '5,5' },
  });
  return { hero, goblin, sage, farAway };
}

test('findCombatant resolves each collection with the right kind', () => {
  const { hero, goblin, sage, farAway } = fixtures();
  const app = stubApp({ characters: [hero], creatures: [goblin, sage, farAway] });
  assert.equal(findCombatant(app, 'hero')?.kind, 'character');
  assert.equal(findCombatant(app, 'goblin')?.kind, 'creature');
  assert.equal(findCombatant(app, 'sage')?.kind, 'creature');
  // A creature away from the party's tile still resolves. It renders by
  // name mid-fight, and syncCombatLocation is what ends an emptied fight.
  assert.equal(findCombatant(app, 'hermit')?.kind, 'creature');
  assert.equal(findCombatant(app, 'nobody'), null);
});

test('findCombatant store writes back to the owning collection', () => {
  const { hero, goblin, sage } = fixtures();
  const app = stubApp({ characters: [hero], creatures: [goblin, sage] });
  const found = findCombatant(app, 'goblin');
  found.store({ ...goblin, currentHP: 3 });
  assert.equal(app.state.creatures[0].currentHP, 3);
  assert.ok(app.calls.includes('syncCreatureMarkers'), 'encounter store syncs the map markers');
  const character = findCombatant(app, 'hero');
  character.store({ ...hero, name: 'Hero II' });
  assert.equal(app.state.characters[0].name, 'Hero II');
  assert.ok(app.calls.includes('refreshSelectedCharacter'));
});

test('findCombatant store writes an NPC back to its collection', () => {
  const { sage } = fixtures();
  const app = stubApp({ creatures: [sage] });
  findCombatant(app, 'sage').store({ ...sage, name: 'Sage the Wise' });
  assert.equal(app.state.creatures[0].name, 'Sage the Wise');
});

test('combatantsAsTargets drops a downed character on the hostile side', () => {
  const { goblin } = fixtures();
  const fallen = damageCharacter(withHP(createCharacter('foe', 'Turncoat'), 8), 999);
  const app = stubApp({ characters: [fallen], creatures: [goblin] });
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
  const app = stubApp({ creatures: [goblin] });
  findCombatant(app, 'goblin').store(applyDamage(goblin, 4));
  assert.equal(findCombatant(app, 'goblin').entity.currentHP, 6);
});

test('asTarget projects AC by kind', () => {
  const { hero, goblin, sage } = fixtures();
  assert.equal(asTarget(goblin, 'creature').ac, effectiveStatBlock(goblin).AC);
  assert.equal(asTarget(sage, 'creature').ac, 12);
  const heroTarget = asTarget(hero, 'character');
  assert.equal(heroTarget.name, 'Hero');
  assert.equal(typeof heroTarget.ac, 'number');
});

test('asTarget derives the AC of an NPC saved without a stat block', () => {
  assert.equal(asTarget(/** @type {any} */ ({ id: 'x', name: 'Wisp' }), 'creature').ac, 10);
  assert.deepEqual(
    asTarget(/** @type {any} */ ({ id: 'x', name: 'Wisp' }), 'creature').conditions,
    [],
  );
});

test("asTarget adds an NPC's armor to its stat block AC", () => {
  const guard = createCreature('guard', 'Guard', {
    location: HERE,
    stats: { AC: 12 },
    armor: { name: 'Shield', acBonus: 2 },
  });
  assert.equal(asTarget(guard, 'creature').ac, 14);
});

test('asTarget carries an NPC chip through to the target', () => {
  const sage = { ...fixtures().sage, conditions: [{ name: 'Prone', rounds: null }] };
  assert.deepEqual(asTarget(sage, 'creature').conditions, [{ name: 'Prone', rounds: null }]);
});

test('targetConditions reads the chips off an NPC on the tile', () => {
  const sage = { ...fixtures().sage, conditions: [{ name: 'Poisoned', rounds: 2 }] };
  const app = stubApp({ creatures: [sage] });
  assert.deepEqual(targetConditions(app, 'sage'), [{ name: 'Poisoned', rounds: 2 }]);
  assert.deepEqual(targetConditions(app, 'nobody'), []);
});

test('combatantsAsTargets skips a participant absent from every roster', () => {
  const { hero, goblin } = fixtures();
  const app = stubApp({ characters: [hero], creatures: [goblin] });
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
  const app = stubApp({ creatures: [goblin] });
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
  const downed = applyDamage(
    createCreature('orc', 'Orc', { disposition: 'hostile', maxHP: 8, location: HERE }),
    8,
  );
  const brute = createCreature('brute', 'Brute', { location: HERE, disposition: 'hostile' });
  const app = stubApp({
    characters: [hero],
    creatures: [goblin, downed, sage, brute],
  });
  const combat = {
    order: [{ id: 'hero' }, { id: 'goblin' }, { id: 'orc' }, { id: 'sage' }, { id: 'brute' }],
  };
  const targets = combatantsAsTargets(app, /** @type {any} */ (combat), combat.order[0]);
  assert.deepEqual(
    targets.map((t) => t.id),
    ['goblin', 'sage', 'brute'],
    'the defeated orc drops out, and the neutral sage stays attackable',
  );
});

test('combatantsAsTargets never offers an allied character or the actor itself', () => {
  const { hero, goblin, sage } = fixtures();
  const mage = createCharacter('mage', 'Mage');
  const app = stubApp({ characters: [hero, mage], creatures: [goblin, sage] });
  const combat = { order: [{ id: 'hero' }, { id: 'mage' }, { id: 'goblin' }, { id: 'sage' }] };
  // A character's hostile action reaches the foe and the bystander, but
  // never a fellow character.
  const heroTargets = combatantsAsTargets(app, /** @type {any} */ (combat), combat.order[0]);
  assert.deepEqual(
    heroTargets.map((t) => t.id),
    ['goblin', 'sage'],
  );
  // A creature's hostile action reaches every other combatant, but a
  // creature never targets itself.
  const goblinTargets = combatantsAsTargets(app, /** @type {any} */ (combat), combat.order[2]);
  assert.deepEqual(
    goblinTargets.map((t) => t.id),
    ['hero', 'mage', 'sage'],
  );
});

test('combatantsAsTargets drops a downed bystander from the hostile list', () => {
  const { hero, goblin } = fixtures();
  const fallen = applyDamage(createCreature('sage', 'Sage', { location: HERE, maxHP: 4 }), 4);
  const app = stubApp({ characters: [hero], creatures: [goblin, fallen] });
  const combat = { order: [{ id: 'hero' }, { id: 'goblin' }, { id: 'sage' }] };
  const targets = combatantsAsTargets(app, /** @type {any} */ (combat), combat.order[0]);
  assert.deepEqual(
    targets.map((t) => t.id),
    ['goblin'],
  );
});

test('describeCombatant reads the name and side off the live entity', () => {
  const { hero, goblin, sage } = fixtures();
  const brute = createCreature('brute', 'Brute', { location: HERE, disposition: 'hostile' });
  const app = stubApp({ characters: [hero], creatures: [goblin, sage, brute] });
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
  const app = stubApp({ characters: [hero, fallen], creatures: [goblin] });
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
  const app = stubApp({ creatures: [goblin] });
  applyToTarget(app, 'goblin', 4, false);
  assert.equal(app.state.creatures[0].currentHP, 6);
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
  const app = stubApp({ creatures: [hurt] });
  applyToTarget(app, 'goblin', 3, true);
  assert.equal(app.state.creatures[0].currentHP, 7);
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

test('applyToTarget ignores non-positive amounts and unknown ids', () => {
  const { sage } = fixtures();
  const app = stubApp({ creatures: [sage] });
  applyToTarget(app, 'nobody', 5, false);
  applyToTarget(app, 'sage', 0, false);
  assert.equal(app.dirty, 0);
  assert.equal(app.log.length, 0);
});

test('applyToTarget damages and heals an NPC, clamped to its own maximum', () => {
  const guard = createCreature('guard', 'Guard', { location: HERE, maxHP: 8 });
  const app = stubApp({ creatures: [guard] });
  applyToTarget(app, 'guard', 3, false);
  assert.equal(app.state.creatures[0].currentHP, 5);
  applyToTarget(app, 'guard', 99, true);
  assert.equal(app.state.creatures[0].currentHP, 8);
  assert.equal(app.dirty, 2);
  assert.deepEqual(app.log, [], 'a standing NPC logs nothing of its own');
  assert.ok(app.refreshes.includes('initiativePanel'), 'the fight surfaces show the new HP');
});

test('applyToTarget logs an NPC defeat once and rolls it no death saves', () => {
  const guard = createCreature('guard', 'Guard', { location: HERE, maxHP: 6 });
  const app = stubApp({ creatures: [guard] });
  applyToTarget(app, 'guard', 6, false);
  assert.equal(app.state.creatures[0].currentHP, 0);
  assert.deepEqual(app.log, ['Defeated Guard.']);
  assert.equal(app.state.creatures[0].deathSaves, undefined, 'an NPC has no dying tracker');
  applyToTarget(app, 'guard', 4, false);
  assert.deepEqual(app.log, ['Defeated Guard.'], 'a hit on a downed NPC stays quiet');
});

test('commitCreatures skips the encounter panel and the dirty mark when told to', () => {
  const app = stubApp();
  commitCreatures(app, { panel: false, dirty: false });
  assert.ok(!app.refreshes.includes('encounterPanel'), 'the caller re-renders its own rows');
  assert.equal(app.dirty, 0, 'the caller marks the campaign dirty itself');
  assert.ok(app.refreshes.includes('initiativePanel'), 'the running order still refreshes');
  assert.ok(app.calls.includes('syncCreatureMarkers'));
  assert.ok(app.calls.includes('syncCombatLocation'));
});

test('commitCreatures refreshes both sidebar panels and marks dirty by default', () => {
  const app = stubApp();
  commitCreatures(app);
  assert.ok(app.refreshes.includes('encounterPanel'));
  assert.ok(app.refreshes.includes('npcPanel'), 'both lists can show the same creature');
  assert.equal(app.dirty, 1);
});

test('targetSaveBonus derives a save for either kind and reports nothing for an unknown id', () => {
  const { hero, goblin, sage } = fixtures();
  const trained = { ...goblin, cr: 5, proficiencies: { saves: ['STR'], skills: [] } };
  const app = stubApp({ characters: [hero], creatures: [trained, sage] });
  assert.equal(targetSaveBonus(app, 'hero', 'STR'), saveBonus(hero, 'STR'));
  assert.equal(targetSaveBonus(app, 'goblin', 'STR'), 3, 'STR 10 plus the CR 5 proficiency');
  assert.equal(targetSaveBonus(app, 'sage', 'STR'), 0, 'an untrained creature adds its modifier');
  assert.equal(targetSaveBonus(app, 'nobody', 'STR'), undefined);
});

test('a target save bonus carries exhaustion for both kinds', () => {
  const { hero, goblin } = fixtures();
  const app = stubApp({
    characters: [{ ...hero, exhaustion: 2 }],
    creatures: [{ ...goblin, exhaustion: 2 }],
  });
  assert.equal(targetSaveBonus(app, 'hero', 'STR'), saveBonus(hero, 'STR') - 4);
  // A creature's save is derived now, so the penalty reaches it without the GM
  // subtracting it by hand.
  assert.equal(targetSaveBonus(app, 'goblin', 'STR'), -4);
});

/** A character holding an equipped, damage-carrying sword. */
function swordBearer() {
  const armed = addItem(
    createCharacter('hero', 'Hero'),
    item('sword', 'Sword', {
      type: 'weapon',
      kind: 'melee',
      damage: [{ count: 1, sides: 8, damageType: 'slashing' }],
    }),
  );
  return equip(armed, 'mainHand', 'sword');
}

test('weaponsOf lists what each kind of combatant can swing', () => {
  const club = { name: 'Club', kind: 'melee', damage: [{ count: 1, sides: 4 }] };
  const armedFoe = createCreature('ogre', 'Ogre', {
    disposition: 'hostile',
    maxHP: 20,
    location: HERE,
    weapon: /** @type {any} */ (club),
  });
  const barehanded = createCreature('slime', 'Slime', {
    disposition: 'hostile',
    maxHP: 8,
    location: HERE,
    weapon: null,
  });
  const { sage } = fixtures();
  const app = stubApp({
    characters: [swordBearer()],
    creatures: [armedFoe, barehanded, sage],
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
  assert.deepEqual(weaponsOf(app, 'sage'), [], 'an unarmed NPC has nothing');
  assert.deepEqual(weaponsOf(app, 'nobody'), []);
});

test('weaponsOf lists the weapon an armed NPC was given', () => {
  const club = { name: 'Club', kind: 'melee', damage: [{ count: 1, sides: 4 }] };
  const guard = createCreature('guard', 'Guard', {
    location: HERE,
    weapon: /** @type {any} */ (club),
  });
  const app = stubApp({ creatures: [guard] });
  assert.deepEqual(
    weaponsOf(app, 'guard').map((w) => w.name),
    ['Club'],
  );
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
  const caster = createCreature('lich', 'Lich', {
    disposition: 'hostile',
    maxHP: 40,
    location: HERE,
    class: 'wizard',
    casterLevel: 9,
    spellbook: { cantrips: ['fire-bolt'], known: ['hold-person'], prepared: [] },
  });
  const npcCaster = createCreature('seer', 'Seer', {
    location: HERE,
    class: 'wizard',
    spellbook: { cantrips: [], known: ['hold-person'], prepared: [] },
  });
  const app = stubApp({ creatures: [caster, npcCaster] });
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
  const app = stubApp({ characters: [hero], creatures: [goblin, sage] });
  assert.equal(applyConditionToTarget(app, 'hero', 'Paralyzed', 10, heldBy()), true);
  assert.deepEqual(app.state.characters[0].conditions, [
    { name: 'Paralyzed', rounds: 10, source: heldBy() },
  ]);
  assert.equal(applyConditionToTarget(app, 'goblin', 'Blinded', null), true);
  assert.deepEqual(app.state.creatures[0].conditions, [{ name: 'Blinded', rounds: null }]);
  assert.equal(applyConditionToTarget(app, 'sage', 'Blinded', null), true);
  assert.deepEqual(app.state.creatures[0].conditions, [{ name: 'Blinded', rounds: null }]);
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
  const app = stubApp({ characters: [hero], creatures: [goblin] });
  endSpellEffects(app, 'mage', 'hold-person');
  assert.deepEqual(app.state.characters[0].conditions, []);
  assert.deepEqual(app.state.creatures[0].conditions, []);
  assert.deepEqual(app.log, ['Hero is no longer Paralyzed.', 'Goblin is no longer Paralyzed.']);
  assert.equal(app.dirty, 1);
  assert.ok(app.calls.includes('refreshSelectedCharacter'));
  assert.ok(app.calls.includes('syncCreatureMarkers'));
});

test('endSpellEffects frees an NPC the cast had held', () => {
  const source = heldBy();
  const sage = { ...fixtures().sage, conditions: addCondition([], 'Paralyzed', 10, { source }) };
  const app = stubApp({ creatures: [sage] });
  endSpellEffects(app, 'mage', 'hold-person');
  assert.deepEqual(app.state.creatures[0].conditions, []);
  assert.deepEqual(app.log, ['Sage is no longer Paralyzed.']);
  assert.ok(app.refreshes.includes('npcPanel'));
});

test('endSpellEffects leaves the other roster untouched when only one holds a chip', () => {
  const goblin = {
    ...fixtures().goblin,
    conditions: addCondition([], 'Paralyzed', 10, { source: heldBy() }),
  };
  const { hero } = fixtures();
  const app = stubApp({ characters: [hero], creatures: [goblin] });
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

/** A creature spawned by the standard test cast. */
function summoned(id, over = {}) {
  return {
    ...createCreature(id, 'Wolf', { disposition: 'hostile', maxHP: 11, location: HERE }),
    summonedBy: { spellId: 'conjure-animals', spellName: 'Conjure Animals', casterId: 'druid' },
    ...over,
  };
}

test('endSpellEffects despawns the summons of a cast that imposed no chip', () => {
  const { goblin } = fixtures();
  const app = stubApp({ creatures: [goblin, summoned('wolf-1'), summoned('wolf-2')] });
  endSpellEffects(app, 'druid', 'conjure-animals');
  assert.deepEqual(
    app.state.creatures.map((c) => c.id),
    ['goblin'],
  );
  assert.deepEqual(app.log, [
    'Wolf vanishes as Conjure Animals ends.',
    'Wolf vanishes as Conjure Animals ends.',
  ]);
  assert.equal(app.dirty, 1);
  assert.equal(app.calls.filter((c) => c === 'removeCombatant').length, 2);
  assert.ok(app.calls.includes('syncCreatureMarkers'));
});

test('endSpellEffects leaves the summons of another caster or another spell', () => {
  const app = stubApp({
    creatures: [
      summoned('wolf'),
      summoned('bear', {
        summonedBy: {
          spellId: 'conjure-animals',
          spellName: 'Conjure Animals',
          casterId: 'ranger',
        },
      }),
      summoned('spirit', {
        summonedBy: {
          spellId: 'spirit-guardians',
          spellName: 'Spirit Guardians',
          casterId: 'druid',
        },
      }),
    ],
  });
  endSpellEffects(app, 'druid', 'conjure-animals');
  assert.deepEqual(
    app.state.creatures.map((c) => c.id),
    ['bear', 'spirit'],
  );
});

test('endSpellEffects despawns a defeated summon too', () => {
  const app = stubApp({ creatures: [summoned('wolf', { currentHP: 0 })] });
  endSpellEffects(app, 'druid', 'conjure-animals');
  assert.deepEqual(app.state.creatures, []);
  assert.deepEqual(app.log, ['Wolf vanishes as Conjure Animals ends.']);
});

test('endSpellEffects frees a chip and despawns a summon in one pass', () => {
  const source = heldBy({
    spellId: 'conjure-animals',
    spellName: 'Conjure Animals',
    casterId: 'druid',
  });
  const hero = { ...fixtures().hero, conditions: addCondition([], 'Blessed', 10, { source }) };
  // The chipped creature is also the summon, which is the case the despawn
  // must read the swept list for: the creature would otherwise be written back
  // after it has already left.
  const chipped = {
    ...summoned('wolf'),
    conditions: addCondition([], 'Blessed', 10, { source }),
  };
  const app = stubApp({ characters: [hero], creatures: [chipped, fixtures().goblin] });
  endSpellEffects(app, 'druid', 'conjure-animals');
  assert.deepEqual(app.state.characters[0].conditions, []);
  assert.deepEqual(
    app.state.creatures.map((c) => c.id),
    ['goblin'],
  );
  assert.deepEqual(app.log, [
    'Hero is no longer Blessed.',
    'Wolf is no longer Blessed.',
    'Wolf vanishes as Conjure Animals ends.',
  ]);
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
  const app = stubApp({ creatures: [goblin] });
  retryImposedSaves(app, 'goblin');
  assert.deepEqual(app.state.creatures[0].conditions.length, 1);
  assert.equal(app.dirty, 0, 'a failed retry changes nothing to store');
  assert.match(app.log[0], /^Goblin is still Paralyzed \(WIS save \d+ vs DC 99\)\.$/);
});

test('retryImposedSaves writes a freed foe back to the encounter roster', () => {
  const source = heldBy({ saveEnds: true, saveDC: 1 });
  const goblin = {
    ...fixtures().goblin,
    conditions: addCondition([], 'Paralyzed', 10, { source }),
  };
  const app = stubApp({ creatures: [goblin] });
  retryImposedSaves(app, 'goblin');
  assert.deepEqual(app.state.creatures[0].conditions, []);
  assert.equal(app.dirty, 1);
  assert.match(app.log[0], /^Goblin shakes off Paralyzed \(WIS save \d+ vs DC 1\)\.$/);
});

test('retryImposedSaves rolls a foe chip against the bonus the cast recorded', () => {
  const source = heldBy({ saveEnds: true, saveDC: 99, saveBonus: 4, saveAbility: undefined });
  const goblin = {
    ...fixtures().goblin,
    conditions: addCondition([], 'Stunned', null, { source }),
  };
  const app = stubApp({ creatures: [goblin] });
  retryImposedSaves(app, 'goblin');
  assert.match(app.log[0], /^Goblin is still Stunned \(save \d+ vs DC 99\)\.$/);
});

test('retryImposedSaves frees an NPC that shakes its chip off', () => {
  const source = heldBy({ saveEnds: true, saveDC: 1 });
  const sage = { ...fixtures().sage, conditions: addCondition([], 'Stunned', 10, { source }) };
  const app = stubApp({ creatures: [sage] });
  retryImposedSaves(app, 'sage');
  assert.deepEqual(app.state.creatures[0].conditions, []);
  assert.equal(app.dirty, 1);
  assert.match(app.log[0], /^Sage shakes off Stunned \(WIS save \d+ vs DC 1\)\.$/);
});

test('retryImposedSaves rolls nothing for an unknown id or a chip with no retry', () => {
  const { sage } = fixtures();
  const hero = {
    ...fixtures().hero,
    conditions: addCondition([], 'Paralyzed', 10, { source: heldBy() }),
  };
  const app = stubApp({ characters: [hero], creatures: [sage] });
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
  const app = stubApp({ characters: [character], creatures: [goblin] });
  applyToTarget(app, 'hero', 80, false);
  assert.equal(app.state.characters[0].concentration, null);
  assert.deepEqual(app.state.creatures[0].conditions, [], 'the target walks free with the spell');
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
  const app = stubApp({ creatures: [goblin] });
  retryImposedSaves(app, 'goblin');
  assert.match(app.log[0], /Bane -1d4 \[\d\]/);
});
