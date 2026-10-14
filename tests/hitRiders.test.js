import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hitRiderNote,
  hitRiderParts,
  hitRiderSummary,
  hitRiders,
  normalizeHitRider,
} from '../src/entities/HitRiders.js';
import { rollWeaponAttack } from '../src/app/weaponAttack.js';
import { aids } from '../src/app/spellTargets.js';
import { castSpell } from '../src/entities/Casting.js';
import { buffExtras } from '../src/entities/SpellFields.js';
import { createCondition } from '../src/entities/Conditions.js';
import { effectSummary } from '../src/view/SpellEffectText.js';
import { roll } from '../src/dice/DiceRoller.js';
import { createCharacter, withHP } from '../src/entities/Character.js';
import { createCreature } from '../src/entities/Creature.js';
import { createResource } from '../src/entities/Resource.js';
import { DEFAULT_SPELLS } from '../src/data/spells.js';
import { stubApp as baseStubApp } from './helpers/app.js';

const HERE = { nodeId: 'n1', tileId: '0,0' };
const SWORD = {
  id: 'sword',
  name: 'Sword',
  type: 'weapon',
  kind: 'melee',
  category: 'martial',
  quantity: 1,
  notes: '',
  damage: [{ count: 1, sides: 8, damageType: 'slashing' }],
};
const spell = (/** @type {string} */ id) =>
  /** @type {any} */ (DEFAULT_SPELLS.find((s) => s.id === id));
const d20 = (/** @type {number} */ n) => (n - 1) / 20;
/** @param {number[]} values */
function scripted(values) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

const FAVOR = { count: 1, sides: 4, damageType: 'radiant', weaponOnly: true };
const MARK = { count: 1, sides: 6, weaponOnly: true, mark: true };
const HEX = { count: 1, sides: 6, damageType: 'necrotic', mark: true };
const markBy = (/** @type {string} */ casterId, hit = MARK, name = "Hunter's Mark") =>
  createCondition(name, 600, {
    source: { spellId: 'hunters-mark', spellName: name, casterId },
    hit,
  });

/** A hero proficient with martial weapons, carrying the given chips. */
function makeHero(conditions = []) {
  const base = withHP(createCharacter('hero', 'Hero', { STR: 16 }), 12);
  return {
    ...base,
    conditions,
    proficiencies: { ...base.proficiencies, weapons: { categories: ['martial'], named: [] } },
  };
}

function goblinWith(conditions = [], hp = 40) {
  return {
    ...createCreature('goblin', 'Goblin', {
      disposition: 'hostile',
      maxHP: hp,
      stats: { AC: 10 },
      location: HERE,
      level: 1,
    }),
    conditions,
  };
}

function stubApp({ characters = [], creatures = [], rng = () => 0.5 }) {
  const app = baseStubApp({
    state: { characters, creatures },
    partyTracker: /** @type {any} */ ({ getPosition: () => HERE }),
    toasts: { show: () => {} },
    actions: {
      rollDice: (/** @type {any} */ selection) => ({ result: roll(selection, rng) }),
    },
  });
  return app;
}

/** Swing the sword once with every damage die on its top face. */
function swing(hero, goblin, natural = 15) {
  const app = stubApp({ characters: [hero], creatures: [goblin], rng: scripted([d20(natural)]) });
  rollWeaponAttack(app, {
    attacker: hero,
    defender: { id: goblin.id, name: goblin.name, ac: 10, conditions: goblin.conditions },
    weapon: /** @type {any} */ (SWORD),
    rng: () => 0.999,
  });
  return app;
}

test('normalizeHitRider keeps a usable rider and drops one that adds nothing', () => {
  assert.deepEqual(normalizeHitRider({ ...FAVOR, damageType: ' Radiant ' }), FAVOR);
  assert.deepEqual(normalizeHitRider({ count: 2, sides: 6, damageType: '' }), {
    count: 2,
    sides: 6,
  });
  assert.equal(normalizeHitRider(null), null);
  assert.equal(normalizeHitRider('1d6'), null);
  assert.equal(normalizeHitRider({ count: 0, sides: 6 }), null);
  assert.equal(normalizeHitRider({ count: 1, sides: 7 }), null);
  assert.equal(normalizeHitRider({ count: 99, sides: 6 })?.count, 20);
});

