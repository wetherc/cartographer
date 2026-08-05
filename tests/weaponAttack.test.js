import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  attackParticipants,
  readAttackTweaks,
  rollWeaponAttack,
  weaponAttack,
} from '../src/app/weaponAttack.js';
import { roll } from '../src/dice/DiceRoller.js';
import { addItem, createCharacter, withHP, getHP } from '../src/entities/Character.js';
import { equip } from '../src/entities/Equipment.js';
import { withProficiencies } from '../src/entities/Proficiencies.js';
import { createCreature } from '../src/entities/Creature.js';
import { stubApp as baseStubApp } from './helpers/app.js';

const HERE = { nodeId: 'n1', tileId: '0,0' };

/** A sword with one damage die, in the inventory shape a character carries. */
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

/**
 * A party attacker proficient with martial weapons, so the baseline attack
 * keeps its proficiency bonus. The tests about the gate itself build a
 * character without the grant.
 * @param {Record<string, number>} [stats]
 */
function makeHero(stats) {
  const base = withHP(createCharacter('hero', 'Hero', stats), 12);
  return {
    ...base,
    proficiencies: {
      ...base.proficiencies,
      weapons: { categories: ['martial'], named: [] },
    },
  };
}

/**
 * An rng that hands back the given values in order, then repeats the last one.
 * A d20 roll of `n` comes from `(n - 1) / 20`, so the roll a test wants is
 * spelled out instead of tuned.
 * @param {number[]} values
 */
function scripted(values) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

/** The rng value that makes a d20 land on `n`. */
const d20 = (n) => (n - 1) / 20;

/**
 * A stub app whose dice tray rolls the scripted sequence. `rolls` records each
 * selection the attack loaded into the tray, along with the AC it rolled
 * against.
 * @param {{ characters?: any[], creatures?: any[], rng?: () => number }} [opts]
 */
function stubApp({ characters = [], creatures = [], rng = () => 0.5 } = {}) {
  const app = baseStubApp({
    state: { characters, creatures },
    partyTracker: /** @type {any} */ ({ getPosition: () => HERE }),
    toasts: { show: (/** @type {string} */ message) => app.toastMessages.push(message) },
    actions: {
      rollDice: (/** @type {any} */ selection, /** @type {number} */ target) => {
        app.rolls.push({ selection, target });
        return { result: roll(selection, rng) };
      },
    },
  });
  app.toastMessages = [];
  app.rolls = [];
  return app;
}

test('readAttackTweaks reads the dialog answers and treats a blank field as no override', () => {
  assert.deepEqual(
    readAttackTweaks({
      mode: 'advantage',
      'two-handed': '1',
      range: 'long',
      'atk-count': '1',
      'atk-die': 'd6',
      'atk-flat': '2',
      'dmg-count': '3',
      'dmg-die': 'd8',
      'dmg-flat': '-1',
    }),
    {
      mode: 'advantage',
      twoHanded: true,
      longRange: true,
      thrown: false,
      attackDice: 1,
      attackDie: 'd6',
      attackFlat: 2,
      damageDice: 3,
      damageDie: 'd8',
      damageFlat: -1,
    },
  );
  // An absent mode answer reads as `auto`, which leaves the chips in charge.
  // An absent grip or range answer reads as the one-handed, normal-range
  // attack.
  assert.deepEqual(readAttackTweaks({}), {
    mode: 'auto',
    twoHanded: false,
    longRange: false,
    thrown: false,
    attackDice: 0,
    attackDie: undefined,
    attackFlat: 0,
    damageDice: 0,
    damageDie: undefined,
    damageFlat: 0,
  });
  const nonsense = readAttackTweaks({ 'atk-count': 'two', 'dmg-flat': '' });
  assert.equal(nonsense.attackDice, 0);
  assert.equal(nonsense.damageFlat, 0);
});

test('the range answer of a thrown melee weapon says whether it was thrown', () => {
  const melee = readAttackTweaks({ range: 'melee' });
  assert.equal(melee.thrown, false, 'a stab stays a melee attack');
  assert.equal(melee.longRange, false);
  const thrown = readAttackTweaks({ range: 'thrown' });
  assert.equal(thrown.thrown, true);
  assert.equal(thrown.longRange, false);
  const far = readAttackTweaks({ range: 'thrown-long' });
  assert.equal(far.thrown, true);
  assert.equal(far.longRange, true, 'a long throw slants the roll too');
});

test('attackParticipants names the attacker and who is left to attack', () => {
  const hero = makeHero({ STR: 16 });
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 10,
    stats: { AC: 13 },
    location: HERE,
    level: 1,
  });
  const app = stubApp({ characters: [hero], creatures: [goblin] });
  const combat = { order: [{ id: 'hero' }, { id: 'goblin' }] };
  const sides = attackParticipants(app, /** @type {any} */ (combat), combat.order[0]);
  assert.equal(sides?.attacker.id, 'hero');
  assert.deepEqual(
    sides?.defenders.map((d) => d.id),
    ['goblin'],
  );
});

