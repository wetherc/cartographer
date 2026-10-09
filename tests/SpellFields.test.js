import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  attackExtras,
  buffExtras,
  normalizeHpPool,
  normalizeLevelsPerStep,
  normalizeOnHit,
  normalizeOngoing,
  normalizeParts,
  normalizeRepeat,
  normalizeUntil,
  rollsNoSave,
  saveExtras,
} from '../src/entities/SpellFields.js';
import { heldRepeat, opensRepeat, repeatedSpell } from '../src/entities/SpellRepeat.js';
import { DEFAULT_SPELLS } from '../src/data/spells.js';

const acid = (count) => ({ count, sides: 4, damageType: 'acid' });
const spellById = (id) => /** @type {any} */ (DEFAULT_SPELLS.find((s) => s.id === id));

test('a boundary reads only as one of the three it names', () => {
  assert.equal(normalizeUntil('caster-start'), 'caster-start');
  assert.equal(normalizeUntil('dawn'), null);
  assert.equal(normalizeUntil(undefined), null);
});

test('damage terms repair each term and drop what is not one', () => {
  assert.deepEqual(normalizeParts([acid(2), null, 'x']), [acid(2)]);
  assert.deepEqual(normalizeParts('2d4'), []);
});

test('damage terms keep to the allowed types when a caller names them', () => {
  assert.equal(
    normalizeParts([{ count: 2, sides: 8, damageType: 'fire' }], ['healing'])[0].damageType,
    'healing',
  );
  assert.equal(
    normalizeParts([{ count: 2, sides: 8, damageType: 'healing' }])[0].damageType,
    'slashing',
  );
});

test('later-turn damage needs dice, and keeps its growth and boundary', () => {
  assert.equal(normalizeOngoing(null), null);
  assert.equal(normalizeOngoing({ damage: [] }), null);
  assert.deepEqual(normalizeOngoing({ damage: [acid(2)] }), { damage: [acid(2)] });
  assert.deepEqual(
    normalizeOngoing({ damage: [acid(2)], perStep: [acid(1)], until: 'caster-end' }),
    { damage: [acid(2)], perStep: [acid(1)], until: 'caster-end' },
  );
  assert.deepEqual(normalizeOngoing({ damage: [acid(2)], until: 'later' }), {
    damage: [acid(2)],
  });
});

test('a repeat keeps a known cost and fixed damage, and an empty block is still a repeat', () => {
  assert.equal(normalizeRepeat(undefined), null);
  assert.deepEqual(normalizeRepeat({}), {});
  assert.deepEqual(normalizeRepeat({ cost: 'bonus', damage: [acid(1)] }), {
    cost: 'bonus',
    damage: [acid(1)],
  });
  assert.deepEqual(normalizeRepeat({ cost: 'reaction', damage: [] }), {});
});

test('attack flags come through only when true', () => {
  assert.deepEqual(attackExtras({ melee: 'yes', halfOnMiss: false }), {});
  assert.deepEqual(
    attackExtras({
      melee: true,
      halfOnMiss: true,
      addsModifier: true,
      ongoing: { damage: [acid(2)] },
    }),
    { melee: true, halfOnMiss: true, addsModifier: true, ongoing: { damage: [acid(2)] } },
  );
});

test('a save keeps a boundary only with a condition to end', () => {
  assert.deepEqual(saveExtras({ until: 'caster-start' }, 'Blinded'), { until: 'caster-start' });
  assert.deepEqual(saveExtras({ until: 'caster-start' }, ''), {});
});

test('levels per step reads 2 and up, and one or garbage as the default', () => {
  assert.equal(normalizeLevelsPerStep(2), 2);
  assert.equal(normalizeLevelsPerStep(1), 0);
  assert.equal(normalizeLevelsPerStep('x'), 0);
});

test('a caster keeps a repeat open through the chip its own cast wrote', () => {
  const hold = { slotLevel: 3, targetIds: ['ogre'] };
  const chip = {
    name: 'Witch Bolt',
    rounds: 10,
    source: { spellId: 'witch-bolt', spellName: 'Witch Bolt', casterId: 'mage', repeat: hold },
  };
  assert.deepEqual(heldRepeat({ id: 'mage', conditions: [chip] }, 'witch-bolt'), hold);
  assert.equal(heldRepeat({ id: 'other', conditions: [chip] }, 'witch-bolt'), null);
  assert.equal(heldRepeat({ id: 'mage' }, 'witch-bolt'), null);
});

test('a fixed-damage repeat resolves as an unscaled automatic hit', () => {
  const bolt = spellById('witch-bolt');
  const repeated = repeatedSpell(bolt);
  assert.equal(repeated.scaling, undefined);
  assert.deepEqual(repeated.effect, {
    kind: 'attack',
    damage: bolt.repeat.damage,
    projectiles: { count: 1, autoHit: true },
  });
  const weapon = spellById('spiritual-weapon');
  assert.equal(repeatedSpell(weapon), weapon);
});

