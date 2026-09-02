import { test } from 'node:test';
import assert from 'node:assert/strict';
import { idClaimer, renameConflict } from '../src/library/LibraryIdentity.js';
import {
  DEFAULT_CREATURES,
  nameKey,
  normalizeLibrary,
  setActiveLibrary,
  activeSpellIndex,
  activeSpells,
  resolveSpellIds,
} from '../src/library/Library.js';
import { DEFAULT_SPELLS } from '../src/data/spells.js';
import { DEFAULT_FEATS } from '../src/data/feats.js';
import { hasWeaponProperty } from '../src/entities/Weapons.js';

const fireBolt = DEFAULT_SPELLS.find((s) => s.id === 'fire-bolt');
assert.ok(fireBolt, 'the catalog carries Fire Bolt');

// --- renameConflict ---------------------------------------------------------

test('renameConflict flags a rename of an existing entry onto a held name', () => {
  const found = { entry: { id: 'ember-dart' }, source: 'custom' };
  const target = { entry: { id: 'fire-bolt' }, source: 'default' };
  assert.equal(renameConflict({ found, target, renamed: true }), true);
  const override = { entry: { id: 'fire-bolt' }, source: 'override' };
  assert.equal(
    renameConflict({ found: override, target: { entry: { id: 'fireball' } }, renamed: true }),
    true,
    'a renamed override onto another entry is refused too',
  );
});

test('renameConflict allows an edit in place, a fresh name, and a new override', () => {
  const found = { entry: { id: 'ember-dart' }, source: 'custom' };
  assert.equal(renameConflict({ found, target: found, renamed: false }), false, 'same name');
  assert.equal(renameConflict({ found, target: null, renamed: true }), false, 'unused name');
  const target = { entry: { id: 'fire-bolt' }, source: 'default' };
  assert.equal(
    renameConflict({ found: null, target, renamed: true }),
    false,
    'a new entry that names a built-in stores as its override',
  );
});

// --- idClaimer ----------------------------------------------------------------

test('idClaimer keeps an explicit id that nothing else owns', () => {
  const claim = idClaimer(DEFAULT_SPELLS, nameKey);
  assert.equal(claim('ember-dart', 'Ember Dart', []), 'ember-dart');
  assert.equal(
    claim('fire-bolt', 'Fire Bolt', []),
    'fire-bolt',
    'an override keeps the default id',
  );
  assert.equal(claim('fire-bolt', '  fire bolt ', []), 'fire-bolt', 'name keys ignore case');
});

test('idClaimer reslugs an explicit id that names a different built-in entry', () => {
  const claim = idClaimer(DEFAULT_SPELLS, nameKey);
  assert.equal(claim('fire-bolt', 'Zap', []), 'zap');
});

test('idClaimer reslugs an explicit id an earlier entry already claimed', () => {
  const claim = idClaimer(DEFAULT_SPELLS, nameKey);
  assert.equal(claim('zap', 'Zip', ['zap']), 'zip');
  assert.equal(claim('zip', 'Zip', ['zip']), 'zip-2', 'the slug avoids the claimed id too');
});

test('idClaimer gives an entry without an id the id of the default it overrides', () => {
  const claim = idClaimer(DEFAULT_SPELLS, nameKey);
  assert.equal(claim(undefined, 'Fire Bolt', []), 'fire-bolt');
  assert.equal(claim('', 'Fire Bolt', []), 'fire-bolt', 'an empty id counts as none');
  assert.equal(claim(7, 'Fire Bolt', []), 'fire-bolt', 'a non-string id counts as none');
  assert.equal(
    claim(undefined, 'Fire Bolt', ['fire-bolt']),
    'fire-bolt-2',
    'unless an earlier entry already took that id',
  );
});

test('idClaimer slugs a new name away from every default id', () => {
  const claim = idClaimer(DEFAULT_SPELLS, nameKey);
  assert.equal(claim(undefined, 'Fire-Bolt!', []), 'fire-bolt-2');
  assert.equal(claim(undefined, 'Ember Dart', ['ember-dart']), 'ember-dart-2');
});

// --- normalizeLibrary id integrity ------------------------------------------

