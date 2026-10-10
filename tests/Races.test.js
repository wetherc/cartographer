import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RACE_LIST,
  getRace,
  withRace,
  withCustomRace,
  resolveRace,
  validRacePicks,
  raceCantrips,
} from '../src/entities/Races.js';
import {
  createCharacter,
  withDefaults,
  learnCantrip,
  unlearnCantrip,
  spellSource,
} from '../src/entities/Character.js';
import { withClasses } from '../src/entities/Multiclass.js';
import { cantripLimit, spellSaveDC, spellAttackBonus } from '../src/entities/Classes.js';

test('getRace resolves known ids and rejects unknown or absent ones', () => {
  assert.equal(getRace('dwarf')?.name, 'Dwarf');
  assert.equal(getRace('modron'), null);
  assert.equal(getRace(undefined), null);
  assert.equal(getRace(null), null);
  assert.equal(getRace(''), null);
});

test('withRace assigns name, id, and a snapshot of the definition', () => {
  const c = withRace(createCharacter('c1', 'Durnan'), 'dwarf');
  assert.equal(c.race, 'Dwarf');
  assert.equal(c.raceId, 'dwarf');
  assert.equal(c.raceTraits?.speed, 25);
  assert.deepEqual(c.raceTraits?.abilityIncreases, { CON: 2, WIS: 1 });
  assert.deepEqual(c.raceTraits?.resistances, ['poison']);
  assert.equal(c.raceTraits?.keepsSpeedInArmor, true);
  assert.equal('keepsSpeedInArmor' in (withRace(c, 'elf').raceTraits ?? {}), false);
});

test('withRace snapshot shares nothing with the catalog definition', () => {
  const c = withRace(createCharacter('c1', 'Durnan'), 'dwarf');
  const def = getRace('dwarf');
  assert.notEqual(c.raceTraits.traits, def.traits);
  assert.notEqual(c.raceTraits.abilityIncreases, def.abilityIncreases);
  c.raceTraits.traits.push('mutated');
  assert.ok(!def.traits.includes('mutated'));
});

test('withRace with an unknown id leaves the character unchanged', () => {
  const c = createCharacter('c1', 'Durnan');
  assert.equal(withRace(c, 'modron'), c);
});

test('withRace adds the definition ability increases to the scores', () => {
  const base = createCharacter('c1', 'Durnan', { CON: 12, WIS: 8 });
  const c = withRace(base, 'dwarf');
  assert.equal(c.stats.CON, 14);
  assert.equal(c.stats.WIS, 9);
  assert.equal(c.stats.STR, base.stats.STR, 'an ability the race skips is untouched');
});

test('withRace applied twice grants the increase once', () => {
  const base = createCharacter('c1', 'Durnan', { CON: 12 });
  assert.equal(withRace(withRace(base, 'dwarf'), 'dwarf').stats.CON, 14);
});

test('withRace swaps one race bonus for the next instead of stacking', () => {
  const base = createCharacter('c1', 'Durnan', { CON: 12, DEX: 10 });
  const swapped = withRace(withRace(base, 'dwarf'), 'elf');
  assert.equal(swapped.stats.CON, 12, "the dwarf's increase comes back off");
  assert.equal(swapped.stats.DEX, 12, "the elf's lands");
});

test('withRace takes back the increases the snapshot recorded, not the catalog ones', () => {
  const base = createCharacter('c1', 'Durnan', { CON: 12, DEX: 10 });
  const dwarf = withRace(base, 'dwarf');
  // A save written before the catalog was edited: the snapshot says +4 CON was
  // applied, so that is what switching races has to undo.
  const stale = {
    ...dwarf,
    stats: { ...dwarf.stats, CON: 16 },
    raceTraits: { ...dwarf.raceTraits, abilityIncreases: { CON: 4 } },
  };
  assert.equal(withRace(stale, 'elf').stats.CON, 12);
});

test('withCustomRace keeps the hand-typed string and drops catalog fields', () => {
  const picked = withRace(createCharacter('c1', 'Durnan', { DEX: 10 }), 'elf');
  const c = withCustomRace(picked, 'Githzerai');
  assert.equal(c.race, 'Githzerai');
  assert.equal(c.raceId, undefined);
  assert.equal(c.raceTraits, undefined);
  assert.equal(c.stats.DEX, 10, "the dropped race's increase goes with it");
});

