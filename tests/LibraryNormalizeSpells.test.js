import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLibrary } from '../src/library/LibraryNormalize.js';
import { DEFAULT_FEATS } from '../src/data/feats.js';

test('normalizeLibrary repairs spells: id, defaults, effect shape, and drops nameless', () => {
  const lib = normalizeLibrary({
    spells: [
      // A minimal save spell with a bogus school/ability and a garbage damage term.
      {
        name: ' Scorch ',
        level: '2',
        school: 'pyromancy',
        effect: {
          kind: 'save',
          saveAbility: 'LUCK',
          damage: [{ count: 0, sides: 7, damageType: 'psychic' }, 'junk'],
          halfOnSave: true,
        },
      },
      // An unknown effect kind collapses to utility.
      { name: 'Mystery', effect: { kind: 'bogus' } },
      // Nameless -> dropped.
      { level: 1 },
    ],
  });
  assert.equal(lib.spells.length, 2);
  const scorch = lib.spells[0];
  assert.equal(scorch.name, 'Scorch');
  assert.equal(scorch.id, 'scorch');
  assert.equal(scorch.level, 2);
  assert.equal(scorch.school, 'abjuration', 'unknown school falls back to the first');
  assert.equal(scorch.effect.kind, 'save');
  assert.equal(scorch.effect.saveAbility, 'DEX', 'unknown ability falls back to DEX');
  assert.deepEqual(
    scorch.effect.damage,
    [{ count: 1, sides: 4, damageType: 'psychic' }],
    'the bad die repairs, the non-object term drops',
  );
  assert.equal(lib.spells[1].effect.kind, 'utility');
  assert.deepEqual(scorch.castingTime, { kind: 'action' }, 'absent timing gets the usual default');
  assert.deepEqual(scorch.duration, { kind: 'instantaneous' });
});

test('normalizeLibrary keeps a positive HP limit on a save spell', () => {
  const lib = normalizeLibrary({
    spells: [
      { name: 'Stun', effect: { kind: 'save', saveAbility: 'CON', hpLimit: 150 } },
      { name: 'Odd', effect: { kind: 'save', saveAbility: 'CON', hpLimit: -3 } },
    ],
  });
  assert.equal(lib.spells[0].effect.hpLimit, 150);
  assert.equal(lib.spells[1].effect.hpLimit, undefined);
});

test('normalizeLibrary reads spell timing as either a structured value or printed text', () => {
  const lib = normalizeLibrary({
    spells: [
      // A library written before timing was structured carries the printed text.
      { name: 'Old', castingTime: '10 minutes', duration: 'Concentration, up to 1 minute' },
      { name: 'New', castingTime: { kind: 'bonus' }, duration: { kind: 'rounds', amount: 3 } },
      // Neither the parser nor a GM can classify this, so it survives as text.
      { name: 'Odd', castingTime: 'one long night', duration: 'while the choir sings' },
    ],
  });
  assert.deepEqual(lib.spells[0].castingTime, { kind: 'minutes', amount: 10 });
  assert.deepEqual(lib.spells[0].duration, { kind: 'minutes', amount: 1, upTo: true });
  assert.deepEqual(lib.spells[1].castingTime, { kind: 'bonus' });
  assert.deepEqual(lib.spells[1].duration, { kind: 'rounds', amount: 3 });
  assert.deepEqual(lib.spells[2].castingTime, { kind: 'special', text: 'one long night' });
  assert.deepEqual(lib.spells[2].duration, { kind: 'special', text: 'while the choir sings' });
});

test('normalizeLibrary reads an attack spell’s projectiles and drops an unusable block', () => {
  const lib = normalizeLibrary({
    spells: [
      {
        name: 'Rays',
        effect: {
          kind: 'attack',
          damage: [{ count: 2, sides: 6, damageType: 'fire' }],
          projectiles: { count: '3', perStep: 1, autoHit: true },
        },
      },
      // Nothing usable written, so the entry stays the single-roll attack every
      // spell authored before projectiles existed is.
      { name: 'Bolt', effect: { kind: 'attack', damage: [], projectiles: { count: 'lots' } } },
      { name: 'Plain', effect: { kind: 'attack', damage: [] } },
    ],
  });
  const [rays, bolt, plain] = lib.spells;
  assert.deepEqual(/** @type {any} */ (rays.effect).projectiles, {
    count: 3,
    perStep: 1,
    autoHit: true,
  });
  assert.equal(/** @type {any} */ (bolt.effect).projectiles, undefined);
  assert.equal(/** @type {any} */ (plain.effect).projectiles, undefined);
});

