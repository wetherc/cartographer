import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hitSaveLine, hitSaveOf, normalizeHitSave } from '../src/combat/HitSave.js';
import { attackTraitFields } from '../src/entities/CreatureAttacks.js';
import { copyEnemyWeapon } from '../src/entities/EquipmentPresets.js';
import { createCreature } from '../src/entities/Creature.js';
import { createCharacter, withHP } from '../src/entities/Character.js';
import { createParticipant } from '../src/combat/Initiative.js';
import { prepareSwing, attackLine } from '../src/combat/WeaponSwing.js';
import { readAttackTweaks } from '../src/combat/AttackTweaks.js';
import { attackDialog } from '../src/app/attackFields.js';
import { rollHitSave } from '../src/app/weaponAttack.js';
import { creatureFields } from '../src/view/forms/creatureFields.js';
import { readCreatureFields } from '../src/view/forms/creatureRead.js';
import { gearOptions } from '../src/view/forms/gearFields.js';
import { STAT_KEYS } from '../src/entities/Modifiers.js';
import { stubApp } from './helpers/app.js';

const HERE = { nodeId: 'n1', tileId: '0,0' };
const RIDER = { ability: 'STR', dc: 11, condition: 'Prone' };
const BITE = /** @type {any} */ ({
  name: 'Bite',
  kind: 'melee',
  category: null,
  damage: [{ count: 2, sides: 4, damageType: 'piercing' }],
  onHitSave: RIDER,
});
const wolf = createCreature('wolf', 'Wolf', {
  disposition: 'hostile',
  maxHP: 11,
  location: HERE,
  weapons: [BITE],
  packTactics: true,
});

test('normalizeHitSave cleans a rider and refuses one that names nothing known', () => {
  assert.deepEqual(normalizeHitSave({ ability: 'str', dc: '11', condition: 'prone' }), RIDER);
  assert.equal(normalizeHitSave({ ability: 'STR', dc: 99, condition: 'Prone' })?.dc, 30);
  assert.equal(normalizeHitSave({ ability: 'LUCK', dc: 11, condition: 'Prone' }), null);
  assert.equal(normalizeHitSave({ ability: 'STR', dc: 0, condition: 'Prone' }), null);
  assert.equal(normalizeHitSave({ ability: 'STR', dc: 11, condition: 'Sleepy' }), null);
  assert.equal(normalizeHitSave({}), null);
  assert.equal(normalizeHitSave(null), null);
});

test('hitSaveOf reads the rider of a creature weapon and none from other weapons', () => {
  assert.deepEqual(hitSaveOf(BITE), RIDER);
  assert.equal(hitSaveOf({ name: 'Sword' }), null);
});

test('hitSaveLine states the total, the DC, and the result', () => {
  const base = { defenderName: 'Mira', weaponName: 'Bite', rider: RIDER, total: 9 };
  assert.equal(
    hitSaveLine({ ...base, success: false }),
    'Bite: Mira rolls 9 on a DC 11 STR save and fails and is Prone.',
  );
  assert.equal(
    hitSaveLine({ ...base, total: 14, success: true }),
    'Bite: Mira rolls 14 on a DC 11 STR save and resists.',
  );
});

test('copyEnemyWeapon keeps a clean rider and drops a broken one', () => {
  assert.deepEqual(copyEnemyWeapon(BITE).onHitSave, RIDER);
  assert.notEqual(copyEnemyWeapon(BITE).onHitSave, RIDER);
  assert.equal('onHitSave' in copyEnemyWeapon({ ...BITE, onHitSave: { dc: 3 } }), false);
});

test('Pack Tactics stores only a true flag', () => {
  assert.deepEqual(attackTraitFields({ packTactics: true }), { packTactics: true });
  assert.deepEqual(attackTraitFields({ packTactics: 'yes' }), {});
  assert.equal(wolf.packTactics, true);
});

const hero = withHP(createCharacter('hero', 'Hero'), 20);
const target = { id: 'hero', name: 'Hero', ac: 12, conditions: [] };

test('the attack dialog offers the Pack Tactics box only to a creature with the trait', () => {
  const fieldsOf = (/** @type {any} */ attacker) =>
    attackDialog({
      attacker,
      defenders: [target],
      participant: createParticipant(attacker.id),
      weapon: BITE,
      defenderId: null,
      offhand: false,
      reaction: false,
    }).fields.map((f) => f.name);
  assert.ok(fieldsOf(wolf).includes('pack'));
  assert.ok(!fieldsOf({ ...wolf, packTactics: undefined }).includes('pack'));
});

