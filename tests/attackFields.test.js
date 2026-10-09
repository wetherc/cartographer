import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attackDialog } from '../src/app/attackFields.js';
import { createCharacter, withHP } from '../src/entities/Character.js';
import { createParticipant } from '../src/combat/Initiative.js';
import { spend } from '../src/combat/ActionBudget.js';

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

const hero = withHP(createCharacter('hero', 'Hero'), 12);
const defenders = [
  { id: 'gob', name: 'Goblin', ac: 13, conditions: [] },
  { id: 'orc', name: 'Orc', ac: 15, conditions: [] },
];

/** @param {Partial<Parameters<typeof attackDialog>[0]>} over */
function dialog(over = {}) {
  return attackDialog({
    attacker: hero,
    defenders,
    participant: createParticipant('hero'),
    weapon: /** @type {any} */ (SWORD),
    defenderId: null,
    offhand: false,
    reaction: false,
    ...over,
  });
}

const names = (/** @type {{ fields: any[] }} */ d) => d.fields.map((f) => f.name);

test('a plain swing offers the defender, mode, cover, and the situational modifiers', () => {
  const d = dialog();
  assert.equal(d.title, 'Attack with Sword');
  assert.deepEqual(names(d), [
    'target',
    'mode',
    'cover',
    'atk-count',
    'atk-die',
    'dmg-count',
    'dmg-die',
    'atk-flat',
    'dmg-flat',
  ]);
  assert.deepEqual(
    d.fields[0].options.map((/** @type {any} */ o) => o.label),
    ['Goblin (AC 13)', 'Orc (AC 15)'],
  );
  assert.equal(d.fields[0].value, undefined, 'no board pick leaves the first defender');
  assert.deepEqual(d.options, {
    submitLabel: 'Roll attack',
    wide: true,
    advancedLabel: 'Situational modifiers',
  });
});

test('a board-picked defender opens pre-selected, and a gone one falls back', () => {
  assert.equal(dialog({ defenderId: 'orc' }).fields[0].value, 'orc');
  assert.equal(dialog({ defenderId: 'ghost' }).fields[0].value, undefined);
});

test('a versatile weapon offers the two-handed grip while the other hand is free', () => {
  const longsword = {
    ...SWORD,
    name: 'Longsword',
    properties: ['versatile'],
    versatileDamage: [{ count: 1, sides: 10, damageType: 'slashing' }],
  };
  assert.ok(names(dialog({ weapon: /** @type {any} */ (longsword) })).includes('two-handed'));
  const noDice = { ...longsword, versatileDamage: [] };
  assert.ok(!names(dialog({ weapon: /** @type {any} */ (noDice) })).includes('two-handed'));
});

test('a ranged weapon offers the two distances, and a thrown one adds the melee swing', () => {
  const bow = { ...SWORD, name: 'Bow', kind: 'ranged', range: { normal: 80, long: 320 } };
  const range = dialog({ weapon: /** @type {any} */ (bow) }).fields.find(
    (/** @type {any} */ f) => f.name === 'range',
  );
  assert.deepEqual(
    range.options.map((/** @type {any} */ o) => o.label),
    ['Normal (80 ft)', 'Long (320 ft, disadvantage)'],
  );
  assert.equal(range.value, 'normal');
  const dagger = {
    ...SWORD,
    name: 'Dagger',
    properties: ['thrown'],
    range: { normal: 20, long: 60 },
  };
  const thrown = dialog({ weapon: /** @type {any} */ (dagger) }).fields.find(
    (/** @type {any} */ f) => f.name === 'range',
  );
  assert.deepEqual(
    thrown.options.map((/** @type {any} */ o) => o.value),
    ['melee', 'thrown', 'thrown-long'],
  );
  // A weapon that states no range offers no range control.
  const sling = { ...SWORD, name: 'Sling', kind: 'ranged' };
  assert.ok(!names(dialog({ weapon: /** @type {any} */ (sling) })).includes('range'));
});

test('a rogue with a finesse weapon gets the Sneak Attack box until it is spent', () => {
  const rogue = { ...hero, classes: [{ classId: 'rogue', level: 3 }], level: 3 };
  const rapier = { ...SWORD, name: 'Rapier', properties: ['finesse'] };
  const fresh = dialog({ attacker: rogue, weapon: /** @type {any} */ (rapier) });
  const box = fresh.fields.find((/** @type {any} */ f) => f.name === 'sneak');
  assert.equal(box.label, 'Sneak Attack (+2d6)');
  const spent = dialog({
    attacker: rogue,
    weapon: /** @type {any} */ (rapier),
    participant: spend(createParticipant('hero'), 'sneak'),
  });
  assert.ok(!names(spent).includes('sneak'));
});

test('a swing the turn cannot pay for needs the opt-out box ticked', () => {
  const used = spend(createParticipant('hero'), 'bonus');
  const d = dialog({ offhand: true, participant: used });
  assert.equal(d.title, 'Off-hand attack with Sword');
  const box = d.fields.find((/** @type {any} */ f) => f.name === 'free-action');
  assert.equal(box.label, 'Ignore action cost (bonus action already used)');
  assert.deepEqual(d.options.submitRequires, ['free-action']);
  const reaction = dialog({ reaction: true });
  assert.equal(reaction.title, 'Opportunity attack with Sword');
  assert.ok(!names(reaction).includes('free-action'));
});

test('picking Disadvantage disables the Sneak Attack box and says why', () => {
  const rogue = { ...hero, classes: [{ classId: 'rogue', level: 3 }], level: 3 };
  const rapier = { ...SWORD, name: 'Rapier', properties: ['finesse'] };
  const d = dialog({ attacker: rogue, weapon: /** @type {any} */ (rapier) });
  /** @type {Record<string, string>} */
  const values = { mode: 'disadvantage' };
  /** @type {Record<string, boolean>} */
  const disabled = {};
  /** @type {Record<string, string>} */
  const labels = {};
  const form = /** @type {any} */ ({
    get: (/** @type {string} */ n) => values[n],
    setDisabled: (/** @type {string} */ n, /** @type {boolean} */ v) => (disabled[n] = v),
    setLabel: (/** @type {string} */ n, /** @type {string} */ v) => (labels[n] = v),
  });
  const onChange = /** @type {any} */ (d.options).onChange;
  onChange('cover', form);
  assert.deepEqual(disabled, {}, 'other fields change nothing');
  onChange('mode', form);
  assert.equal(disabled.sneak, true);
  assert.equal(labels.sneak, 'Sneak Attack (+2d6): not at disadvantage');
  values.mode = 'advantage';
  onChange('mode', form);
  assert.equal(disabled.sneak, false);
  assert.equal(labels.sneak, 'Sneak Attack (+2d6)');
  // A dialog with no Sneak Attack box has no change handler.
  assert.equal(/** @type {any} */ (dialog().options).onChange, undefined);
});