test('normalizeLibrary types a heal spell’s dice as healing, not as damage', () => {
  const lib = normalizeLibrary({
    spells: [
      {
        name: 'Mend',
        effect: { kind: 'heal', healing: [{ count: 2, sides: 8, damageType: 'healing' }] },
        scaling: { damagePerLevel: [{ count: 1, sides: 8, damageType: 'healing' }] },
      },
      // Healing is not one of the 13 damage types, so validating it against them
      // used to repair a heal spell into slashing on every edit or import.
      {
        name: 'Botched',
        effect: { kind: 'heal', healing: [{ count: 1, sides: 8, damageType: 'fire' }] },
        scaling: { damagePerLevel: [{ count: 1, sides: 8, damageType: 'fire' }] },
      },
    ],
  });
  const [mend, botched] = lib.spells;
  assert.equal(/** @type {any} */ (mend.effect).healing[0].damageType, 'healing');
  assert.equal(mend.scaling?.damagePerLevel?.[0].damageType, 'healing');
  assert.equal(/** @type {any} */ (botched.effect).healing[0].damageType, 'healing');
  assert.equal(botched.scaling?.damagePerLevel?.[0].damageType, 'healing');
});

test('normalizeLibrary keeps the modifier flag of a heal spell only when it is true', () => {
  const lib = normalizeLibrary({
    spells: [
      { name: 'Mend', effect: { kind: 'heal', healing: [], addsModifier: true } },
      { name: 'Odd', effect: { kind: 'heal', healing: [], addsModifier: 'yes' } },
    ],
  });
  assert.equal(/** @type {any} */ (lib.spells[0].effect).addsModifier, true);
  assert.equal('addsModifier' in lib.spells[1].effect, false);
});

test('normalizeLibrary keeps a damage term’s flat bonus, dice or not', () => {
  const lib = normalizeLibrary({
    spells: [
      {
        name: 'Darts',
        effect: { kind: 'attack', damage: [{ count: 1, sides: 4, damageType: 'force', bonus: 1 }] },
      },
      // A fixed amount with no dice behind it, which only a bonus can express.
      { name: 'Spark', effect: { kind: 'attack', damage: [{ count: 0, bonus: '2' }] } },
      { name: 'Plain', effect: { kind: 'attack', damage: [{ count: 1, sides: 6 }] } },
    ],
  });
  const [darts, spark, plain] = lib.spells;
  assert.equal(/** @type {any} */ (darts.effect).damage[0].bonus, 1);
  assert.deepEqual(/** @type {any} */ (spark.effect).damage[0].count, 0);
  assert.deepEqual(/** @type {any} */ (spark.effect).damage[0].bonus, 2);
  assert.equal(
    'bonus' in /** @type {any} */ (plain.effect).damage[0],
    false,
    'an unbonused term keeps the shape it had before the field existed',
  );
});

test('normalizeLibrary keeps a spell entry that states every descriptive field', () => {
  const lib = normalizeLibrary({
    spells: [
      {
        id: 'ember-dart',
        name: 'Ember Dart',
        school: 'evocation',
        classes: ['wizard', 7, 'sorcerer'],
        range: '60 feet',
        description: 'A mote of fire streaks to the target.',
        targetCount: 2,
        effect: { kind: 'attack', damage: [{ count: 1, sides: 6, damageType: 'fire' }] },
        scaling: { targetsPerLevel: 1 },
      },
      // The same fields written as values the schema cannot use.
      {
        name: 'Muddle',
        school: 7,
        classes: 'wizard',
        range: { far: true },
        description: null,
        targetCount: null,
      },
    ],
  });
  const [dart, muddle] = lib.spells;
  assert.equal(dart.id, 'ember-dart', 'a stated id is kept, not sluggified from the name');
  assert.equal(dart.school, 'evocation');
  assert.deepEqual(dart.classes, ['wizard', 'sorcerer'], 'non-string classes drop');
  assert.equal(dart.range, '60 feet');
  assert.equal(dart.description, 'A mote of fire streaks to the target.');
  assert.equal(dart.targetCount, 2);
  assert.deepEqual(dart.scaling, { targetsPerLevel: 1 }, 'targets scale without damage dice');
  assert.equal(muddle.id, 'muddle');
  assert.equal(muddle.school, 'abjuration');
  assert.deepEqual(muddle.classes, []);
  assert.equal(muddle.range, 'Self');
  assert.equal(muddle.description, '');
  assert.equal('targetCount' in muddle, false, 'an explicit null reads as no target count');
});

