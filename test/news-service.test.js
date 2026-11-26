'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createNewsService, loadMemory, CHECK_EVERY_MS } = require('../src/news-service');
const news = require('../src/news');

const NOW = Date.parse('2026-11-26T02:00:00Z');
const pub = new Date(NOW - 30 * 60_000).toUTCString();
const rss = (items) => `<rss><channel>${items.map(([title, link]) => `<item><title>${title}</title><link>${link}</link><guid>${link}</guid><pubDate>${pub}</pubDate></item>`).join('')}</channel></rss>`;

function feedsFor(url) {
  if (url.includes('45910')) return rss([['Big one', 'https://www.abc.net.au/a'], ['Small one', 'https://www.abc.net.au/b']]);
  if (url.includes('bom.gov.au')) return rss([['26/12:00 EDT Severe Weather Warning for Central', 'http://reg.bom.gov.au/w1'], ['Marine Wind Warning Summary for Victoria', 'http://reg.bom.gov.au/w2']]);
  return rss([]);
}

function setup({ ask = async () => '[{"i":0,"level":"need"}]', busy = false, prefs = news.sanitizePrefs({}) } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blip-news-'));
  const file = path.join(dir, 'news-state.json');
  let now = NOW;
  const shown = [];
  const working = [];
  const asked = [];
  const make = () => createNewsService({
    getPrefs: () => prefs,
    ask: async (prompt) => { asked.push(prompt); return ask(prompt); },
    fetchText: async (url) => feedsFor(url),
    isBusy: () => busy,
    onWorking: (on) => working.push(on),
    onMessage: (m) => shown.push(m),
    file,
    nowFn: () => now,
  });
  return { make, shown, working, asked, file, advance: (ms) => { now += ms; } };
}

test('a check shows the Melbourne warning at once and drops the marine one', async () => {
  const s = setup();
  const service = s.make();
  await service.tick();
  assert.deepEqual(s.working, [true, false]);
  assert.equal(s.shown.length, 1);
  assert.equal(s.shown[0].urgent, true);
  assert.deepEqual(s.shown[0].stories.map((x) => x.title), ['Severe Weather Warning for Central']);
  assert.equal(s.shown[0].stories[0].link, 'https://reg.bom.gov.au/w1');
});

test('the picked story is shown next, with the feed headline and link, not Claude text', async () => {
  const s = setup({ ask: async () => 'Here you go [{"i":0,"level":"need"}] Big one is huge!' });
  const service = s.make();
  await service.tick();
  service.release();
  const story = s.shown[1].stories[0];
  assert.equal(story.title, 'Big one');
  assert.equal(story.link, 'https://www.abc.net.au/a');
});

test('nothing is repeated after a restart, and the hourly check is not redone early', async () => {
  const s = setup();
  await s.make().tick();
  const before = s.asked.length;
  const again = s.make();
  s.advance(10 * 60_000);
  await again.tick();
  assert.equal(s.asked.length, before, 'no new Claude call within the hour');
  s.advance(CHECK_EVERY_MS);
  await again.tick();
  assert.equal(s.asked.length, before, 'no Claude call when nothing new arrived');
  const titles = s.shown.flatMap((m) => m.stories.map((x) => x.title));
  assert.equal(new Set(titles).size, titles.length);
});

test('in a meeting: news is held (dot glows), then shown after', async () => {
  let busy = true;
  const held = [];
  const s = setup();
  const service = createNewsService({
    getPrefs: () => news.sanitizePrefs({}), ask: async () => '[]', fetchText: async (u) => feedsFor(u),
    isBusy: () => busy, onMessage: (m) => s.shown.push(m), onHeld: (on) => held.push(on), file: s.file, nowFn: () => NOW,
  });
  await service.tick();
  assert.equal(s.shown.length, 0);
  assert.deepEqual(held, [true]);
  busy = false;
  service.release();
  assert.equal(s.shown.length, 1);
  assert.equal(held.at(-1), false);
});

