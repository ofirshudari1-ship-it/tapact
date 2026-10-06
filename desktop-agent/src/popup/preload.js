const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tapact', {
  getInitData: () => ipcRenderer.invoke('popup:get-init-data'),
  checkPhone: (text) => ipcRenderer.invoke('popup:check-phone', text),
  send: (payload) => ipcRenderer.send('popup:send', payload),
  dismiss: () => ipcRenderer.send('popup:dismiss'),
  openSettings: () => ipcRenderer.send('popup:open-settings'),
  openLeadSettings: () => ipcRenderer.send('popup:open-lead-settings'),
  notifyActivity: () => ipcRenderer.send('popup:activity'),
  fitHeight: (h) => ipcRenderer.send('popup:fit', h),
  hold: (reason, on) => ipcRenderer.send('popup:hold', reason, !!on),
  snooze: (kind) => ipcRenderer.send('popup:snooze', kind),
  getCountdown: () => ipcRenderer.invoke('popup:get-countdown'),
  onCountdown: (cb) => ipcRenderer.on('popup:countdown', (_e, state) => cb(state)),
  sendWhatsapp: (payload) => ipcRenderer.send('popup:send', payload),
  sendLeadChannel: (payload) => ipcRenderer.invoke('lead:send-channel', payload),
  aiCleanupLead: (lead) => ipcRenderer.invoke('lead:ai-cleanup', lead)
});