test('normalizeLibrary carries a caster class that states nothing else', () => {
  const lib = normalizeLibrary({
    creatures: [{ name: 'Hedge Witch', class: 'druid', casterLevel: 'later' }],
  });
  const witch = lib.creatures[0];
  assert.equal(witch.class, 'druid');
  assert.equal('subclass' in witch, false);
  assert.equal('casterLevel' in witch, false, 'an unusable level is left for a default to fill');
  assert.deepEqual(witch.spellbook, { cantrips: [], known: [], prepared: [] });
});

test('normalizeLibrary keeps a named material and implies the M letter', () => {
  const lib = normalizeLibrary({
    spells: [
      {
        name: 'Revive',
        components: ['V', 'S', 'M'],
        materials: { text: ' diamonds worth 300 gp ', costGP: '300', consumed: 'yes' },
      },
      // A material named without the letter beside it: the block is what makes it
      // an M component, so the letter is added rather than the material dropped.
      { name: 'Spark', components: ['V'], materials: { text: 'a pinch of dust' } },
      { name: 'Word', components: ['V'] },
    ],
  });
  const [revive, spark, word] = lib.spells;
  assert.deepEqual(revive.materials, {
    text: 'diamonds worth 300 gp',
    costGP: 300,
    consumed: true,
  });
  assert.deepEqual(spark.materials, { text: 'a pinch of dust', consumed: false });
  assert.deepEqual(spark.components, ['V', 'M']);
  assert.equal('materials' in word, false, 'a spell with no material carries no block');
  assert.deepEqual(word.components, ['V']);
});

test('normalizeLibrary repairs attack/heal effects, save conditions, and scaling', () => {
  const lib = normalizeLibrary({
    spells: [
      {
        name: 'Bolt',
        effect: { kind: 'attack', damage: [{ count: 2, sides: 6, damageType: 'fire' }] },
        scaling: {
          damagePerLevel: [{ count: 1, sides: 6, damageType: 'fire' }],
          targetsPerLevel: 1,
        },
      },
      {
        name: 'Mend',
        effect: { kind: 'heal', healing: [{ count: 1, sides: 8, damageType: 'none' }] },
      },
      {
        name: 'Hold',
        effect: {
          kind: 'save',
          saveAbility: 'WIS',
          damage: [],
          halfOnSave: false,
          condition: 'paralyzed',
        },
      },
    ],
  });
  const bolt = lib.spells.find((s) => s.name === 'Bolt');
  assert.equal(bolt.effect.kind, 'attack');
  assert.equal(bolt.effect.damage[0].count, 2);
  assert.deepEqual(bolt.scaling.damagePerLevel, [{ count: 1, sides: 6, damageType: 'fire' }]);
  assert.equal(bolt.scaling.targetsPerLevel, 1);
  const mend = lib.spells.find((s) => s.name === 'Mend');
  assert.equal(mend.effect.kind, 'heal');
  assert.equal(mend.effect.healing[0].sides, 8);
  const hold = lib.spells.find((s) => s.name === 'Hold');
  assert.equal(hold.effect.condition, 'paralyzed');
});

test('normalizeLibrary keeps the class sources of a template spellbook', () => {
  const lib = normalizeLibrary({
    creatures: [
      {
        name: 'Hexer',
        disposition: 'hostile',
        class: 'warlock',
        spellbook: {
          cantrips: [],
          known: ['hex'],
          prepared: [],
          sources: { hex: 'warlock', bad: 3 },
        },
      },
    ],
  });
  assert.deepEqual(lib.creatures[0].spellbook.sources, { hex: 'warlock' });
});

