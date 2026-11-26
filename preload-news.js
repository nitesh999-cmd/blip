'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (callback) => ipcRenderer.on(channel, (_event, payload) => callback(payload));

contextBridge.exposeInMainWorld('newsApi', {
  onOpen: on('open'),
  onShown: on('shown'),
  onCollapsed: on('collapsed'),
  onMode: on('mode'),
  reportHeight: (height) => ipcRenderer.send('news-height', height),
  tap: () => ipcRenderer.send('news-tap'),
  menu: () => ipcRenderer.send('news-menu'),
  read: (key) => ipcRenderer.send('news-read', key),
  close: (missed) => ipcRenderer.send('news-close', missed === true),
  dragStart: (grab) => ipcRenderer.send('news-drag-start', grab),
  dragEnd: () => ipcRenderer.send('news-drag-end'),
});