test('attackParticipants names an NPC attacker and skips an unknown participant', () => {
  const hero = withHP(createCharacter('hero', 'Hero'), 12);
  const brigand = createCreature('brigand', 'Brigand', { location: HERE, disposition: 'hostile' });
  const app = stubApp({ characters: [hero], creatures: [brigand] });
  const combat = { order: [{ id: 'brigand' }, { id: 'hero' }, { id: 'ghost' }] };
  const sides = attackParticipants(app, /** @type {any} */ (combat), combat.order[0]);
  assert.equal(sides?.attacker.id, 'brigand');
  assert.deepEqual(
    sides?.defenders.map((d) => d.id),
    ['hero'],
  );
  assert.equal(attackParticipants(app, /** @type {any} */ (combat), combat.order[2]), null);
});

test('a hit rolls the weapon damage, applies it, and logs both halves', () => {
  const hero = makeHero({ STR: 16 });
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 20,
    stats: { AC: 10 },
    location: HERE,
    level: 1,
  });
  // A 15 on the d20 plus STR +3 plus proficiency +2 beats AC 10. The damage
  // die then lands on 5.
  const app = stubApp({
    characters: [hero],
    creatures: [goblin],
    rng: scripted([d20(15)]),
  });
  rollWeaponAttack(app, {
    attacker: hero,
    defender: { id: 'goblin', name: 'Goblin', ac: 10 },
    weapon: /** @type {any} */ (SWORD),
    rng: scripted([4 / 8]),
  });
  assert.deepEqual(app.rolls, [{ selection: { counts: { d20: 1 }, modifier: 5 }, target: 10 }]);
  assert.match(
    app.log[0],
    /^Hero attacks Goblin with Sword \(STR \+3, proficiency \+2\): 20 to hit/,
  );
  assert.match(app.log[0], /vs AC 10 — hit\.$/);
  assert.match(app.log[1], /^Sword hits Goblin for /);
  // 5 on the die plus the STR modifier.
  assert.equal(app.state.creatures[0].currentHP, 20 - 8);
  assert.match(app.toastMessages[0], /^Hit! Goblin takes /);
});

test('a natural 20 crits, doubles the damage dice, and says so', () => {
  const hero = makeHero({ STR: 16 });
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 40,
    stats: { AC: 25 },
    location: HERE,
    level: 1,
  });
  // Both damage dice land on 8, so the crit total is unmistakable.
  const app = stubApp({ characters: [hero], creatures: [goblin], rng: scripted([d20(20)]) });
  rollWeaponAttack(app, {
    attacker: hero,
    defender: { id: 'goblin', name: 'Goblin', ac: 25 },
    weapon: /** @type {any} */ (SWORD),
    rng: scripted([7 / 8]),
  });
  assert.match(app.log[0], /— critical hit\.$/, 'a natural 20 beats any AC');
  assert.match(app.log[1], /^Sword critically hits Goblin for /);
  // Two dice at 8 plus the STR modifier of 3.
  assert.equal(app.state.creatures[0].currentHP, 40 - 19);
  assert.match(app.toastMessages[0], /^Critical hit!/);
});

test('a miss logs the roll, says who missed, and lands no damage', () => {
  const hero = makeHero({ STR: 16 });
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 20,
    stats: { AC: 25 },
    location: HERE,
    level: 1,
  });
  const app = stubApp({
    characters: [hero],
    creatures: [goblin],
    rng: scripted([d20(5)]),
  });
  rollWeaponAttack(app, {
    attacker: hero,
    defender: { id: 'goblin', name: 'Goblin', ac: 25 },
    weapon: /** @type {any} */ (SWORD),
  });
  assert.equal(app.log.length, 1, 'a miss logs the attack and nothing else');
  assert.match(app.log[0], /— miss\.$/);
  assert.equal(app.state.creatures[0].currentHP, 20);
  assert.deepEqual(app.toastMessages, ['10 vs AC 25: Hero misses Goblin.']);
});

test('a natural 1 misses however high the total', () => {
  const hero = makeHero({ STR: 20 });
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 20,
    stats: { AC: 2 },
    location: HERE,
    level: 1,
  });
  const app = stubApp({
    characters: [hero],
    creatures: [goblin],
    rng: scripted([d20(1)]),
  });
  rollWeaponAttack(app, {
    attacker: hero,
    defender: { id: 'goblin', name: 'Goblin', ac: 2 },
    weapon: /** @type {any} */ (SWORD),
  });
  assert.match(app.log[0], /— natural 1, miss\.$/);
  assert.equal(app.state.creatures[0].currentHP, 20);
});

test('bonus attack dice join the d20 in the tray and are named in the log', () => {
  const hero = makeHero({ STR: 16 });
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 20,
    stats: { AC: 10 },
    location: HERE,
    level: 1,
  });
  const app = stubApp({
    characters: [hero],
    creatures: [goblin],
    rng: scripted([d20(12)]),
  });
  rollWeaponAttack(app, {
    attacker: hero,
    defender: { id: 'goblin', name: 'Goblin', ac: 10 },
    weapon: /** @type {any} */ (SWORD),
    tweaks: { attackDice: 1, attackDie: 'd4', attackFlat: 2 },
    rng: scripted([3 / 8]),
  });
  // The bonus die rolls in the tray, so it appears in the selection. The flat
  // bonus folds into the modifier alongside STR +3 and proficiency +2.
  assert.deepEqual(app.rolls[0].selection, { counts: { d20: 1, d4: 1 }, modifier: 7 });
  assert.match(app.log[0], /proficiency \+2, \+1d4 \+2/);
});

