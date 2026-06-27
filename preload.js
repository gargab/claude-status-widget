const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('claudeStatus', {
  onStatusUpdate: (cb) => ipcRenderer.on('status-update', (_e, data) => cb(data)),
  onDialogInit: (cb) => ipcRenderer.on('dialog-init', (_e, data) => cb(data)),
  dismissSession: (sessionId) => ipcRenderer.send('dismiss-session', sessionId),
  keepWatching: (sessionId) => ipcRenderer.send('keep-watching', sessionId),
  showContextMenu: () => ipcRenderer.send('show-context-menu')
});