test('a locked repeat opens only on a hit, and an open one on any cast', () => {
  assert.equal(opensRepeat(spellById('witch-bolt'), []), false);
  assert.equal(opensRepeat(spellById('witch-bolt'), ['ogre']), true);
  assert.equal(opensRepeat(spellById('spiritual-weapon'), []), true);
  assert.equal(opensRepeat(spellById('fire-bolt'), ['ogre']), false);
});

test('an on-hit block needs a condition, and drops a save ability outside the six', () => {
  assert.equal(normalizeOnHit(null), null);
  assert.equal(normalizeOnHit({ condition: '  ' }), null);
  assert.equal(normalizeOnHit({ condition: 7 }), null);
  assert.deepEqual(
    normalizeOnHit({ condition: ' Poisoned ', saveAbility: 'LUCK', until: 'noon' }),
    {
      condition: 'Poisoned',
    },
  );
  assert.deepEqual(
    normalizeOnHit({ condition: 'Poisoned', saveAbility: 'CON', until: 'caster-end' }),
    { condition: 'Poisoned', saveAbility: 'CON', until: 'caster-end' },
  );
});

test('an attack keeps an on-hit block and a drain only when each says something', () => {
  assert.deepEqual(attackExtras({ onHit: { condition: '' }, drain: 'most' }), {});
  assert.deepEqual(attackExtras({ onHit: { condition: 'Blinded' }, drain: 'half' }), {
    onHit: { condition: 'Blinded' },
    drain: 'half',
  });
  assert.deepEqual(attackExtras({ drain: 'full' }), { drain: 'full' });
});

test('an HP pool needs dice of a size the editor offers, and keeps a growth above 0', () => {
  assert.equal(normalizeHpPool(null), null);
  assert.equal(normalizeHpPool('5d8'), null);
  assert.equal(normalizeHpPool({ count: 0, sides: 8 }), null);
  assert.equal(normalizeHpPool({ count: 5, sides: 7 }), null);
  assert.deepEqual(normalizeHpPool({ count: '5', sides: '8', perStep: '2' }), {
    count: 5,
    sides: 8,
    perStep: 2,
  });
  assert.deepEqual(normalizeHpPool({ count: 99, sides: 10, perStep: 0 }), { count: 40, sides: 10 });
});

test('a save keeps a pool and a kill, and an end on damage only with a condition', () => {
  const pool = { count: 5, sides: 8 };
  assert.deepEqual(saveExtras({ hpPool: pool, kills: true, endsOnDamage: true }, 'Unconscious'), {
    hpPool: pool,
    kills: true,
    endsOnDamage: true,
  });
  assert.deepEqual(saveExtras({ kills: 'yes', endsOnDamage: true }, ''), {});
});

test('a save rolls no die with a pool, or with a limit and no repeated save', () => {
  assert.equal(rollsNoSave(spellById('sleep').effect), true);
  assert.equal(rollsNoSave(spellById('power-word-kill').effect), true);
  assert.equal(rollsNoSave(spellById('power-word-stun').effect), false);
  assert.equal(rollsNoSave(spellById('hold-person').effect), false);
  assert.equal(rollsNoSave(spellById('magic-missile').effect), false);
});

test('an on-hit chip and a save chip keep their chip mods', () => {
  assert.deepEqual(
    normalizeOnHit({
      condition: 'Guiding Bolt',
      mods: { attacksAgainst: 'advantage', once: true },
    }),
    { condition: 'Guiding Bolt', mods: { attacksAgainst: 'advantage', once: true } },
  );
  assert.deepEqual(normalizeOnHit({ condition: 'Marked', mods: { attacks: 'sideways' } }), {
    condition: 'Marked',
  });
  assert.deepEqual(saveExtras({ mods: { attacks: 'disadvantage' } }, 'Vicious Mockery'), {
    mods: { attacks: 'disadvantage' },
  });
  // Mods with no condition to ride have no chip, so they drop.
  assert.deepEqual(saveExtras({ mods: { attacks: 'disadvantage' } }, ''), {});
});

test('buffExtras keeps only known damage types in a resist choice', () => {
  assert.deepEqual(buffExtras({ resistChoice: ['fire', 'nope', 'acid'] }).resistChoice, [
    'acid',
    'fire',
  ]);
  assert.equal('resistChoice' in buffExtras({ resistChoice: ['nope'] }), false);
  assert.equal('resistChoice' in buffExtras({ resistChoice: 'fire' }), false);
});

test('Protection from Energy offers the five energy types', () => {
  const pfe = DEFAULT_SPELLS.find((s) => s.id === 'protection-from-energy');
  assert.deepEqual(/** @type {any} */ (pfe?.effect).resistChoice, [
    'acid',
    'cold',
    'fire',
    'lightning',
    'thunder',
  ]);
});