test('penalty attack dice roll off the tray and come out of the modifier', () => {
  const hero = makeHero({ STR: 16 });
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 20,
    stats: { AC: 10 },
    location: HERE,
    level: 1,
  });
  const app = stubApp({
    characters: [hero],
    creatures: [goblin],
    rng: scripted([3 / 4, d20(12), 3 / 8]),
  });
  rollWeaponAttack(app, {
    attacker: hero,
    defender: { id: 'goblin', name: 'Goblin', ac: 10 },
    weapon: /** @type {any} */ (SWORD),
    tweaks: { attackDice: -1, attackDie: 'd4' },
  });
  assert.deepEqual(
    app.rolls[0].selection.counts,
    { d20: 1 },
    'a penalty die is not thrown in view',
  );
  assert.ok(app.rolls[0].selection.modifier < 5, 'the rolled penalty comes off the modifier');
  assert.match(app.log[0], /-1d4/);
});

test('bonus damage dice and a flat rider both add to a hit', () => {
  const hero = makeHero({ STR: 16 });
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 40,
    stats: { AC: 10 },
    location: HERE,
    level: 1,
  });
  // The attack d20 lands on 15, then every damage die lands on its maximum.
  const app = stubApp({ characters: [hero], creatures: [goblin], rng: scripted([d20(15)]) });
  rollWeaponAttack(app, {
    attacker: hero,
    defender: { id: 'goblin', name: 'Goblin', ac: 10 },
    weapon: /** @type {any} */ (SWORD),
    tweaks: { damageDice: 2, damageDie: 'd6', damageFlat: 1 },
    rng: () => 0.999,
  });
  // 8 on the sword, 6 and 6 on the bonus dice, STR +3, and the flat +1.
  assert.equal(app.state.creatures[0].currentHP, 40 - 24);
});

test('an advantage roll names the die it threw away', () => {
  const hero = makeHero({ STR: 16 });
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 20,
    stats: { AC: 10 },
    location: HERE,
    level: 1,
  });
  const app = stubApp({ characters: [hero], creatures: [goblin] });
  // The tray owns advantage, so the stub rolls it the way the tray would.
  app.actions.rollDice = (/** @type {any} */ selection, /** @type {number} */ target) => {
    app.rolls.push({ selection, target });
    return { result: roll({ ...selection, mode: 'advantage' }, scripted([d20(4), d20(18)])) };
  };
  rollWeaponAttack(app, {
    attacker: hero,
    defender: { id: 'goblin', name: 'Goblin', ac: 10 },
    weapon: /** @type {any} */ (SWORD),
    rng: scripted([3 / 8]),
  });
  assert.match(app.log[0], /dropped 4/);
});

test("a foe attacks with its own weapon and its stat block's ability", () => {
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 10,
    stats: { STR: 14 },
    location: HERE,
    level: 1,
    weapon: /** @type {any} */ ({
      name: 'Club',
      kind: 'melee',
      damage: [{ count: 1, sides: 4 }],
    }),
  });
  const hero = withHP(createCharacter('hero', 'Hero'), 20);
  const app = stubApp({ characters: [hero], creatures: [goblin], rng: scripted([d20(18)]) });
  rollWeaponAttack(app, {
    attacker: goblin,
    defender: { id: 'hero', name: 'Hero', ac: 10 },
    weapon: /** @type {any} */ (goblin.weapon),
    rng: scripted([3 / 4]),
  });
  assert.match(app.log[0], /^Goblin attacks Hero with Club \(STR \+2/);
  assert.equal(getHP(app.state.characters[0]).current, 20 - 6);
});

test('a weapon carrying status effects names them in the log and the toast', () => {
  const hero = makeHero({ STR: 16 });
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 20,
    stats: { AC: 10 },
    location: HERE,
    level: 1,
  });
  const app = stubApp({
    characters: [hero],
    creatures: [goblin],
    rng: scripted([d20(15)]),
  });
  rollWeaponAttack(app, {
    attacker: hero,
    defender: { id: 'goblin', name: 'Goblin', ac: 10 },
    weapon: /** @type {any} */ ({ ...SWORD, statusEffects: ['Poisoned', 'Prone'] }),
    rng: scripted([3 / 8]),
  });
  assert.match(app.log[1], /, inflicting Poisoned, Prone\.$/);
  assert.match(app.toastMessages[0], /, inflicting Poisoned, Prone\.$/);
});

test('a weapon with no damage roll still resolves and lands nothing', () => {
  const hero = withHP(createCharacter('hero', 'Hero', { STR: 10 }), 12);
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 20,
    stats: { AC: 10 },
    location: HERE,
    level: 1,
  });
  const app = stubApp({
    characters: [hero],
    creatures: [goblin],
    rng: scripted([d20(15)]),
  });
  rollWeaponAttack(app, {
    attacker: hero,
    defender: { id: 'goblin', name: 'Goblin', ac: 10 },
    weapon: /** @type {any} */ ({ name: 'Fist' }),
  });
  assert.match(app.log[1], /^Fist hits Goblin for 0 damage\.$/);
  assert.equal(app.state.creatures[0].currentHP, 20, 'no damage means no write');
  assert.match(app.toastMessages[0], /Goblin takes no damage\.$/);
});

