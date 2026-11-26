'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { BrowserWindow, screen } = require('electron');
const place = require('./news-placement');

const DRAG_POLL_MS = 16;
const TOPMOST_EVERY_MS = 4000;

/**
 * The news dot: a tiny transparent always-on-top window that never takes keyboard focus.
 * It can be dragged to any screen and opens into a small message toward the screen's middle.
 */
function createNewsWindow({ savedPoint = null, visible = true, onMoved = () => {} } = {}) {
  let point = place.pickPoint(screen.getAllDisplays(), savedPoint, screen.getPrimaryDisplay());
  let open = false;
  let drag = null;
  let dragTimer = null;
  let loaded = false;
  let outbox = [];

  const win = new BrowserWindow({
    ...place.dotBounds(point),
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload-news.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  if (process.platform === 'darwin') win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'news.html'));
  win.once('ready-to-show', () => { if (visible) win.showInactive(); });
  win.webContents.on('did-finish-load', () => {
    loaded = true;
    outbox.forEach(([channel, payload]) => win.webContents.send(channel, payload));
    outbox = [];
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());

  const send = (channel, payload) => {
    if (win.isDestroyed()) return;
    if (loaded) win.webContents.send(channel, payload);
    else outbox = [...outbox, [channel, payload]];
  };

  const workAreaFor = (p) => screen.getDisplayNearestPoint({ x: Math.round(p.x), y: Math.round(p.y) }).workArea;

  function collapse() {
    open = false;
    if (!win.isDestroyed()) win.setBounds(place.dotBounds(point));
    send('collapsed');
  }

  /** Step 1: the page lays the message out at the corner and reports its height. */
  function openMessage(view) {
    if (drag) return;
    open = true;
    send('open', { view, corner: place.openLayout(point, workAreaFor(point), 0).corner });
  }

  /** Step 2: size the window around the message, keeping the dot exactly where it was. */
  function fitOpen(height) {
    if (!open || drag || win.isDestroyed()) return;
    const layout = place.openLayout(point, workAreaFor(point), height);
    win.setBounds(layout.bounds);
    send('shown', { corner: layout.corner });
  }

  function startDrag(grab) {
    if (drag) return;
    if (open) collapse();
    drag = { grab: place.safeGrab(grab) };
    dragTimer = setInterval(() => {
      if (!drag || win.isDestroyed()) return;
      point = place.dragPoint(screen.getCursorScreenPoint(), drag.grab);
      win.setBounds(place.dotBounds(point));
    }, DRAG_POLL_MS);
  }

  function endDrag() {
    if (!drag) return;
    clearInterval(dragTimer);
    point = place.clampPoint(place.dragPoint(screen.getCursorScreenPoint(), drag.grab), workAreaFor(point));
    drag = null;
    if (!win.isDestroyed()) win.setBounds(place.dotBounds(point));
    onMoved(point);
  }

  /** Verification only: put the dot somewhere for a picture without saving the spot. */
  function moveTo(target) {
    point = place.clampPoint(target, workAreaFor(target));
    collapse();
  }

  /** Brings the dot next to the given screen point (Blip) and makes it pulse. */
  function find(near) {
    const display = screen.getDisplayNearestPoint({ x: Math.round(near.x), y: Math.round(near.y) });
    point = place.defaultPoint(display);
    collapse();
    setVisible(true);
    send('mode', 'find');
    onMoved(point);
  }

  function setVisible(on) {
    if (win.isDestroyed()) return;
    if (on && !win.isVisible()) win.showInactive();
    if (!on && win.isVisible()) { collapse(); win.hide(); }
  }

  const keepOnScreen = () => {
    if (win.isDestroyed() || drag) return;
    point = place.pickPoint(screen.getAllDisplays(), point, screen.getPrimaryDisplay());
    if (open) collapse();
    else win.setBounds(place.dotBounds(point));
  };
  screen.on('display-metrics-changed', keepOnScreen);
  screen.on('display-added', keepOnScreen);
  screen.on('display-removed', keepOnScreen);

  const topTimer = setInterval(() => { if (!win.isDestroyed()) win.setAlwaysOnTop(true, 'screen-saver'); }, TOPMOST_EVERY_MS);
  win.on('closed', () => {
    clearInterval(topTimer);
    clearInterval(dragTimer);
    screen.removeListener('display-metrics-changed', keepOnScreen);
    screen.removeListener('display-added', keepOnScreen);
    screen.removeListener('display-removed', keepOnScreen);
  });

  /** Verification only (demo + BLIP_CAPTURE_DIR): a picture of this window alone. */
  async function capture(file) {
    const image = await win.webContents.capturePage();
    fs.writeFileSync(file, image.toPNG());
  }

  return {
    win,
    send,
    openMessage,
    fitOpen,
    collapse,
    startDrag,
    endDrag,
    find,
    moveTo,
    setVisible,
    capture,
    workArea: () => workAreaFor(point),
    setMode: (mode) => send('mode', mode),
    isOpen: () => open,
    isFromDot: (event) => !win.isDestroyed() && event.sender === win.webContents,
  };
}

module.exports = { createNewsWindow };
