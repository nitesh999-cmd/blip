'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { ipcMain, Menu, shell } = require('electron');
const news = require('./news');
const { createNewsService } = require('./news-service');
const { createNewsWindow } = require('./news-window');
const { createNewsSettingsWindow } = require('./news-settings-window');

const ROUTINE_OPEN_MS = 45_000;
const URGENT_OPEN_MS = 90_000;
const NOTE_OPEN_MS = 7_000;

const DEMO_NEWS = Object.freeze({
  urgent: false,
  stories: [
    { key: 'd0000000000000a1', title: 'Example headline: a need-to-know story would appear here', source: 'ABC News', link: 'https://www.abc.net.au/news', level: 'need' },
    { key: 'd0000000000000a2', title: 'Example: who won the big final, in one plain line', source: 'ABC Sport', link: 'https://www.abc.net.au/news/sport', level: 'need' },
  ],
});

const LONG = 'Example of a long title: Severe Weather Warning for North Central, North East and parts of Central, East Gippsland, Northern Country and West and South Gippsland Forecast Districts';
const DEMO_LONG = Object.freeze({
  urgent: true,
  stories: [
    { key: 'd0000000000000b1', title: LONG, source: 'Bureau of Meteorology', link: 'https://reg.bom.gov.au/', level: 'warning' },
    { key: 'd0000000000000b2', title: `${LONG} (second)`, source: 'Bureau of Meteorology', link: 'https://reg.bom.gov.au/', level: 'warning' },
    { key: 'd0000000000000b3', title: 'Example: a third fairly long headline that wraps over two or three lines in the card', source: 'ABC News', link: 'https://www.abc.net.au/news', level: 'need' },
    { key: 'd0000000000000b4', title: 'Example: a fourth headline, the most a merged message can hold', source: 'BBC News', link: 'https://www.bbc.com/news', level: 'need' },
  ],
});

const timeText = (ms) => new Date(ms).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });

function heading(message) {
  if (message.stories.some((s) => s.level === 'breaking')) return 'Breaking news';
  const warnings = message.stories.filter((s) => s.level === 'warning').length;
  if (warnings === message.stories.length) return 'Weather warning';
  return warnings ? 'Weather warning + news' : 'News';
}

/** What the dot's page gets: words only. Links stay here and are checked again before opening. */
function toView(message) {
  return {
    heading: heading(message),
    urgent: message.urgent === true,
    timeoutMs: message.urgent ? URGENT_OPEN_MS : ROUTINE_OPEN_MS,
    stories: message.stories.map(({ key, title, source }) => ({ key, title, source })),
  };
}