test('weaponAttack stops before the dialog when there is nobody to attack', async () => {
  const hero = withHP(createCharacter('hero', 'Hero'), 12);
  const mage = withHP(createCharacter('mage', 'Mage'), 12);
  const app = stubApp({ characters: [hero, mage], creatures: [] });
  const combat = { order: [{ id: 'hero' }, { id: 'mage' }] };
  // The only other combatant is an allied character, which a hostile action
  // never reaches. A bystander creature would count as a defender now. The
  // dialog never opens, which is what keeps this reachable without a
  // browser.
  await weaponAttack(app, /** @type {any} */ (combat), combat.order[0], /** @type {any} */ (SWORD));
  assert.deepEqual(app.toastMessages, ['No defender left standing.']);
  assert.deepEqual(app.rolls, []);
});

test('weaponAttack ignores a participant nothing resolves', async () => {
  const app = stubApp({});
  const combat = { order: [{ id: 'ghost' }] };
  await weaponAttack(app, /** @type {any} */ (combat), combat.order[0], /** @type {any} */ (SWORD));
  assert.deepEqual(app.toastMessages, [], 'a ghost never reaches the dialog or the toast');
});

test('an armed NPC attacks with its own stats and proficiency', () => {
  const club = {
    name: 'Club',
    kind: 'melee',
    damage: [{ count: 1, sides: 4, damageType: 'bludgeoning' }],
  };
  const brigand = createCreature('brigand', 'Brigand', {
    location: HERE,
    disposition: 'hostile',
    stats: { STR: 16 },
    weapon: /** @type {any} */ (club),
  });
  const hero = withHP(createCharacter('hero', 'Hero'), 12);
  // A 15 on the d20 plus STR +3 plus proficiency +2 beats AC 10.
  const app = stubApp({ characters: [hero], creatures: [brigand], rng: scripted([d20(15)]) });
  rollWeaponAttack(app, {
    attacker: brigand,
    defender: { id: 'hero', name: 'Hero', ac: 10 },
    weapon: /** @type {any} */ (club),
    rng: scripted([2 / 4]),
  });
  assert.deepEqual(app.rolls, [{ selection: { counts: { d20: 1 }, modifier: 5 }, target: 10 }]);
  assert.match(app.log[0], /^Brigand attacks Hero with Club \(STR \+3, proficiency \+2\)/);
  assert.equal(getHP(app.state.characters[0]).current, 6, 'a d4 of 3 plus STR +3');
});

test('a caster NPC takes its proficiency from its caster level', () => {
  const fist = { name: 'Fist', kind: 'melee', damage: [{ count: 1, sides: 4 }] };
  const cultist = createCreature('cultist', 'Cultist', {
    location: HERE,
    disposition: 'hostile',
    class: 'cleric',
    casterLevel: 9,
    weapon: /** @type {any} */ (fist),
  });
  const hero = withHP(createCharacter('hero', 'Hero'), 12);
  const app = stubApp({ characters: [hero], creatures: [cultist], rng: scripted([d20(10)]) });
  rollWeaponAttack(app, {
    attacker: cultist,
    defender: { id: 'hero', name: 'Hero', ac: 20 },
    weapon: /** @type {any} */ (fist),
    rng: scripted([0]),
  });
  assert.match(app.log[0], /proficiency \+4\): 14 to hit vs AC 20 — miss\.$/);
});

test('a rider chip on the attacker joins the attack roll and the log', () => {
  const blessed = {
    ...makeHero({ STR: 16 }),
    conditions: [
      { name: 'Bless', rounds: 10, rider: { rolls: ['attack', 'save'], dice: 1, die: 'd4' } },
    ],
  };
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 20,
    stats: { AC: 12 },
    location: HERE,
    level: 1,
  });
  // A 5 on the d20 plus STR +3 plus proficiency +2 is 10, which misses AC 12.
  // The Bless d4 lands on 3, so the attack reaches 13 and hits.
  const app = stubApp({ characters: [blessed], creatures: [goblin], rng: scripted([d20(5)]) });
  rollWeaponAttack(app, {
    attacker: blessed,
    defender: { id: 'goblin', name: 'Goblin', ac: 12 },
    weapon: /** @type {any} */ (SWORD),
    rng: scripted([2 / 4, 4 / 8]),
  });
  assert.deepEqual(app.rolls, [{ selection: { counts: { d20: 1 }, modifier: 8 }, target: 12 }]);
  assert.match(app.log[0], /proficiency \+2, Bless \+1d4 \[3\]\): 13 to hit vs AC 12 — hit\.$/);
});

test('an attacker with no rider chip rolls exactly what it rolled before', () => {
  const hero = makeHero({ STR: 16 });
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 20,
    stats: { AC: 10 },
    location: HERE,
    level: 1,
  });
  const app = stubApp({ characters: [hero], creatures: [goblin], rng: scripted([d20(15)]) });
  rollWeaponAttack(app, {
    attacker: { ...hero, conditions: [{ name: 'Charmed', rounds: null }] },
    defender: { id: 'goblin', name: 'Goblin', ac: 10 },
    weapon: /** @type {any} */ (SWORD),
    rng: scripted([4 / 8]),
  });
  assert.deepEqual(app.rolls, [{ selection: { counts: { d20: 1 }, modifier: 5 }, target: 10 }]);
  assert.equal(/Bless|\[/.test(app.log[0]), false, 'nothing extra reaches the log');
});

