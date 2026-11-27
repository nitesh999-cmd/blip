'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// The page gets a handful of named calls and nothing else.
contextBridge.exposeInMainWorld('blip', {
  onCursor: (callback) => ipcRenderer.on('cursor', (_event, point) => callback(point)),
  onBubble: (callback) => ipcRenderer.on('bubble', (_event, bubble) => callback(bubble)),
  onJump: (callback) => ipcRenderer.on('jump', () => callback()),
  onDemo: (callback) => ipcRenderer.on('demo', () => callback()),
  onDragMode: (callback) => ipcRenderer.on('drag-mode', () => callback()),
  onPlaced: (callback) => ipcRenderer.on('placed', (_event, place) => callback(place)),
  onLook: (callback) => ipcRenderer.on('look', (_event, id) => callback(String(id))),
  dragStart: (grab) => ipcRenderer.send('drag-start', grab),
  dragMove: () => ipcRenderer.send('drag-move'),
  dragEnd: () => ipcRenderer.send('drag-end'),
  tap: () => ipcRenderer.send('tap'),
  openMenu: () => ipcRenderer.send('open-menu'),
  bubbleAction: (actionId) => ipcRenderer.send('bubble-action', actionId),
  setHitRects: (rects) => ipcRenderer.send('hit-rects', rects),
});
