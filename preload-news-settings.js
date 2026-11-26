'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('newsSettings', {
  get: () => ipcRenderer.invoke('news-settings-get'),
  save: (choice) => ipcRenderer.send('news-settings-save', choice),
  close: () => ipcRenderer.send('news-settings-close'),
});