test('a chip that slants nothing leaves the mode off the tray selection', () => {
  const hero = makeHero({ STR: 16 });
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 20,
    stats: { AC: 10 },
    location: HERE,
    level: 1,
  });
  const app = stubApp({ characters: [hero], creatures: [goblin], rng: scripted([d20(15)]) });
  rollWeaponAttack(app, {
    attacker: hero,
    defender: { id: 'goblin', name: 'Goblin', ac: 10, conditions: [] },
    weapon: /** @type {any} */ (SWORD),
    rng: scripted([4 / 8]),
  });
  // No mode key at all, so the tray's standing advantage toggle still applies.
  assert.equal('mode' in app.rolls[0].selection, false);
});

test('a poisoned attacker rolls at disadvantage and the log names the chip', () => {
  const hero = makeHero({ STR: 16 });
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 20,
    stats: { AC: 10 },
    location: HERE,
    level: 1,
  });
  const app = stubApp({ characters: [hero], creatures: [goblin], rng: scripted([d20(15)]) });
  rollWeaponAttack(app, {
    attacker: { ...hero, conditions: [{ name: 'Poisoned', rounds: null }] },
    defender: { id: 'goblin', name: 'Goblin', ac: 10, conditions: [] },
    weapon: /** @type {any} */ (SWORD),
    rng: scripted([4 / 8]),
  });
  assert.equal(app.rolls[0].selection.mode, 'disadvantage');
  assert.match(app.log[0], /proficiency \+2, Poisoned disadvantage\)/);
});

test('a prone defender helps a melee swing and hinders a ranged one', () => {
  const hero = makeHero({ STR: 16, DEX: 16 });
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 20,
    stats: { AC: 10 },
    location: HERE,
    level: 1,
  });
  const prone = { id: 'goblin', name: 'Goblin', ac: 10, conditions: [{ name: 'Prone' }] };
  const app = stubApp({ characters: [hero], creatures: [goblin], rng: scripted([d20(15)]) });
  rollWeaponAttack(app, {
    attacker: hero,
    defender: /** @type {any} */ (prone),
    weapon: /** @type {any} */ (SWORD),
    rng: scripted([4 / 8]),
  });
  assert.equal(app.rolls[0].selection.mode, 'advantage');
  rollWeaponAttack(app, {
    attacker: hero,
    defender: /** @type {any} */ (prone),
    weapon: /** @type {any} */ ({ ...SWORD, name: 'Bow', kind: 'ranged' }),
    rng: scripted([4 / 8]),
  });
  assert.equal(app.rolls[1].selection.mode, 'disadvantage');
});

test('the attacker and defender chips cancel to a straight roll', () => {
  const hero = makeHero({ STR: 16 });
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 20,
    stats: { AC: 10 },
    location: HERE,
    level: 1,
  });
  const app = stubApp({ characters: [hero], creatures: [goblin], rng: scripted([d20(15)]) });
  rollWeaponAttack(app, {
    attacker: { ...hero, conditions: [{ name: 'Blinded', rounds: null }] },
    defender: /** @type {any} */ ({
      id: 'goblin',
      name: 'Goblin',
      ac: 10,
      conditions: [{ name: 'Restrained' }],
    }),
    weapon: /** @type {any} */ (SWORD),
    rng: scripted([4 / 8]),
  });
  // A cancelled pair still names both chips, so the log says why the roll
  // came out straight.
  assert.equal(app.rolls[0].selection.mode, 'normal');
  assert.match(app.log[0], /Blinded disadvantage, Restrained advantage/);
});

test('a mode picked in the dialog reaches the roll and the log names the GM', () => {
  const hero = makeHero({ STR: 16 });
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 20,
    stats: { AC: 10 },
    location: HERE,
    level: 1,
  });
  const app = stubApp({ characters: [hero], creatures: [goblin], rng: scripted([d20(15)]) });
  rollWeaponAttack(app, {
    attacker: hero,
    defender: { id: 'goblin', name: 'Goblin', ac: 10, conditions: [] },
    weapon: /** @type {any} */ (SWORD),
    tweaks: { mode: 'advantage' },
    rng: scripted([4 / 8]),
  });
  assert.equal(app.rolls[0].selection.mode, 'advantage');
  assert.match(app.log[0], /advantage set by the GM/);
});

