const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tapactAction', {
  getInitData: () => ipcRenderer.invoke('action-popup:get-init-data'),
  runAction: (index) => ipcRenderer.send('action-popup:run', index),
  dismiss: () => ipcRenderer.send('action-popup:dismiss'),
  openSettings: () => ipcRenderer.send('action-popup:open-settings'),
  notifyActivity: () => ipcRenderer.send('action-popup:activity'),
  setHover: (hovering) => ipcRenderer.send('action-popup:hover', !!hovering)
});