test("hitRiders reads the attacker's own chips and the marks it left on the defender", () => {
  const attacker = { id: 'r', conditions: [createCondition('Divine Favor', 10, { hit: FAVOR })] };
  const defender = { conditions: [markBy('r'), markBy('other', MARK, 'Other Mark')] };
  assert.deepEqual(
    hitRiders(attacker, defender, { weapon: true }).map((r) => r.name),
    ['Divine Favor', "Hunter's Mark"],
  );
  // A spell attack skips the weapon-only riders and keeps the others.
  const hexed = { conditions: [markBy('r', HEX, 'Hex'), markBy('r')] };
  assert.deepEqual(
    hitRiders(attacker, hexed, { weapon: false }).map((r) => r.name),
    ['Hex'],
  );
  // A mark on the attacker itself, or a plain rider on the defender, adds nothing.
  assert.deepEqual(
    hitRiders({ id: 'r', conditions: [markBy('r')] }, { conditions: [] }, { weapon: true }),
    [],
  );
  assert.deepEqual(
    hitRiders(
      { id: 'r' },
      { conditions: [createCondition('Favor', 1, { hit: FAVOR })] },
      {
        weapon: true,
      },
    ),
    [],
  );
});

test('rider parts double on a crit and take the base type when they name none', () => {
  const riders = [
    { name: 'A', rider: FAVOR },
    { name: 'B', rider: MARK },
  ];
  assert.deepEqual(hitRiderParts(riders, true, 'piercing'), [
    { count: 2, sides: 4, damageType: 'radiant' },
    { count: 2, sides: 6, damageType: 'piercing' },
  ]);
  assert.equal(hitRiderNote(riders, false), ', A +1d4 radiant, B +1d6');
  assert.equal(hitRiderNote(riders, true), ', A +2d4 radiant, B +2d6');
  assert.equal(hitRiderNote([], false), '');
  assert.equal(hitRiderSummary(MARK), '+1d6 on weapon hits by the caster');
  assert.equal(hitRiderSummary(HEX), '+1d6 necrotic on hits by the caster');
  assert.equal(hitRiderSummary(undefined), '');
});

test('a Divine Favor hit adds 1d4 radiant and names it in the log', () => {
  const hero = makeHero([createCondition('Divine Favor', 10, { hit: FAVOR })]);
  const app = swing(hero, goblinWith());
  // 8 on the sword, 3 from STR, and 4 radiant.
  assert.equal(app.state.creatures[0].currentHP, 40 - 15);
  assert.match(app.log[1], /radiant.*, Divine Favor \+1d4 radiant\.$/);
});

test('a chip resistance halves rider damage by the rider type', () => {
  const hero = makeHero([createCondition('Divine Favor', 10, { hit: FAVOR })]);
  const warded = { name: 'Protection from Energy', rounds: 600, mods: { resist: ['radiant'] } };
  const app = swing(hero, goblinWith([warded]));
  // 11 slashing lands in full, and the 4 radiant of the rider halves to 2.
  assert.equal(app.state.creatures[0].currentHP, 40 - 13);
  // Stoneskin halves the slashing of Hunter's Mark with the sword's own.
  const stone = { name: 'Stoneskin', rounds: 600, mods: { resistNonmagical: true } };
  const marked = swing(makeHero(), goblinWith([markBy('hero'), stone]));
  // 8 + 6 + 3 slashing is 17, which halves to 8.
  assert.equal(marked.state.creatures[0].currentHP, 40 - 8);
});

