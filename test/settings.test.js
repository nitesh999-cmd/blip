'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSettings } = require('../src/settings');
const { DEFAULT_PREFS } = require('../src/news');

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'blip-settings-'));

test('defaults: main screen, news dot on with every extra, flower pot look', () => {
  assert.deepEqual(createSettings(tempDir()).get(), { displayPoint: null, news: DEFAULT_PREFS, look: 'sprout' });
});

test('the chosen screen is saved and read back on the next start', () => {
  const dir = tempDir();
  createSettings(dir).update({ displayPoint: { x: 2880, y: 540 } });
  assert.deepEqual(createSettings(dir).get().displayPoint, { x: 2880, y: 540 });
});

test('a damaged saved screen falls back to the main screen', () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ displayPoint: { x: 'left', y: 3 } }));
  assert.deepEqual(createSettings(dir).get(), { displayPoint: null, news: DEFAULT_PREFS, look: 'sprout' });
});

test('news settings are saved and re-checked when read back', () => {
  const dir = tempDir();
  createSettings(dir).update({ news: { enabled: false, extras: ['tech'], interests: ['Collingwood'], point: { x: 10, y: 20 } } });
  fs.writeFileSync(path.join(dir, 'settings.json'), fs.readFileSync(path.join(dir, 'settings.json'), 'utf8').replace('"tech"', '"tech", "bogus"'));
  assert.deepEqual(createSettings(dir).get().news, { enabled: false, extras: ['tech'], interests: ['Collingwood'], point: { x: 10, y: 20 } });
});

test('the chosen look is saved, and an unknown one falls back to the flower pot', () => {
  const dir = tempDir();
  createSettings(dir).update({ look: 'supercar' });
  assert.equal(createSettings(dir).get().look, 'supercar');
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ look: 'spaceship-9000' }));
  assert.equal(createSettings(dir).get().look, 'sprout');
});
