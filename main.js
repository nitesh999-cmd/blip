'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app, ipcMain, Menu } = require('electron');
const { createPetWindow } = require('./src/pet-window');
const { createSettings } = require('./src/settings');
const { createLinePool, makeClaudeGenerator, runClaude, SYSTEM_PROMPT } = require('./src/claude-lines');
const { createNewsController } = require('./src/news-controller');
const { NEWS_SYSTEM_PROMPT, leadStories } = require('./src/news');
const { PRIORITY } = require('./renderer/bubble-queue');

const DEMO = process.argv.includes('--demo');
const IS_MAC = process.platform === 'darwin';
const NOTICE_BUBBLE_MS = 25_000;
const THINKING_BUBBLE_MS = 45_000;
const CLAUDE_NOTICE_EVERY_MS = 6 * 60 * 60_000;
const CLAUDE_AUTH_ERROR = /not logged in|\/login|authenticat|unauthori[sz]ed|\b401\b|invalid api key|oauth/i;
const CLAUDE_MISSING_ERROR = /ENOENT|not found|no such file/i;
const MAX_ACTIONS = 50;
const NEWS_CLAUDE_TIMEOUT_MS = 90_000;
const CAPTURE_QUIT_MS = 16_000;
const PET_CAPTURE_MS = 3_000;

let pet;
let newsDot;
let pool;
let sequence = 0;
let saying = false;
let actions = new Map();
let lastClaudeNotice = -Infinity;

function log(message) {
  const file = path.join(app.getPath('userData'), 'blip.log');
  fs.appendFile(file, `${new Date().toISOString()} ${message}\n`, () => {});
}

/** Bubble buttons are just ids; what they do stays here in the main process. */
function registerAction(run) {
  sequence += 1;
  const id = `action-${sequence}`;
  const kept = [...actions].slice(-(MAX_ACTIONS - 1));
  actions = new Map([...kept, [id, run]]);
  return id;
}

function showBubble({ text, sub = '', priority, durationMs, action = null, thinking = false, wide = false }) {
  sequence += 1;
  const bubble = { id: `bubble-${sequence}`, text, sub, priority, durationMs, thinking, wide };
  const withAction = action ? { ...bubble, actionLabel: action.label, actionId: registerAction(action.run) } : bubble;
  pet.send('bubble', withAction);
}

const chatterMs = (text) => Math.min(9000, Math.max(4500, 2500 + text.length * 60));
const thinking = () => showBubble({ text: '', priority: PRIORITY.chatter, durationMs: THINKING_BUBBLE_MS, thinking: true });

async function say(kind) {
  if (saying) return;
  saying = true;
  try {
    if (!pool.hasReady(kind)) thinking();
    const line = await pool.take(kind);
    showBubble({ text: line, priority: PRIORITY.chatter, durationMs: chatterMs(line) });
  } catch (error) {
    log(`say failed: ${error.message}`);
  } finally {
    saying = false;
  }
}

/** Claude problems: say so now and then (signed out, or not installed); Blip carries on without it. */
function onClaudeError(error) {
  const message = String(error && error.message);
  log(`claude: ${message.slice(0, 200)}`);
  const signedOut = CLAUDE_AUTH_ERROR.test(message);
  const missing = CLAUDE_MISSING_ERROR.test(message);
  if ((!signedOut && !missing) || Date.now() - lastClaudeNotice < CLAUDE_NOTICE_EVERY_MS) return;
  lastClaudeNotice = Date.now();
  const text = signedOut
    ? "Claude seems to be signed out, so I'm using my own lines. Run claude in a terminal to sign in again."
    : "I can't find Claude Code on this computer, so I'm using my own lines and the top headlines. Install Claude Code to make me smarter.";
  showBubble({ text, priority: PRIORITY.notice, durationMs: NOTICE_BUBBLE_MS });
}

