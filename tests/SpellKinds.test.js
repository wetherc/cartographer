import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPELL_KINDS } from '../src/entities/SpellKinds.js';
import { SPELL_EFFECT_KINDS } from '../src/data/spells.js';
import { normalizeSpellEffect } from '../src/entities/SpellEntry.js';
import { castSpell } from '../src/entities/Casting.js';
import { effectSummary } from '../src/view/SpellEffectText.js';
import { helps, targetFree } from '../src/app/spellTargets.js';
import { exhaustive } from '../src/util/exhaustive.js';

test('the kind table has one row per effect kind, in the order of the form select', () => {
  assert.deepEqual(Object.keys(SPELL_KINDS), SPELL_EFFECT_KINDS);
  assert.ok(Object.isFrozen(SPELL_KINDS.attack));
});

test('a heal and a buff help, and a utility spell and a summons pick no creature', () => {
  assert.deepEqual(
    SPELL_EFFECT_KINDS.filter((k) => helps(k)),
    ['heal', 'buff'],
  );
  assert.deepEqual(
    SPELL_EFFECT_KINDS.filter((k) => targetFree(k)),
    ['summons', 'utility'],
  );
});

test('every kind repairs into itself, and an unknown kind into utility', () => {
  for (const kind of SPELL_EFFECT_KINDS) {
    const raw = { kind, saveAbility: 'DEX', creature: 'Wolf', damage: [] };
    assert.equal(normalizeSpellEffect(raw).kind, kind);
  }
  assert.deepEqual(normalizeSpellEffect({ kind: 'teleport' }), { kind: 'utility' });
  assert.deepEqual(normalizeSpellEffect({ kind: 'summons' }), { kind: 'utility' });
});

test('exhaustive gives back the fallback for a value that bypassed the type', () => {
  assert.equal(exhaustive(/** @type {never} */ ('teleport'), null), null);
  assert.deepEqual(exhaustive(/** @type {never} */ ('teleport'), []), []);
});

test('an effect of no known kind rolls nothing and has no summary line', () => {
  const spell = /** @type {any} */ ({
    id: 'odd',
    name: 'Odd',
    level: 0,
    school: 'evocation',
    classes: ['wizard'],
    effect: { kind: 'teleport' },
    concentration: false,
    ritual: false,
    components: ['V'],
    castingTime: { kind: 'action' },
    range: '30 ft',
    duration: { kind: 'instantaneous' },
    description: '',
  });
  assert.equal(effectSummary(spell, null), null);
  const caster = /** @type {any} */ ({
    id: 'c',
    name: 'C',
    race: 'human',
    class: 'wizard',
    level: 5,
    xp: 0,
    stats: { STR: 10, DEX: 10, CON: 10, INT: 16, WIS: 10, CHA: 10 },
    resources: [],
    inventory: [],
    conditions: [],
    spellbook: { cantrips: ['odd'], known: [], prepared: [] },
  });
  const result = castSpell(caster, spell, { targets: [], rng: () => 0.5 });
  assert.ok('outcomes' in result);
  assert.deepEqual(result.outcomes, []);
});
