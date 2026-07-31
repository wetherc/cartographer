import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  assembleEffect,
  assembleScaling,
  assembleSpell,
  effectDamageOf,
} from '../src/entities/SpellDraft.js';

/** @param {number} count @param {number} sides @param {string} damageType */
function part(count, sides, damageType) {
  return { count, sides, damageType };
}

const fire = [part(3, 6, 'fire')];

/** Every effect control, so a test states only what it is about. */
function effectDraft(extra = {}) {
  return {
    kind: 'utility',
    damage: fire,
    saveAbility: 'DEX',
    halfOnSave: false,
    dealsDamage: false,
    condition: '',
    fires: false,
    projectiles: { count: 1, perStep: 0, autoHit: false },
    ...extra,
  };
}

/** The whole form, with a utility effect and nothing optional ticked. */
function draft(extra = {}) {
  return {
    name: 'Firebolt',
    level: 0,
    school: 'evocation',
    classes: ['wizard'],
    castingTime: { kind: 'action' },
    duration: { kind: 'instantaneous' },
    range: '120 feet',
    components: ['V', 'S'],
    materials: null,
    concentration: false,
    ritual: false,
    description: 'A mote of fire.',
    targetCount: 1,
    effect: effectDraft(),
    scaling: null,
    ...extra,
  };
}

test('an attack effect keeps its dice and drops the save fields', () => {
  const effect = assembleEffect(effectDraft({ kind: 'attack', saveAbility: 'WIS' }));
  assert.deepEqual(effect, { kind: 'attack', damage: fire });
});

test('an attack fires projectiles only when the form says it does', () => {
  const off = assembleEffect(effectDraft({ kind: 'attack', fires: false }));
  assert.equal('projectiles' in off, false);
  const on = assembleEffect(
    effectDraft({ kind: 'attack', fires: true, projectiles: { count: 3, perStep: 1 } }),
  );
  assert.deepEqual(on.projectiles, { count: 3, perStep: 1 });
});

test('an unusable projectile block drops out rather than firing nothing', () => {
  const effect = assembleEffect(
    effectDraft({ kind: 'attack', fires: true, projectiles: { count: 0, perStep: 0 } }),
  );
  assert.equal('projectiles' in effect, false);
});

test('a save effect keeps its ability and half-on-save, and gates its damage', () => {
  const dry = assembleEffect(effectDraft({ kind: 'save', saveAbility: 'CON', halfOnSave: true }));
  assert.deepEqual(dry, { kind: 'save', saveAbility: 'CON', damage: [], halfOnSave: true });
  const wet = assembleEffect(effectDraft({ kind: 'save', dealsDamage: true }));
  assert.deepEqual(wet.damage, fire);
});

test('a save effect carries a condition only when one is picked', () => {
  assert.equal('condition' in assembleEffect(effectDraft({ kind: 'save' })), false);
  assert.equal(
    'condition' in assembleEffect(effectDraft({ kind: 'save', condition: '  ' })),
    false,
  );
  assert.equal(
    assembleEffect(effectDraft({ kind: 'save', condition: ' Stunned ' })).condition,
    'Stunned',
  );
});

test('a heal effect reads the dice as healing', () => {
  assert.deepEqual(assembleEffect(effectDraft({ kind: 'heal' })), {
    kind: 'heal',
    healing: fire,
  });
});

test('a utility effect carries nothing at all, whatever the other controls hold', () => {
  const effect = assembleEffect(
    effectDraft({ kind: 'utility', dealsDamage: true, fires: true, condition: 'Stunned' }),
  );
  assert.deepEqual(effect, { kind: 'utility' });
});

test('an unticked scaling box scales nothing', () => {
  assert.equal(assembleScaling(null), undefined);
});

test('a ticked scaling box with neither half filled in is the same as unticked', () => {
  assert.equal(assembleScaling({ damagePerLevel: [], targetsPerLevel: 0 }), undefined);
});

test('scaling keeps whichever half was filled in', () => {
  assert.deepEqual(assembleScaling({ damagePerLevel: fire, targetsPerLevel: 0 }), {
    damagePerLevel: fire,
  });
  assert.deepEqual(assembleScaling({ damagePerLevel: [], targetsPerLevel: '2' }), {
    targetsPerLevel: 2,
  });
});

test('a negative extra-targets figure is not scaling', () => {
  assert.equal(assembleScaling({ damagePerLevel: [], targetsPerLevel: -4 }), undefined);
});

test('a submitted form trims its text and reads its level as a number', () => {
  const spell = assembleSpell(draft({ name: '  Firebolt  ', level: '3', description: '  Zap. ' }));
  assert.equal(spell.name, 'Firebolt');
  assert.equal(spell.level, 3);
  assert.equal(spell.description, 'Zap.');
});

test('an empty range falls back to Self', () => {
  assert.equal(assembleSpell(draft({ range: '   ' })).range, 'Self');
  assert.equal(assembleSpell(draft({ range: ' 30 feet ' })).range, '30 feet');
});

test('an unticked M component carries no material block', () => {
  assert.equal('materials' in assembleSpell(draft()), false);
});

test('a ticked M component carries whatever the parser makes of the fields', () => {
  const spell = assembleSpell(
    draft({ materials: { text: 'a pinch of sulfur', costGP: '50', consumed: true } }),
  );
  assert.deepEqual(spell.materials, {
    text: 'a pinch of sulfur',
    costGP: 50,
    consumed: true,
  });
});

test('the timing fields go through the timing parsers', () => {
  const spell = assembleSpell(
    draft({
      castingTime: { kind: 'minutes', amount: '10' },
      duration: { kind: 'hours', amount: '1', upTo: true },
    }),
  );
  assert.deepEqual(spell.castingTime, { kind: 'minutes', amount: 10 });
  assert.equal(spell.duration.kind, 'hours');
  assert.equal(spell.duration.upTo, true);
});

test('the flags read as booleans and the target count through its parser', () => {
  const spell = assembleSpell(draft({ concentration: 1, ritual: 0, targetCount: '3' }));
  assert.equal(spell.concentration, true);
  assert.equal(spell.ritual, false);
  assert.equal(spell.targetCount, 3);
});

test('a spell that scales carries its scaling; one that does not omits the key', () => {
  assert.equal('scaling' in assembleSpell(draft()), false);
  const scaled = assembleSpell(draft({ scaling: { damagePerLevel: fire, targetsPerLevel: 0 } }));
  assert.deepEqual(scaled.scaling, { damagePerLevel: fire });
});

test('the seed dice of an effect are its own, and an empty list is nothing to seed from', () => {
  assert.deepEqual(effectDamageOf({ kind: 'attack', damage: fire }), fire);
  assert.deepEqual(effectDamageOf({ kind: 'save', damage: fire, halfOnSave: false }), fire);
  assert.deepEqual(effectDamageOf({ kind: 'heal', healing: fire }), fire);
  assert.equal(effectDamageOf({ kind: 'attack', damage: [] }), null);
  assert.equal(effectDamageOf({ kind: 'save', damage: [], halfOnSave: false }), null);
  assert.equal(effectDamageOf({ kind: 'heal', healing: [] }), null);
  assert.equal(effectDamageOf({ kind: 'utility' }), null);
  assert.equal(effectDamageOf(undefined), null);
});

test('a save effect with no condition control at all carries none', () => {
  const effect = assembleEffect({ kind: 'save', damage: [], condition: undefined });
  assert.equal('condition' in effect, false);
});

test('an attack whose projectile fields were never filled in fires none', () => {
  const effect = assembleEffect({ kind: 'attack', damage: fire, fires: true });
  assert.equal('projectiles' in effect, false);
});
