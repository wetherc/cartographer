import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initiativeReadout } from '../src/view/InitiativeBadge.js';
import { createCharacter } from '../src/entities/Character.js';
import { setExhaustion } from '../src/entities/Exhaustion.js';

test('a DEX 18 character reads Init +4', () => {
  const wren = createCharacter('w', 'Wren', { DEX: 18 });
  assert.deepEqual(initiativeReadout(wren), {
    label: 'Init +4',
    note: 'Initiative bonus (DEX modifier)',
  });
});

test('exhaustion leaves the initiative badge alone and names the disadvantage', () => {
  const tired = setExhaustion(createCharacter('w', 'Wren', { DEX: 18 }), 1);
  assert.deepEqual(initiativeReadout(tired), {
    label: 'Init +4',
    note: 'Initiative bonus (DEX modifier). Exhaustion 1: disadvantage',
  });
});
