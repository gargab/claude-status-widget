const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('claudeStatus', {
  onStatusUpdate: (cb) => ipcRenderer.on('status-update', (_e, data) => cb(data)),
  showContextMenu: () => ipcRenderer.send('show-context-menu'),
  clearAll: () => ipcRenderer.send('clear-all'),
});
