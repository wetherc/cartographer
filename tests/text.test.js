import { test } from 'node:test';
import assert from 'node:assert/strict';

import { article, capitalize, slugify, splitList, splitTrimmedList } from '../src/util/text.js';

test('article picks "an" before a vowel letter and "a" otherwise', () => {
  assert.equal(article('Acrobatics check'), 'an');
  assert.equal(article('Insight check'), 'an');
  assert.equal(article('Stealth check'), 'a');
  assert.equal(article('DEX saving throw'), 'a');
  assert.equal(article('INT saving throw'), 'an');
});

test('article reads an empty string as taking "a"', () => {
  assert.equal(article(''), 'a');
});

test('capitalize uppercases only the first character', () => {
  assert.equal(capitalize('friendly'), 'Friendly');
  assert.equal(capitalize('general store'), 'General store');
  assert.equal(capitalize('Already'), 'Already');
});

test('capitalize passes empty and single-character strings through', () => {
  assert.equal(capitalize(''), '');
  assert.equal(capitalize('a'), 'A');
});

test('slugify lowercases and dashes a name', () => {
  assert.equal(slugify('Healing Potion'), 'healing-potion');
  assert.equal(slugify('  Rope  '), 'rope');
  assert.equal(slugify(''), '');
});

test('slugify collapses a run of whitespace into one dash', () => {
  assert.equal(slugify('Bag   of  Holding'), 'bag-of-holding');
  assert.equal(slugify('Cloak\tof\nElvenkind'), 'cloak-of-elvenkind');
});

test('slugify gives two spellings of the same name the same id', () => {
  assert.equal(slugify('Healing potion'), slugify('  HEALING   POTION '));
});

test('slugify collapses punctuation too, and trims the dashes it makes', () => {
  assert.equal(slugify("  D'artagnan the 3rd! "), 'd-artagnan-the-3rd');
  assert.equal(slugify('Potion of Healing (Greater)'), 'potion-of-healing-greater');
  // Nothing usable is left, so the caller decides on a fallback. Roster's
  // slugId is the one that supplies "entry".
  assert.equal(slugify('!!!'), '');
});

test('splitList reads the comma-joined convention, dropping empty segments', () => {
  assert.deepEqual(splitList('a,b,c'), ['a', 'b', 'c']);
  assert.deepEqual(splitList('a,,c'), ['a', 'c']);
  assert.deepEqual(splitList(''), []);
  assert.deepEqual(splitList(undefined), []);
});

test('splitList leaves the segments as written', () => {
  assert.deepEqual(splitList('elvish, dwarvish'), ['elvish', ' dwarvish']);
});

test('splitTrimmedList trims each segment and drops the blank ones', () => {
  assert.deepEqual(splitTrimmedList('elvish, dwarvish'), ['elvish', 'dwarvish']);
  assert.deepEqual(splitTrimmedList(' a , , b '), ['a', 'b']);
  assert.deepEqual(splitTrimmedList('   '), []);
  assert.deepEqual(splitTrimmedList(undefined), []);
});
