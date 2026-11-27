'use strict';

const path = require('node:path');
const { BrowserWindow, screen } = require('electron');
const placement = require('./placement');

const CURSOR_POLL_MS = 33;
const TOPMOST_EVERY_MS = 4000;
const HIT_PADDING = 4;
const MAX_HIT_RECTS = 4;

function validRects(rects) {
  if (!Array.isArray(rects)) return [];
  return rects
    .slice(0, MAX_HIT_RECTS)
    .filter((r) => r && ['x', 'y', 'w', 'h'].every((k) => Number.isFinite(r[k])));
}

/** The same display after a monitor change, matched by id, else by its old centre, else the primary. */
function refreshDisplay(display) {
  const all = screen.getAllDisplays();
  return all.find((d) => d.id === display.id)
    || placement.pickDisplay(all, placement.displayPoint(display), screen.getPrimaryDisplay());
}

/**
 * The pet's window: transparent, frameless, always on top, never takes keyboard focus,
 * lets clicks fall through except on Blip and the bubble, and can be dragged to any screen.
 */
function createPetWindow({ savedPoint = null, onMoved = () => {} } = {}) {
  let display = placement.pickDisplay(screen.getAllDisplays(), savedPoint, screen.getPrimaryDisplay());
  const win = new BrowserWindow({
    ...placement.stripBoundsFor(display),
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
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  let hitRects = [];
  let interactive = false;
  let loaded = false;
  let outbox = [];
  let drag = null;
  let size = placement.petSize(null);

  win.setAlwaysOnTop(true, 'screen-saver');
  if (process.platform === 'darwin') win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.showInactive());
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

  const setInteractive = (on) => {
    if (on === interactive) return;
    interactive = on;
    win.setIgnoreMouseEvents(!on, { forward: true });
  };

  const insideHitArea = (point) => hitRects.some((r) => (
    point.x >= r.x - HIT_PADDING && point.x <= r.x + r.w + HIT_PADDING
    && point.y >= r.y - HIT_PADDING && point.y <= r.y + r.h + HIT_PADDING
  ));

  const followCursor = () => {
    if (drag && !win.isDestroyed()) win.setBounds(placement.dragBounds(screen.getCursorScreenPoint(), drag.grab, size));
  };

  // Follow the mouse everywhere on screen (not just over the window) so Blip can look at it.
  const cursorTimer = setInterval(() => {
    if (win.isDestroyed() || !loaded) return;
    if (drag) { followCursor(); return; }
    const cursor = screen.getCursorScreenPoint();
    const bounds = win.getBounds();
    const local = { x: cursor.x - bounds.x, y: cursor.y - bounds.y };
    win.webContents.send('cursor', local);
    setInteractive(insideHitArea(local));
  }, CURSOR_POLL_MS);

  // Windows can drop "topmost" when other always-on-top apps appear; keep claiming it.
  const topTimer = setInterval(() => {
    if (!win.isDestroyed()) win.setAlwaysOnTop(true, 'screen-saver');
  }, TOPMOST_EVERY_MS);

  const reposition = () => {
    if (win.isDestroyed() || drag) return;
    display = refreshDisplay(display);
    win.setBounds(placement.stripBoundsFor(display));
  };
  screen.on('display-metrics-changed', reposition);
  screen.on('display-added', reposition);
  screen.on('display-removed', reposition);

  win.on('closed', () => {
    clearInterval(cursorTimer);
    clearInterval(topTimer);
    screen.removeListener('display-metrics-changed', reposition);
    screen.removeListener('display-added', reposition);
    screen.removeListener('display-removed', reposition);
  });

  /** Pressed and moved: shrink to just Blip and keep the grabbed spot under the cursor. */
  function startDrag(grab) {
    if (drag) return;
    drag = { grab: placement.safeGrab(grab, size) };
    setInteractive(true);
    followCursor();
    send('drag-mode');
  }

  /** Let go: live along the bottom of whichever screen the cursor is on, where it was dropped. */
  function endDrag() {
    if (!drag) return;
    const cursor = screen.getCursorScreenPoint();
    display = screen.getDisplayNearestPoint(cursor);
    const strip = placement.stripBoundsFor(display);
    const x = placement.dropX(cursor, drag.grab, strip, size.w);
    drag = null;
    hitRects = [];
    win.setBounds(strip);
    setInteractive(false);
    send('placed', { x });
    onMoved(placement.displayPoint(display));
  }

  return {
    win,
    send,
    startDrag,
    dragMove: followCursor,
    endDrag,
    setHitRects(rects) { if (!drag) hitRects = validRects(rects); },
    /** The current look's size (from the catalogue, not the page), for dragging and dropping. */
    setSize(next) { if (!drag) size = placement.petSize(next); },
    /** Screen point under Blip's middle, for placing windows near it on the same screen. */
    anchor() {
      const bounds = win.getBounds();
      const pot = hitRects[0];
      return { x: bounds.x + (pot ? pot.x + pot.w / 2 : bounds.width / 2), y: bounds.y + bounds.height };
    },
    isFromPet(event) { return !win.isDestroyed() && event.sender === win.webContents; },
  };
}

module.exports = { createPetWindow };
