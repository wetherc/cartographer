import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MapCanvasKeyboard } from '../src/map/MapCanvasKeyboard.js';

/**
 * The controller is exercised against a stub host: it only reads and writes
 * host fields and fires host callbacks, so no canvas is needed. The stub's
 * disarmExit mirrors MapCanvas.disarmExit (clear the side, tell the wiring,
 * redraw), which is the piece of the real host the arming handshake leans on.
 */
/**
 * A canvas element stub that records its listener registrations, so a test can
 * fire an event the way the browser would and can check that detach takes back
 * exactly what attach put on. It also answers getBoundingClientRect, which the
 * hover announcement reads to place the tooltip.
 */
function makeCanvasStub(overrides = {}) {
  /** @type {Array<{ type: string, handler: (event: any) => void }>} */
  const listeners = [];
  const canvas = {
    width: 300,
    height: 300,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 300 }),
    addEventListener(type, handler) {
      listeners.push({ type, handler });
    },
    removeEventListener(type, handler) {
      const at = listeners.findIndex((entry) => entry.type === type && entry.handler === handler);
      if (at >= 0) listeners.splice(at, 1);
    },
    ...overrides,
  };
  const fire = (type, event) => {
    for (const entry of [...listeners]) if (entry.type === type) entry.handler(event);
  };
  return { canvas, listeners, fire };
}

