const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('iceDesktop', {
  getState: () => ipcRenderer.invoke('desktop:get-state'),
  chooseDataDir: () => ipcRenderer.invoke('desktop:choose-data-dir'),
  testRemote: (payload) => ipcRenderer.invoke('desktop:test-remote', payload),
  connect: (payload) => ipcRenderer.invoke('desktop:connect', payload),
  restartLocal: () => ipcRenderer.invoke('desktop:restart-local'),
  openLauncher: () => ipcRenderer.invoke('desktop:open-launcher'),
  copyText: (text) => ipcRenderer.invoke('desktop:copy-text', text),
  quit: () => ipcRenderer.invoke('desktop:quit'),
  onStatus: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('desktop:status', listener);
    return () => ipcRenderer.removeListener('desktop:status', listener);
  }
});
