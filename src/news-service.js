'use strict';

const fs = require('node:fs');
const news = require('./news');

const CHECK_EVERY_MS = 60 * 60_000;
const TICK_MS = 5 * 60_000;
const FIRST_TICK_MS = 60_000;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_FEED_CHARS = 2_000_000;
const SEEN_MEMORY = 3000;
const MAX_PROMPT_STORIES = 70;
const LAST_MESSAGE_KEEP_MS = 12 * news.HOUR_MS;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) BlipNews/1.0';

/** Fetches one public feed. Size-capped; anything odd is an error, never parsed. */
async function fetchFeedText(url, fetchImpl = fetch) {
  const res = await fetchImpl(url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (text.length > MAX_FEED_CHARS) throw new Error('feed too large');
  return text;
}

function cleanMessage(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.stories) || !Number.isFinite(raw.at)) return null;
  const stories = raw.stories.map(news.cleanStory).filter(Boolean).slice(0, 4);
  return stories.length ? { urgent: raw.urgent === true, stories, at: raw.at } : null;
}

/** Blip's own memory of the news: what it has seen, what is waiting, and today's counts. */
function loadMemory(file, log) {
  const empty = { seen: [], queue: [], state: { ...news.EMPTY_STATE }, last: null };
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    const state = saved.state && typeof saved.state === 'object' ? saved.state : {};
    const num = (v) => (Number.isFinite(v) ? v : null);
    return {
      seen: Array.isArray(saved.seen) ? saved.seen.filter((k) => typeof k === 'string' && /^[0-9a-f]{16}$/.test(k)).slice(-SEEN_MEMORY) : [],
      queue: Array.isArray(saved.queue) ? saved.queue.map(news.cleanStory).filter((s) => s && Number.isFinite(s.foundAt)) : [],
      state: {
        day: typeof state.day === 'string' ? state.day : null,
        routineToday: Number.isInteger(state.routineToday) ? state.routineToday : 0,
        urgentToday: Number.isInteger(state.urgentToday) ? state.urgentToday : 0,
        lastRoutineAt: num(state.lastRoutineAt),
        lastCheckAt: num(state.lastCheckAt),
        shownToday: Array.isArray(state.shownToday) ? state.shownToday.filter((t) => typeof t === 'string').map((t) => news.plainText(t, 220)).slice(-20) : [],
      },
      last: cleanMessage(saved.last),
    };
  } catch (error) {
    if (error.code !== 'ENOENT') log(`news memory unreadable, starting fresh: ${error.message}`);
    return empty;
  }
}

/**
 * Checks the news every hour (feeds, then one Claude pick; without Claude, fallbackPick if given), and every 5 minutes decides
 * whether something waiting should be shown. Never shows anything itself.
 */
