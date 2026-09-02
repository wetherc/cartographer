import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isSafeImageRef, safeImageRef } from '../src/storage/ImageRefs.js';

test('an inline image payload is accepted, other data URLs are not', () => {
  assert.equal(isSafeImageRef('data:image/png;base64,AAAA'), true);
  assert.equal(isSafeImageRef('data:image/svg+xml,%3Csvg%3E'), true);
  assert.equal(isSafeImageRef('data:text/html,<script>1</script>'), false);
  assert.equal(isSafeImageRef('data:,plain'), false);
});

test('an asset key is accepted in the alphabet the asset table uses', () => {
  assert.equal(isSafeImageRef('asset:1k9z0'), true);
  assert.equal(isSafeImageRef('asset:1k9z0~2'), true);
  assert.equal(isSafeImageRef('asset:'), false);
  assert.equal(isSafeImageRef('asset:UPPER'), false);
  assert.equal(isSafeImageRef('asset:1k9z0/../x'), false);
});

test('a relative path on this origin is accepted', () => {
  assert.equal(isSafeImageRef('assets/tiles/grass/grass-1.svg'), true);
  assert.equal(isSafeImageRef('assets/handouts/region.png'), true);
  assert.equal(isSafeImageRef('assets/tiles/a_b-c.d.png'), true);
  assert.equal(isSafeImageRef('grass.svg'), true);
});

test('a path that climbs out of its folder or reaches another host is rejected', () => {
  for (const ref of [
    '//evil.example/pixel.png',
    'https://evil.example/pixel.png',
    'http://evil.example/pixel.png',
    '/assets/tiles/grass/grass-1.svg',
    'assets/../index.html',
    'assets/tiles/../../secret.png',
    'assets//tiles/grass-1.svg',
    'assets/tiles/./grass-1.svg',
    'assets/tiles/grass 1.svg',
    'assets/tiles/grass?x=1',
    'assets\\tiles\\grass-1.svg',
    'javascript:alert(1)',
    'assets/',
    '/',
    'a/',
  ]) {
    assert.equal(isSafeImageRef(ref), false, `${ref} was accepted`);
  }
});

test('a non-string or empty ref is rejected', () => {
  assert.equal(isSafeImageRef(''), false);
  assert.equal(isSafeImageRef(null), false);
  assert.equal(isSafeImageRef(undefined), false);
  assert.equal(isSafeImageRef(['assets/tiles/grass/grass-1.svg']), false);
});

test('safeImageRef keeps a safe ref and blanks anything else', () => {
  assert.equal(safeImageRef('assets/tiles/grass/grass-1.svg'), 'assets/tiles/grass/grass-1.svg');
  assert.equal(safeImageRef('//evil.example/pixel.png'), '');
});

test('the verdict cache stays correct past its bound', () => {
  for (let i = 0; i < 1200; i += 1) {
    assert.equal(isSafeImageRef(`assets/tiles/t${i}.svg`), true);
    assert.equal(isSafeImageRef(`//host/t${i}.png`), false);
  }
  assert.equal(isSafeImageRef('assets/tiles/t0.svg'), true);
  assert.equal(isSafeImageRef('//host/t0.png'), false);
});
