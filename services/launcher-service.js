const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { Client, Authenticator } = require('minecraft-launcher-core');
const { Auth } = require('msmc');
const {
  getVanillaVersions,
  getFabricLoaders,
  getForgeVersion,
  buildLaunchOptions,
  formatVersionLabel,
} = require('./loaders');
const { getJavaInfo: fetchJavaInfo } = require('./java-detector');

class LauncherService {
  constructor(sendEvent) {
    this.sendEvent = sendEvent;
    this.client = new Client();
    this.auth = null;
    this.authPath = path.join(app.getPath('userData'), 'auth.json');
    this.mcRoot = path.join(app.getPath('userData'), '.minecraft');
    this.isLaunching = false;
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
        this.sendEvent('launch-event', { type: event, data });
      });
    }

    this.client.on('close', (code) => {
      this.isLaunching = false;
      this.sendEvent('launch-event', { type: 'close', data: code });
      this.sendEvent('launch-status', {
        state: 'idle',
        message: 'Minecraft closed.',
      });
    });
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
        return [await getForgeVersion(mcVersion)];
      } catch {
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
  }) {
    if (this.isLaunching) {
      throw new Error('A launch is already in progress');
    }
    if (!this.auth) {
      throw new Error('Please sign in before launching');
    }

    this.isLaunching = true;
    this.sendEvent('launch-status', {
      state: 'preparing',
      message: 'Preparing files...',
    });

    try {
      const javaInfo = await fetchJavaInfo(mcVersion);
      if (!javaInfo.selected) {
        const installedText = javaInfo.installed.length
          ? javaInfo.installed.map((item) => `Java ${item.version}`).join(', ')
          : 'none detected';

        throw new Error(
          `Minecraft ${mcVersion} requires Java ${javaInfo.required}+. Found: ${installedText}. Install Java ${javaInfo.required} or newer from https://adoptium.net/`,
        );
      }

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

      await this.client.launch(opts);

      this.sendEvent('launch-status', {
        state: 'running',
        message: 'Minecraft is running.',
      });
    } catch (error) {
      this.isLaunching = false;
      this.sendEvent('launch-status', {
        state: 'error',
        message: error.message || 'Launch failed',
      });
      throw error;
    }
  }
}

module.exports = { LauncherService };