test("a Hunter's Mark hit adds 1d6 of the weapon's type, doubled on a crit", () => {
  const hero = makeHero();
  const app = swing(hero, goblinWith([markBy('hero')]));
  // 8 + 6 slashing plus 3 from STR.
  assert.equal(app.state.creatures[0].currentHP, 40 - 17);
  assert.match(app.log[1], /, Hunter's Mark \+1d6\.$/);
  const crit = swing(hero, goblinWith([markBy('hero')]), 20);
  // Two d8 and two d6 at their top faces, plus 3.
  assert.equal(crit.state.creatures[0].currentHP, 40 - 31);
  assert.match(crit.log[1], /, Hunter's Mark \+2d6\.$/);
});

test("another caster's mark adds nothing to the hero's hit", () => {
  const app = swing(makeHero(), goblinWith([markBy('someone-else')]));
  assert.equal(app.state.creatures[0].currentHP, 40 - 11);
  assert.doesNotMatch(app.log[1], /Hunter's Mark/);
});

/** A warlock that casts Fire Bolt with the given chips around it. */
function boltCaster() {
  return /** @type {any} */ ({
    id: 'c',
    name: 'Mage',
    class: 'wizard',
    level: 5,
    stats: { INT: 16 },
    resources: [createResource('slots-1', 'Level 1 slots', 4)],
    inventory: [],
    conditions: [],
    spellbook: { cantrips: ['firebolt'], known: [], prepared: [] },
  });
}
const firebolt = /** @type {any} */ ({
  id: 'firebolt',
  name: 'Fire Bolt',
  level: 0,
  school: 'evocation',
  classes: ['wizard'],
  castingTime: { kind: 'action' },
  range: '120 ft',
  components: ['V', 'S'],
  duration: { kind: 'instantaneous' },
  concentration: false,
  ritual: false,
  description: '',
  effect: { kind: 'attack', damage: [{ count: 1, sides: 10, damageType: 'fire' }] },
});

test('a hex-like mark adds its dice to a spell attack hit by its caster', () => {
  const target = { id: 'g', ac: 5, conditions: [markBy('c', HEX, 'Hex')] };
  const result = /** @type {any} */ (
    castSpell(boltCaster(), firebolt, { targets: [target], spellAttackBonus: 5, rng: () => 0.999 })
  );
  const [o] = result.outcomes;
  assert.equal(o.crit, true);
  // A natural 20 doubles both the fire dice and the necrotic dice.
  assert.equal(o.damage.total, 20 + 12);
  assert.equal(o.hitNote, ', Hex +2d6 necrotic');
  // A weapon-only mark and a miss add nothing.
  const marked = { ...target, conditions: [markBy('c')] };
  const plain = /** @type {any} */ (
    castSpell(boltCaster(), firebolt, { targets: [marked], spellAttackBonus: 5, rng: () => 0.5 })
  );
  assert.equal(plain.outcomes[0].hitNote, '');
  const missed = /** @type {any} */ (
    castSpell(boltCaster(), firebolt, { targets: [target], rng: () => 0 })
  );
  assert.equal(missed.outcomes[0].hitNote, undefined);
});

test('an automatic hit such as Magic Missile takes no hit rider', () => {
  const missile = spell('magic-missile');
  const target = { id: 'g', ac: 5, conditions: [markBy('c', HEX, 'Hex')] };
  const result = /** @type {any} */ (
    castSpell(
      { ...boltCaster(), spellbook: { cantrips: [], known: [], prepared: ['magic-missile'] } },
      missile,
      { slotLevel: 1, targets: [target], rng: () => 0 },
    )
  );
  // Three darts at 1d4+1 on their lowest face, and no necrotic dice.
  assert.equal(result.outcomes[0].damage.total, 6);
});

test("Hunter's Mark and Divine Favor are buffs with hit riders, and the mark aims at foes", () => {
  const mark = spell('hunters-mark');
  const favor = spell('divine-favor');
  assert.deepEqual(mark.effect.hit, MARK);
  assert.equal(mark.castingTime.kind, 'bonus');
  assert.deepEqual(mark.repeat, { cost: 'bonus' });
  assert.deepEqual(favor.effect.hit, FAVOR);
  assert.equal(aids(mark), false);
  assert.equal(aids(favor), true);
  assert.equal(aids(spell('cure-wounds')), true);
  assert.equal(aids(spell('fire-bolt') ?? firebolt), false);
  assert.match(effectSummary(mark, null), /\+1d6 on weapon hits by the caster/);
});

test('a buff cast writes its hit rider onto each outcome, and the library keeps it', () => {
  const paladin = /** @type {any} */ ({
    ...boltCaster(),
    class: 'paladin',
    spellbook: { cantrips: [], known: [], prepared: ['divine-favor'] },
  });
  const result = /** @type {any} */ (
    castSpell(paladin, spell('divine-favor'), { slotLevel: 1, targets: [{ id: 'c' }] })
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.outcomes[0].hit, FAVOR);
  assert.deepEqual(buffExtras({ hit: HEX }).hit, HEX);
  assert.equal('hit' in buffExtras({ hit: { count: 0, sides: 6 } }), false);
  assert.deepEqual(createCondition('X', 1, { hit: FAVOR }).hit, FAVOR);
});