/** The news dot: its window, its hourly service, its menu and its topics window. */
function createNewsController({ settings, ask, isBusy, getAnchor, dataDir, log, fallbackPick = null }) {
  const prefs = () => settings.get().news;
  const updatePrefs = (patch) => settings.update({ news: news.sanitizePrefs({ ...prefs(), ...patch }) }).news;

  let onScreen = new Map();
  let unread = false;
  let held = false;
  let working = false;
  let noteOpen = false;

  const dot = createNewsWindow({ savedPoint: prefs().point, visible: prefs().enabled, onMoved: (point) => updatePrefs({ point }) });
  const topics = createNewsSettingsWindow();
  // Shining = busy checking; soft glow = there is something (unread, or held during a meeting).
  const restingMode = () => (working ? 'working' : unread || held ? 'waiting' : 'rest');

  function show(message) {
    onScreen = new Map(message.stories.map((s) => [s.key, s.link]));
    unread = true;
    noteOpen = false;
    dot.setMode(restingMode());
    dot.openMessage(toView(message));
  }

  /** A short note ("Topics saved") never counts as reading the news. */
  function note(text) {
    noteOpen = true;
    dot.openMessage({ heading: 'News', note: text, stories: [], timeoutMs: NOTE_OPEN_MS });
  }

  const service = createNewsService({
    getPrefs: prefs,
    ask,
    isBusy,
    file: path.join(dataDir, 'news-state.json'),
    log,
    onWorking: (on) => { working = on; dot.setMode(restingMode()); },
    onHeld: (on) => {
      if (on !== held) log(on ? 'news held (in a meeting); dot glowing' : 'news no longer held');
      held = on;
      dot.setMode(restingMode());
    },
    onMessage: show,
    hasUnread: () => unread,
    fallbackPick,
  });

  /** Closed by hand = read. Timed out unread = keep a soft glow until tapped. */
  function closeMessage(missed) {
    dot.collapse();
    if (!noteOpen) unread = missed && onScreen.size > 0;
    noteOpen = false;
    dot.setMode(restingMode());
  }

  function tap() {
    if (dot.isOpen()) { closeMessage(false); return; }
    const last = service.lastMessage();
    if (unread && last) { show(last); return; }
    if (held && service.release({ asked: true, force: true })) return;
    if (last) { show(last); return; }
    const at = service.lastCheckAt();
    note(at ? `Nothing new worth stopping for. Last checked ${timeText(at)}.` : "I haven't checked the news yet. I'll shine while I do.");
  }

  function read(key) {
    const link = onScreen.get(key);
    if (!link || !news.isNewsLink(link)) return;
    shell.openExternal(link);
    closeMessage(false);
  }

  async function checkNow() {
    if (!prefs().enabled) return;
    const shown = await service.checkNow();
    if (!shown) note(`Nothing new worth stopping for. Checked ${timeText(Date.now())}.`);
  }

  function setEnabled(on) {
    updatePrefs({ enabled: on });
    dot.setVisible(on);
    if (on) service.tick();
  }

  const openTopics = () => topics.show(getAnchor());

  function openDotMenu() {
    Menu.buildFromTemplate([
      { label: 'Check the news now', click: () => { checkNow(); } },
      { label: 'News topics…', click: openTopics },
      { type: 'separator' },
      { label: 'Hide the news dot', click: () => setEnabled(false) },
    ]).popup({ window: dot.win });
  }

  /** Items for Blip's own right-click menu. */
  function menuItems() {
    return [
      { label: 'News dot', type: 'checkbox', checked: prefs().enabled, click: (item) => setEnabled(item.checked) },
      { label: 'Find the news dot', click: () => { if (!prefs().enabled) setEnabled(true); dot.find(getAnchor()); } },
      { label: 'News topics…', click: openTopics },
    ];
  }

  function wireIpc() {
    const fromDot = (handler) => (event, ...args) => { if (dot.isFromDot(event)) handler(...args); };
    ipcMain.on('news-tap', fromDot(tap));
    ipcMain.on('news-menu', fromDot(openDotMenu));
    ipcMain.on('news-read', fromDot((key) => { if (typeof key === 'string') read(key); }));
    ipcMain.on('news-close', fromDot((missed) => closeMessage(missed === true)));
    ipcMain.on('news-height', fromDot((height) => { if (Number.isFinite(height)) dot.fitOpen(height); }));
    ipcMain.on('news-drag-start', fromDot((grab) => dot.startDrag(grab)));
    ipcMain.on('news-drag-end', fromDot(() => dot.endDrag()));
    ipcMain.handle('news-settings-get', (event) => {
      if (!topics.isFromSettings(event)) return { extras: [], interests: [] };
      const current = prefs();
      return {
        extras: Object.entries(news.EXTRAS).map(([key, extra]) => ({ key, label: extra.label, on: current.extras.includes(key) })),
        interests: current.interests,
      };
    });
    ipcMain.on('news-settings-save', (event, choice) => {
      if (!topics.isFromSettings(event) || !choice || typeof choice !== 'object') return;
      if (!Array.isArray(choice.extras) || !Array.isArray(choice.interests)) return;
      updatePrefs({ extras: choice.extras, interests: choice.interests });
      topics.close();
      note('Topics saved. They count from the next check.');
    });
    ipcMain.on('news-settings-close', (event) => { if (topics.isFromSettings(event)) topics.close(); });
  }

  /** Demo: invented headlines, no network. With a capture folder, saves a picture of each state. */
  function runDemo(captureDir) {
    const canCapture = Boolean(captureDir) && fs.existsSync(captureDir) && fs.statSync(captureDir).isDirectory();
    const snap = (name) => {
      if (canCapture) dot.capture(path.join(captureDir, `news-${name}.png`)).catch((error) => log(`capture failed: ${error.message}`));
    };
    const at = (ms, run) => setTimeout(run, ms);
    at(1500, () => snap('rest'));
    at(2000, () => { working = true; dot.setMode('working'); });
    at(3600, () => snap('working'));
    at(4500, () => { working = false; show(DEMO_NEWS); });
    at(6500, () => snap('open'));
    at(8000, () => closeMessage(true));
    at(9800, () => snap('waiting'));
    if (!canCapture) return;
    at(10000, () => topics.show(getAnchor(), { quiet: true }));
    at(12000, () => topics.capture(path.join(captureDir, 'news-topics.png')).catch((error) => log(`capture failed: ${error.message}`)));
    // Worst case: four long headlines opening from a bottom-left dot.
    at(12500, () => {
      const area = dot.workArea();
      dot.moveTo({ x: area.x + 60, y: area.y + area.height - 60 });
      show(DEMO_LONG);
    });
    at(14500, () => snap('open-long'));
  }

  wireIpc();

  return { start: () => service.start(), stop: () => service.stop(), menuItems, runDemo, checkNow };
}

module.exports = { createNewsController, toView };
