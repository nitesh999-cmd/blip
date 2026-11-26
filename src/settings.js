'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { sanitizePrefs, DEFAULT_PREFS } = require('./news');

const DEFAULTS = Object.freeze({ displayPoint: null, news: DEFAULT_PREFS });

/** Tiny JSON settings file in Blip's own app-data folder. */
function createSettings(dir, log = () => {}) {
  const file = path.join(dir, 'settings.json');
  let current = { ...DEFAULTS };
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    const point = saved.displayPoint;
    const validPoint = point && Number.isFinite(point.x) && Number.isFinite(point.y) ? { x: point.x, y: point.y } : null;
    current = { ...DEFAULTS, displayPoint: validPoint, news: sanitizePrefs(saved.news) };
  } catch (error) {
    if (error.code !== 'ENOENT') log(`settings unreadable, using defaults: ${error.message}`);
  }

  function update(patch) {
    current = { ...current, ...patch };
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(current, null, 2));
    } catch (error) {
      log(`could not save settings: ${error.message}`);
    }
    return current;
  }

  return { get: () => current, update };
}

module.exports = { createSettings };
