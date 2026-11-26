'use strict';

// News dot: pure helpers. No Electron, no I/O: everything here is unit-tested.
// Feed text is untrusted. Claude only ever returns item numbers; the headline and the
// link shown come from the parsed feed item, and links must be on that feed's own hosts.

const crypto = require('node:crypto');

const HOUR_MS = 60 * 60_000;
const MAX_ITEMS_PER_FEED = 60;
const MAX_PROMPT_ITEMS = 70;
const MAX_PICKS = 6;
const ITEM_MAX_AGE_MS = 12 * HOUR_MS;
const QUEUE_MAX_AGE_MS = 8 * HOUR_MS;
const QUEUE_MAX = 12;
const ROUTINE_GAP_MS = 2 * HOUR_MS;
const MAX_ROUTINE_PER_DAY = 5;
const MAX_URGENT_PER_DAY = 4;
const STORIES_PER_MESSAGE = 3;
const MAX_INTERESTS = 20;
const INTEREST_MAX_CHARS = 40;

const ABC = ['www.abc.net.au'];
const BBC = ['www.bbc.co.uk', 'www.bbc.com'];

const FEEDS = Object.freeze([
  { id: 'abc-top', name: 'ABC News', topic: 'core', url: 'https://www.abc.net.au/news/feed/45910/rss.xml', hosts: ABC },
  { id: 'abc-justin', name: 'ABC News', topic: 'core', url: 'https://www.abc.net.au/news/feed/51120/rss.xml', hosts: ABC },
  { id: 'abc-sport', name: 'ABC Sport', topic: 'core', url: 'https://www.abc.net.au/news/feed/45924/rss.xml', hosts: ABC },
  { id: 'bbc-world', name: 'BBC News', topic: 'core', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', hosts: BBC },
  { id: 'abc-business', name: 'ABC Business', topic: 'markets', url: 'https://www.abc.net.au/news/feed/51892/rss.xml', hosts: ABC },
  { id: 'bbc-business', name: 'BBC Business', topic: 'markets', url: 'https://feeds.bbci.co.uk/news/business/rss.xml', hosts: BBC },
  { id: 'reneweconomy', name: 'RenewEconomy', topic: 'energy', url: 'https://reneweconomy.com.au/feed/', hosts: ['reneweconomy.com.au'] },
  { id: 'pv-magazine', name: 'pv magazine Australia', topic: 'energy', url: 'https://www.pv-magazine-australia.com/feed/', hosts: ['www.pv-magazine-australia.com'] },
  { id: 'bbc-tech', name: 'BBC Technology', topic: 'tech', url: 'https://feeds.bbci.co.uk/news/technology/rss.xml', hosts: BBC },
  { id: 'bom-vic', name: 'Bureau of Meteorology', topic: 'weather', kind: 'warning', url: 'https://www.bom.gov.au/fwo/IDZ00059.warnings_vic.xml', hosts: ['reg.bom.gov.au', 'www.bom.gov.au'] },
]);

/** Owner-selectable extras. "core" (Australian + world headlines and big winners) is always on. */
const EXTRAS = Object.freeze({
  markets: { label: 'Money & markets', brief: 'money and markets: RBA interest-rate decisions, big ASX or global market moves, major company news' },
  energy: { label: 'Solar & energy policy', brief: 'solar and energy policy in Australia: rebates, VEU, feed-in tariffs, grid and network changes, big solar or battery news' },
  tech: { label: 'Tech & AI', brief: 'tech and AI: major launches and big tech-company news' },
  weather: { label: 'Melbourne weather warnings', brief: '' },
});

const DEFAULT_PREFS = Object.freeze({ enabled: true, extras: Object.keys(EXTRAS), interests: [], point: null });

const NEWS_SYSTEM_PROMPT = [
  'You pick the few news stories a busy person in Melbourne, Australia needs to know about today.',
  'You never write or rewrite headlines. You reply with only a JSON array, nothing else.',
].join(' ');

// ---------- feed parsing ----------

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };

