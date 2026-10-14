import { test } from 'node:test';
import assert from 'node:assert/strict';
import { castSpell } from '../src/entities/Casting.js';
import { isRitualOnly } from '../src/entities/SpellView.js';
import { createResource } from '../src/entities/Resource.js';
import { DEFAULT_SPELLS } from '../src/data/spells.js';
import { canResist } from '../src/combat/LegendaryResistance.js';

/** A spell with every field a cast reads, overridden per test. */
function spell(over = {}) {
  return /** @type {import('../src/types/spell.js').Spell} */ ({
    id: 'detect-magic',
    name: 'Detect Magic',
    level: 1,
    school: 'divination',
    classes: ['wizard'],
    castingTime: { kind: 'action' },
    range: 'Self',
    components: ['V', 'S'],
    duration: { kind: 'instantaneous' },
    concentration: false,
    ritual: true,
    description: '',
    effect: { kind: 'utility' },
    ...over,
  });
}

/**
 * A 5th-level caster of one class, with a level 1 slot and the given book.
 * @param {string} classId
 * @param {{ cantrips?: string[], known?: string[], prepared?: string[] }} book
 */
function caster(classId, book) {
  return /** @type {any} */ ({
    id: 'c',
    name: 'Mage',
    classes: [{ classId, level: 5 }],
    level: 5,
    stats: { STR: 10, DEX: 10, CON: 10, INT: 16, WIS: 16, CHA: 10 },
    resources: [createResource('slots-1', 'Level 1 slots', 4)],
    inventory: [],
    conditions: [],
    spellbook: { cantrips: [], known: [], prepared: [], ...book },
  });
}

test('a Wizard casts an unprepared ritual from its book, as a ritual only', () => {
  const wizard = caster('wizard', { known: ['detect-magic'] });
  const ritual = spell();
  assert.equal(isRitualOnly(wizard, ritual), true);
  const cast = castSpell(wizard, ritual, { ritual: true });
  assert.equal(cast.ok, true);
  assert.equal(cast.ok && cast.spent, false);
  assert.deepEqual(castSpell(wizard, ritual), { ok: false, reason: 'not-known' });
});

test('only an unprepared ritual in a Wizard book is ritual-only', () => {
  const ritual = spell();
  const prepared = caster('wizard', { known: ['detect-magic'], prepared: ['detect-magic'] });
  assert.equal(isRitualOnly(prepared, ritual), false, 'a prepared ritual casts either way');
  assert.equal(isRitualOnly(caster('wizard', {}), ritual), false, 'not in the book');
  const known = caster('wizard', { known: ['detect-magic'] });
  assert.equal(isRitualOnly(known, spell({ ritual: false })), false, 'not a ritual');
  assert.equal(isRitualOnly(known, spell({ level: 0 })), false, 'a cantrip');
  const cleric = caster('cleric', { known: ['detect-magic'] });
  assert.equal(isRitualOnly(cleric, ritual), false, 'a Cleric prepares its rituals');
  assert.deepEqual(castSpell(cleric, ritual, { ritual: true }), { ok: false, reason: 'not-known' });
});

/** A save spell with Power Word Stun's HP limit, against three targets. */
function stunCast() {
  const stun = spell({
    id: 'stun',
    ritual: false,
    targetCount: 3,
    effect: {
      kind: 'save',
      saveAbility: 'CON',
      damage: [],
      halfOnSave: false,
      condition: 'Stunned',
      saveEnds: true,
      hpLimit: 150,
    },
  });
  const mage = caster('wizard', { prepared: ['stun'] });
  return castSpell(mage, stun, {
    targets: [
      { id: 'ogre', name: 'Ogre', saveBonus: 20, hp: 150 },
      { id: 'dragon', name: 'Dragon', saveBonus: 20, hp: 151 },
      { id: 'shade', name: 'Shade', saveBonus: 20 },
    ],
    saveDC: 10,
    rng: () => 0.999,
  });
}

test('an HP limit fails the save at or under the limit and spares a target above it', () => {
  const cast = stunCast();
  assert.equal(cast.ok, true);
  const [ogre, dragon, shade] = /** @type {any[]} */ (cast.ok ? cast.outcomes : []);
  assert.equal(ogre.saved, false, 'no roll, even with +20 on a natural 20');
  assert.equal(ogre.save, null);
  assert.equal(ogre.autoFailedBy, '150 HP or fewer');
  assert.equal(ogre.condition, 'Stunned');
  assert.deepEqual(
    { unaffectedBy: dragon.unaffectedBy, condition: dragon.condition, taken: dragon.taken },
    { unaffectedBy: 'over 150 HP', condition: null, taken: 0 },
  );
  assert.equal(shade.condition, 'Stunned', 'a target with no known HP counts as under');
});

test('Power Word Stun carries the 150 HP limit', () => {
  const stun = DEFAULT_SPELLS.find((s) => s.id === 'power-word-stun');
  assert.equal(stun?.effect.kind === 'save' && stun.effect.hpLimit, 150);
});

test('an HP-limit save with a later retry rolls no first save for Legendary Resistance to turn', () => {
  const cast = stunCast();
  const [ogre] = /** @type {any[]} */ (cast.ok ? cast.outcomes : []);
  assert.equal(ogre.noRoll, true);
  assert.equal(canResist(ogre), false);
});

test('Evasion halves a failed DEX half-on-save and negates a made one', async () => {
  const { evades } = await import('../src/entities/Casting.js');
  const fire = spell({
    id: 'fire',
    ritual: false,
    targetCount: 2,
    effect: {
      kind: 'save',
      saveAbility: 'DEX',
      damage: [{ count: 1, sides: 10, damageType: 'fire' }],
      halfOnSave: true,
    },
  });
  const mage = caster('wizard', { prepared: ['fire'] });
  /** @param {number} unit @param {number} bonus */
  const cast = (unit, bonus) =>
    castSpell(mage, fire, {
      targets: [
        { id: 'rogue', name: 'Rogue', saveBonus: bonus, evasion: true },
        { id: 'fighter', name: 'Fighter', saveBonus: bonus },
      ],
      saveDC: 15,
      rng: () => unit,
    });
  // Every die lands on its top face: 10 fire, and a 20 on the save.
  const made = cast(0.999, 0);
  const [rogueMade, fighterMade] = /** @type {any[]} */ (made.ok ? made.outcomes : []);
  assert.equal(rogueMade.saved, true);
  assert.equal(rogueMade.taken, 0);
  assert.equal(rogueMade.evaded, true);
  assert.equal(fighterMade.taken, 5);
  // A low face fails both saves, and Evasion halves the damage.
  const failed = cast(0, -10);
  const [rogueFailed, fighterFailed] = /** @type {any[]} */ (failed.ok ? failed.outcomes : []);
  assert.equal(rogueFailed.saved, false);
  assert.equal(rogueFailed.taken, Math.floor(fighterFailed.taken / 2));
  // Only a DEX save that halves on a success counts.
  assert.equal(evades({ saveAbility: 'CON', halfOnSave: true }, { evasion: true }), false);
  assert.equal(evades({ saveAbility: 'DEX', halfOnSave: false }, { evasion: true }), false);
  assert.equal(evades({ saveAbility: 'DEX', halfOnSave: true }, {}), false);
});