test('withCustomRace on a character that never had a catalog race keeps the scores', () => {
  const c = withCustomRace(createCharacter('c1', 'Nim', { DEX: 15 }), 'Githzerai');
  assert.equal(c.stats.DEX, 15);
});

test('resolveRace prefers the live catalog over the stored snapshot', () => {
  const c = withRace(createCharacter('c1', 'Durnan'), 'halfling');
  const stale = { ...c, raceTraits: { ...c.raceTraits, speed: 99 } };
  assert.equal(resolveRace(stale)?.speed, 25);
});

test('resolveRace reports the ability increases the character actually got', () => {
  const c = withRace(createCharacter('c1', 'Durnan'), 'halfling');
  // Only the snapshot knows what was added to the scores, so a catalog edit
  // must not show up here as a bonus the character was never granted.
  const edited = { ...c, raceTraits: { ...c.raceTraits, abilityIncreases: { DEX: 1 } } };
  assert.deepEqual(resolveRace(edited)?.abilityIncreases, { DEX: 1 });
  assert.equal(resolveRace(edited)?.speed, 25, 'everything else still comes from the catalog');
});

test('resolveRace falls back to the snapshot when the definition is gone', () => {
  const c = withRace(createCharacter('c1', 'Durnan'), 'gnome');
  const orphaned = { ...c, raceId: 'deleted-custom-race' };
  assert.equal(resolveRace(orphaned)?.speed, 25);
  assert.deepEqual(resolveRace(orphaned)?.languages, ['Common', 'Gnomish']);
});

test('resolveRace is null for a hand-typed race', () => {
  const c = withCustomRace(createCharacter('c1', 'Durnan'), 'Githzerai');
  assert.equal(resolveRace(c), null);
});

test('withDefaults preserves catalog race fields on a round-trip', () => {
  const c = withRace(createCharacter('c1', 'Durnan'), 'tiefling');
  const loaded = withDefaults(JSON.parse(JSON.stringify(c)));
  assert.equal(loaded.raceId, 'tiefling');
  assert.equal(loaded.race, 'Tiefling');
  assert.deepEqual(loaded.raceTraits.resistances, ['fire']);
});

test('every catalog race can be assigned and resolved', () => {
  for (const def of RACE_LIST) {
    const c = withRace(createCharacter('c1', 'X'), def.id);
    assert.equal(c.raceId, def.id, def.id);
    assert.equal(resolveRace(c)?.speed, def.speed, def.id);
  }
});

test('an ability the character has no score for reads as 10 before the increase', () => {
  const partial = /** @type {any} */ ({
    id: 'c1',
    name: 'Durnan',
    level: 1,
    stats: { STR: 14 },
    resources: [],
    inventory: [],
    conditions: [],
  });
  const c = withRace(partial, 'dwarf');
  assert.equal(c.stats.CON, 12); // 10 + 2
  assert.equal(c.stats.WIS, 11); // 10 + 1
  assert.equal(c.stats.STR, 14); // untouched
});

test('withRace adds chosen abilities and skills, and a race change takes them back', () => {
  const base = createCharacter('c1', 'Mira', { STR: 10, DEX: 10, CHA: 10 });
  const half = withRace(base, 'half-elf', {
    abilities: ['STR', 'STR', 'DEX'],
    skills: ['stealth'],
  });
  assert.deepEqual(half.raceTraits?.abilityIncreases, { CHA: 2, STR: 1, DEX: 1 });
  assert.deepEqual(half.raceTraits?.chosenSkills, ['stealth']);
  assert.deepEqual(resolveRace(half)?.chosenSkills, ['stealth']);
  const elf = withRace(half, 'elf');
  assert.equal(elf.stats.STR, 10);
  assert.equal(elf.stats.CHA, 10);
  assert.equal(elf.stats.DEX, 12);
  assert.equal(elf.raceTraits?.chosenSkills, undefined);
});