test('normalizeLibrary keeps a rider only alongside a chip to carry it', () => {
  const rider = { rolls: ['attack', 'save'], dice: -1, die: 'd4' };
  const lib = normalizeLibrary({
    spells: [
      { name: 'Bane', effect: { kind: 'save', saveAbility: 'CHA', condition: 'Bane', rider } },
      // No condition, so nothing carries the rider.
      { name: 'Scorch', effect: { kind: 'save', saveAbility: 'DEX', rider } },
      // A buff always has a chip, named or not.
      { name: 'Bless', effect: { kind: 'buff', condition: 'Bless', rider } },
      { name: 'Shielded', effect: { kind: 'buff' } },
      // Junk in the rider block drops the block, not the spell.
      { name: 'Noise', effect: { kind: 'buff', rider: { rolls: ['wibble'], dice: 1 } } },
    ],
  });
  assert.deepEqual(lib.spells[0].effect.rider, rider);
  assert.equal(lib.spells[1].effect.rider, undefined);
  assert.deepEqual(lib.spells[2].effect.rider, rider);
  assert.deepEqual(lib.spells[3].effect, { kind: 'buff' });
  assert.deepEqual(lib.spells[4].effect, { kind: 'buff' });
});

test('normalizeLibrary trims a buff’s chip name and drops an empty one', () => {
  const lib = normalizeLibrary({
    spells: [
      { name: 'Bless', effect: { kind: 'buff', condition: '  Bless  ' } },
      { name: 'Plain', effect: { kind: 'buff', condition: '   ' } },
    ],
  });
  assert.equal(lib.spells[0].effect.condition, 'Bless');
  assert.equal(lib.spells[1].effect.condition, undefined);
});

test('normalizeLibrary keeps a summons, and clamps its counts', () => {
  const lib = normalizeLibrary({
    spells: [
      {
        name: 'Conjure',
        effect: { kind: 'summons', creature: '  Wolf  ', count: 4, countPerStep: 2 },
      },
      // A count below one would summon nothing, and an absent one reads as one.
      { name: 'Single', effect: { kind: 'summons', creature: 'Wolf', count: 0 } },
      { name: 'Unnumbered', effect: { kind: 'summons', creature: 'Wolf' } },
      // A per-step count of zero is not scaling, so the field stays absent.
      { name: 'Flat', effect: { kind: 'summons', creature: 'Wolf', count: 2, countPerStep: 0 } },
    ],
  });
  assert.deepEqual(lib.spells[0].effect, {
    kind: 'summons',
    creature: 'Wolf',
    count: 4,
    countPerStep: 2,
  });
  assert.equal(lib.spells[1].effect.count, 1);
  assert.equal(lib.spells[2].effect.count, 1);
  assert.deepEqual(lib.spells[3].effect, { kind: 'summons', creature: 'Wolf', count: 2 });
});

test('normalizeLibrary degrades a summons that names no creature', () => {
  const lib = normalizeLibrary({
    spells: [
      { name: 'Nameless', effect: { kind: 'summons', count: 4 } },
      { name: 'Blank', effect: { kind: 'summons', creature: '   ', count: 4 } },
    ],
  });
  // The creature is the whole effect, so an entry without one casts nothing.
  assert.deepEqual(lib.spells[0].effect, { kind: 'utility' });
  assert.deepEqual(lib.spells[1].effect, { kind: 'utility' });
});

