'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const news = require('../src/news');

const ABC = news.FEEDS.find((f) => f.id === 'abc-top');
const BOM = news.FEEDS.find((f) => f.id === 'bom-vic');
const HOUR = news.HOUR_MS;

const item = (title, link, extra = '') => `<item><title>${title}</title><link>${link}</link>${extra}</item>`;

test('decodes named, decimal and hex entities', () => {
  assert.equal(news.decodeEntities('a &amp; b &#038; c &#x2019; &bogus;'), 'a & b & c ’ &bogus;');
});

test('parses CDATA titles, strips HTML from descriptions and keeps the feed link', () => {
  const xml = item('<![CDATA[Big &amp; bold]]>', 'https://www.abc.net.au/news/1?a=1&amp;b=2',
    '<description>&lt;p&gt;Hello <b>there</b>&lt;/p&gt;</description><pubDate>Thu, 26 Nov 2026 05:00:00 GMT</pubDate><guid>g1</guid>');
  const [parsed] = news.parseFeed(xml, ABC);
  assert.equal(parsed.title, 'Big & bold');
  assert.equal(parsed.summary, 'Hello there');
  assert.equal(parsed.link, 'https://www.abc.net.au/news/1?a=1&b=2');
  assert.equal(parsed.publishedMs, Date.parse('2026-11-26T05:00:00Z'));
  assert.equal(parsed.source, 'ABC News');
});

test('drops items whose link is off the feed hosts or not http(s)', () => {
  const xml = item('Elsewhere', 'https://evil.example/x') + item('Script', 'javascript:alert(1)')
    + item('Creds', 'https://user:pw@www.abc.net.au/x') + item('Fine', 'http://www.abc.net.au/ok');
  const parsed = news.parseFeed(xml, ABC);
  assert.deepEqual(parsed.map((p) => p.title), ['Fine']);
  assert.equal(parsed[0].link, 'https://www.abc.net.au/ok');
});

test('a reissued BOM warning with the same text keeps the same key', () => {
  const a = news.parseFeed(item('26/16:36 EDT Severe Weather Warning for Central', 'http://reg.bom.gov.au/p/1.shtml', '<guid>http://reg.bom.gov.au/p/1.shtml</guid>'), BOM)[0];
  const b = news.parseFeed(item('26/19:02 EDT Severe Weather Warning for Central', 'http://reg.bom.gov.au/p/1.shtml', '<guid>http://reg.bom.gov.au/p/1.shtml</guid>'), BOM)[0];
  assert.equal(a.title, 'Severe Weather Warning for Central');
  assert.equal(a.key, b.key);
  assert.equal(a.kind, 'warning');
  assert.equal(a.link, 'https://reg.bom.gov.au/p/1.shtml');
});

test('Melbourne warnings: Central yes, North Central only no, marine no', () => {
  assert.equal(news.isMelbourneWarning('Severe Weather Warning for North Central, North East and parts of Central'), true);
  assert.equal(news.isMelbourneWarning('Severe Weather Warning for North Central and North East'), false);
  assert.equal(news.isMelbourneWarning('Marine Wind Warning Summary for Victoria'), false);
  assert.equal(news.isMelbourneWarning('Flood Watch for West and South Gippsland'), false);
  assert.equal(news.isMelbourneWarning('Heat warning for Melbourne'), true);
});

test('active feeds follow the chosen extras; core is always on', () => {
  const coreOnly = news.activeFeeds({ extras: [] }).map((f) => f.topic);
  assert.ok(coreOnly.every((t) => t === 'core'));
  assert.ok(news.activeFeeds({ extras: ['energy'] }).some((f) => f.id === 'reneweconomy'));
});

