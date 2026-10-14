import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  healTypeRules,
  takesMaxDamage,
  typeRuleFields,
  typeRulesSummary,
  typeSkipReason,
  withTypeSaveMode,
} from '../src/entities/SpellTypeRules.js';
import { castSpell } from '../src/entities/Casting.js';
import { createResource } from '../src/entities/Resource.js';
import { DEFAULT_SPELLS } from '../src/data/spells.js';

/** @param {string} id */
const spell = (id) => {
  const found = DEFAULT_SPELLS.find((s) => s.id === id);
  if (!found) throw new Error(id);
  return found;
};

/** A deterministic RNG that replays a queue of unit values, then returns 0. */
function seq(values) {
  const queue = [...values];
  return () => (queue.length ? /** @type {number} */ (queue.shift()) : 0);
}

/** @param {string[]} prepared */
function caster(prepared) {
  return /** @type {any} */ ({
    id: 'c',
    name: 'Mage',
    class: 'wizard',
    level: 9,
    stats: { STR: 10, DEX: 10, CON: 10, INT: 16, WIS: 10, CHA: 10 },
    resources: [1, 2, 3, 4].map((n) => createResource(`slots-${n}`, `Level ${n}`, 2)),
    inventory: [],
    conditions: [],
    spellbook: { cantrips: [], known: [], prepared },
  });
}

test('typeRuleFields keeps known types and conditions and drops empty lists', () => {
  assert.deepEqual(typeRuleFields({}), {});
  assert.deepEqual(typeRuleFields({ typeRules: 'undead' }), {});
  assert.deepEqual(typeRuleFields({ typeRules: { skip: 'undead', maxDamage: [] } }), {});
  assert.deepEqual(
    typeRuleFields({
      typeRules: {
        skip: ['Undead', 'undead', 'robot'],
        only: ['Humanoid', 'robot'],
        skipImmuneTo: ['charmed', 'Concentrating', 'nope'],
        disadvantage: ['ooze'],
        maxDamage: ['plant'],
      },
    }),
    {
      typeRules: {
        skip: ['undead'],
        only: ['humanoid'],
        skipImmuneTo: ['Charmed'],
        disadvantage: ['ooze'],
        maxDamage: ['plant'],
      },
    },
  );
});

test('healTypeRules keeps only the skipped types', () => {
  assert.deepEqual(healTypeRules({ typeRules: { skip: ['construct'], maxDamage: ['plant'] } }), {
    typeRules: { skip: ['construct'] },
  });
  assert.deepEqual(healTypeRules({ typeRules: { maxDamage: ['plant'] } }), {});
});

test('typeSkipReason names the type or the immunity that passes a target over', () => {
  const rules = { skip: /** @type {any} */ (['undead']), skipImmuneTo: ['Charmed'] };
  assert.equal(typeSkipReason(undefined, { creatureType: 'undead' }), null);
  assert.equal(typeSkipReason(rules, { creatureType: 'undead' }), 'undead');
  assert.equal(
    typeSkipReason(rules, { creatureType: 'fey', conditionImmunities: ['charmed'] }),
    'immune to Charmed',
  );
  assert.equal(typeSkipReason(rules, { creatureType: 'humanoid' }), null);
  assert.equal(typeSkipReason({ skip: ['undead'] }, {}), null);
  const only = { only: /** @type {any} */ (['humanoid', 'giant']) };
  assert.equal(typeSkipReason(only, { creatureType: 'beast' }), 'not humanoid or giant');
  assert.equal(typeSkipReason(only, { creatureType: 'giant' }), null);
  assert.equal(typeSkipReason(only, {}), null);
});

test('withTypeSaveMode folds a disadvantage into the target mode', () => {
  const rules = { disadvantage: /** @type {any} */ (['ooze']) };
  const ooze = { creatureType: /** @type {any} */ ('ooze') };
  assert.equal(withTypeSaveMode(rules, ooze).saveMode, 'disadvantage');
  assert.equal(withTypeSaveMode(rules, { ...ooze, saveMode: 'advantage' }).saveMode, 'normal');
  const elf = { creatureType: /** @type {any} */ ('humanoid') };
  assert.equal(withTypeSaveMode(rules, elf), elf);
  assert.equal(withTypeSaveMode(undefined, ooze), ooze);
  assert.deepEqual(withTypeSaveMode(rules, {}), {});
});

test('takesMaxDamage matches only the listed types', () => {
  const rules = { maxDamage: /** @type {any} */ (['plant']) };
  assert.equal(takesMaxDamage(rules, { creatureType: 'plant' }), true);
  assert.equal(takesMaxDamage(rules, { creatureType: 'beast' }), false);
  assert.equal(takesMaxDamage(undefined, { creatureType: 'plant' }), false);
  assert.equal(takesMaxDamage(rules, {}), false);
});

test('typeRulesSummary reads each rule', () => {
  assert.equal(typeRulesSummary(undefined), '');
  assert.equal(
    typeRulesSummary(/** @type {any} */ ({ skip: ['undead'], skipImmuneTo: ['Charmed'] })),
    'No effect on undead, Charmed-immune.',
  );
  assert.equal(
    typeRulesSummary(/** @type {any} */ ({ disadvantage: ['plant'], maxDamage: ['plant'] })),
    'Saves at disadvantage: plant. Maximum damage: plant.',
  );
  assert.equal(
    typeRulesSummary(/** @type {any} */ ({ only: ['humanoid'] })),
    'Only affects humanoid.',
  );
});

