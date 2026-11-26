'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const p = require('../src/news-placement');

const left = { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 } };
const right = { id: 2, bounds: { x: 1920, y: 0, width: 2560, height: 1440 }, workArea: { x: 1920, y: 0, width: 2560, height: 1400 } };

test('saved spot is kept when its screen is connected, otherwise top-right of the primary', () => {
  assert.deepEqual(p.pickPoint([left, right], { x: 3000, y: 700 }, left), { x: 3000, y: 700 });
  assert.deepEqual(p.pickPoint([left], { x: 3000, y: 700 }, left), { x: 1880, y: 40 });
  assert.deepEqual(p.pickPoint([left], { x: 'a', y: 1 }, left), { x: 1880, y: 40 });
});

test('clampPoint keeps the whole dot on its screen', () => {
  assert.deepEqual(p.clampPoint({ x: -50, y: 2000 }, left.workArea), { x: 14, y: 1026 });
});

test('dot window is a 28px box centred on the point', () => {
  assert.deepEqual(p.dotBounds({ x: 100, y: 200 }), { x: 86, y: 186, width: 28, height: 28 });
});

test('drag keeps the grabbed spot under the cursor; bad grabs are clamped', () => {
  assert.deepEqual(p.dragPoint({ x: 500, y: 500 }, { x: 4, y: 24 }), { x: 510, y: 490 });
  assert.deepEqual(p.safeGrab({ x: 999, y: 'x' }), { x: 28, y: 14 });
});

test('the message opens toward the middle of the screen', () => {
  const topRight = p.openLayout({ x: 1880, y: 40 }, left.workArea, 150);
  assert.equal(topRight.corner, 'tr');
  assert.deepEqual(topRight.bounds, { x: 1574, y: 26, width: 320, height: 150 });
  const bottomLeft = p.openLayout({ x: 40, y: 1000 }, left.workArea, 150);
  assert.equal(bottomLeft.corner, 'bl');
  assert.deepEqual(bottomLeft.bounds, { x: 26, y: 864, width: 320, height: 150 });
});

test('open height is bounded and the window stays on screen', () => {
  const tall = p.openLayout({ x: 100, y: 100 }, left.workArea, 5000);
  assert.equal(tall.bounds.height, 420);
  const tiny = p.openLayout({ x: 100, y: 100 }, left.workArea, NaN);
  assert.equal(tiny.bounds.height, 80);
  const edge = p.openLayout({ x: 14, y: 14 }, left.workArea, 100);
  assert.deepEqual([edge.bounds.x, edge.bounds.y], [0, 0]);
});