function makeHost(overrides = {}) {
  const calls = { taken: [], armed: [] };
  const host = {
    node: { id: 'child', width: 3, height: 3, tiles: [] },
    canvas: makeCanvasStub().canvas,
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

test('attach registers the keyboard and focus listeners, and detach takes them back', () => {
  const { canvas, listeners, fire } = makeCanvasStub();
  const { host, keyboard } = makeHost({ canvas });
  keyboard.attach();
  assert.deepEqual(
    listeners.map((entry) => entry.type),
    ['keydown', 'focus', 'blur'],
  );
  fire('keydown', key('ArrowUp'));
  assert.equal(host.cursorCellId, '2,0');
  keyboard.detach();
  assert.equal(listeners.length, 0);
});

test('gaining focus marks the host focused and redraws', () => {
  let renders = 0;
  const { canvas, fire } = makeCanvasStub();
  const { host, keyboard } = makeHost({
    canvas,
    render() {
      renders += 1;
    },
  });
  keyboard.attach();
  fire('focus', {});
  assert.equal(host._focused, true);
  assert.equal(renders, 1);
  fire('blur', {});
  assert.equal(host._focused, false);
  assert.equal(renders, 2);
});

test('a key press with no node loaded is ignored', () => {
  const prevented = [];
  const { host, keyboard } = makeHost({ node: null });
  keyboard._onKeyDown(key('ArrowLeft', { preventDefault: () => prevented.push('ArrowLeft') }));
  assert.equal(host.cursorCellId, '2,1');
  assert.deepEqual(prevented, []);
});

test('the first arrow press with no cursor starts from the grid centre', () => {
  const { host, keyboard } = makeHost({ cursorCellId: null });
  keyboard._onKeyDown(key('ArrowLeft'));
  assert.equal(host.cursorCellId, '0,1');
  assert.equal(host.offsetX, 48); // the new cell sits inside the left margin
  assert.equal(host._userView, true);
});

test('moving the cursor toward the far edges pans the view to keep it in frame', () => {
  const { host, keyboard } = makeHost({
    node: { id: 'child', width: 8, height: 8, tiles: [] },
    cursorCellId: '4,4',
  });
  keyboard._onKeyDown(key('ArrowRight'));
  assert.equal(host.offsetX, -36);
  keyboard._onKeyDown(key('ArrowDown'));
  assert.equal(host.offsetY, -36);
  assert.equal(host.cursorCellId, '5,5');
});

test('enter acts on the cursor cell the way a click does', () => {
  const clicks = [];
  const prevented = [];
  const { keyboard } = makeHost({
    onCellClick: (...args) => clicks.push(args),
  });
  keyboard._onKeyDown(key('Enter', { preventDefault: () => prevented.push('Enter') }));
  assert.deepEqual(clicks, [[2, 1, null]]);
  assert.deepEqual(prevented, ['Enter']);
});

test('space acts on the cursor cell the way a click does', () => {
  const clicks = [];
  const { keyboard } = makeHost({ onCellClick: (...args) => clicks.push(args) });
  keyboard._onKeyDown(key(' '));
  assert.deepEqual(clicks, [[2, 1, null]]);
});

test('enter in authoring mode paints a one-cell stroke and ends it', () => {
  const strokes = [];
  const { keyboard } = makeHost({
    authoring: true,
    onStrokeCell: (...args) => strokes.push(args),
    onStrokeEnd: () => strokes.push('end'),
  });
  keyboard._onKeyDown(key('Enter'));
  assert.deepEqual(strokes, [[2, 1, null, true], 'end']);
});

test('activation with no cursor cell does nothing', () => {
  const clicks = [];
  const { keyboard } = makeHost({ cursorCellId: null, onCellClick: () => clicks.push('click') });
  keyboard._onKeyDown(key('Enter'));
  assert.deepEqual(clicks, []);
});

test('activation with a cursor id outside the grid format does nothing', () => {
  const clicks = [];
  const { keyboard } = makeHost({
    cursorCellId: 'entry',
    onCellClick: () => clicks.push('click'),
  });
  keyboard._onKeyDown(key('Enter'));
  assert.deepEqual(clicks, []);
});

test('plus and equals zoom in, minus and underscore zoom out', () => {
  const factors = [];
  const prevented = [];
  const { keyboard } = makeHost({ zoomBy: (factor) => factors.push(factor) });
  for (const name of ['+', '=', '-', '_']) {
    keyboard._onKeyDown(key(name, { preventDefault: () => prevented.push(name) }));
  }
  assert.deepEqual(factors, [1.25, 1.25, 1 / 1.25, 1 / 1.25]);
  assert.deepEqual(prevented, ['+', '=', '-', '_']);
});

test('an unhandled key neither zooms nor acts', () => {
  const factors = [];
  const clicks = [];
  const { keyboard } = makeHost({
    zoomBy: (factor) => factors.push(factor),
    onCellClick: () => clicks.push('click'),
  });
  keyboard._onKeyDown(key('a'));
  assert.deepEqual(factors, []);
  assert.deepEqual(clicks, []);
});

test('a cursor move reports the new cell to the hover callback at its screen centre', () => {
  const hovers = [];
  const { keyboard } = makeHost({ onCellHover: (...args) => hovers.push(args) });
  keyboard._onKeyDown(key('ArrowUp'));
  // The move panned the view down by one tile, so the cell centre is (120, 72).
  assert.deepEqual(hovers, [[null, 120, 72]]);
});

test('a canvas drawn smaller than its buffer scales the reported hover point', () => {
  const hovers = [];
  const { canvas } = makeCanvasStub({
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 150, height: 150 }),
  });
  const { keyboard } = makeHost({ canvas, onCellHover: (...args) => hovers.push(args) });
  keyboard._onKeyDown(key('ArrowUp'));
  assert.deepEqual(hovers, [[null, 60, 36]]);
});

test('a zero-size canvas rectangle reports the buffer point unscaled', () => {
  const hovers = [];
  const { canvas } = makeCanvasStub({
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 0, height: 0 }),
  });
  const { keyboard } = makeHost({ canvas, onCellHover: (...args) => hovers.push(args) });
  keyboard._onKeyDown(key('ArrowUp'));
  assert.deepEqual(hovers, [[null, 130, 92]]);
});

test('the hover report needs a callback, a cursor cell, and a node', () => {
  const hovers = [];
  const { host, keyboard } = makeHost({ onCellHover: (...args) => hovers.push(args) });
  host.cursorCellId = null;
  keyboard._announceCursor();
  host.cursorCellId = '1,1';
  host.node = null;
  keyboard._announceCursor();
  assert.deepEqual(hovers, []);
});

test('the hover report stops when the cursor id is outside the grid format', () => {
  const hovers = [];
  const { keyboard } = makeHost({
    cursorCellId: 'entry',
    onCellHover: (...args) => hovers.push(args),
  });
  keyboard._announceCursor();
  assert.deepEqual(hovers, []);
});