test('a picked mode beats the chips, including a picked straight roll', () => {
  const hero = makeHero({ STR: 16 });
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 20,
    stats: { AC: 10 },
    location: HERE,
    level: 1,
  });
  const poisoned = { ...hero, conditions: [{ name: 'Poisoned', rounds: null }] };
  const app = stubApp({ characters: [hero], creatures: [goblin], rng: scripted([d20(15)]) });
  // The chip alone would roll this at disadvantage.
  rollWeaponAttack(app, {
    attacker: poisoned,
    defender: { id: 'goblin', name: 'Goblin', ac: 10, conditions: [] },
    weapon: /** @type {any} */ (SWORD),
    tweaks: { mode: 'advantage' },
    rng: scripted([4 / 8]),
  });
  assert.equal(app.rolls[0].selection.mode, 'advantage');
  // A picked `normal` is passed on rather than left off, so it also cancels
  // the dice tray's standing toggle for this roll.
  rollWeaponAttack(app, {
    attacker: poisoned,
    defender: { id: 'goblin', name: 'Goblin', ac: 10, conditions: [] },
    weapon: /** @type {any} */ (SWORD),
    tweaks: { mode: 'normal' },
    rng: scripted([4 / 8]),
  });
  assert.equal(app.rolls[1].selection.mode, 'normal');
  assert.equal(/Poisoned/.test(app.log[2]), false, 'the chip no longer explains the roll');
});

test('an auto mode leaves the chips in charge', () => {
  const hero = makeHero({ STR: 16 });
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 20,
    stats: { AC: 10 },
    location: HERE,
    level: 1,
  });
  const app = stubApp({ characters: [hero], creatures: [goblin], rng: scripted([d20(15)]) });
  rollWeaponAttack(app, {
    attacker: { ...hero, conditions: [{ name: 'Poisoned', rounds: null }] },
    defender: { id: 'goblin', name: 'Goblin', ac: 10, conditions: [] },
    weapon: /** @type {any} */ (SWORD),
    tweaks: { mode: 'auto' },
    rng: scripted([4 / 8]),
  });
  assert.equal(app.rolls[0].selection.mode, 'disadvantage');
  assert.match(app.log[0], /Poisoned disadvantage/);
});

test('a melee hit on an unconscious defender crits without a natural 20', () => {
  const hero = makeHero({ STR: 16 });
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 40,
    stats: { AC: 10 },
    location: HERE,
    level: 1,
  });
  const app = stubApp({ characters: [hero], creatures: [goblin], rng: scripted([d20(15)]) });
  rollWeaponAttack(app, {
    attacker: hero,
    defender: /** @type {any} */ ({
      id: 'goblin',
      name: 'Goblin',
      ac: 10,
      conditions: [{ name: 'Unconscious' }],
    }),
    weapon: /** @type {any} */ (SWORD),
    rng: () => 0.999,
  });
  assert.match(app.log[0], /— critical hit\.$/);
  // Two sword dice at 8 plus the STR modifier of 3.
  assert.equal(app.state.creatures[0].currentHP, 40 - 19);
});

test('a ranged hit on an unconscious defender stays an ordinary hit', () => {
  const hero = makeHero({ DEX: 16 });
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 40,
    stats: { AC: 10 },
    location: HERE,
    level: 1,
  });
  const app = stubApp({ characters: [hero], creatures: [goblin], rng: scripted([d20(15)]) });
  rollWeaponAttack(app, {
    attacker: hero,
    defender: /** @type {any} */ ({
      id: 'goblin',
      name: 'Goblin',
      ac: 10,
      conditions: [{ name: 'Unconscious' }],
    }),
    weapon: /** @type {any} */ ({ ...SWORD, name: 'Bow', kind: 'ranged' }),
    rng: () => 0.999,
  });
  assert.match(app.log[0], /— hit\.$/);
  // One bow die at 8 plus the DEX modifier of 3.
  assert.equal(app.state.creatures[0].currentHP, 40 - 11);
});

test('a character without the proficiency loses the bonus and the log says so', () => {
  const untrained = withHP(createCharacter('hero', 'Hero', { STR: 16 }), 12);
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 20,
    stats: { AC: 10 },
    location: HERE,
    level: 1,
  });
  const app = stubApp({ characters: [untrained], creatures: [goblin], rng: scripted([d20(15)]) });
  rollWeaponAttack(app, {
    attacker: untrained,
    defender: { id: 'goblin', name: 'Goblin', ac: 10 },
    weapon: /** @type {any} */ (SWORD),
    rng: scripted([4 / 8]),
  });
  // STR +3 alone, with no proficiency on top.
  assert.deepEqual(app.rolls, [{ selection: { counts: { d20: 1 }, modifier: 3 }, target: 10 }]);
  assert.match(app.log[0], /\(STR \+3, not proficient\): 18 to hit/);
});

test('a named weapon grant matches whatever case the item name uses', () => {
  const base = withHP(createCharacter('hero', 'Hero', { STR: 16 }), 12);
  const named = {
    ...base,
    proficiencies: {
      ...base.proficiencies,
      weapons: { categories: [], named: ['sword'] },
    },
  };
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 20,
    stats: { AC: 10 },
    location: HERE,
    level: 1,
  });
  const app = stubApp({ characters: [named], creatures: [goblin], rng: scripted([d20(15)]) });
  rollWeaponAttack(app, {
    attacker: named,
    defender: { id: 'goblin', name: 'Goblin', ac: 10 },
    weapon: /** @type {any} */ (SWORD),
    rng: scripted([4 / 8]),
  });
  assert.deepEqual(app.rolls, [{ selection: { counts: { d20: 1 }, modifier: 5 }, target: 10 }]);
  assert.match(app.log[0], /proficiency \+2/);
});

