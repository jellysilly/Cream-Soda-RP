const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcher', {
  state: () => ipcRenderer.invoke('state'),
  launch: (opts) => ipcRenderer.invoke('launch', opts),
  stop: () => ipcRenderer.invoke('stop'),
  settings: (patch) => ipcRenderer.invoke('settings', patch),
  createProfile: (name) => ipcRenderer.invoke('create-profile', name),
  backup: () => ipcRenderer.invoke('backup'),
  logs: () => ipcRenderer.invoke('logs'),
  update: () => ipcRenderer.invoke('update'),
  openData: () => ipcRenderer.invoke('open-data'),
  openUrl: (url) => ipcRenderer.invoke('open-url', url),
  minimize: () => ipcRenderer.send('window', 'minimize'),
  close: () => ipcRenderer.send('window', 'close'),
  onState: (fn) => {
    const handler = (_e, s) => fn(s);
    ipcRenderer.on('state', handler);
    return () => ipcRenderer.removeListener('state', handler);
  },
});
