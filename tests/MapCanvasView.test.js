import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyFollow,
  centerOn,
  fitKey,
  fitPadding,
  fitView,
  refitIfChanged,
  resizeView,
  tileOnCanvas,
  tileWellInView,
  viewSnapshot,
  zoomAboutCentre,
} from '../src/map/MapCanvasView.js';

/** A stub host with the view fields of MapCanvas and a counting render. */
function makeHost(overrides = {}) {
  const node = { width: 20, height: 20, tiles: [] };
  const host = {
    canvas: { width: 480, height: 480 },
    node,
    tileSize: 48,
    minZoom: 0.25,
    maxZoom: 4,
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    revealAll: true,
    focusTileId: null,
    exitSides: [],
    occluders: [],
    _userView: false,
    _fitWhole: false,
    renders: 0,
    render() {
      this.renders++;
    },
    ...overrides,
  };
  return /** @type {any} */ (host);
}

test('fitView frames the node, records the whole flag, and redraws', () => {
  const host = makeHost({ _userView: true });
  fitView(host, { whole: true });
  assert.equal(host._userView, false);
  assert.equal(host._fitWhole, true);
  assert.equal(host.renders, 1);
  assert.ok(host.scale > 0 && host.scale <= 1);
  fitView(host);
  assert.equal(host._fitWhole, true, 'a refit with no options keeps the choice');
});

test('fitView does nothing with no node', () => {
  const host = makeHost({ node: null });
  fitView(host);
  assert.equal(host.renders, 0);
});

test('fitView in Play mode frames the revealed area around the focus tile', () => {
  const tiles = [{ id: '3,4', revealed: true }];
  const host = makeHost({ revealAll: false, node: { width: 20, height: 20, tiles } });
  host.focusTileId = '3,4';
  fitView(host);
  assert.equal(host.renders, 1);
  assert.ok(Number.isFinite(host.offsetX) && Number.isFinite(host.offsetY));
});

test('centerOn puts the tile centre at the canvas centre and marks a user view', () => {
  const host = makeHost({ scale: 2 });
  centerOn(host, '2,3');
  assert.equal(host.offsetX, 240 - 2.5 * 48 * 2);
  assert.equal(host.offsetY, 240 - 3.5 * 48 * 2);
  assert.equal(host._userView, true);
  centerOn(host, 'not-a-cell');
  assert.equal(host.renders, 1);
});

test('tileOnCanvas and tileWellInView read the tile rect against the canvas', () => {
  const host = makeHost();
  assert.equal(tileOnCanvas(host, '0,0'), true);
  assert.equal(tileOnCanvas(host, '10,0'), false);
  assert.equal(tileOnCanvas(host, 'x'), true);
  assert.equal(tileWellInView(host, '0,0'), false);
  assert.equal(tileWellInView(host, '4,4'), true);
  assert.equal(tileWellInView(host, '9,4'), false);
  assert.equal(tileWellInView(host, 'x'), true);
});

test('zoomAboutCentre keeps the centre world point and clamps the scale', () => {
  const host = makeHost();
  zoomAboutCentre(host, 2);
  assert.equal(host.scale, 2);
  assert.equal(host.offsetX, 240 - 240 * 2);
  zoomAboutCentre(host, 100);
  assert.equal(host.scale, 4);
  assert.equal(host._userView, true);
});

test('resizeView refits a fitted view and keeps a user view anchored', () => {
  const fitted = makeHost();
  resizeView(fitted, 480, 480);
  assert.equal(fitted.renders, 0, 'the same size does nothing');
  resizeView(fitted, 600, 400);
  assert.deepEqual([fitted.canvas.width, fitted.canvas.height], [600, 400]);
  assert.equal(fitted.renders, 1);

  const panned = makeHost({ _userView: true, scale: 2, offsetX: 10, offsetY: 20 });
  resizeView(panned, 680, 280);
  assert.equal(panned.offsetX, 110);
  assert.equal(panned.offsetY, -80);
  assert.equal(panned.scale, 2);
});

test('fitKey changes with the exit sides, and refitIfChanged refits only a fitted view', () => {
  const host = makeHost();
  const before = fitKey(host);
  assert.match(before, /^\d+,\d+,\d+,\d+$/);
  assert.deepEqual(fitPadding(host), fitPadding(host, undefined));
  host.exitSides = ['north'];
  assert.notEqual(fitKey(host), before);
  host.scale = 9;
  refitIfChanged(host, before);
  assert.notEqual(host.scale, 9, 'the fitted view refits');
  host._userView = true;
  host.scale = 9;
  refitIfChanged(host, before);
  assert.equal(host.scale, 9, 'a user view only redraws');
});

test('applyFollow pans toward a focus tile out of the deadzone, and stops for a user view', () => {
  const host = makeHost({ scale: 1, focusTileId: '19,19' });
  applyFollow(host);
  assert.equal(host.renders, 1);
  assert.ok(host.offsetX < 0 && host.offsetY < 0);
  const { offsetX } = host;
  applyFollow(host);
  assert.equal(host.renders, 1, 'no move, no redraw');
  assert.equal(host.offsetX, offsetX);
  host._userView = true;
  host.focusTileId = '0,0';
  applyFollow(host);
  assert.equal(host.renders, 1);
});

test('viewSnapshot copies the view fields for the renderer', () => {
  const host = makeHost({ markerRange: 4, _focused: true, cursorCellId: '1,1' });
  const view = viewSnapshot(host);
  assert.equal(view.canvasWidth, 480);
  assert.equal(view.node, host.node);
  assert.equal(view.focused, true);
  assert.equal(view.cursorCellId, '1,1');
  assert.equal(view.pixelRatio, 1);
});
