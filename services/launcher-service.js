const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { Client, Authenticator } = require('minecraft-launcher-core');
const { Auth } = require('msmc');
const {
  getVanillaVersions,
  getFabricLoaders,
  getForgeLoaders,
  getForgeVersion,
  buildLaunchOptions,
  formatVersionLabel,
} = require('./loaders');
const { getJavaInfo: fetchJavaInfo } = require('./java-detector');
const { downloadJava } = require('./java-downloader');
const { GameConsoleService } = require('./game-console');

class LauncherService {
  constructor(sendEvent) {
    this.sendEvent = sendEvent;
    this.client = new Client();
    this.auth = null;
    this.authPath = path.join(app.getPath('userData'), 'auth.json');
    this.mcRoot = path.join(app.getPath('userData'), '.minecraft');
    this.isLaunching = false;
    this.console = null;
    this.recentDebugLines = [];
    this.lastStatus = null;
    this.setupClientEvents();
    fs.mkdirSync(this.mcRoot, { recursive: true });
    this.loadSavedAuth();
  }

  setupClientEvents() {
    const events = [
      'debug',
      'data',
      'progress',
      'download',
      'download-status',
    ];

    for (const event of events) {
      this.client.on(event, (data) => {
        this.forwardClientEvent(event, data);
      });
    }

    this.client.on('arguments', (args) => {
      this.sendEvent('launch-event', { type: 'arguments', data: args });
      const sanitized = (Array.isArray(args) ? args : [])
        .map((arg) => {
          if (/accessToken|clientToken|uuid|xuid/i.test(arg)) return '[REDACTED]';
          return arg;
        })
        .join(' ');
      this.console?.writeLine(`[ARGUMENTLER] java ${sanitized}`);
    });

    this.client.on('close', (code) => {
      this.isLaunching = false;
      this.sendEvent('launch-event', { type: 'close', data: code });

      const startupFailure = this.recentDebugLines.find(
        (line) =>
          /couldn't start|failed to start|failed to run|unable to|invalid|error/i.test(line),
      );

      this.console?.writeLine('');
      this.console?.writeLine(
        `[INFO] Game closed. Exit code: ${code === null || code === undefined ? 'unknown' : code}` +
          (this.console?.logPath ? ` | Log: ${this.console.logPath}` : ''),
      );

      if (startupFailure) {
        const reason = startupFailure.replace(/^\[MCLC\]:\s*/i, '').slice(0, 300);
        this.sendEvent('launch-status', {
          state: 'error',
          message: `Minecraft could not start: ${reason}. Enable the "Game Console" option in Settings and try again to see the real error.`,
        });
      } else {
        this.sendEvent('launch-status', {
          state: 'idle',
          message: 'Minecraft closed.',
        });
      }

      this.closeConsole();
    });
  }

  forwardClientEvent(event, data) {
    const text = typeof data === 'string' ? data : String(data);

    if (event === 'debug') {
      this.recentDebugLines.push(text);
      if (this.recentDebugLines.length > 200) this.recentDebugLines.shift();
      this.console?.writeLine(`[MCLC] ${text}`);
    } else if (event === 'data') {
      // oyun ciktisi, boot'ta sorun cikan yer burasi
      this.console?.writeChunk(text);
    }

    this.sendEvent('launch-event', { type: event, data });
  }

  async closeConsole() {
    if (this.console) {
      const consoleRef = this.console;
      this.console = null;
      await consoleRef.close();
    }
  }

  loadSavedAuth() {
    try {
      if (fs.existsSync(this.authPath)) {
        this.auth = JSON.parse(fs.readFileSync(this.authPath, 'utf8'));
      }
    } catch {
      this.auth = null;
    }
  }

  saveAuth() {
    if (this.auth) {
      fs.writeFileSync(this.authPath, JSON.stringify(this.auth, null, 2));
    }
  }

  getAccountInfo() {
    if (!this.auth) return null;
    return {
      username: this.auth.name,
      uuid: this.auth.uuid,
      type: this.auth.meta?.type || 'offline',
    };
  }

  async loginMicrosoft() {
    const authManager = new Auth('select_account');
    const xboxManager = await authManager.launch('electron');
    const token = await xboxManager.getMinecraft();
    this.auth = token.mclc();
    this.saveAuth();
    return this.getAccountInfo();
  }

  async loginOffline(username) {
    const name = username.trim();
    if (!name) throw new Error('Username is required');

    this.auth = await Authenticator.getAuth(name);
    this.auth.meta = { type: 'offline', demo: false };
    this.saveAuth();
    return this.getAccountInfo();
  }

  logout() {
    this.auth = null;
    if (fs.existsSync(this.authPath)) {
      fs.unlinkSync(this.authPath);
    }
  }