function decodeEntities(text) {
  return String(text).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] !== '#') return NAMED_ENTITIES[code.toLowerCase()] ?? match;
    const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
  });
}

function tagText(block, tag) {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i'));
  if (!match) return '';
  return match[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1');
}

/** Feed text to one plain line: entities decoded, tags and control characters removed. */
function plainText(text, max) {
  const once = decodeEntities(text).replace(/<[^>]*>/g, ' ');
  const clean = decodeEntities(once).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

const hash = (text) => crypto.createHash('sha1').update(text).digest('hex').slice(0, 16);

/** BOM titles start with an issue stamp ("26/16:36 EDT"); drop it so a reissue isn't new news. */
const warningTitle = (title) => title.replace(/^\d{1,2}\/\d{1,2}:\d{2}\s+[A-Z]{3,4}\s+/, '');

/** The feed's own link, upgraded to https, and only if it is on that feed's hosts. */
function safeLink(link, feed) {
  let url;
  try {
    url = new URL(decodeEntities(String(link || '')).trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (!feed.hosts.includes(url.hostname) || url.username || url.password) return null;
  url.protocol = 'https:';
  url.port = '';
  return url.href;
}

function parseFeed(xml, feed) {
  const items = [];
  for (const match of String(xml || '').matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const block = match[0];
    const raw = plainText(tagText(block, 'title'), 220);
    const title = feed.kind === 'warning' ? warningTitle(raw) : raw;
    const link = safeLink(tagText(block, 'link'), feed);
    if (!title || !link) continue;
    const guid = decodeEntities(tagText(block, 'guid')).trim();
    const published = Date.parse(decodeEntities(tagText(block, 'pubDate')).trim());
    items.push({
      key: hash(feed.kind === 'warning' ? `${feed.id}|${guid || link}|${title}` : `${feed.id}|${guid || link}`),
      feedId: feed.id,
      source: feed.name,
      topic: feed.topic,
      kind: feed.kind || 'story',
      title,
      summary: plainText(tagText(block, 'description'), 200),
      link,
      publishedMs: Number.isFinite(published) ? published : null,
      rank: items.length,
    });
    if (items.length >= MAX_ITEMS_PER_FEED) break;
  }
  return items;
}

/** Statewide BOM feed: keep warnings for Melbourne's forecast district ("Central", not "North Central"). */
function isMelbourneWarning(title) {
  if (/marine|coastal|surf|small craft|sheep graziers|ocean/i.test(title)) return false;
  return /(?<!North\s)\bCentral\b(?!\s+Gippsland)|\bMelbourne\b|\bPort Phillip\b|\bMornington\b/i.test(title);
}

function activeFeeds(prefs) {
  const extras = new Set(prefs.extras || []);
  return FEEDS.filter((feed) => feed.topic === 'core' || extras.has(feed.topic));
}

/** Unseen, recent, one per link (the same story often sits in two ABC feeds). */
function freshItems(items, seen, nowMs, maxAgeMs = ITEM_MAX_AGE_MS) {
  const links = new Set();
  return items.filter((item) => {
    if (seen.has(item.key) || links.has(item.link)) return false;
    if (item.publishedMs !== null && (nowMs - item.publishedMs > maxAgeMs || item.publishedMs - nowMs > HOUR_MS)) return false;
    links.add(item.link);
    return true;
  });
}

// ---------- asking Claude ----------

function buildPickPrompt(items, { extras = [], interests = [], shownToday = [], now = new Date() } = {}) {
  const extraLines = extras.map((key) => EXTRAS[key] && EXTRAS[key].brief).filter(Boolean);
  const wants = [
    'Australian and world headlines most people would be expected to know about today',
    'big results: who won major sport (AFL and NRL finals, State of Origin, Melbourne Cup, the Ashes, Australian Open and other Grand Slams, F1, Olympics, World Cups), elections, the Oscars and similar',
    ...extraLines,
    ...(interests.length ? [`anything clearly about: ${interests.join(', ')}`] : []),
  ];
  const list = items.slice(0, MAX_PROMPT_ITEMS)
    .map((item, i) => `${i}. [${item.source}] ${item.title}${item.summary ? ` — ${item.summary.slice(0, 160)}` : ''}`)
    .join('\n');
  const shown = shownToday.length ? `\nAlready shown today (do not pick the same story again): ${shownToday.join(' | ')}` : '';
  const when = now.toLocaleString('en-AU', { weekday: 'long', hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Melbourne' });
  return [
    `It is ${when} in Melbourne. Pick only the stories below worth interrupting someone's work for.`,
    `Worth knowing: ${wants.map((w) => `\n- ${w}`).join('')}`,
    'Skip opinion, analysis, explainers, lifestyle, minor sport, local crime and court cases unless they are national news. When several items are the same story, pick only the best one.',
    `Level "breaking" is only for huge news most Australians will talk about today (a major disaster, a change of prime minister, an election result, a grand-final winner, a world-changing event). Everything else you pick is "need". Pick at most ${MAX_PICKS}, most important first. Picking none is fine.`,
    'Reply with only a JSON array like [{"i": 3, "level": "need"}], using the item numbers.',
    shown,
    `Items:\n${list}`,
  ].join('\n') + '\n';
}

/** Claude's reply to [{ index, level }]; anything malformed is ignored, never guessed. */
// ---------- without Claude ----------

/** How many top slots of each editor-ordered feed count as lead stories. */
const LEAD_SLOTS = Object.freeze({ 'abc-top': 2, 'bbc-world': 1 });

/** Without Claude: the editors' lead stories (top of ABC Top Stories and BBC World), skipping any shown today. */
function leadStories(items, shownToday = []) {
  const shown = new Set(shownToday);
  return items
    .filter((item) => item.kind !== 'warning' && Number.isInteger(item.rank) && item.rank < (LEAD_SLOTS[item.feedId] || 0))
    .filter((item) => !shown.has(item.title))
    .map((item) => toStory(item, 'need'));
}

function parsePicks(text, count) {
  const raw = String(text || '');
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start < 0 || end <= start) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const used = new Set();
  const picks = [];
  for (const entry of parsed) {
    const index = entry && entry.i;
    const level = entry && entry.level;
    if (!Number.isInteger(index) || index < 0 || index >= count || used.has(index)) continue;
    if (level !== 'breaking' && level !== 'need') continue;
    used.add(index);
    picks.push({ index, level });
    if (picks.length >= MAX_PICKS) break;
  }
  return picks;
}

// ---------- when to show ----------

const dayKey = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

const EMPTY_STATE = Object.freeze({ day: null, routineToday: 0, urgentToday: 0, lastRoutineAt: null, lastCheckAt: null, shownToday: [] });

function rollDay(state, nowMs) {
  const day = dayKey(nowMs);
  return state.day === day ? state : { ...state, day, routineToday: 0, urgentToday: 0, shownToday: [] };
}

const toStory = (item, level) => ({ key: item.key, title: item.title, source: item.source, link: item.link, level });

/** New picks join the queue; stale or overflowing entries fall off the front. */
function enqueue(queue, stories, nowMs) {
  const keys = new Set(queue.map((s) => s.key));
  const added = stories.filter((s) => !keys.has(s.key)).map((s) => ({ ...s, foundAt: nowMs }));
  return [...queue, ...added].filter((s) => nowMs - s.foundAt <= QUEUE_MAX_AGE_MS).slice(-QUEUE_MAX);
}

const isUrgent = (story) => story.level === 'breaking' || story.level === 'warning';

/**
 * What to show now, if anything. Urgent news (breaking, weather warnings) goes out at once
 * up to its own daily cap; other news at most every 2 hours and 5 messages a day.
 * Busy (in a meeting) holds everything.
 */
function nextMessage(queue, state, nowMs, { busy = false, asked = false, routineBlocked = false } = {}) {
  const today = rollDay(state, nowMs);
  if (busy || !queue.length) return { message: null, queue, state: today };
  const urgent = today.urgentToday < MAX_URGENT_PER_DAY ? queue.filter(isUrgent).slice(0, STORIES_PER_MESSAGE) : [];
  // "Check the news now" skips the 2-hour wait (it still counts toward the day's 5).
  // routineBlocked: an earlier message is still unread, so ordinary news waits behind it.
  const routineDue = !routineBlocked && today.routineToday < MAX_ROUTINE_PER_DAY
    && (asked || today.lastRoutineAt === null || nowMs - today.lastRoutineAt >= ROUTINE_GAP_MS);
  const stories = urgent.length ? urgent : routineDue ? queue.filter((s) => !isUrgent(s)).slice(0, STORIES_PER_MESSAGE) : [];
  if (!stories.length) return { message: null, queue, state: today };
  const sent = new Set(stories.map((s) => s.key));
  const shownToday = [...today.shownToday, ...stories.map((s) => s.title)].slice(-20);
  const nextState = urgent.length
    ? { ...today, urgentToday: today.urgentToday + 1, shownToday }
    : { ...today, routineToday: today.routineToday + 1, lastRoutineAt: nowMs, shownToday };
  return {
    message: { urgent: urgent.length > 0, stories: stories.map(({ foundAt, ...story }) => story) },
    queue: queue.filter((s) => !sent.has(s.key)),
    state: nextState,
  };
}

const ALL_HOSTS = new Set(FEEDS.flatMap((feed) => feed.hosts));

/** Last check before a link leaves Blip: https on one of the feeds' own hosts. */
function isNewsLink(link) {
  try {
    const url = new URL(link);
    return url.protocol === 'https:' && ALL_HOSTS.has(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

/** Stories read back from Blip's own state file are re-checked like any other input. */
function cleanStory(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const { key, title, source, link, level, foundAt } = raw;
  if (typeof key !== 'string' || !/^[0-9a-f]{16}$/.test(key)) return null;
  if (typeof title !== 'string' || !title.trim() || typeof source !== 'string' || !isNewsLink(link)) return null;
  if (!['need', 'breaking', 'warning'].includes(level)) return null;
  const story = { key, title: plainText(title, 220), source: plainText(source, 60), link, level };
  return Number.isFinite(foundAt) ? { ...story, foundAt } : story;
}

const MAX_MERGED_STORIES = 4;

/** New urgent news on top of a still-unread message: show both rather than lose the older one. */
function mergeUnread(message, unread) {
  if (!unread) return message;
  const keys = new Set(message.stories.map((s) => s.key));
  const older = unread.stories.filter((s) => !keys.has(s.key));
  return { urgent: message.urgent || unread.urgent, stories: [...message.stories, ...older].slice(0, MAX_MERGED_STORIES) };
}

// ---------- settings ----------

function cleanInterest(value) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, INTEREST_MAX_CHARS);
}

function sanitizePrefs(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const extras = Array.isArray(source.extras)
    ? [...new Set(source.extras.filter((key) => Object.hasOwn(EXTRAS, key)))]
    : [...DEFAULT_PREFS.extras];
  const seen = new Set();
  const interests = (Array.isArray(source.interests) ? source.interests : [])
    .map(cleanInterest)
    .filter((text) => text && !seen.has(text.toLowerCase()) && seen.add(text.toLowerCase()))
    .slice(0, MAX_INTERESTS);
  const p = source.point;
  const point = p && Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: Math.round(p.x), y: Math.round(p.y) } : null;
  return { enabled: source.enabled !== false, extras, interests, point };
}

module.exports = {
  FEEDS, EXTRAS, DEFAULT_PREFS, NEWS_SYSTEM_PROMPT, EMPTY_STATE,
  ROUTINE_GAP_MS, MAX_ROUTINE_PER_DAY, MAX_URGENT_PER_DAY, HOUR_MS,
  decodeEntities, plainText, safeLink, parseFeed, isMelbourneWarning, activeFeeds, freshItems,
  buildPickPrompt, parsePicks, leadStories, rollDay, toStory, enqueue, nextMessage, sanitizePrefs, dayKey,
  isNewsLink, cleanStory, mergeUnread,
};
