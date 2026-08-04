import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  attackParticipants,
  readAttackTweaks,
  rollWeaponAttack,
  weaponAttack,
} from '../src/app/weaponAttack.js';
import { roll } from '../src/dice/DiceRoller.js';
import { createCharacter, withHP, getHP } from '../src/entities/Character.js';
import { createEncounter } from '../src/entities/Encounter.js';
import { createNPC } from '../src/entities/NPC.js';
import { stubApp as baseStubApp } from './helpers/app.js';

const HERE = { nodeId: 'n1', tileId: '0,0' };

/** A sword with one damage die, in the inventory shape a character carries. */
const SWORD = {
  id: 'sword',
  name: 'Sword',
  type: 'weapon',
  handling: 'melee',
  quantity: 1,
  notes: '',
  damage: [{ count: 1, sides: 8, damageType: 'slashing' }],
};

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
 * @param {{ characters?: any[], encounters?: any[], npcs?: any[], rng?: () => number }} [opts]
 */
function stubApp({ characters = [], encounters = [], npcs = [], rng = () => 0.5 } = {}) {
  const app = baseStubApp({
    state: { characters, encounters, npcs },
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
      'atk-count': '1',
      'atk-die': 'd6',
      'atk-flat': '2',
      'dmg-count': '3',
      'dmg-die': 'd8',
      'dmg-flat': '-1',
    }),
    {
      attackDice: 1,
      attackDie: 'd6',
      attackFlat: 2,
      damageDice: 3,
      damageDie: 'd8',
      damageFlat: -1,
    },
  );
  assert.deepEqual(readAttackTweaks({}), {
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

test('attackParticipants names the attacker and who is left to attack', () => {
  const hero = withHP(createCharacter('hero', 'Hero', { STR: 16 }), 12);
  const goblin = createEncounter('goblin', 'Goblin', 10, { AC: 13 }, HERE);
  const app = stubApp({ characters: [hero], encounters: [goblin] });
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
  const brigand = createNPC('brigand', 'Brigand', { location: HERE, disposition: 'hostile' });
  const app = stubApp({ characters: [hero], npcs: [brigand] });
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
  const hero = withHP(createCharacter('hero', 'Hero', { STR: 16 }), 12);
  const goblin = createEncounter('goblin', 'Goblin', 20, { AC: 10 }, HERE);
  // A 15 on the d20 plus STR +3 plus proficiency +2 beats AC 10. The damage
  // die then lands on 5.
  const app = stubApp({
    characters: [hero],
    encounters: [goblin],
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
  assert.equal(app.state.encounters[0].currentHP, 20 - 8);
  assert.match(app.toastMessages[0], /^Hit! Goblin takes /);
});

test('a natural 20 crits, doubles the damage dice, and says so', () => {
  const hero = withHP(createCharacter('hero', 'Hero', { STR: 16 }), 12);
  const goblin = createEncounter('goblin', 'Goblin', 40, { AC: 25 }, HERE);
  // Both damage dice land on 8, so the crit total is unmistakable.
  const app = stubApp({ characters: [hero], encounters: [goblin], rng: scripted([d20(20)]) });
  rollWeaponAttack(app, {
    attacker: hero,
    defender: { id: 'goblin', name: 'Goblin', ac: 25 },
    weapon: /** @type {any} */ (SWORD),
    rng: scripted([7 / 8]),
  });
  assert.match(app.log[0], /— critical hit\.$/, 'a natural 20 beats any AC');
  assert.match(app.log[1], /^Sword critically hits Goblin for /);
  // Two dice at 8 plus the STR modifier of 3.
  assert.equal(app.state.encounters[0].currentHP, 40 - 19);
  assert.match(app.toastMessages[0], /^Critical hit!/);
});

test('a miss logs the roll, says who missed, and lands no damage', () => {
  const hero = withHP(createCharacter('hero', 'Hero', { STR: 16 }), 12);
  const goblin = createEncounter('goblin', 'Goblin', 20, { AC: 25 }, HERE);
  const app = stubApp({
    characters: [hero],
    encounters: [goblin],
    rng: scripted([d20(5)]),
  });
  rollWeaponAttack(app, {
    attacker: hero,
    defender: { id: 'goblin', name: 'Goblin', ac: 25 },
    weapon: /** @type {any} */ (SWORD),
  });
  assert.equal(app.log.length, 1, 'a miss logs the attack and nothing else');
  assert.match(app.log[0], /— miss\.$/);
  assert.equal(app.state.encounters[0].currentHP, 20);
  assert.deepEqual(app.toastMessages, ['10 vs AC 25: Hero misses Goblin.']);
});

test('a natural 1 misses however high the total', () => {
  const hero = withHP(createCharacter('hero', 'Hero', { STR: 20 }), 12);
  const goblin = createEncounter('goblin', 'Goblin', 20, { AC: 2 }, HERE);
  const app = stubApp({
    characters: [hero],
    encounters: [goblin],
    rng: scripted([d20(1)]),
  });
  rollWeaponAttack(app, {
    attacker: hero,
    defender: { id: 'goblin', name: 'Goblin', ac: 2 },
    weapon: /** @type {any} */ (SWORD),
  });
  assert.match(app.log[0], /— natural 1, miss\.$/);
  assert.equal(app.state.encounters[0].currentHP, 20);
});

test('bonus attack dice join the d20 in the tray and are named in the log', () => {
  const hero = withHP(createCharacter('hero', 'Hero', { STR: 16 }), 12);
  const goblin = createEncounter('goblin', 'Goblin', 20, { AC: 10 }, HERE);
  const app = stubApp({
    characters: [hero],
    encounters: [goblin],
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
  const hero = withHP(createCharacter('hero', 'Hero', { STR: 16 }), 12);
  const goblin = createEncounter('goblin', 'Goblin', 20, { AC: 10 }, HERE);
  const app = stubApp({
    characters: [hero],
    encounters: [goblin],
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
  const hero = withHP(createCharacter('hero', 'Hero', { STR: 16 }), 12);
  const goblin = createEncounter('goblin', 'Goblin', 40, { AC: 10 }, HERE);
  // The attack d20 lands on 15, then every damage die lands on its maximum.
  const app = stubApp({ characters: [hero], encounters: [goblin], rng: scripted([d20(15)]) });
  rollWeaponAttack(app, {
    attacker: hero,
    defender: { id: 'goblin', name: 'Goblin', ac: 10 },
    weapon: /** @type {any} */ (SWORD),
    tweaks: { damageDice: 2, damageDie: 'd6', damageFlat: 1 },
    rng: () => 0.999,
  });
  // 8 on the sword, 6 and 6 on the bonus dice, STR +3, and the flat +1.
  assert.equal(app.state.encounters[0].currentHP, 40 - 24);
});

test('an advantage roll names the die it threw away', () => {
  const hero = withHP(createCharacter('hero', 'Hero', { STR: 16 }), 12);
  const goblin = createEncounter('goblin', 'Goblin', 20, { AC: 10 }, HERE);
  const app = stubApp({ characters: [hero], encounters: [goblin] });
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
  const goblin = createEncounter(
    'goblin',
    'Goblin',
    10,
    { STR: 14 },
    HERE,
    /** @type {any} */ ({
      weapon: { name: 'Club', handling: 'melee', damage: [{ count: 1, sides: 4 }] },
    }),
  );
  const hero = withHP(createCharacter('hero', 'Hero'), 20);
  const app = stubApp({ characters: [hero], encounters: [goblin], rng: scripted([d20(18)]) });
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
  const hero = withHP(createCharacter('hero', 'Hero', { STR: 16 }), 12);
  const goblin = createEncounter('goblin', 'Goblin', 20, { AC: 10 }, HERE);
  const app = stubApp({
    characters: [hero],
    encounters: [goblin],
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
  const goblin = createEncounter('goblin', 'Goblin', 20, { AC: 10 }, HERE);
  const app = stubApp({
    characters: [hero],
    encounters: [goblin],
    rng: scripted([d20(15)]),
  });
  rollWeaponAttack(app, {
    attacker: hero,
    defender: { id: 'goblin', name: 'Goblin', ac: 10 },
    weapon: /** @type {any} */ ({ name: 'Fist' }),
  });
  assert.match(app.log[1], /^Fist hits Goblin for 0 damage\.$/);
  assert.equal(app.state.encounters[0].currentHP, 20, 'no damage means no write');
  assert.match(app.toastMessages[0], /Goblin takes no damage\.$/);
});

test('weaponAttack stops before the dialog when there is nobody to attack', async () => {
  const hero = withHP(createCharacter('hero', 'Hero'), 12);
  const sage = createNPC('sage', 'Sage', { location: HERE });
  const app = stubApp({ characters: [hero], npcs: [sage] });
  const combat = { order: [{ id: 'hero' }, { id: 'sage' }] };
  // The only other combatant is on the party's own side, so no defender is
  // left. The dialog never opens, which is what keeps this reachable without
  // a browser.
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
    handling: 'melee',
    damage: [{ count: 1, sides: 4, damageType: 'bludgeoning' }],
  };
  const brigand = createNPC('brigand', 'Brigand', {
    location: HERE,
    disposition: 'hostile',
    stats: { STR: 16 },
    weapon: /** @type {any} */ (club),
  });
  const hero = withHP(createCharacter('hero', 'Hero'), 12);
  // A 15 on the d20 plus STR +3 plus proficiency +2 beats AC 10.
  const app = stubApp({ characters: [hero], npcs: [brigand], rng: scripted([d20(15)]) });
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
  const fist = { name: 'Fist', handling: 'melee', damage: [{ count: 1, sides: 4 }] };
  const cultist = createNPC('cultist', 'Cultist', {
    location: HERE,
    disposition: 'hostile',
    class: 'cleric',
    casterLevel: 9,
    weapon: /** @type {any} */ (fist),
  });
  const hero = withHP(createCharacter('hero', 'Hero'), 12);
  const app = stubApp({ characters: [hero], npcs: [cultist], rng: scripted([d20(10)]) });
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
    ...withHP(createCharacter('hero', 'Hero', { STR: 16 }), 12),
    conditions: [
      { name: 'Bless', rounds: 10, rider: { rolls: ['attack', 'save'], dice: 1, die: 'd4' } },
    ],
  };
  const goblin = createEncounter('goblin', 'Goblin', 20, { AC: 12 }, HERE);
  // A 5 on the d20 plus STR +3 plus proficiency +2 is 10, which misses AC 12.
  // The Bless d4 lands on 3, so the attack reaches 13 and hits.
  const app = stubApp({ characters: [blessed], encounters: [goblin], rng: scripted([d20(5)]) });
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
  const hero = withHP(createCharacter('hero', 'Hero', { STR: 16 }), 12);
  const goblin = createEncounter('goblin', 'Goblin', 20, { AC: 10 }, HERE);
  const app = stubApp({ characters: [hero], encounters: [goblin], rng: scripted([d20(15)]) });
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
  const hero = withHP(createCharacter('hero', 'Hero', { STR: 16 }), 12);
  const goblin = createEncounter('goblin', 'Goblin', 20, { AC: 10 }, HERE);
  const app = stubApp({ characters: [hero], encounters: [goblin], rng: scripted([d20(15)]) });
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
  const hero = withHP(createCharacter('hero', 'Hero', { STR: 16 }), 12);
  const goblin = createEncounter('goblin', 'Goblin', 20, { AC: 10 }, HERE);
  const app = stubApp({ characters: [hero], encounters: [goblin], rng: scripted([d20(15)]) });
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
  const hero = withHP(createCharacter('hero', 'Hero', { STR: 16, DEX: 16 }), 12);
  const goblin = createEncounter('goblin', 'Goblin', 20, { AC: 10 }, HERE);
  const prone = { id: 'goblin', name: 'Goblin', ac: 10, conditions: [{ name: 'Prone' }] };
  const app = stubApp({ characters: [hero], encounters: [goblin], rng: scripted([d20(15)]) });
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
    weapon: /** @type {any} */ ({ ...SWORD, name: 'Bow', handling: 'ranged' }),
    rng: scripted([4 / 8]),
  });
  assert.equal(app.rolls[1].selection.mode, 'disadvantage');
});

test('the attacker and defender chips cancel to a straight roll', () => {
  const hero = withHP(createCharacter('hero', 'Hero', { STR: 16 }), 12);
  const goblin = createEncounter('goblin', 'Goblin', 20, { AC: 10 }, HERE);
  const app = stubApp({ characters: [hero], encounters: [goblin], rng: scripted([d20(15)]) });
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

test('a melee hit on an unconscious defender crits without a natural 20', () => {
  const hero = withHP(createCharacter('hero', 'Hero', { STR: 16 }), 12);
  const goblin = createEncounter('goblin', 'Goblin', 40, { AC: 10 }, HERE);
  const app = stubApp({ characters: [hero], encounters: [goblin], rng: scripted([d20(15)]) });
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
  assert.equal(app.state.encounters[0].currentHP, 40 - 19);
});

test('a ranged hit on an unconscious defender stays an ordinary hit', () => {
  const hero = withHP(createCharacter('hero', 'Hero', { DEX: 16 }), 12);
  const goblin = createEncounter('goblin', 'Goblin', 40, { AC: 10 }, HERE);
  const app = stubApp({ characters: [hero], encounters: [goblin], rng: scripted([d20(15)]) });
  rollWeaponAttack(app, {
    attacker: hero,
    defender: /** @type {any} */ ({
      id: 'goblin',
      name: 'Goblin',
      ac: 10,
      conditions: [{ name: 'Unconscious' }],
    }),
    weapon: /** @type {any} */ ({ ...SWORD, name: 'Bow', handling: 'ranged' }),
    rng: () => 0.999,
  });
  assert.match(app.log[0], /— hit\.$/);
  // One bow die at 8 plus the DEX modifier of 3.
  assert.equal(app.state.encounters[0].currentHP, 40 - 11);
});