test('normalizeLibrary repairs feat effects one by one and keeps the feat', () => {
  const lib = normalizeLibrary({
    feats: [
      {
        name: '  Homebrew  ',
        prerequisite: ' Strength 13 ',
        repeatable: 1,
        effects: [
          { kind: 'asi', abilities: ['STR', 'STR', 'nope', 7] },
          { kind: 'asi', abilities: 'garbage' },
          { kind: 'proficiency', skills: { choose: 99 }, armor: ['heavy', 'pauldron'] },
          { kind: 'proficiency', skills: ['stealth', 'stealth', 'flying'] },
          { kind: 'proficiency', saves: { choose: 0 }, tools: [3, '  '] },
          { kind: 'rider', rider: { rolls: ['attack'], flat: 2 } },
          { kind: 'rider', rider: { rolls: [] } },
          { kind: 'mystery' },
          'nope',
        ],
      },
      { name: 'Plain' },
      { effects: [] },
    ],
  });
  assert.equal(lib.feats.length, 2, 'a nameless entry drops');
  const feat = lib.feats[0];
  assert.equal(feat.id, 'homebrew');
  assert.equal(feat.name, 'Homebrew');
  assert.equal(feat.prerequisite, 'Strength 13');
  assert.equal(feat.repeatable, true);
  assert.deepEqual(feat.effects, [
    { kind: 'asi', abilities: ['STR'] },
    { kind: 'asi', abilities: [] },
    { kind: 'proficiency', skills: { choose: 18, from: [] }, armor: ['heavy'] },
    { kind: 'proficiency', skills: { choose: 1, from: ['stealth'] } },
    { kind: 'rider', rider: { rolls: ['attack'], flat: 2 } },
  ]);
  const plain = lib.feats[1];
  assert.equal(plain.description, '');
  assert.equal('prerequisite' in plain, false);
  assert.equal('repeatable' in plain, false);
  assert.deepEqual(plain.effects, []);
});

test('a lowercased asi ability list narrows the choice instead of widening it', () => {
  const lib = normalizeLibrary({
    feats: [{ name: 'Casing', effects: [{ kind: 'asi', abilities: ['str', 'Dex'] }] }],
  });
  assert.deepEqual(lib.feats[0].effects, [{ kind: 'asi', abilities: ['STR', 'DEX'] }]);
});

test('normalizeLibrary dedupes feats by name and keeps a supplied id', () => {
  const lib = normalizeLibrary({
    feats: [
      { name: 'Edge', id: 'kept-id' },
      { name: ' EDGE ', description: 'last wins' },
    ],
  });
  assert.equal(lib.feats.length, 1);
  assert.equal(lib.feats[0].description, 'last wins');
  assert.equal(lib.feats[0].id, 'edge', 'the surviving entry slugs its own id');
});

test('every built-in feat effect survives its own normalizer unchanged', () => {
  const lib = normalizeLibrary({ feats: DEFAULT_FEATS });
  assert.deepEqual(lib.feats, DEFAULT_FEATS);
});

test('normalizeLibrary keeps the HP pool, the kill, and the end on damage of a save spell', () => {
  const lib = normalizeLibrary({
    spells: [
      {
        name: 'Doze',
        effect: {
          kind: 'save',
          saveAbility: 'WIS',
          condition: 'Unconscious',
          hpPool: { count: 3, sides: 6 },
          endsOnDamage: true,
          kills: true,
        },
      },
    ],
  });
  const effect = /** @type {any} */ (lib.spells[0].effect);
  assert.deepEqual(effect.hpPool, { count: 3, sides: 6 });
  assert.equal(effect.endsOnDamage, true);
  assert.equal(effect.kills, true);
});

test('normalizeLibrary keeps a buff chip change and its boundary', () => {
  const lib = normalizeLibrary({
    spells: [
      {
        name: 'Ward',
        effect: { kind: 'buff', mods: { ac: 5, acMin: 'x' }, until: 'caster-start' },
      },
      { name: 'Dud', effect: { kind: 'buff', mods: { ac: 0 }, until: 'someday' } },
    ],
  });
  assert.deepEqual(lib.spells[0].effect, { kind: 'buff', mods: { ac: 5 }, until: 'caster-start' });
  assert.deepEqual(lib.spells[1].effect, { kind: 'buff' });
});

test('normalizeLibrary keeps a buff HP raise and temporary HP', () => {
  const lib = normalizeLibrary({
    spells: [
      {
        name: 'Boon',
        effect: {
          kind: 'buff',
          mods: { maxHP: 5 },
          modsPerStep: { maxHP: 'x' },
          tempHP: { count: 2, sides: 7, flat: 3 },
          tempEachTurn: 'yes',
        },
      },
    ],
  });
  assert.deepEqual(lib.spells[0].effect, {
    kind: 'buff',
    mods: { maxHP: 5 },
    tempHP: { count: 0, sides: 4, flat: 3 },
  });
});