function openMenu() {
  const menu = Menu.buildFromTemplate([
    { label: 'Encourage me', click: () => say('encourage') },
    { label: 'Say something funny', click: () => say('funny') },
    { label: 'Check in on me', click: () => say('checkin') },
    { type: 'separator' },
    ...newsDot.menuItems(),
    { type: 'separator' },
    { label: 'Quit Blip', click: () => app.quit() },
  ]);
  menu.popup({ window: pet.win });
}

/** Verification pictures: Blip's own windows only, never the screen. */
function capturePet(captureDir) {
  pet.win.webContents.capturePage()
    .then((image) => fs.writeFileSync(path.join(captureDir, 'pet.png'), image.toPNG()))
    .catch((error) => log(`capture failed: ${error.message}`));
}

function runDemo() {
  const captureDir = process.env.BLIP_CAPTURE_DIR;
  pet.send('demo');
  newsDot.runDemo(captureDir);
  if (captureDir && fs.existsSync(captureDir)) {
    setTimeout(() => capturePet(captureDir), PET_CAPTURE_MS);
    setTimeout(() => app.quit(), CAPTURE_QUIT_MS);
  }
}

function wireIpc() {
  ipcMain.on('tap', (event) => { if (pet.isFromPet(event)) say('encourage'); });
  ipcMain.on('open-menu', (event) => { if (pet.isFromPet(event)) openMenu(); });
  ipcMain.on('hit-rects', (event, rects) => { if (pet.isFromPet(event)) pet.setHitRects(rects); });
  ipcMain.on('drag-start', (event, grab) => { if (pet.isFromPet(event)) pet.startDrag(grab); });
  ipcMain.on('drag-move', (event) => { if (pet.isFromPet(event)) pet.dragMove(); });
  ipcMain.on('drag-end', (event) => { if (pet.isFromPet(event)) pet.endDrag(); });
  ipcMain.on('bubble-action', (event, actionId) => {
    if (!pet.isFromPet(event)) return;
    const run = actions.get(actionId);
    if (!run) return;
    actions = new Map([...actions].filter(([id]) => id !== actionId));
    run();
  });
}

function start() {
  // On a Mac Blip lives on the desktop, not in the Dock or the app switcher.
  if (IS_MAC && app.dock) app.dock.hide();
  const dataDir = app.getPath('userData');
  const claudeDir = path.join(dataDir, 'claude-work');
  const promptFile = path.join(dataDir, 'system-prompt.txt');
  const newsPromptFile = path.join(dataDir, 'news-prompt.txt');
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.writeFileSync(promptFile, SYSTEM_PROMPT);
  fs.writeFileSync(newsPromptFile, NEWS_SYSTEM_PROMPT);

  const settings = createSettings(dataDir, log);
  pool = createLinePool({ generate: makeClaudeGenerator({ systemPromptFile: promptFile, cwd: claudeDir }), onError: onClaudeError });
  pet = createPetWindow({
    savedPoint: settings.get().displayPoint,
    onMoved: (point) => settings.update({ displayPoint: point }),
  });
  newsDot = createNewsController({
    settings,
    ask: (input) => runClaude({ input, systemPromptFile: newsPromptFile, cwd: claudeDir, timeoutMs: NEWS_CLAUDE_TIMEOUT_MS })
      .catch((error) => { onClaudeError(error); throw error; }),
    isBusy: () => false,
    getAnchor: () => pet.anchor(),
    dataDir,
    log,
    fallbackPick: leadStories,
  });
  wireIpc();

  showBubble({ text: "Hi, I'm Blip! Tap me any time.", priority: PRIORITY.chatter, durationMs: 5000 });
  if (DEMO) {
    runDemo();
    return;
  }
  newsDot.start();
}

// Checks and tests can keep Blip's data (and its one-copy lock) in a folder of their own.
if (process.env.BLIP_DATA_DIR) app.setPath('userData', process.env.BLIP_DATA_DIR);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showBubble({ text: "I'm already here!", priority: PRIORITY.chatter, durationMs: 3000 }));
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => { if (newsDot) newsDot.stop(); });
  app.whenReady().then(start);
}