test('Sleep passes over undead and Charmed-immune targets without spending the pool', () => {
  // 5d8 at the minimum face is a pool of 5.
  const result = /** @type {any} */ (
    castSpell(caster(['sleep']), spell('sleep'), {
      slotLevel: 1,
      rng: seq([]),
      targets: [
        { id: 'skel', name: 'Skeleton', hp: 1, creatureType: 'undead' },
        { id: 'elf', name: 'Elf', hp: 1, creatureType: 'fey', conditionImmunities: ['Charmed'] },
        { id: 'gob', name: 'Goblin', hp: 5, creatureType: 'humanoid' },
      ],
    })
  );
  assert.deepEqual(
    result.outcomes.map((o) => [o.target.id, o.unaffectedBy ?? null, o.condition]),
    [
      ['gob', null, 'Unconscious'],
      ['skel', 'undead', null],
      ['elf', 'immune to Charmed', null],
    ],
  );
});

test('Blight skips undead, and a plant saves at disadvantage and takes the maximum', () => {
  const result = /** @type {any} */ (
    castSpell(
      caster(['blight']),
      { ...spell('blight'), targetCount: 3 },
      {
        slotLevel: 4,
        saveDC: 30,
        rng: seq([]),
        targets: [
          { id: 'tree', name: 'Shrub', saveBonus: 0, creatureType: 'plant' },
          { id: 'orc', name: 'Orc', saveBonus: 0, creatureType: 'humanoid' },
          { id: 'zom', name: 'Zombie', saveBonus: 0, creatureType: 'undead' },
        ],
      },
    )
  );
  const [tree, orc, zom] = result.outcomes;
  assert.equal(tree.taken, 64);
  assert.equal(tree.maxDamage, true);
  assert.equal(tree.target.saveMode, 'disadvantage');
  assert.equal(orc.taken, 8);
  assert.equal(orc.maxDamage, undefined);
  assert.equal(zom.unaffectedBy, 'undead');
});

test('Sunburst gives undead and oozes disadvantage on the save', () => {
  const result = /** @type {any} */ (
    castSpell(caster(['sunburst']), spell('sunburst'), {
      slotLevel: 8,
      free: { slotLevel: 8 },
      rng: seq([]),
      targets: [
        { id: 'o', name: 'Ooze', saveBonus: 0, creatureType: 'ooze' },
        { id: 'h', name: 'Hero', saveBonus: 0, creatureType: 'humanoid' },
      ],
    })
  );
  assert.equal(result.outcomes[0].target.saveMode, 'disadvantage');
  assert.equal(result.outcomes[1].target.saveMode, undefined);
});

test('Cure Wounds has no effect on undead or constructs', () => {
  const result = /** @type {any} */ (
    castSpell(
      caster(['cure-wounds']),
      { ...spell('cure-wounds'), targetCount: 2 },
      {
        slotLevel: 1,
        rng: seq([]),
        targets: [
          { id: 'g', name: 'Golem', creatureType: 'construct' },
          { id: 'p', name: 'Pal', creatureType: 'humanoid' },
        ],
      },
    )
  );
  assert.equal(result.outcomes[0].unaffectedBy, 'construct');
  assert.equal(result.outcomes[1].unaffectedBy, undefined);
  assert.ok(result.outcomes[1].healing.total > 0);
});

test('every built-in heal of hit points but Revivify skips undead and constructs', () => {
  const heals = DEFAULT_SPELLS.filter(
    (s) => s.effect.kind === 'heal' && s.effect.healing.length > 0 && !s.effect.revives,
  );
  assert.ok(heals.length >= 6);
  for (const s of heals) {
    assert.deepEqual(/** @type {any} */ (s.effect).typeRules, { skip: ['undead', 'construct'] });
  }
});

test('the spell form draft keeps the type rules of a save and a heal', async () => {
  const { assembleEffect } = await import('../src/entities/SpellDraft.js');
  const rules = {
    skip: ['undead'],
    only: ['humanoid'],
    skipImmuneTo: ['Charmed'],
    disadvantage: [],
    maxDamage: [],
  };
  const save = assembleEffect(
    /** @type {any} */ ({ kind: 'save', damage: [], saveAbility: 'WIS', typeRules: rules }),
  );
  assert.deepEqual(/** @type {any} */ (save).typeRules, {
    skip: ['undead'],
    only: ['humanoid'],
    skipImmuneTo: ['Charmed'],
  });
  const heal = assembleEffect(/** @type {any} */ ({ kind: 'heal', damage: [], typeRules: rules }));
  assert.deepEqual(/** @type {any} */ (heal).typeRules, { skip: ['undead'] });
  const bare = assembleEffect(/** @type {any} */ ({ kind: 'heal', damage: [] }));
  assert.equal('typeRules' in bare, false);
});

test('the spell card states the type rules after the effect line', async () => {
  const { effectSummary } = await import('../src/view/SpellEffectText.js');
  assert.match(
    /** @type {string} */ (effectSummary(spell('cure-wounds'), null)),
    /\. No effect on undead, construct\.$/,
  );
  assert.doesNotMatch(/** @type {string} */ (effectSummary(spell('fireball'), 14)), /No effect/);
  assert.equal(effectSummary(spell('light'), null), null);
});