test('a tap shows held news even during a meeting', async () => {
  const s = setup();
  const service = createNewsService({
    getPrefs: () => news.sanitizePrefs({}), ask: async () => '[]', fetchText: async (u) => feedsFor(u),
    isBusy: () => true, onMessage: (m) => s.shown.push(m), file: s.file, nowFn: () => NOW,
  });
  await service.tick();
  assert.equal(s.shown.length, 0);
  assert.equal(service.release({ asked: true, force: true }), true);
  assert.equal(s.shown.length, 1);
});

test('a failed Claude pick keeps the stories for the next hour', async () => {
  let fail = true;
  const s = setup({ ask: async () => { if (fail) throw new Error('claude exited 1'); return '[{"i":0,"level":"need"}]'; } });
  const service = s.make();
  await service.tick();
  fail = false;
  s.advance(CHECK_EVERY_MS);
  await service.tick();
  assert.equal(s.asked.length, 2);
  assert.ok(s.asked[1].includes('Big one'));
});

test('switched off: no fetching, no Claude, nothing shown', async () => {
  const s = setup({ prefs: news.sanitizePrefs({ enabled: false }) });
  await s.make().tick();
  assert.deepEqual([s.asked.length, s.shown.length, s.working.length], [0, 0, 0]);
});

test('a damaged memory file starts fresh; tampered stories are dropped', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blip-news-'));
  const file = path.join(dir, 'news-state.json');
  fs.writeFileSync(file, '{not json');
  assert.deepEqual(loadMemory(file, () => {}).queue, []);
  fs.writeFileSync(file, JSON.stringify({
    seen: ['0123456789abcdef', 'bad'],
    queue: [
      { key: '0123456789abcdef', title: 'Ok', source: 'ABC News', link: 'https://www.abc.net.au/x', level: 'need', foundAt: NOW },
      { key: 'fedcba9876543210', title: 'Evil', source: 'X', link: 'https://evil.example/x', level: 'need', foundAt: NOW },
    ],
  }));
  const memory = loadMemory(file, () => {});
  assert.deepEqual(memory.seen, ['0123456789abcdef']);
  assert.deepEqual(memory.queue.map((s) => s.title), ['Ok']);
});

test('"Check the news now" shows held news even during a meeting', async () => {
  const s = setup();
  const service = createNewsService({
    getPrefs: () => news.sanitizePrefs({}), ask: async () => '[{"i":0,"level":"need"}]', fetchText: async (u) => feedsFor(u),
    isBusy: () => true, onMessage: (m) => s.shown.push(m), file: s.file, nowFn: () => NOW,
  });
  assert.equal(await service.checkNow(), true);
  assert.equal(s.shown.length, 1);
});

test('while a message is unread, ordinary news waits and urgent news is shown with it', async () => {
  let unread = false;
  const s = setup();
  const service = createNewsService({
    getPrefs: () => news.sanitizePrefs({}), ask: async () => '[{"i":0,"level":"need"}]', fetchText: async (u) => feedsFor(u),
    onMessage: (m) => { s.shown.push(m); unread = true; }, hasUnread: () => unread, file: s.file, nowFn: () => NOW,
  });
  await service.tick();
  assert.equal(s.shown.length, 1, 'the warning went out');
  service.release();
  assert.equal(s.shown.length, 1, 'ordinary news waits while the warning is unread');
  unread = false;
  service.release();
  assert.equal(s.shown.length, 2);
  assert.deepEqual(s.shown[1].stories.map((x) => x.title), ['Big one']);
});

test('with a fallback picker, a failed Claude pick still finds the lead story and does not ask again', async () => {
  const s = setup({ ask: async () => { throw new Error('spawn claude ENOENT'); } });
  const service = createNewsService({
    getPrefs: () => news.sanitizePrefs({}), ask: async () => { throw new Error('spawn claude ENOENT'); }, fetchText: async (u) => feedsFor(u),
    onMessage: (m) => s.shown.push(m), file: s.file, nowFn: () => NOW, fallbackPick: news.leadStories,
  });
  await service.tick();
  service.release();
  assert.deepEqual(s.shown.map((m) => m.stories.map((x) => x.title)), [['Severe Weather Warning for Central'], ['Big one', 'Small one']]);
});
