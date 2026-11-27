'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const looks = require('../renderer/looks');

const { LOOKS, lookById, sanitizeLook, surpriseLook, stepX, isOnScreen, clampX, menuTemplate } = looks;

test('the pot plus ten new looks, each with a unique id and label', () => {
  assert.equal(LOOKS.length, 11);
  assert.equal(LOOKS[0].id, 'sprout');
  assert.equal(new Set(LOOKS.map((l) => l.id)).size, 11);
  assert.equal(new Set(LOOKS.map((l) => l.label)).size, 11);
  LOOKS.forEach((l) => {
    assert.ok(['waddle', 'drive', 'float'].includes(l.motion), l.id);
    assert.ok(l.w > 0 && l.w <= 140 && l.h > 0 && l.h <= 124, `${l.id} fits the strip`);
    assert.ok(l.greeting.length > 0, l.id);
  });
});

test('the two cars the owner asked for: a Taycan-style GT and a Ferrari-style supercar that only drives right', () => {
  const gt = lookById('gt');
  const car = lookById('supercar');
  assert.match(gt.label, /Taycan/);
  assert.match(car.label, /Ferrari/);
  assert.equal(gt.motion, 'drive');
  assert.equal(car.motion, 'drive');
  assert.equal(car.oneWay, true);
  assert.equal(gt.oneWay, false);
  assert.equal(gt.faces, true);
});

test('unknown or damaged saved looks fall back to the pot', () => {
  assert.equal(sanitizeLook('gt'), 'gt');
  assert.equal(sanitizeLook('lamborghini'), 'sprout');
  assert.equal(sanitizeLook(undefined), 'sprout');
  assert.equal(sanitizeLook({ id: 'gt' }), 'sprout');
  assert.equal(lookById('nope').id, 'sprout');
});

test('surprise me never picks the look you already have', () => {
  const ids = LOOKS.map((l) => l.id);
  for (let i = 0; i < ids.length; i += 1) {
    const pick = surpriseLook('cat', () => i / ids.length);
    assert.notEqual(pick, 'cat');
    assert.ok(ids.includes(pick));
  }
  assert.notEqual(surpriseLook('cat', () => 0.999999), 'cat');
});

test('two-way walkers turn round at the screen edges', () => {
  const base = { w: 84, viewW: 1000, edge: 10, oneWay: false };
  assert.deepEqual(stepX({ ...base, x: 500, dir: 1, dx: 20 }), { x: 520, dir: 1 });
  assert.deepEqual(stepX({ ...base, x: 900, dir: 1, dx: 20 }), { x: 906, dir: -1 });
  assert.deepEqual(stepX({ ...base, x: 15, dir: -1, dx: 20 }), { x: 10, dir: 1 });
});

test('the supercar drives off the right edge and comes back in from the left', () => {
  const base = { w: 126, viewW: 1000, edge: 10, oneWay: true };
  assert.deepEqual(stepX({ ...base, x: 900, dir: 1, dx: 50 }), { x: 950, dir: 1 });
  assert.deepEqual(stepX({ ...base, x: 990, dir: 1, dx: 20 }), { x: -126, dir: 1 });
  assert.deepEqual(stepX({ ...base, x: 300, dir: -1, dx: 20 }), { x: 320, dir: 1 }, 'never reverses');
});

test('on-screen check and clamping use the look width', () => {
  assert.equal(isOnScreen(10, 126, 1000), true);
  assert.equal(isOnScreen(-40, 126, 1000), false);
  assert.equal(isOnScreen(900, 126, 1000), false);
  assert.equal(clampX(-126, 126, 1000, 10), 10);
  assert.equal(clampX(990, 84, 1000, 10), 906);
  assert.equal(clampX(400, 84, 1000, 10), 400);
});

test('the menu: surprise me, then every look as a radio item with the current one ticked', () => {
  const picked = [];
  const items = menuTemplate('gt', (id) => picked.push(id), () => picked.push('surprise'));
  assert.equal(items[0].label, 'Surprise me');
  assert.equal(items[1].type, 'separator');
  const radios = items.slice(2);
  assert.equal(radios.length, 11);
  assert.ok(radios.every((item) => item.type === 'radio'));
  assert.deepEqual(radios.filter((item) => item.checked).map((item) => item.label), [lookById('gt').label]);
  items[0].click();
  radios[2].click();
  assert.deepEqual(picked, ['surprise', 'supercar']);
});

// ---------- the drawings ----------
const fs = require('node:fs');
const path = require('node:path');
const art = require('../renderer/look-art');

const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'index.html'), 'utf8');
const count = (text, needle) => text.split(needle).length - 1;

test('every look except the pot has a drawing, and the pot is in the page', () => {
  assert.deepEqual(Object.keys(art).sort(), LOOKS.filter((l) => l.id !== 'sprout').map((l) => l.id).sort());
  assert.match(indexHtml, /<svg class="look active" data-look="sprout" width="84" height="124"/);
  const order = ['looks.js', 'look-art.js', 'pet.js'].map((file) => indexHtml.indexOf(`<script src="${file}">`));
  assert.ok(order.every((at) => at > 0) && order[0] < order[1] && order[1] < order[2], 'scripts load before pet.js');
});

test('each drawing matches its catalogue size, has two blinking eyes and at most three clickable parts', () => {
  Object.entries(art).forEach(([id, markup]) => {
    const { w, h } = lookById(id);
    assert.ok(markup.startsWith(`<svg xmlns="http://www.w3.org/2000/svg" class="look" data-look="${id}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"`), id);
    assert.equal(count(markup, 'class="lid"'), 2, `${id} eyes`);
    assert.equal(count(markup, 'class="pupil"'), 2, `${id} pupils`);
    const hits = count(markup, 'class="hit"');
    assert.ok(hits >= 1 && hits <= 3, `${id} hit parts`);
    assert.equal(count(markup, '<svg'), 1, id);
    assert.equal(count(markup, '</svg>'), 1, id);
  });
});

test('drawings obey the page rules: no inline styles or scripts, ids unique and named after their look', () => {
  const ids = [];
  Object.entries(art).forEach(([id, markup]) => {
    assert.doesNotMatch(markup, /style=|<script|on[a-z]+=/i, id);
    [...markup.matchAll(/ id="([^"]+)"/g)].forEach(([, gradient]) => {
      assert.ok(gradient.startsWith(`${id}-`), `${id}: ${gradient}`);
      ids.push(gradient);
    });
  });
  assert.equal(new Set(ids).size, ids.length);
  ids.forEach((gradient) => assert.doesNotMatch(indexHtml, new RegExp(`id="${gradient}"`)));
});

test('the cars have two turning wheels; nothing else does', () => {
  Object.entries(art).forEach(([id, markup]) => {
    assert.equal(count(markup, 'class="wheel"'), lookById(id).motion === 'drive' ? 2 : 0, id);
  });
});

test('a click moves to the next look in menu order and wraps back to the pot', () => {
  const { nextLook } = looks;
  assert.equal(nextLook('sprout'), 'gt');
  assert.equal(nextLook('gt'), 'supercar');
  assert.equal(nextLook('duck'), 'sprout');
  assert.equal(nextLook('bogus'), 'gt');
  const seen = [];
  let id = 'sprout';
  for (let i = 0; i < LOOKS.length; i += 1) { id = nextLook(id); seen.push(id); }
  assert.equal(new Set(seen).size, LOOKS.length, 'eleven clicks visit every look once');
  assert.equal(id, 'sprout');
});
