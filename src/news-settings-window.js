'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, screen } = require('electron');

const WIDTH = 380;
const HEIGHT = 500;

/** On a Mac Blip has no Dock icon, so the app must be brought forward before the window can take typing. */
function bringForward(win) {
  if (process.platform === 'darwin') app.focus({ steal: true });
  win.show();
  win.focus();
}

/** The "News topics" window: one at a time, centred on the screen nearest the given point. */
function createNewsSettingsWindow() {
  let win = null;

  function bounds(near) {
    const { workArea } = screen.getDisplayNearestPoint({ x: Math.round(near.x), y: Math.round(near.y) });
    return {
      x: Math.round(workArea.x + (workArea.width - WIDTH) / 2),
      y: Math.round(workArea.y + (workArea.height - HEIGHT) / 2),
      width: WIDTH,
      height: HEIGHT,
    };
  }

  /** quiet = never put on screen (verification pictures only). */
  function show(near, { quiet = false } = {}) {
    if (win && !win.isDestroyed()) {
      if (!quiet) bringForward(win);
      return;
    }
    win = new BrowserWindow({
      ...bounds(near),
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload-news-settings.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event) => event.preventDefault());
    win.once('ready-to-show', () => { if (!quiet) bringForward(win); });
    win.on('closed', () => { win = null; });
    win.loadFile(path.join(__dirname, '..', 'renderer', 'news-settings.html'));
  }

  function close() {
    if (win && !win.isDestroyed()) win.close();
  }

  const isFromSettings = (event) => Boolean(win && !win.isDestroyed() && event.sender === win.webContents);

  async function capture(file) {
    if (!win || win.isDestroyed()) return;
    fs.writeFileSync(file, (await win.webContents.capturePage()).toPNG());
  }

  return { show, close, isFromSettings, capture };
}

module.exports = { createNewsSettingsWindow };
