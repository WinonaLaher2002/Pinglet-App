// Minimal preload script for Electron.
// Add contextBridge exposures here when needed.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  sendData: (data) => ipcRenderer.send('toMain', data),
  versions: {
    node: () => process.versions.node,
    chrome: () => process.versions.chrome,
    electron: () => process.versions.electron
  }
});

