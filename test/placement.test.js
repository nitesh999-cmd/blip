'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const p = require('../src/placement');

// Shaped like the owner's four screens (DIP values are illustrative).
const main = { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1032 } };
const right = { id: 2, bounds: { x: 1920, y: 0, width: 1920, height: 1080 }, workArea: { x: 1920, y: 0, width: 1920, height: 1032 } };
const wide = { id: 3, bounds: { x: 609, y: 1080, width: 2560, height: 720 }, workArea: { x: 609, y: 1080, width: 2560, height: 672 } };
const far = { id: 4, bounds: { x: -3536, y: -2160, width: 2194, height: 1234 }, workArea: { x: -3536, y: -2160, width: 2194, height: 1186 } };
const displays = [main, right, wide, far];

test('the strip sits on the bottom of the chosen display, above its taskbar', () => {
  assert.deepEqual(p.stripBoundsFor(main), { x: 0, y: 652, width: 1920, height: 380 });
  assert.deepEqual(p.stripBoundsFor(far), { x: -3536, y: -1354, width: 2194, height: 380 });
});

test('the strip never gets taller than a short display', () => {
  const tiny = { bounds: { x: 0, y: 0, width: 800, height: 300 }, workArea: { x: 0, y: 0, width: 800, height: 260 } };
  assert.deepEqual(p.stripBoundsFor(tiny), { x: 0, y: 0, width: 800, height: 260 });
});

test('while dragging, the grabbed spot stays under the cursor', () => {
  const bounds = p.dragBounds({ x: 2500, y: 700 }, { x: 40, y: 90 });
  assert.equal(bounds.x + p.DRAG_PAD + 40, 2500);
  assert.equal(bounds.y + p.DRAG_PAD + 90, 700);
  assert.equal(bounds.width, p.PET_W + 2 * p.DRAG_PAD);
});

test('Blip goes back to the saved display, or the main one if that screen is gone', () => {
  assert.equal(p.pickDisplay(displays, p.displayPoint(wide), main), wide);
  assert.equal(p.pickDisplay(displays, p.displayPoint(far), main), far);
  assert.equal(p.pickDisplay([main, right], { x: 1800, y: 1400 }, main), main);
  assert.equal(p.pickDisplay(displays, null, main), main);
  assert.equal(p.pickDisplay(displays, { x: 'x', y: 1 }, main), main);
});

test('the drop point lands under the cursor and stays on screen', () => {
  const strip = p.stripBoundsFor(right);
  assert.equal(p.dropX({ x: 2500, y: 900 }, { x: 40, y: 90 }, strip), 540);
  assert.equal(p.dropX({ x: 1925, y: 900 }, { x: 40, y: 90 }, strip), 0);
  assert.equal(p.dropX({ x: 3839, y: 900 }, { x: 0, y: 90 }, strip), 1920 - p.PET_W);
});

test('grab offsets from the page are kept inside the pet', () => {
  assert.deepEqual(p.safeGrab({ x: 40, y: 90 }), { x: 40, y: 90 });
  assert.deepEqual(p.safeGrab({ x: -500, y: 99999 }), { x: 0, y: p.PET_H });
  assert.deepEqual(p.safeGrab({ x: 'a' }), { x: p.PET_W / 2, y: p.PET_H / 2 });
});

test('a wider look (the cars) gets a drag window, drop limit and grab area of its own size', () => {
  const car = { w: 126, h: 56 };
  const bounds = p.dragBounds({ x: 2500, y: 700 }, { x: 100, y: 30 }, car);
  assert.equal(bounds.width, 126 + 2 * p.DRAG_PAD);
  assert.equal(bounds.height, 56 + p.DRAG_PAD + 4);
  assert.equal(bounds.x + p.DRAG_PAD + 100, 2500);
  const strip = p.stripBoundsFor(right);
  assert.equal(p.dropX({ x: 3839, y: 900 }, { x: 0, y: 30 }, strip, car.w), 1920 - 126);
  assert.deepEqual(p.safeGrab({ x: 120, y: 99 }, car), { x: 120, y: 56 });
  assert.deepEqual(p.safeGrab({ x: 'a' }, car), { x: 63, y: 28 });
});

test('a missing or bad size falls back to the flower pot size', () => {
  assert.equal(p.dragBounds({ x: 0, y: 0 }, { x: 0, y: 0 }, { w: 'wide', h: -3 }).width, p.PET_W + 2 * p.DRAG_PAD);
  assert.deepEqual(p.safeGrab({ x: 999, y: 999 }, null), { x: p.PET_W, y: p.PET_H });
});
