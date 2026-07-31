import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MapCanvasKeyboard } from '../src/map/MapCanvasKeyboard.js';

/**
 * The controller is exercised against a stub host: it only reads and writes
 * host fields and fires host callbacks, so no canvas is needed. The stub's
 * disarmExit mirrors MapCanvas.disarmExit (clear the side, tell the wiring,
 * redraw), which is the piece of the real host the arming handshake leans on.
 */
function makeHost(overrides = {}) {
  const calls = { taken: [], armed: [] };
  const host = {
    node: { id: 'child', width: 3, height: 3, tiles: [] },
    canvas: { width: 300, height: 300, addEventListener() {}, removeEventListener() {} },
    tileSize: 48,
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    authoring: false,
    cursorCellId: '2,1',
    exits: [{ kind: 'edge', side: 'east', targetNodeId: 'parent', targetName: 'World' }],
    armedExitSide: null,
    render() {},
    zoomBy() {},
    onExitClick(exit) {
      calls.taken.push(exit);
    },
    onExitArmed(exit) {
      calls.armed.push(exit);
    },
    disarmExit() {
      if (this.armedExitSide === null) return;
      this.armedExitSide = null;
      this.onExitArmed?.(null);
      this.render();
    },
    ...overrides,
  };
  return { host, calls, keyboard: new MapCanvasKeyboard(host) };
}

function key(name, extra = {}) {
  return { key: name, repeat: false, preventDefault() {}, ...extra };
}

test('first arrow press into an exit border arms it without travelling', () => {
  const { host, calls, keyboard } = makeHost();
  keyboard._onKeyDown(key('ArrowRight'));
  assert.equal(host.armedExitSide, 'east');
  assert.equal(calls.taken.length, 0);
  assert.equal(calls.armed.length, 1);
  assert.equal(calls.armed[0].side, 'east');
  assert.equal(host.cursorCellId, '2,1'); // cursor stays at the border
});

test('the same arrow pressed again takes the armed exit', () => {
  const { host, calls, keyboard } = makeHost();
  keyboard._onKeyDown(key('ArrowRight'));
  keyboard._onKeyDown(key('ArrowRight'));
  assert.equal(calls.taken.length, 1);
  assert.equal(calls.taken[0].side, 'east');
  assert.equal(host.armedExitSide, null);
  assert.deepEqual(
    calls.armed.map((e) => e && e.side),
    ['east', null],
  );
});

test('key repeats neither arm nor confirm, so a held arrow never leaves', () => {
  const { host, calls, keyboard } = makeHost();
  keyboard._onKeyDown(key('ArrowRight', { repeat: true }));
  assert.equal(host.armedExitSide, null);
  keyboard._onKeyDown(key('ArrowRight'));
  keyboard._onKeyDown(key('ArrowRight', { repeat: true }));
  assert.equal(calls.taken.length, 0);
  assert.equal(host.armedExitSide, 'east');
});

test('moving the cursor away withdraws the armed exit', () => {
  const { host, calls, keyboard } = makeHost();
  keyboard._onKeyDown(key('ArrowRight'));
  keyboard._onKeyDown(key('ArrowUp'));
  assert.equal(host.armedExitSide, null);
  assert.equal(calls.armed.at(-1), null);
  assert.equal(calls.taken.length, 0);
  assert.equal(host.cursorCellId, '2,0');
});

test('any non-arrow key withdraws the armed exit', () => {
  const { host, calls, keyboard } = makeHost();
  keyboard._onKeyDown(key('ArrowRight'));
  keyboard._onKeyDown(key('+'));
  assert.equal(host.armedExitSide, null);
  assert.equal(calls.taken.length, 0);
});

test('losing focus withdraws the armed exit', () => {
  const { host, calls, keyboard } = makeHost();
  keyboard._onKeyDown(key('ArrowRight'));
  keyboard._onBlur();
  assert.equal(host.armedExitSide, null);
  assert.equal(calls.armed.at(-1), null);
});

test('a border with no exit neither arms nor moves the cursor', () => {
  const { host, calls, keyboard } = makeHost({ exits: [] });
  keyboard._onKeyDown(key('ArrowRight'));
  assert.equal(host.armedExitSide, null);
  assert.equal(calls.armed.length, 0);
  assert.equal(host.cursorCellId, '2,1');
});

test('authoring mode never arms an exit', () => {
  const { host, calls, keyboard } = makeHost({ authoring: true });
  keyboard._onKeyDown(key('ArrowRight'));
  assert.equal(host.armedExitSide, null);
  assert.equal(calls.armed.length, 0);
});
