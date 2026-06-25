const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { resolveModrinthLink } = require('./modrinth_downloader');

class ModpackService {
  constructor(sendEvent) {
    this.sendEvent = sendEvent;
    this.mcRoot = path.join(app.getPath('userData'), '.minecraft');
    this.modpacksDir = path.join(this.mcRoot, 'aqua-modpacks');
    this.manifestPath = path.join(this.modpacksDir, 'installed_modpacks.json');
    this.isDownloading = false;

    fs.mkdirSync(this.modpacksDir, { recursive: true });
    this.manifest = this.loadManifest();
  }

  normalizePackId(packId) {
    if (!packId) return 'unknown-pack';
    return String(packId)
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 120) || 'pack';
  }

  getPackFolder(packId) {
    return path.join(this.modpacksDir, this.normalizePackId(packId));
  }

  getPackModsDir(packId) {
    return path.join(this.getPackFolder(packId), 'mods');
  }

  copyDirectoryContents(srcDir, destDir) {
    if (!fs.existsSync(srcDir)) return;
    const entries = fs.readdirSync(srcDir, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(srcDir, entry.name);
      const destPath = path.join(destDir, entry.name);
      if (entry.isDirectory()) {
        fs.mkdirSync(destPath, { recursive: true });
        this.copyDirectoryContents(srcPath, destPath);
      } else if (entry.isFile()) {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  syncPackModsToGame(packId) {
    const packModsDir = this.getPackModsDir(packId);
    if (!fs.existsSync(packModsDir)) {
      throw new Error(`Modpack folder not found for ${packId}`);
    }

    const modsDir = path.join(this.mcRoot, 'mods');
    if (fs.existsSync(modsDir)) {
      fs.rmSync(modsDir, { recursive: true, force: true });
    }
    fs.mkdirSync(modsDir, { recursive: true });
    this.copyDirectoryContents(packModsDir, modsDir);
  }

  loadManifest() {
    try {
      if (fs.existsSync(this.manifestPath)) {
        return JSON.parse(fs.readFileSync(this.manifestPath, 'utf8'));
      }
    } catch {}
    return {};
  }

  saveManifest() {
    fs.writeFileSync(this.manifestPath, JSON.stringify(this.manifest, null, 2));
  }

  extractStringArrayFromJsonLikeText(text) {
    const arrayMatch = /"mods"\s*:\s*\[([\s\S]*?)\]/m.exec(text);
    let arrayText = arrayMatch ? arrayMatch[1] : null;
    if (!arrayText && text.trim().startsWith('[')) {
      const start = text.indexOf('[');
      const end = text.lastIndexOf(']');
      if (start >= 0 && end > start) {
        arrayText = text.slice(start + 1, end);
      }
    }
    if (!arrayText) return [];

    const strings = [];
    const regex = /"((?:\\.|[^"\\])*)"/g;
    let match;
    while ((match = regex.exec(arrayText)) !== null) {
      strings.push(match[1]);
    }
    return strings;
  }


  async downloadFile(url, destPath) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    
    const fileStream = fs.createWriteStream(destPath);
    
    return new Promise((resolve, reject) => {
      // For Node fetch, body is a ReadableStream which can be piped differently in Node 18
      // If we use res.body.pipe, we have to use stream.Readable.fromWeb
      const { Readable } = require('stream');
      const readable = Readable.fromWeb(res.body);
      
      readable.pipe(fileStream);
      
      fileStream.on('finish', () => resolve());
      fileStream.on('error', reject);
      readable.on('error', reject);
    });
  }

  async installModpack(packId, modpackData, force = false) {
    if (this.isDownloading) throw new Error('A download is already in progress');
    
    this.isDownloading = true;
    try {
      // 1. Fetch the remote modpack json to get mods list
      this.sendEvent('modpack-status', { state: 'preparing', message: 'Fetching modpack details...' });
      
      let modsData = {};
      
      if (modpackData.modpackJsonUrl) {
         const res = await fetch(modpackData.modpackJsonUrl);
         if (res.ok) {
            const text = await res.text();
            try {
              modsData = JSON.parse(text);
            } catch (jsonErr) {
              // Try to recover from malformed JSON arrays
              const recoveredUrls = this.extractStringArrayFromJsonLikeText(text);
              if (recoveredUrls.length > 0) {
                modsData = recoveredUrls;
              } else {
                throw jsonErr;
              }
            }
         }
      }

      // Format could be array of strings, or key-value
      // Let's assume the json returns an array of URL strings: [ "https://abc.jar", "https://modrinth.com/mod/sodium" ]
      let modUrls = [];
      if (Array.isArray(modsData)) {
          modUrls = modsData;
      } else if (modsData.mods) {
          modUrls = modsData.mods;
      }
      if ((!modUrls || modUrls.length === 0) && Array.isArray(modpackData.mods)) {
        modUrls = modpackData.mods;
      }
      if ((!modUrls || modUrls.length === 0) && Array.isArray(modpackData.modUrls)) {
        modUrls = modpackData.modUrls;
      }
      if ((!modUrls || modUrls.length === 0) && Array.isArray(modpackData.urls)) {
        modUrls = modpackData.urls;
      }

      // If no mod URLs specified, just mark as installed?
      if (!modUrls || modUrls.length === 0) {
         console.warn('No mod URLs found for pack', packId, modpackData);
         this.manifest[packId] = {
           version: modpackData.version,
           folder: this.normalizePackId(packId),
         };
         this.saveManifest();
         this.sendEvent('modpack-status', { state: 'done', message: 'Ready to play' });
         return;
      }

      // Check current version installed
      const installedInfo = this.manifest[packId];
      if (installedInfo && installedInfo.version === modpackData.version && !force) {
         this.sendEvent('modpack-status', { state: 'preparing', message: 'Activating existing modpack...' });
         this.syncPackModsToGame(packId);
         this.sendEvent('modpack-status', { state: 'done', message: 'Modpack ready.' });
         return;
      }

      const packModsDir = this.getPackModsDir(packId);
      if (fs.existsSync(packModsDir)) {
        fs.rmSync(packModsDir, { recursive: true, force: true });
      }
      fs.mkdirSync(packModsDir, { recursive: true });

      let completedCount = 0;
      const total = modUrls.length;
      
      this.sendEvent('modpack-status', { 
         state: 'downloading', 
         message: `Downloading mods (0/${total})...`,
         progress: { completed: 0, total }
      });

      const selectedLoader = String(modpackData.loader || '').toLowerCase();
      const selectedMcVersion = String(modpackData.mcVersion || '').trim();

      // Simple concurrency loop using chunks
      const concurrency = 3;
      for (let i = 0; i < modUrls.length; i += concurrency) {
         const chunk = modUrls.slice(i, i + concurrency);
         await Promise.all(chunk.map(async (url) => {
            try {
               let finalUrl = url;
               if (url.includes('modrinth.com/mod/')) {
                  finalUrl = await resolveModrinthLink(url, selectedMcVersion, selectedLoader);
               }
               
               // Extract filename
               let fileName = finalUrl.substring(finalUrl.lastIndexOf('/') + 1);
               if (!fileName.endsWith('.jar')) fileName += '.jar';
               // Clean query params if any
               fileName = fileName.split('?')[0];

               const destPath = path.join(packModsDir, fileName);
               await this.downloadFile(finalUrl, destPath);
            } catch (err) {
               console.error(`Failed to download ${url}`, err);
               // Continuing other downloads even if one fails
            }

            completedCount++;
            this.sendEvent('modpack-status', { 
               state: 'downloading', 
               message: `Downloading mods (${completedCount}/${total})...`,
               progress: { completed: completedCount, total }
            });
         }));
      }

      // Update manifest
      this.manifest[packId] = {
        version: modpackData.version,
        folder: this.normalizePackId(packId),
      };
      this.saveManifest();

      this.syncPackModsToGame(packId);

      this.sendEvent('modpack-status', { state: 'done', message: 'Modpack downloaded and activated successfully.' });

    } catch (err) {
      this.sendEvent('modpack-status', { state: 'error', message: err.message });
      throw err;
    } finally {
      this.isDownloading = false;
    }
  }

  async downloadModpack(packId, modpackData) {
    return this.installModpack(packId, modpackData, false);
  }

  async reinstallModpack(packId, modpackData) {
    return this.installModpack(packId, modpackData, true);
  }
}

module.exports = { ModpackService };