test('a custom spell cannot shadow a built-in by carrying its id', () => {
  const lib = normalizeLibrary({ spells: [{ name: 'Zap', id: 'fire-bolt' }] });
  assert.equal(lib.spells[0].id, 'zap');
  setActiveLibrary(lib);
  try {
    assert.equal(activeSpellIndex().get('fire-bolt')?.name, 'Fire Bolt');
    assert.equal(activeSpellIndex().get('zap')?.name, 'Zap');
    assert.equal(activeSpells().filter((s) => s.id === 'fire-bolt').length, 1);
    assert.deepEqual(
      resolveSpellIds(['fire-bolt', 'zap']).map((s) => s.name),
      ['Fire Bolt', 'Zap'],
    );
  } finally {
    setActiveLibrary(normalizeLibrary({}));
  }
});

test('two custom spells with one explicit id keep two ids', () => {
  const lib = normalizeLibrary({
    spells: [
      { name: 'Zap', id: 'spark' },
      { name: 'Zip', id: 'spark' },
    ],
  });
  assert.deepEqual(
    lib.spells.map((s) => s.id),
    ['spark', 'zip'],
  );
});

test('creature and feat ids follow the same rules', () => {
  const goblin = DEFAULT_CREATURES[0];
  const feat = DEFAULT_FEATS[0];
  const lib = normalizeLibrary({
    creatures: [{ name: 'Impostor', id: goblin.id }, { name: goblin.name.toUpperCase() }],
    feats: [{ name: 'Impostor', id: feat.id }, { name: feat.name }],
  });
  assert.equal(lib.creatures[0].id, 'impostor');
  assert.equal(lib.creatures[1].id, goblin.id, 'an override without an id adopts the default id');
  assert.equal(lib.feats[0].id, 'impostor');
  assert.equal(lib.feats[1].id, feat.id);
});

// --- creature level coercion ---------------------------------------------------

test('a null or written-as-text creature level reads as no level', () => {
  const lib = normalizeLibrary({
    creatures: [
      { name: 'Null', level: null },
      { name: 'Text', level: '3' },
      { name: 'Real', level: 3 },
    ],
  });
  const [nul, text, real] = lib.creatures;
  assert.equal('level' in nul, false);
  assert.equal('tier' in nul, false);
  assert.equal(nul.weapon, null, 'no level means no stamped gear');
  assert.equal('level' in text, false);
  assert.equal(real.level, 3);
  assert.equal(real.tier, 'mob');
  assert.ok(real.weapon, 'a leveled entry takes the level default gear');
});

test('a null caster level is left for the default to fill', () => {
  const lib = normalizeLibrary({
    creatures: [
      { name: 'Null', class: 'wizard', casterLevel: null },
      { name: 'Text', class: 'wizard', casterLevel: '5' },
      { name: 'Real', class: 'wizard', casterLevel: 5 },
    ],
  });
  assert.equal('casterLevel' in lib.creatures[0], false);
  assert.equal('casterLevel' in lib.creatures[1], false);
  assert.equal(lib.creatures[2].casterLevel, 5);
});

// --- weapon coercion -------------------------------------------------------------

test('a rejected weapon field cannot survive beside the coerced one', () => {
  const lib = normalizeLibrary({
    equipment: [
      {
        name: 'Odd Blade',
        type: 'weapon',
        kind: 'melee',
        properties: { a: 1 },
        range: 'far',
        damage: [{ count: 1, sides: 6, damageType: 'slashing' }],
      },
    ],
    creatures: [
      {
        name: 'Odd Wielder',
        weapon: {
          name: 'Odd Blade',
          kind: 'melee',
          properties: { a: 1 },
          versatileDamage: 'lots',
          damage: [{ count: 1, sides: 6, damageType: 'slashing' }],
        },
      },
    ],
  });
  const blade = lib.equipment[0];
  assert.equal('properties' in blade, false);
  assert.equal('range' in blade, false);
  assert.equal(blade.kind, 'melee');
  assert.equal(hasWeaponProperty(blade, 'finesse'), false, 'the attack path does not throw');
  const held = lib.creatures[0].weapon;
  assert.ok(held);
  assert.equal('properties' in held, false);
  assert.equal('versatileDamage' in held, false);
  assert.equal(hasWeaponProperty(held, 'finesse'), false);
});
