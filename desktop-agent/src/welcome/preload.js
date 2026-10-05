const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tapactWelcome', {
  finish: () => ipcRenderer.send('welcome:finish'),
  skip: () => ipcRenderer.send('welcome:skip'),
  openSettings: () => ipcRenderer.send('welcome:open-settings'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSetting: (key, value) => ipcRenderer.invoke('settings:save-one', { key, value }),
});