test('fresh items: skips seen, stale, future and duplicate links', () => {
  const now = Date.parse('2026-11-26T06:00:00Z');
  const base = { link: 'https://www.abc.net.au/a', publishedMs: now - HOUR };
  const items = [
    { ...base, key: 'k1' },
    { ...base, key: 'k2' },
    { ...base, key: 'k3', link: 'https://www.abc.net.au/b' },
    { ...base, key: 'k4', link: 'https://www.abc.net.au/c', publishedMs: now - 13 * HOUR },
    { ...base, key: 'k5', link: 'https://www.abc.net.au/d', publishedMs: now + 2 * HOUR },
    { ...base, key: 'k6', link: 'https://www.abc.net.au/e', publishedMs: null },
  ];
  assert.deepEqual(news.freshItems(items, new Set(['k3']), now).map((i) => i.key), ['k1', 'k6']);
});

test('prompt lists items by number and carries extras, interests and already-shown stories', () => {
  const prompt = news.buildPickPrompt(
    [{ source: 'ABC News', title: 'One', summary: 'S' }, { source: 'BBC News', title: 'Two', summary: '' }],
    { extras: ['markets'], interests: ['Collingwood'], shownToday: ['Old story'], now: new Date('2026-11-26T06:00:00Z') },
  );
  assert.match(prompt, /0\. \[ABC News\] One — S/);
  assert.match(prompt, /1\. \[BBC News\] Two/);
  assert.match(prompt, /RBA/);
  assert.match(prompt, /Collingwood/);
  assert.match(prompt, /Old story/);
});

test('picks: keeps valid entries only and never guesses', () => {
  assert.deepEqual(news.parsePicks('Sure! [{"i":2,"level":"need"},{"i":2,"level":"need"},{"i":9,"level":"need"},{"i":1,"level":"huge"},{"i":0,"level":"breaking"}] done', 3),
    [{ index: 2, level: 'need' }, { index: 0, level: 'breaking' }]);
  assert.deepEqual(news.parsePicks('no json here', 3), []);
  assert.deepEqual(news.parsePicks('[{"i": "1"}', 3), []);
  assert.deepEqual(news.parsePicks('{"i": 1}', 3), []);
});

const story = (key, level = 'need') => ({ key, title: `T${key}`, source: 'ABC News', link: `https://www.abc.net.au/${key}`, level });

test('urgent news goes out at once; routine waits for its 2-hour slot', () => {
  const t0 = Date.parse('2026-11-26T00:00:00Z');
  let queue = news.enqueue([], [story('a'), story('b', 'breaking')], t0);
  let state = { ...news.EMPTY_STATE, lastRoutineAt: t0 - HOUR };
  let step = news.nextMessage(queue, state, t0);
  assert.equal(step.message.urgent, true);
  assert.deepEqual(step.message.stories.map((s) => s.key), ['b']);
  ({ queue, state } = step);
  step = news.nextMessage(queue, state, t0 + 30 * 60_000);
  assert.equal(step.message, null);
  step = news.nextMessage(step.queue, step.state, t0 + HOUR);
  assert.deepEqual(step.message.stories.map((s) => s.key), ['a']);
  assert.equal(step.state.routineToday, 1);
  assert.equal(step.queue.length, 0);
});

test('a message carries at most 3 stories and busy holds everything', () => {
  const t0 = Date.parse('2026-11-26T00:00:00Z');
  const queue = news.enqueue([], ['a', 'b', 'c', 'd'].map((k) => story(k)), t0);
  assert.equal(news.nextMessage(queue, news.EMPTY_STATE, t0, { busy: true }).message, null);
  const step = news.nextMessage(queue, news.EMPTY_STATE, t0);
  assert.equal(step.message.stories.length, 3);
  assert.deepEqual(step.queue.map((s) => s.key), ['d']);
});

test('daily caps: 5 routine messages, 4 urgent; a new day resets them', () => {
  const t0 = Date.parse('2026-11-26T00:00:00Z');
  const capped = { ...news.EMPTY_STATE, day: news.dayKey(t0), routineToday: 5, urgentToday: 4 };
  const queue = news.enqueue([], [story('a'), story('w', 'warning')], t0);
  assert.equal(news.nextMessage(queue, capped, t0).message, null);
  const tomorrow = news.nextMessage(queue, capped, t0 + 24 * HOUR);
  assert.equal(tomorrow.message.urgent, true);
  assert.equal(tomorrow.state.urgentToday, 1);
});

