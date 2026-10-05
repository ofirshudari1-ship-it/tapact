const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tapact', {
  getInitData: () => ipcRenderer.invoke('popup:get-init-data'),
  checkPhone: (text) => ipcRenderer.invoke('popup:check-phone', text),
  send: (payload) => ipcRenderer.send('popup:send', payload),
  dismiss: () => ipcRenderer.send('popup:dismiss'),
  openSettings: () => ipcRenderer.send('popup:open-settings'),
  openLeadSettings: () => ipcRenderer.send('popup:open-lead-settings'),
  notifyActivity: () => ipcRenderer.send('popup:activity'),
  setHover: (hovering) => ipcRenderer.send('popup:hover', !!hovering),
  sendWhatsapp: (payload) => ipcRenderer.send('popup:send', payload),
  sendLeadChannel: (payload) => ipcRenderer.invoke('lead:send-channel', payload),
  aiCleanupLead: (lead) => ipcRenderer.invoke('lead:ai-cleanup', lead)
});