test('a two-handed swing of a versatile weapon rolls the two-handed dice', () => {
  const hero = makeHero({ STR: 16 });
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 40,
    stats: { AC: 10 },
    location: HERE,
    level: 1,
  });
  const longsword = {
    ...SWORD,
    name: 'Longsword',
    properties: ['versatile'],
    versatileDamage: [{ count: 1, sides: 10, damageType: 'slashing' }],
  };
  const app = stubApp({ characters: [hero], creatures: [goblin], rng: scripted([d20(15)]) });
  rollWeaponAttack(app, {
    attacker: hero,
    defender: { id: 'goblin', name: 'Goblin', ac: 10 },
    weapon: /** @type {any} */ (longsword),
    tweaks: { twoHanded: true },
    rng: () => 0.999,
  });
  // The d10 at its maximum plus the STR modifier, instead of the d8.
  assert.equal(app.state.creatures[0].currentHP, 40 - 13);
});

test('a long-range shot rolls at disadvantage and the log names the range', () => {
  const hero = makeHero({ DEX: 16 });
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 20,
    stats: { AC: 10 },
    location: HERE,
    level: 1,
  });
  const bow = { ...SWORD, name: 'Bow', kind: 'ranged', range: { normal: 80, long: 320 } };
  const app = stubApp({ characters: [hero], creatures: [goblin], rng: scripted([d20(15)]) });
  rollWeaponAttack(app, {
    attacker: hero,
    defender: { id: 'goblin', name: 'Goblin', ac: 10, conditions: [] },
    weapon: /** @type {any} */ (bow),
    tweaks: { longRange: true },
    rng: scripted([4 / 8]),
  });
  assert.equal(app.rolls[0].selection.mode, 'disadvantage');
  assert.match(app.log[0], /long range disadvantage/);
});

test('an advantage chip and a long-range shot cancel to a straight roll', () => {
  const hero = makeHero({ DEX: 16 });
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 20,
    stats: { AC: 10 },
    location: HERE,
    level: 1,
  });
  const bow = { ...SWORD, name: 'Bow', kind: 'ranged', range: { normal: 80, long: 320 } };
  const app = stubApp({ characters: [hero], creatures: [goblin], rng: scripted([d20(15)]) });
  rollWeaponAttack(app, {
    attacker: hero,
    defender: /** @type {any} */ ({
      id: 'goblin',
      name: 'Goblin',
      ac: 10,
      conditions: [{ name: 'Restrained' }],
    }),
    weapon: /** @type {any} */ (bow),
    tweaks: { longRange: true },
    rng: scripted([4 / 8]),
  });
  // The log still names both slants, so the straight roll explains itself.
  assert.equal(app.rolls[0].selection.mode, 'normal');
  assert.match(app.log[0], /Restrained advantage, long range disadvantage/);
});

test('a GM-picked mode beats the long-range slant', () => {
  const hero = makeHero({ DEX: 16 });
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 20,
    stats: { AC: 10 },
    location: HERE,
    level: 1,
  });
  const bow = { ...SWORD, name: 'Bow', kind: 'ranged', range: { normal: 80, long: 320 } };
  const app = stubApp({ characters: [hero], creatures: [goblin], rng: scripted([d20(15)]) });
  rollWeaponAttack(app, {
    attacker: hero,
    defender: { id: 'goblin', name: 'Goblin', ac: 10, conditions: [] },
    weapon: /** @type {any} */ (bow),
    tweaks: { mode: 'advantage', longRange: true },
    rng: scripted([4 / 8]),
  });
  assert.equal(app.rolls[0].selection.mode, 'advantage');
  assert.match(app.log[0], /advantage set by the GM/);
  assert.equal(/long range/.test(app.log[0]), false, 'the pick replaces the slant reasons');
});

test('untrained armor slants the attack roll and the log names the armor', () => {
  let hero = makeHero({ STR: 16 });
  hero = /** @type {any} */ (
    addItem(hero, {
      id: 'plate',
      name: 'Plate',
      type: 'armor',
      armorWeight: 'heavy',
      baseAC: 18,
      quantity: 1,
      notes: '',
    })
  );
  hero = /** @type {any} */ (equip(hero, 'chest', 'plate'));
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 20,
    stats: { AC: 10 },
    location: HERE,
    level: 1,
  });
  const app = stubApp({ characters: [hero], creatures: [goblin], rng: scripted([d20(15)]) });
  rollWeaponAttack(app, {
    attacker: hero,
    defender: { id: 'goblin', name: 'Goblin', ac: 10, conditions: [] },
    weapon: /** @type {any} */ (SWORD),
    rng: scripted([4 / 8]),
  });
  assert.equal(app.rolls[0].selection.mode, 'disadvantage');
  assert.match(app.log[0], /not proficient with heavy armor, disadvantage/);
});