test('queue drops stories older than 8 hours and ignores repeats', () => {
  const t0 = Date.parse('2026-11-26T00:00:00Z');
  let queue = news.enqueue([], [story('a')], t0);
  queue = news.enqueue(queue, [story('a'), story('b')], t0 + 9 * HOUR);
  assert.deepEqual(queue.map((s) => s.key), ['b']);
});

test('prefs: unknown extras dropped, interests cleaned, deduped and capped, bad point ignored', () => {
  const prefs = news.sanitizePrefs({
    extras: ['tech', 'nope', 'tech'],
    interests: ['  Collingwood  ', 'collingwood', '<b>x</b>', '', 'a'.repeat(60), ...Array.from({ length: 30 }, (_, i) => `t${i}`)],
    point: { x: 'a', y: 2 },
  });
  assert.deepEqual(prefs.extras, ['tech']);
  assert.equal(prefs.interests[0], 'Collingwood');
  assert.equal(prefs.interests[1], 'b x /b');
  assert.equal(prefs.interests[2].length, 40);
  assert.equal(prefs.interests.length, 20);
  assert.equal(prefs.point, null);
  assert.equal(prefs.enabled, true);
  assert.deepEqual(news.sanitizePrefs(null).extras, Object.keys(news.EXTRAS));
  assert.deepEqual(news.sanitizePrefs({ point: { x: 1.4, y: 2.6 } }).point, { x: 1, y: 3 });
});

test('an unread message holds ordinary news back, but not urgent news', () => {
  const t0 = Date.parse('2026-11-26T00:00:00Z');
  const queue = news.enqueue([], [story('a'), story('w', 'warning')], t0);
  const step = news.nextMessage(queue, news.EMPTY_STATE, t0, { routineBlocked: true });
  assert.deepEqual(step.message.stories.map((s) => s.key), ['w']);
  assert.equal(news.nextMessage(step.queue, step.state, t0, { routineBlocked: true }).message, null);
});

test('urgent news merges with a still-unread message, newest first, at most 4 stories', () => {
  const unread = { urgent: false, stories: [story('a'), story('b'), story('c')] };
  const merged = news.mergeUnread({ urgent: true, stories: [story('w', 'warning'), story('a')] }, unread);
  assert.equal(merged.urgent, true);
  assert.deepEqual(merged.stories.map((s) => s.key), ['w', 'a', 'b', 'c']);
  assert.equal(news.mergeUnread(unread, null), unread);
});

test('without Claude: the top 2 ABC Top Stories and the top BBC World story, unless already shown today', () => {
  const BBC = news.FEEDS.find((f) => f.id === 'bbc-world');
  const SPORT = news.FEEDS.find((f) => f.id === 'abc-sport');
  const abc = news.parseFeed(['A1', 'A2', 'A3'].map((t, i) => item(t, `https://www.abc.net.au/news/${i}`)).join(''), ABC);
  const bbc = news.parseFeed(['B1', 'B2'].map((t, i) => item(t, `https://www.bbc.com/news/${i}`)).join(''), BBC);
  const sport = news.parseFeed(item('S1', 'https://www.abc.net.au/news/sport/1'), SPORT);
  const all = [...abc, ...bbc, ...sport];
  assert.deepEqual(news.leadStories(all).map((s) => [s.title, s.level]), [['A1', 'need'], ['A2', 'need'], ['B1', 'need']]);
  assert.deepEqual(news.leadStories(all, ['A1']).map((s) => s.title), ['A2', 'B1']);
  assert.deepEqual(news.leadStories(all.filter((i) => i.title !== 'A1')).map((s) => s.title), ['A2', 'B1'], 'A3 is not a lead story just because A1 was seen');
});
