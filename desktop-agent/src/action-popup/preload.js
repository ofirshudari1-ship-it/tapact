const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tapactAction', {
  getInitData: () => ipcRenderer.invoke('action-popup:get-init-data'),
  runAction: (index) => ipcRenderer.send('action-popup:run', index),
  dismiss: () => ipcRenderer.send('action-popup:dismiss'),
  openSettings: () => ipcRenderer.send('action-popup:open-settings'),
  notifyActivity: () => ipcRenderer.send('action-popup:activity'),
  hold: (reason, on) => ipcRenderer.send('action-popup:hold', reason, !!on),
  snooze: (kind) => ipcRenderer.send('action-popup:snooze', kind),
  getCountdown: () => ipcRenderer.invoke('action-popup:get-countdown'),
  onCountdown: (cb) => ipcRenderer.on('popup:countdown', (_e, state) => cb(state)),
  fitHeight: (h) => ipcRenderer.send('action-popup:fit', h)
});
