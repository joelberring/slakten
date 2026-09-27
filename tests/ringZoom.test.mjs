import assert from 'node:assert/strict';
import test from 'node:test';
import { zoomRingAtPointer } from '../src/utils/ringZoom.ts';

const bounds = { left: 100, top: 200, width: 800, height: 600 };

function zoom(overrides = {}) {
  return zoomRingAtPointer({
    zoom: 2,
    pan: { x: 0, y: 0 },
    nextZoom: 4,
    clientX: 500,
    clientY: 500,
    bounds,
    canvasRadius: 1000,
    ...overrides,
  });
}

function worldAtPointer(state, clientX, clientY, rect = bounds) {
  const halfPaintedSide = Math.min(rect.width, rect.height) / 2;
  const viewRadius = 1000 / state.zoom;
  return {
    x: state.pan.x + (clientX - rect.left - rect.width / 2) / halfPaintedSide * viewRadius,
    y: state.pan.y + (clientY - rect.top - rect.height / 2) / halfPaintedSide * viewRadius,
  };
}

test('zooming at the SVG center keeps the view centered', () => {
  assert.deepEqual(zoom(), { zoom: 4, pan: { x: 0, y: 0 } });
});

test('an off-center pointer keeps the same world point beneath it', () => {
  const pointer = { x: 650, y: 410 };
  const before = { zoom: 2, pan: { x: 30, y: -20 } };
  const after = zoom({ ...before, nextZoom: 3.5, clientX: pointer.x, clientY: pointer.y });
  const previousWorld = worldAtPointer(before, pointer.x, pointer.y);
  const nextWorld = worldAtPointer(after, pointer.x, pointer.y);
  assert.ok(Math.abs(previousWorld.x - nextWorld.x) < 1e-9);
  assert.ok(Math.abs(previousWorld.y - nextWorld.y) < 1e-9);
});

test('letterboxed SVG uses the painted square rather than element width for scale', () => {
  const after = zoom({ clientX: 650, clientY: 500 });
  // The 800×600 element paints an SVG square of side 600 with 100 px side bars.
  // The pointer is 150 px right of its center, so it is half a view radius out.
  assert.deepEqual(after, { zoom: 4, pan: { x: 125, y: 0 } });
  const previousWorld = worldAtPointer({ zoom: 2, pan: { x: 0, y: 0 } }, 650, 500);
  const nextWorld = worldAtPointer(after, 650, 500);
  assert.deepEqual(previousWorld, nextWorld);
});

test('portrait letterboxing also preserves the point under the pointer', () => {
  const portraitBounds = { left: 20, top: 10, width: 400, height: 800 };
  const pointer = { x: 260, y: 520 };
  const before = { zoom: 3, pan: { x: 20, y: 70 } };
  const after = zoom({ ...before, nextZoom: 5, clientX: pointer.x, clientY: pointer.y, bounds: portraitBounds });
  const previousWorld = worldAtPointer(before, pointer.x, pointer.y, portraitBounds);
  const nextWorld = worldAtPointer(after, pointer.x, pointer.y, portraitBounds);
  assert.ok(Math.abs(previousWorld.x - nextWorld.x) < 1e-9);
  assert.ok(Math.abs(previousWorld.y - nextWorld.y) < 1e-9);
});

test('zooming back out preserves the pointer anchor when the pan limit allows it', () => {
  const pointer = { x: 560, y: 470 };
  const before = { zoom: 4, pan: { x: 90, y: -40 } };
  const after = zoom({ ...before, nextZoom: 2, clientX: pointer.x, clientY: pointer.y });
  const previousWorld = worldAtPointer(before, pointer.x, pointer.y);
  const nextWorld = worldAtPointer(after, pointer.x, pointer.y);
  assert.ok(Math.abs(previousWorld.x - nextWorld.x) < 1e-9);
  assert.ok(Math.abs(previousWorld.y - nextWorld.y) < 1e-9);
});

test('pan and zoom stay within the visible canvas limits', () => {
  assert.deepEqual(zoom({
    zoom: 10, nextZoom: 20, pan: { x: 900, y: -900 },
    clientX: 900, clientY: 200,
  }), { zoom: 12, pan: { x: 1000 - 1000 / 12, y: -(1000 - 1000 / 12) } });
  assert.deepEqual(zoom({
    zoom: 4, nextZoom: 0.5, pan: { x: 300, y: -200 },
    clientX: 650, clientY: 350,
  }), { zoom: 1, pan: { x: 0, y: 0 } });
});

test('a zero-size SVG can change zoom without producing non-finite pan', () => {
  assert.deepEqual(zoom({
    bounds: { left: 0, top: 0, width: 0, height: 0 },
    pan: { x: 900, y: -900 },
  }), { zoom: 4, pan: { x: 750, y: -750 } });
});
