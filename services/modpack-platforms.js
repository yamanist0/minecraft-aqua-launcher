const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const { app } = require('electron');

// ─── Constants ───────────────────────────────────────────────────────
const MODRINTH_API = 'https://api.modrinth.com/v2';
const MODRINTH_USER_AGENT = 'AquaLauncher/1.0 (https://github.com/Yaman-the-coder/aqua-launcher)';

// ─── Helpers ─────────────────────────────────────────────────────────

async function modrinthFetch(pathname) {
  const url = `${MODRINTH_API}${pathname}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': MODRINTH_USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`Modrinth API ${res.status}: ${res.statusText} — ${url}`);
  }
  return res.json();
}

async function cfProxyFetch(proxyBaseUrl, cfPath) {
  const url = `${proxyBaseUrl.replace(/\/+$/, '')}${cfPath}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': MODRINTH_USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`CurseForge proxy ${res.status}: ${res.statusText} — ${url}`);
  }
  return res.json();
}

async function cfProxyPost(proxyBaseUrl, cfPath, body) {
  const url = `${proxyBaseUrl.replace(/\/+$/, '')}${cfPath}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'User-Agent': MODRINTH_USER_AGENT,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`CurseForge proxy POST ${res.status}: ${res.statusText} — ${url}`);
  }
  return res.json();
}

async function downloadToBuffer(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': MODRINTH_USER_AGENT },
  });
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function downloadToFile(url, destPath) {
  const { Readable } = require('stream');
  const res = await fetch(url, {
    headers: { 'User-Agent': MODRINTH_USER_AGENT },
  });
  if (!res.ok) throw new Error(`Download HTTP ${res.status}: ${url}`);

  const fileStream = fs.createWriteStream(destPath);
  const readable = Readable.fromWeb(res.body);

  return new Promise((resolve, reject) => {
    readable.pipe(fileStream);
    fileStream.on('finish', () => resolve());
    fileStream.on('error', reject);
    readable.on('error', reject);
  });
}

async function downloadFileWithHash(url, destPath, expectedHashes) {
  const buffer = await downloadToBuffer(url);

  // Verify hashes if provided
  if (expectedHashes) {
    if (expectedHashes.sha512) {
      const actual = crypto.createHash('sha512').update(buffer).digest('hex');
      if (actual !== expectedHashes.sha512) {
        throw new Error(`SHA-512 mismatch for ${path.basename(destPath)}: expected ${expectedHashes.sha512.slice(0, 16)}…, got ${actual.slice(0, 16)}…`);
      }
    } else if (expectedHashes.sha1) {
      const actual = crypto.createHash('sha1').update(buffer).digest('hex');
      if (actual !== expectedHashes.sha1) {
        throw new Error(`SHA-1 mismatch for ${path.basename(destPath)}: expected ${expectedHashes.sha1}, got ${actual}`);
      }
    }
  }

  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, buffer);
}

function extractOverrides(zipPath, overridesFolder, outputDir) {
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();
  const prefix = overridesFolder.replace(/\\/g, '/').replace(/\/?$/, '/');

  for (const entry of entries) {
    const entryName = entry.entryName.replace(/\\/g, '/');
    if (!entryName.startsWith(prefix) || entry.isDirectory) continue;

    const relativePath = entryName.slice(prefix.length);
    if (!relativePath) continue;

    const destPath = path.join(outputDir, relativePath);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, entry.getData());
  }
}

function readJsonFromZip(zipPath, jsonFilePath) {
  const zip = new AdmZip(zipPath);
  const entry = zip.getEntry(jsonFilePath);
  if (!entry) return null;
  return JSON.parse(entry.getData().toString('utf8'));
}

// ─── Modrinth API ────────────────────────────────────────────────────

async function searchModrinth(query, facets, offset = 0, limit = 20) {
  const params = new URLSearchParams();
  params.set('query', query);
  params.set('limit', limit.toString());
  params.set('offset', offset.toString());
// we only want modpacks here
  const allFacets = [['project_type:modpack']];
  if (facets) allFacets.push(...facets);
  params.set('facets', JSON.stringify(allFacets));

  return modrinthFetch(`/search?${params.toString()}`);
}

async function getModrinthProject(idOrSlug) {
  return modrinthFetch(`/project/${encodeURIComponent(idOrSlug)}`);
}

async function getModrinthVersions(projectId, loaders, gameVersions) {
  const params = new URLSearchParams();
  if (loaders && loaders.length) params.set('loaders', JSON.stringify(loaders));
  if (gameVersions && gameVersions.length) params.set('game_versions', JSON.stringify(gameVersions));
  return modrinthFetch(`/project/${encodeURIComponent(projectId)}/version?${params.toString()}`);
}

async function installMrpack(versionData, packId, mcRoot, sendEvent) {
  const packDir = path.join(mcRoot, 'aqua-modpacks', packId);
  const packModsDir = path.join(packDir, 'mods');
  const tempDir = path.join(app.getPath('temp'), 'aqua-mrpack-' + Date.now());

  fs.mkdirSync(tempDir, { recursive: true });

  try {
    // 1. Find the primary .mrpack file in versionData.files
    const mrpackFile = (versionData.files || []).find(f => f.primary) || versionData.files?.[0];
    if (!mrpackFile || !mrpackFile.url) {
      throw new Error('No .mrpack file found in version data');
    }

    sendEvent('modpack-status', { state: 'downloading', message: 'Downloading modpack archive...', progress: { completed: 0, total: 1 } });

    // 2. Download the .mrpack file
    const mrpackPath = path.join(tempDir, mrpackFile.filename || 'modpack.mrpack');
    await downloadToFile(mrpackFile.url, mrpackPath);

    // 3. Parse modrinth.index.json from the archive
    const metadata = readJsonFromZip(mrpackPath, 'modrinth.index.json');
    if (!metadata) {
      throw new Error('Invalid .mrpack: missing modrinth.index.json');
    }

    // 4. Prepare destination
    if (fs.existsSync(packModsDir)) {
      fs.rmSync(packModsDir, { recursive: true, force: true });
    }
    fs.mkdirSync(packModsDir, { recursive: true });

    // 5. Download each mod file from the metadata
    const files = metadata.files || [];
    const total = files.length;
    let completed = 0;

    sendEvent('modpack-status', {
      state: 'downloading',
      message: `Downloading mods (0/${total})...`,
      progress: { completed: 0, total },
    });

    const concurrency = 5;
    for (let i = 0; i < files.length; i += concurrency) {
      const chunk = files.slice(i, i + concurrency);
      await Promise.all(chunk.map(async (file) => {
        try {
          const downloads = file.downloads || [];
          const url = downloads[0];
          if (!url) {
            console.warn('No download URL for file:', file.path);
            return;
          }

          // file.path is relative, e.g. "mods/sodium.jar"
          const destPath = path.join(packDir, file.path);
          fs.mkdirSync(path.dirname(destPath), { recursive: true });

          await downloadFileWithHash(url, destPath, file.hashes);
        } catch (err) {
          console.error(`Failed to download ${file.path}:`, err.message);
        }

        completed++;
        sendEvent('modpack-status', {
          state: 'downloading',
          message: `Downloading mods (${completed}/${total})...`,
          progress: { completed, total },
        });
      }));
    }

    // 6. Extract overrides
    sendEvent('modpack-status', { state: 'preparing', message: 'Installing overrides...' });

    // Modrinth supports both "overrides" and "client-overrides"
    extractOverrides(mrpackPath, 'overrides', packDir);
    extractOverrides(mrpackPath, 'client-overrides', packDir);

    // 7. Return metadata for manifest storage
    return {
      name: metadata.name || packId,
      dependencies: metadata.dependencies || {},
      fileCount: total,
    };
  } finally {
    // Cleanup temp
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
}

// ─── CurseForge API (via Cloudflare Workers proxy) ───────────────────

async function searchCurseForge(query, proxyBaseUrl, index = 0, pageSize = 20) {
  // gameId 432 = Minecraft, classId 4471 = Modpacks
  const params = new URLSearchParams();
  params.set('gameId', '432');
  params.set('classId', '4471');
  params.set('searchFilter', query);
  params.set('pageSize', pageSize.toString());
  params.set('index', index.toString());
  params.set('sortField', '2'); // Popularity
  params.set('sortOrder', 'desc');
  return cfProxyFetch(proxyBaseUrl, `/v1/mods/search?${params.toString()}`);
}

async function getCurseForgeProject(modId, proxyBaseUrl) {
  return cfProxyFetch(proxyBaseUrl, `/v1/mods/${modId}`);
}

async function getCurseForgeFiles(modId, proxyBaseUrl) {
  return cfProxyFetch(proxyBaseUrl, `/v1/mods/${modId}/files?pageSize=50`);
}

async function getCurseForgeFilesByIds(fileIds, proxyBaseUrl) {
  return cfProxyPost(proxyBaseUrl, `/v1/mods/files`, { fileIds });
}

async function installCurseForgePack(fileData, packId, mcRoot, proxyBaseUrl, sendEvent) {
  const packDir = path.join(mcRoot, 'aqua-modpacks', packId);
  const packModsDir = path.join(packDir, 'mods');
  const tempDir = path.join(app.getPath('temp'), 'aqua-cf-' + Date.now());

  fs.mkdirSync(tempDir, { recursive: true });

  try {
    // 1. Download the modpack .zip
    const downloadUrl = fileData.downloadUrl;
    if (!downloadUrl) {
      throw new Error('CurseForge file has no download URL (distribution denied). Please download it manually.');
    }

    sendEvent('modpack-status', { state: 'downloading', message: 'Downloading modpack archive...', progress: { completed: 0, total: 1 } });

    const zipPath = path.join(tempDir, fileData.fileName || 'modpack.zip');
    await downloadToFile(downloadUrl, zipPath);

    // 2. Read manifest.json from the zip
    const manifest = readJsonFromZip(zipPath, 'manifest.json');
    if (!manifest) {
      throw new Error('Invalid CurseForge modpack: missing manifest.json');
    }

    // 3. Prepare destination
    if (fs.existsSync(packModsDir)) {
      fs.rmSync(packModsDir, { recursive: true, force: true });
    }
    fs.mkdirSync(packModsDir, { recursive: true });

    // 4. Resolve mod file download URLs via CurseForge API
    const modFiles = manifest.files || [];
    const fileIds = modFiles.map(f => f.fileID);
    const total = fileIds.length;

    sendEvent('modpack-status', {
      state: 'preparing',
      message: 'Resolving mod download URLs...',
    });

    // Fetch file info in batches of 50
    let resolvedFiles = [];
    for (let i = 0; i < fileIds.length; i += 50) {
      const batch = fileIds.slice(i, i + 50);
      try {
        const result = await getCurseForgeFilesByIds(batch, proxyBaseUrl);
        resolvedFiles.push(...(result.data || []));
      } catch (err) {
        console.error('Failed to resolve file batch:', err.message);
      }
    }

    // 5. Download each mod
    let completed = 0;
    const distributionDenied = [];

    sendEvent('modpack-status', {
      state: 'downloading',
      message: `Downloading mods (0/${total})...`,
      progress: { completed: 0, total },
    });

    const concurrency = 5;
    for (let i = 0; i < resolvedFiles.length; i += concurrency) {
      const chunk = resolvedFiles.slice(i, i + concurrency);
      await Promise.all(chunk.map(async (file) => {
        try {
          if (!file.downloadUrl) {
            distributionDenied.push(file.displayName || file.fileName || `fileId:${file.id}`);
            return;
          }

          const fileName = file.fileName || `mod-${file.id}.jar`;
          // Determine target subfolder: resourcepacks for .zip, mods for .jar
          const ext = path.extname(fileName).toLowerCase();
          const subDir = ext === '.zip' ? 'resourcepacks' : 'mods';
          const destDir = path.join(packDir, subDir);
          fs.mkdirSync(destDir, { recursive: true });

          const destPath = path.join(destDir, fileName);
          await downloadToFile(file.downloadUrl, destPath);
        } catch (err) {
          console.error(`Failed to download CF file ${file.id}:`, err.message);
        }

        completed++;
        sendEvent('modpack-status', {
          state: 'downloading',
          message: `Downloading mods (${completed}/${total})...`,
          progress: { completed, total },
        });
      }));
    }

    // 6. Extract overrides
    sendEvent('modpack-status', { state: 'preparing', message: 'Installing overrides...' });

    const overridesDir = manifest.overrides || 'overrides';
    extractOverrides(zipPath, overridesDir, packDir);

    // 7. Return metadata
    return {
      name: manifest.name || packId,
      mcVersion: manifest.minecraft?.version,
      modLoaders: (manifest.minecraft?.modLoaders || []).map(l => l.id),
      fileCount: total,
      distributionDenied,
    };
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
}

// ─── Exports ─────────────────────────────────────────────────────────

module.exports = {
  // Modrinth
  searchModrinth,
  getModrinthProject,
  getModrinthVersions,
  installMrpack,
  // CurseForge
  searchCurseForge,
  getCurseForgeProject,
  getCurseForgeFiles,
  installCurseForgePack,
};
