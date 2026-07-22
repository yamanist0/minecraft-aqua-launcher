const fs = require('fs');
const https = require('https');
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { LauncherService } = require('./services/launcher-service');
const { ModpackService } = require('./services/modpack-service');
const { ServerListService } = require('./services/server-list');
const platforms = require('./services/modpack-platforms');

let mainWindow;
let launcherService;
let modpackService;
let serverListService;

app.commandLine.appendSwitch('ignore-certificate-errors');
app.commandLine.appendSwitch('log-level', '3'); // Suppress noise

function sendToRenderer(channel, data) {
  mainWindow?.webContents.send(channel, data);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 960,
    minHeight: 540,
    frame: false,
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    backgroundColor: '#131315',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('launcher.html');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerIpcHandlers() {
  ipcMain.handle('launcher:show-window', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  ipcMain.handle('launcher:get-account', () => launcherService.getAccountInfo());

  ipcMain.handle('launcher:login-microsoft', () =>
    launcherService.loginMicrosoft(),
  );

  ipcMain.handle('launcher:login-offline', (_, username) =>
    launcherService.loginOffline(username),
  );

  ipcMain.handle('launcher:logout', () => {
    launcherService.logout();
  });

  ipcMain.handle('launcher:get-versions', () => launcherService.getVersions());

  ipcMain.handle('launcher:get-loader-versions', (_, mcVersion, loader) =>
    launcherService.getLoaderVersions(mcVersion, loader),
  );

  ipcMain.handle('launcher:preview-version', (_, options) =>
    launcherService.previewVersion(options),
  );

  ipcMain.handle('launcher:launch', (_, options) =>
    launcherService.launch(options),
  );

  const whereToFindSettings = () => path.join(app.getPath('userData'), 'settings.json');
  ipcMain.handle('launcher:get-settings', () => {
     try {
       if (fs.existsSync(whereToFindSettings())) {
          return Object.assign(
            {
              modpackUrls: [],
              javaArgs: '',
              password: '',
              serverListUrl: 'https://raw.githubusercontent.com/Yaman-the-coder/aqua-launcher/refs/heads/main/servers.json',
            },
            JSON.parse(fs.readFileSync(whereToFindSettings(), 'utf8')),
          );
       }
     } catch (e) {}
     return {
       modpackUrls: ['https://raw.githubusercontent.com/Yaman-the-coder/aqua-launcher/refs/heads/main/modpacks.json'],
       javaArgs: '',
       password: '',
       serverListUrl: 'https://raw.githubusercontent.com/Yaman-the-coder/aqua-launcher/refs/heads/main/servers.json',
     };
  });

  ipcMain.handle('launcher:save-settings', (_, newSettings) => {
     fs.writeFileSync(whereToFindSettings(), JSON.stringify(newSettings, null, 2));
  });

  ipcMain.handle('launcher:download-modpack', async (_, packId, modpackData) => {
    return modpackService.downloadModpack(packId, modpackData);
  });

  ipcMain.handle('launcher:reinstall-modpack', async (_, packId, modpackData) => {
    return modpackService.reinstallModpack(packId, modpackData);
  });
  
  ipcMain.handle('launcher:get-installed-modpacks', () => {
    return Object.assign({}, modpackService.manifest);
  });

  // ─── Modrinth IPC ──────────────────────────────────────────────
  ipcMain.handle('launcher:search-modrinth', async (_, query, facets, offset, limit) => {
    return platforms.searchModrinth(query, facets, offset, limit);
  });

  ipcMain.handle('launcher:get-modrinth-project', async (_, idOrSlug) => {
    return platforms.getModrinthProject(idOrSlug);
  });

  ipcMain.handle('launcher:get-modrinth-versions', async (_, projectId, loaders, gameVersions) => {
    return platforms.getModrinthVersions(projectId, loaders, gameVersions);
  });

  ipcMain.handle('launcher:install-mrpack', async (_, packId, versionData, meta) => {
    return modpackService.installMrpackPack(packId, versionData, meta);
  });

  // ─── CurseForge IPC ────────────────────────────────────────────
  ipcMain.handle('launcher:search-curseforge', async (_, query, proxyBaseUrl, index, pageSize) => {
    return platforms.searchCurseForge(query, proxyBaseUrl, index, pageSize);
  });

  ipcMain.handle('launcher:get-curseforge-project', async (_, modId, proxyBaseUrl) => {
    return platforms.getCurseForgeProject(modId, proxyBaseUrl);
  });

  ipcMain.handle('launcher:get-curseforge-files', async (_, modId, proxyBaseUrl) => {
    return platforms.getCurseForgeFiles(modId, proxyBaseUrl);
  });

  ipcMain.handle('launcher:install-curseforge-pack', async (_, packId, fileData, proxyBaseUrl, meta) => {
    return modpackService.installCfPack(packId, fileData, proxyBaseUrl, meta);
  });
  
  ipcMain.handle('launcher:get-servers-page', async (_, page, serverListUrl, query) => {
    return serverListService.getServersPage(page, serverListUrl, query);
  });
  
  ipcMain.handle('launcher:get-all-servers', async (_, serverListUrl) => {
    const servers = await serverListService.loadServers(serverListUrl);
    return servers.map((server) => ({
      ...server,
      live: false,
      online: null,
    }));
  });

  ipcMain.handle('launcher:get-news', async (_, page = 1) => {
    const pageNum = Number(page) || 1;
    const url = `https://net-secondary.web.minecraft-services.net/api/v1.0/en-us/search?page=${pageNum}&pageSize=24&sortType=Recent&category=News&newsOnly=true&geography=TR`;
    function fetchJson(u) {
      return new Promise((resolve, reject) => {
        try {
          const req = https.get(u, { timeout: 8000 }, (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => (body += chunk));
            res.on('end', () => {
              try {
                const json = JSON.parse(body);
                resolve(json);
              } catch (e) {
                reject(e);
              }
            });
          });
          req.on('timeout', () => {
            req.destroy(new Error('Request timed out'));
          });
          req.on('error', (err) => reject(err));
        } catch (e) {
          reject(e);
        }
      });
    }

    try {
      const data = await fetchJson(url);
      return data;
    } catch (e) {
      console.error('Failed fetching news', e);
      return null;
    }
  });

  ipcMain.on('window-minimize', () => mainWindow?.minimize());

  ipcMain.on('window-maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });

  ipcMain.on('window-close', () => mainWindow?.close());
}

app.whenReady().then(() => {
  launcherService = new LauncherService(sendToRenderer);
  modpackService = new ModpackService(sendToRenderer);
  serverListService = new ServerListService(sendToRenderer);
  registerIpcHandlers();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    console.log("Quitting app on platform: " + process.platform);
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
