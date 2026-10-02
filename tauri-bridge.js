// tauri bridge for aqua launcher frontend
(function () {
  const getTauri = () => window.__TAURI__;

  function callInvoke(cmd, args = {}) {
    const tauri = getTauri();
    if (tauri && tauri.core && typeof tauri.core.invoke === 'function') {
      return tauri.core.invoke(cmd, args);
    }
    console.error('tauri core not found for command:', cmd);
    return Promise.reject(new Error('tauri core not found'));
  }

  function addListener(eventName, callback) {
    const tauri = getTauri();
    if (tauri && tauri.event && typeof tauri.event.listen === 'function') {
      return tauri.event.listen(eventName, (e) => callback(e.payload));
    }
    console.warn('tauri event listener not available for:', eventName);
  }

  window.electronAPI = {
    minimize: async () => {
      const tauri = getTauri();
      if (tauri && tauri.window && tauri.window.getCurrentWindow) {
        return tauri.window.getCurrentWindow().minimize();
      }
      return callInvoke('minimize_window');
    },
    maximize: async () => {
      const tauri = getTauri();
      if (tauri && tauri.window && tauri.window.getCurrentWindow) {
        const win = tauri.window.getCurrentWindow();
        const isMax = await win.isMaximized();
        if (isMax) {
          return win.unmaximize();
        } else {
          return win.maximize();
        }
      }
      return callInvoke('toggle_maximize_window');
    },
    close: async () => {
      const tauri = getTauri();
      if (tauri && tauri.window && tauri.window.getCurrentWindow) {
        return tauri.window.getCurrentWindow().close();
      }
      return callInvoke('close_window');
    },
  };

  window.launcherAPI = {
    getAccount: () => callInvoke('get_account'),
    loginMicrosoft: () => callInvoke('login_microsoft'),
    loginOffline: (username) => callInvoke('login_offline', { username }),
    logout: () => callInvoke('logout'),
    getVersions: () => callInvoke('get_versions'),
    getLoaderVersions: (mcVersion, loader) =>
      callInvoke('get_loader_versions', { mcVersion, loader }),
    previewVersion: (options) => callInvoke('preview_version', { options }),
    launch: (options) => callInvoke('launch', { options }),
    downloadModpack: (packId, data) =>
      callInvoke('download_modpack', { packId, data }),
    reinstallModpack: (packId, data) =>
      callInvoke('reinstall_modpack', { packId, data }),
    getInstalledModpacks: () => callInvoke('get_installed_modpacks'),
    getSettings: () => callInvoke('get_settings'),
    saveSettings: (settings) => callInvoke('save_settings', { settings }),
    getSystemMemory: () => callInvoke('get_system_memory'),
    getServersPage: (page, serverListUrl, query) =>
      callInvoke('get_servers_page', { page, serverListUrl, query }),
    getAllServers: (serverListUrl) =>
      callInvoke('get_all_servers', { serverListUrl }),
    getNews: (page) => callInvoke('get_news', { page }),
    showWindow: () => callInvoke('show_window'),

    // modrinth
    searchModrinth: (query, facets, offset, limit) =>
      callInvoke('search_modrinth', { query, facets, offset, limit }),
    getModrinthProject: (idOrSlug) =>
      callInvoke('get_modrinth_project', { idOrSlug }),
    getModrinthVersions: (projectId, loaders, gameVersions) =>
      callInvoke('get_modrinth_versions', { projectId, loaders, gameVersions }),
    installMrpack: (packId, versionData, meta) =>
      callInvoke('install_mrpack', { packId, versionData, meta }),

    // curseforge
    searchCurseForge: (query, proxyBaseUrl, index, pageSize) =>
      callInvoke('search_curseforge', { query, proxyBaseUrl, index, pageSize }),
    getCurseForgeProject: (modId, proxyBaseUrl) =>
      callInvoke('get_curseforge_project', { modId, proxyBaseUrl }),
    getCurseForgeFiles: (modId, proxyBaseUrl) =>
      callInvoke('get_curseforge_files', { modId, proxyBaseUrl }),
    installCurseForgePack: (packId, fileData, proxyBaseUrl, meta) =>
      callInvoke('install_curseforge_pack', {
        packId,
        fileData,
        proxyBaseUrl,
        meta,
      }),

    // olay dinleyicileri
    onServerPlayersUpdate: (callback) =>
      addListener('server-players-update', callback),
    onModpackStatus: (callback) => addListener('modpack-status', callback),
    onLaunchStatus: (callback) => addListener('launch-status', callback),
    onLaunchEvent: (callback) => addListener('launch-event', callback),
  };
})();