test('validRacePicks drops picks for a race with no choice and caps the counts', () => {
  const dwarf = /** @type {any} */ (getRace('dwarf'));
  assert.deepEqual(validRacePicks(dwarf, { abilities: ['STR'], skills: ['stealth'] }), {
    abilities: [],
    skills: [],
    resistance: null,
    tool: null,
    cantrip: null,
  });
  const half = /** @type {any} */ (getRace('half-elf'));
  assert.deepEqual(
    validRacePicks(half, { abilities: ['CHA', 'STR', 'DEX', 'CON'], skills: ['a', 'b', 'c'] }),
    { abilities: ['STR', 'DEX'], skills: ['a', 'b'], resistance: null, tool: null, cantrip: null },
  );
  assert.deepEqual(validRacePicks(half, {}), {
    abilities: [],
    skills: [],
    resistance: null,
    tool: null,
    cantrip: null,
  });
});

test('a Dwarf tool pick joins the tools and outlasts a resolve', () => {
  const dwarf = withRace(createCharacter('d', 'D'), 'dwarf', { tool: "brewer's supplies" });
  assert.deepEqual(dwarf.raceTraits?.tools, ["brewer's supplies"]);
  assert.equal(resolveRace(dwarf)?.chosenTool, "brewer's supplies");
  assert.deepEqual(resolveRace(dwarf)?.tools, ["brewer's supplies"]);
  const none = withRace(createCharacter('d', 'D'), 'dwarf', { tool: 'lute' });
  assert.equal(none.raceTraits?.chosenTool, undefined);
  assert.deepEqual(none.raceTraits?.tools, []);
});

test('a High Elf cantrip joins the spellbook as a wizard cantrip outside the limit', () => {
  const fighter = withClasses(createCharacter('e', 'E', { INT: 14 }), [
    { classId: 'fighter', level: 1 },
  ]);
  const elf = withRace(fighter, 'elf', { cantrip: 'fire-bolt' });
  assert.equal(elf.raceTraits?.chosenCantrip, 'fire-bolt');
  assert.equal(resolveRace(elf)?.chosenCantrip, 'fire-bolt');
  assert.deepEqual(elf.spellbook?.cantrips, ['fire-bolt']);
  assert.equal(elf.spellbook?.sources?.['fire-bolt'], 'wizard');
  assert.deepEqual(raceCantrips(elf), ['fire-bolt']);
  assert.equal(cantripLimit(elf), 1);
  // INT 14 + 1 from the race is 15 (+2), and proficiency at level 1 is +2.
  assert.equal(spellSaveDC(elf, spellSource(elf, 'fire-bolt') ?? undefined), 12);
  assert.equal(spellAttackBonus(elf, 'wizard'), 4);
});

test('a new race cantrip pick replaces the old one, and a race change removes it', () => {
  const elf = withRace(createCharacter('e', 'E'), 'elf', { cantrip: 'fire-bolt' });
  const swapped = withRace(elf, 'elf', { cantrip: 'light' });
  assert.deepEqual(swapped.spellbook?.cantrips, ['light']);
  assert.deepEqual(swapped.spellbook?.sources, { light: 'wizard' });
  const human = withRace(swapped, 'human');
  assert.deepEqual(human.spellbook?.cantrips, []);
  assert.equal(human.raceTraits?.chosenCantrip, undefined);
  const custom = withCustomRace(swapped, 'Sea elf');
  assert.deepEqual(custom.spellbook?.cantrips, []);
});

test('a race cantrip the character knows from a class stays a class cantrip', () => {
  const wizard = learnCantrip(
    withClasses(createCharacter('w', 'W'), [{ classId: 'wizard', level: 1 }]),
    'fire-bolt',
    'wizard',
  );
  const elf = withRace(wizard, 'elf', { cantrip: 'fire-bolt' });
  assert.equal(elf.raceTraits?.chosenCantrip, undefined);
  assert.deepEqual(elf.spellbook?.cantrips, ['fire-bolt']);
  assert.equal(cantripLimit(elf), cantripLimit(wizard));
  assert.equal(
    validRacePicks(/** @type {any} */ (getRace('dwarf')), { cantrip: 'light' }).cantrip,
    null,
  );
});

test('forgetting the race cantrip clears the race record', () => {
  const elf = withRace(createCharacter('e', 'E'), 'elf', { cantrip: 'light' });
  const forgot = unlearnCantrip(elf, 'light');
  assert.equal(forgot.raceTraits?.chosenCantrip, undefined);
  assert.deepEqual(raceCantrips(forgot), []);
  assert.equal(cantripLimit(forgot), 0);
  const other = unlearnCantrip(elf, 'fire-bolt');
  assert.equal(other.raceTraits?.chosenCantrip, 'light');
});