test('an advantage chip cancels the untrained-armor slant', () => {
  let hero = makeHero({ STR: 16 });
  hero = /** @type {any} */ (
    addItem(hero, {
      id: 'plate',
      name: 'Plate',
      type: 'armor',
      armorWeight: 'heavy',
      baseAC: 18,
      quantity: 1,
      notes: '',
    })
  );
  hero = /** @type {any} */ (equip(hero, 'chest', 'plate'));
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 20,
    stats: { AC: 10 },
    location: HERE,
    level: 1,
  });
  const app = stubApp({ characters: [hero], creatures: [goblin], rng: scripted([d20(15)]) });
  rollWeaponAttack(app, {
    attacker: hero,
    defender: /** @type {any} */ ({
      id: 'goblin',
      name: 'Goblin',
      ac: 10,
      conditions: [{ name: 'Restrained' }],
    }),
    weapon: /** @type {any} */ (SWORD),
    rng: scripted([4 / 8]),
  });
  assert.equal(app.rolls[0].selection.mode, 'normal');
});

test('a trained wearer and a creature never carry the armor slant', () => {
  let hero = makeHero({ STR: 16 });
  hero = /** @type {any} */ (
    addItem(hero, {
      id: 'plate',
      name: 'Plate',
      type: 'armor',
      armorWeight: 'heavy',
      baseAC: 18,
      quantity: 1,
      notes: '',
    })
  );
  hero = /** @type {any} */ (equip(hero, 'chest', 'plate'));
  hero = /** @type {any} */ (withProficiencies(hero, { armor: ['heavy'] }));
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 20,
    stats: { AC: 10 },
    location: HERE,
    level: 1,
  });
  const app = stubApp({ characters: [hero], creatures: [goblin], rng: scripted([d20(15)]) });
  rollWeaponAttack(app, {
    attacker: hero,
    defender: { id: 'goblin', name: 'Goblin', ac: 10, conditions: [] },
    weapon: /** @type {any} */ (SWORD),
    rng: scripted([4 / 8]),
  });
  assert.equal(app.rolls[0].selection.mode, undefined, 'nothing slants the roll');
  rollWeaponAttack(app, {
    attacker: goblin,
    defender: { id: 'hero', name: 'Hero', ac: 12, conditions: [] },
    weapon: /** @type {any} */ (SWORD),
    rng: scripted([4 / 8]),
  });
  assert.equal(app.rolls[1].selection.mode, undefined, 'a creature wears no tracked armor');
});

test('a thrown melee weapon rolls as a ranged attack for the throw', () => {
  const hero = makeHero({ STR: 16 });
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 20,
    stats: { AC: 10 },
    location: HERE,
    level: 1,
  });
  const dagger = {
    ...SWORD,
    name: 'Dagger',
    properties: ['thrown'],
    range: { normal: 20, long: 60 },
  };
  const app = stubApp({ characters: [hero], creatures: [goblin], rng: scripted([d20(15)]) });
  /** @type {any} */
  const prone = { id: 'goblin', name: 'Goblin', ac: 10, conditions: [{ name: 'Prone' }] };
  rollWeaponAttack(app, {
    attacker: hero,
    defender: prone,
    weapon: /** @type {any} */ (dagger),
    rng: scripted([4 / 8]),
  });
  assert.equal(app.rolls[0].selection.mode, 'advantage', 'a stab is still melee');
  rollWeaponAttack(app, {
    attacker: hero,
    defender: prone,
    weapon: /** @type {any} */ (dagger),
    tweaks: { thrown: true },
    rng: scripted([4 / 8]),
  });
  assert.equal(
    app.rolls[1].selection.mode,
    'disadvantage',
    'a throw is a ranged attack, so a prone target is harder to hit',
  );
});

test('exhaustion lowers an attack roll, and the log names the level', () => {
  const hero = { ...makeHero({ STR: 16 }), exhaustion: 2 };
  const app = stubApp({ characters: [hero], rng: scripted([d20(15)]) });
  rollWeaponAttack(app, {
    attacker: hero,
    defender: { id: 'goblin', name: 'Goblin', ac: 10 },
    weapon: /** @type {any} */ (SWORD),
    rng: scripted([4 / 8]),
  });
  // STR +3 and proficiency +2, less 4 for two levels of exhaustion.
  assert.equal(app.rolls[0].selection.modifier, 1);
  assert.match(
    app.log[0],
    /^Hero attacks Goblin with Sword \(STR \+3, proficiency \+2, exhaustion 2 -4\): 16 to hit/,
  );
});

test('a tired creature swings at the same penalty, and its damage is untouched', () => {
  const goblin = {
    ...createCreature('goblin', 'Goblin', {
      disposition: 'hostile',
      maxHP: 20,
      stats: { STR: 16, AC: 10 },
      location: HERE,
      level: 1,
    }),
    exhaustion: 3,
  };
  const hero = makeHero({ STR: 10 });
  const app = stubApp({ characters: [hero], creatures: [goblin], rng: scripted([d20(20)]) });
  rollWeaponAttack(app, {
    attacker: goblin,
    defender: { id: 'hero', name: 'Hero', ac: 10 },
    weapon: /** @type {any} */ (SWORD),
    rng: scripted([4 / 8]),
  });
  // STR +3 and proficiency +2, less 6. A creature is always proficient.
  assert.equal(app.rolls[0].selection.modifier, -1);
  assert.match(app.log[0], /exhaustion 3 -6\): 19 to hit/);
  assert.match(app.log[1], /\+3\]\.$/, 'the damage keeps the whole ability modifier');
});
