const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
});

contextBridge.exposeInMainWorld('launcherAPI', {
  getAccount: () => ipcRenderer.invoke('launcher:get-account'),
  loginMicrosoft: () => ipcRenderer.invoke('launcher:login-microsoft'),
  loginOffline: (username) =>
    ipcRenderer.invoke('launcher:login-offline', username),
  logout: () => ipcRenderer.invoke('launcher:logout'),
  getVersions: () => ipcRenderer.invoke('launcher:get-versions'),
  getLoaderVersions: (mcVersion, loader) =>
    ipcRenderer.invoke('launcher:get-loader-versions', mcVersion, loader),
  previewVersion: (options) =>
    ipcRenderer.invoke('launcher:preview-version', options),
  launch: (options) => ipcRenderer.invoke('launcher:launch', options),
  downloadModpack: (packId, data) => ipcRenderer.invoke('launcher:download-modpack', packId, data),
  reinstallModpack: (packId, data) => ipcRenderer.invoke('launcher:reinstall-modpack', packId, data),
  getInstalledModpacks: () => ipcRenderer.invoke('launcher:get-installed-modpacks'),
  getSettings: () => ipcRenderer.invoke('launcher:get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('launcher:save-settings', settings),
  getServersPage: (page, serverListUrl) => ipcRenderer.invoke('launcher:get-servers-page', page, serverListUrl),
  getAllServers: (serverListUrl) => ipcRenderer.invoke('launcher:get-all-servers', serverListUrl),
  getNews: (page) => ipcRenderer.invoke('launcher:get-news', page),
  onServerPlayersUpdate: (callback) => {
    ipcRenderer.on('server-players-update', (_, data) => callback(data));
  },
  onModpackStatus: (callback) => {
    ipcRenderer.on('modpack-status', (_, data) => callback(data));
  },
  onLaunchStatus: (callback) => {
    ipcRenderer.on('launch-status', (_, data) => callback(data));
  },
  onLaunchEvent: (callback) => {
    ipcRenderer.on('launch-event', (_, data) => callback(data));
  },
});