function createNewsService({
  getPrefs, ask, fetchText = fetchFeedText, isBusy = () => false, onWorking = () => {}, onMessage = () => {},
  onHeld = () => {}, hasUnread = () => false, file, log = () => {}, nowFn = Date.now, timers = globalThis,
  fallbackPick = null,
}) {
  let memory = loadMemory(file, log);
  let checking = null;
  let handles = [];

  function save() {
    try {
      fs.writeFileSync(file, JSON.stringify(memory));
    } catch (error) {
      log(`could not save news memory: ${error.message}`);
    }
  }

  const remember = (keys) => {
    memory = { ...memory, seen: [...memory.seen, ...keys].slice(-SEEN_MEMORY) };
  };

  async function gather(prefs) {
    const feeds = news.activeFeeds(prefs);
    const results = await Promise.allSettled(feeds.map(async (feed) => news.parseFeed(await fetchText(feed.url), feed)));
    results.forEach((result, i) => { if (result.status === 'rejected') log(`news feed ${feeds[i].id}: ${result.reason && result.reason.message}`); });
    const items = results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
    return news.freshItems(items, new Set(memory.seen), nowFn());
  }

  async function pick(stories, prefs) {
    if (!stories.length) return [];
    const reply = await ask(news.buildPickPrompt(stories, {
      extras: prefs.extras, interests: prefs.interests, shownToday: news.rollDay(memory.state, nowFn()).shownToday, now: new Date(nowFn()),
    }));
    return news.parsePicks(reply, stories.length).map((p) => news.toStory(stories[p.index], p.level));
  }

  async function runCheck() {
    const prefs = getPrefs();
    if (!prefs.enabled) return;
    onWorking(true);
    try {
      const fresh = await gather(prefs);
      const warnings = fresh.filter((item) => item.kind === 'warning');
      const urgentWeather = warnings.filter((item) => news.isMelbourneWarning(item.title)).map((item) => news.toStory(item, 'warning'));
      const stories = fresh.filter((item) => item.kind !== 'warning')
        .sort((a, b) => (b.publishedMs || 0) - (a.publishedMs || 0))
        .slice(0, MAX_PROMPT_STORIES);
      remember(warnings.map((item) => item.key));
      let picked = [];
      try {
        picked = await pick(stories, prefs);
        remember(fresh.filter((item) => item.kind !== 'warning').map((item) => item.key));
      } catch (error) {
        if (fallbackPick) {
          const plain = fresh.filter((item) => item.kind !== 'warning');
          picked = fallbackPick(plain, news.rollDay(memory.state, nowFn()).shownToday);
          remember(plain.map((item) => item.key));
          log(`news pick: Claude unavailable (${error && error.message}); used the lead stories`);
        } else {
          log(`news pick failed (will retry next hour): ${error && error.message}`);
        }
      }
      memory = {
        ...memory,
        queue: news.enqueue(memory.queue, [...urgentWeather, ...picked], nowFn()),
        state: { ...memory.state, lastCheckAt: nowFn() },
      };
      save();
    } finally {
      onWorking(false);
    }
  }

  function check() {
    if (!checking) checking = runCheck().catch((error) => log(`news check failed: ${error && error.message}`)).finally(() => { checking = null; });
    return checking;
  }

  /**
   * Shows what is due; returns true if something was shown. In a meeting, due news is held
   * (onHeld(true) lets the dot glow); asked + force (a tap, "Check the news now") shows it anyway.
   * While a message is unread, ordinary news waits; urgent news is shown together with it.
   */
  function release({ asked = false, force = false } = {}) {
    if (!getPrefs().enabled) return false;
    let busy = false;
    if (!force) {
      try { busy = Boolean(isBusy()); } catch { busy = false; }
    }
    const unread = Boolean(hasUnread());
    const options = { asked, routineBlocked: unread && !asked };
    const step = news.nextMessage(memory.queue, memory.state, nowFn(), { ...options, busy });
    memory = { ...memory, queue: step.queue, state: step.state };
    onHeld(busy && Boolean(news.nextMessage(memory.queue, memory.state, nowFn(), options).message));
    if (!step.message) return false;
    const message = news.mergeUnread(step.message, unread ? lastMessage() : null);
    memory = { ...memory, last: { ...message, at: nowFn() } };
    save();
    onMessage(message);
    return true;
  }

  async function tick() {
    const last = memory.state.lastCheckAt;
    if (last === null || nowFn() - last >= CHECK_EVERY_MS) await check();
    release();
  }

  /** "Check the news now": fetch and pick at once, then show anything waiting, meeting or not. */
  async function checkNow() {
    await check();
    return release({ asked: true, force: true });
  }

  function start() {
    handles = [timers.setTimeout(tick, FIRST_TICK_MS), timers.setInterval(tick, TICK_MS)];
  }

  function stop() {
    handles.forEach((handle) => { timers.clearTimeout(handle); timers.clearInterval(handle); });
    handles = [];
  }

  /** The last message, for a tap to bring back (kept 12 hours). */
  function lastMessage() {
    const last = memory.last;
    return last && nowFn() - last.at <= LAST_MESSAGE_KEEP_MS ? last : null;
  }

  return { start, stop, tick, check, checkNow, release, lastMessage, lastCheckAt: () => memory.state.lastCheckAt };
}

module.exports = { createNewsService, fetchFeedText, loadMemory, CHECK_EVERY_MS, TICK_MS };