test('a ticked Pack Tactics box rolls with advantage and names it in the log', () => {
  const tweaks = readAttackTweaks({ pack: '1' });
  assert.equal(tweaks.pack, true);
  const setup = prepareSwing({
    attacker: wolf,
    defender: target,
    weapon: BITE,
    tweaks,
    rng: () => 0.5,
  });
  assert.equal(setup.mode, 'advantage');
  const line = attackLine(setup, {
    attacker: wolf,
    defender: target,
    weapon: BITE,
    tweaks,
    swingNote: '',
    total: 15,
    d20: undefined,
    rollMode: 'advantage',
    raised: 0,
    wardName: null,
    outcome: 'hit',
  });
  assert.match(line, /Pack Tactics advantage/);
  const plain = prepareSwing({
    attacker: wolf,
    defender: target,
    weapon: BITE,
    tweaks: {},
    rng: () => 0.5,
  });
  assert.equal(plain.mode, null);
});

/** A fight holding the hero, with a recorder for the log. */
function app(heroHP = 20) {
  return stubApp({
    state: /** @type {any} */ ({
      characters: [withHP(createCharacter('hero', 'Hero'), heroHP)],
      creatures: [wolf],
      combat: { order: [{ id: 'wolf' }, { id: 'hero' }] },
    }),
    partyTracker: /** @type {any} */ ({ getPosition: () => HERE }),
  });
}

test('a failed rider save knocks the defender prone and logs it', () => {
  const a = app();
  rollHitSave(a, 'hero', BITE, () => 0);
  assert.match(a.log[0], /^Bite: Hero rolls \d+ on a DC 11 STR save and fails and is Prone\.$/);
  assert.ok(a.state.characters[0].conditions.some((c) => c.name === 'Prone'));
});

test('a passed rider save leaves the defender standing', () => {
  const a = app();
  rollHitSave(a, 'hero', BITE, () => 0.99);
  assert.match(a.log[0], /resists\.$/);
  assert.equal(a.state.characters[0].conditions.length, 0);
});

test('a downed defender, an unknown one, or a plain weapon rolls no rider save', () => {
  const a = app(0);
  rollHitSave(a, 'hero', BITE, () => 0);
  rollHitSave(a, 'ghost', BITE, () => 0);
  rollHitSave(app(), 'hero', { ...BITE, onHitSave: undefined }, () => 0);
  assert.deepEqual(a.log, []);
});

test('the creature form fills and reads the Pack Tactics box and the on-hit save', () => {
  const gear = gearOptions(wolf);
  const fields = creatureFields(wolf, gear);
  const value = (/** @type {string} */ name) => fields.find((f) => f.name === name)?.value;
  assert.equal(value('packTactics'), true);
  assert.equal(value('hitSaveAbility'), 'STR');
  assert.equal(value('hitSaveDC'), 11);
  assert.equal(value('hitSaveCondition'), 'Prone');
  const values = {
    name: 'Wolf',
    role: '',
    disposition: 'hostile',
    notes: '',
    maxHP: '11',
    level: '',
    tier: 'mob',
    cr: '',
    weapon: 'Bite',
    armor: '',
    casterClass: '',
    packTactics: '1',
    hitSaveAbility: 'DEX',
    hitSaveDC: '12',
    hitSaveCondition: 'Restrained',
    ...Object.fromEntries(STAT_KEYS.map((key) => [`stat-${key}`, '10'])),
  };
  const read = readCreatureFields(values, gear);
  assert.equal(read.packTactics, true);
  assert.deepEqual(read.weapons[0]?.onHitSave, { ability: 'DEX', dc: 12, condition: 'Restrained' });
  const cleared = readCreatureFields({ ...values, hitSaveAbility: '', packTactics: '' }, gear);
  assert.equal('onHitSave' in (cleared.weapons[0] ?? {}), false);
  assert.equal('packTactics' in cleared, false);
  const unarmed = readCreatureFields({ ...values, weapon: '' }, gear);
  assert.deepEqual(unarmed.weapons, []);
});

test('a hero with no rider weapon still reads as a plain target', () => {
  assert.equal(hitSaveOf(/** @type {any} */ ({ name: 'Fist' })), null);
  assert.equal(hero.name, 'Hero');
});

test('the library normalizer cleans an on-hit save and drops a broken one', async () => {
  const { normalizeLibrary } = await import('../src/library/Library.js');
  const weapon = (/** @type {unknown} */ onHitSave) => ({ ...BITE, onHitSave });
  const lib = normalizeLibrary({
    creatures: [
      {
        name: 'Good Wolf',
        maxHP: 11,
        weapon: weapon({ ability: 'str', dc: '11', condition: 'prone' }),
      },
      {
        name: 'Bad Wolf',
        maxHP: 11,
        weapon: weapon({ ability: 'LUCK', dc: 11, condition: 'Prone' }),
      },
    ],
  });
  const byName = Object.fromEntries(lib.creatures.map((c) => [c.name, c]));
  assert.deepEqual(byName['Good Wolf'].weapons[0]?.onHitSave, RIDER);
  assert.equal('onHitSave' in (byName['Bad Wolf'].weapons[0] ?? {}), false);
});