  async getVersions() {
    return getVanillaVersions();
  }

  async getLoaderVersions(mcVersion, loader) {
    if (loader === 'fabric') {
      try {
        return await getFabricLoaders(mcVersion);
      } catch (e) {
        console.error('Failed to fetch fabric loaders', e);
        return [];
      }
    }
    if (loader === 'forge') {
      try {
        return await getForgeLoaders(mcVersion);
      } catch (e) {
        console.error('Failed to fetch forge loaders', e);
        return [];
      }
    }
    return [];
  }

  async getJavaInfo(mcVersion) {
    return fetchJavaInfo(mcVersion);
  }

  async previewVersion({ loader, mcVersion, loaderVersion }) {
    let resolvedLoaderVersion = loaderVersion;

    if (loader === 'fabric' && !resolvedLoaderVersion) {
      try {
        const loaders = await getFabricLoaders(mcVersion);
        resolvedLoaderVersion = loaders[0] || null;
      } catch (e) {
        console.error('previewVersion: failed to get fabric loaders', e);
        resolvedLoaderVersion = null;
      }
    }

    if (loader === 'forge' && !resolvedLoaderVersion) {
      try {
        resolvedLoaderVersion = await getForgeVersion(mcVersion);
      } catch {
        resolvedLoaderVersion = null;
      }
    }

    return {
      label: formatVersionLabel(loader, mcVersion, resolvedLoaderVersion),
      loaderVersion: resolvedLoaderVersion,
      available: loader === 'vanilla' || Boolean(resolvedLoaderVersion),
    };
  }

  async launch({
    loader,
    mcVersion,
    memory,
    forgeVersion,
    fabricLoaderVersion,
    javaArgs,
    openConsole,
  }) {
    if (this.isLaunching) {
      throw new Error('A launch is already in progress');
    }
    if (!this.auth) {
      throw new Error('Please sign in before launching');
    }

    this.isLaunching = true;
    this.recentDebugLines = [];
    this.sendEvent('launch-status', {
      state: 'preparing',
      message: 'Preparing files...',
    });

    if (openConsole) {
      try {
        this.console = new GameConsoleService(this.mcRoot);
        this.console.open();
        this.console.writeLine('');
        this.console.writeLine(
          `[BASLATILIYOR] loader=${loader} mcVersion=${mcVersion} loaderVersion=${fabricLoaderVersion || forgeVersion || 'auto'}`,
        );
      } catch (e) {
        console.error('Failed to open game console', e);
        this.console = null;
      }
    }

    try {
      const javaInfo = await fetchJavaInfo(mcVersion);
      if (!javaInfo.selected) {
        const downloadedPath = await downloadJava(javaInfo.required, this.mcRoot, this.sendEvent.bind(this));
        javaInfo.selected = { version: javaInfo.required, path: downloadedPath };
      }

      this.console?.writeLine(
        `[JAVA] Kullanilan Java ${javaInfo.selected.version} -> ${javaInfo.selected.path}`,
      );
      this.console?.writeLine(
        `[JAVA] Gerekli: ${javaInfo.required} | Kurulu: ${
          javaInfo.installed.length
            ? javaInfo.installed.map((j) => `v${j.version}`).join(', ')
            : 'yok'
        }`,
      );

      this.sendEvent('launch-status', {
        state: 'preparing',
        message: `Using Java ${javaInfo.selected.version}`,
      });

      const opts = await buildLaunchOptions({
        root: this.mcRoot,
        auth: this.auth,
        loader,
        mcVersion,
        memory,
        forgeVersion,
        fabricLoaderVersion,
        javaPath: javaInfo.selected.path,
      });

      if (javaArgs) {
         if (!opts.customArgs) opts.customArgs = [];
         opts.customArgs = opts.customArgs.concat(javaArgs.split(' ').filter(a => a.trim()));
      }

      this.sendEvent('launch-status', {
        state: 'launching',
        message: 'Starting Minecraft...',
      });
      this.console?.writeLine('[BASLATILIYOR] Oyun Java ile baslatiliyor...');

      await this.client.launch(opts);

      this.console?.writeLine('[DURUM] Surec baslatildi, oyun buyuk ihtimalle aciliyor...');
      this.sendEvent('launch-status', {
        state: 'running',
        message: 'Minecraft is running.',
      });
    } catch (error) {
      this.isLaunching = false;
      const message = error?.message || 'Launch failed';
      this.console?.writeLine(`[HATA] ${message}`);
      this.sendEvent('launch-status', {
        state: 'error',
        message,
      });
      this.closeConsole();
      throw error;
    }
  }
}

module.exports = { LauncherService };
