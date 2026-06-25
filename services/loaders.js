const fs = require('fs');
const path = require('path');

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

async function downloadFile(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buffer);
  return dest;
}

async function getVanillaVersions() {
  const manifest = await fetchJson(
    'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json',
  );
  return manifest.versions
    .filter((v) => v.type === 'release')
    .map((v) => v.id);
}

async function getFabricLoaders(mcVersion) {
  const loaders = await fetchJson(
    `https://meta.fabricmc.net/v2/versions/loader/${mcVersion}`,
  );
  return loaders
    .filter((entry) => entry.loader.stable)
    .map((entry) => entry.loader.version);
}

async function getLatestFabricLoader(mcVersion) {
  const loaders = await getFabricLoaders(mcVersion);
  if (!loaders.length) {
    throw new Error(`Fabric is not available for Minecraft ${mcVersion}`);
  }
  return loaders[0];
}

async function installFabricProfile(root, mcVersion, loaderVersion) {
  const profile = await fetchJson(
    `https://meta.fabricmc.net/v2/versions/loader/${mcVersion}/${loaderVersion}/profile/json`,
  );
  const versionId = profile.id;
  const versionDir = path.join(root, 'versions', versionId);
  fs.mkdirSync(versionDir, { recursive: true });
  fs.writeFileSync(
    path.join(versionDir, `${versionId}.json`),
    JSON.stringify(profile, null, 2),
  );
  return { versionId, loaderVersion };
}

async function getForgeVersion(mcVersion) {
  const promos = await fetchJson(
    'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json',
  );
  const recommended = promos.promos[`${mcVersion}-recommended`];
  const latest = promos.promos[`${mcVersion}-latest`];
  const forgeVersion = recommended || latest;
  if (!forgeVersion) {
    throw new Error(`Forge is not available for Minecraft ${mcVersion}`);
  }
  return forgeVersion;
}

async function downloadForgeInstaller(root, mcVersion, forgeVersion) {
  const fileName = `forge-${mcVersion}-${forgeVersion}-installer.jar`;
  const url = `https://maven.minecraftforge.net/net/minecraftforge/forge/${mcVersion}-${forgeVersion}/${fileName}`;
  const dest = path.join(root, 'cache', 'forge', fileName);

  if (!fs.existsSync(dest)) {
    await downloadFile(url, dest);
  }

  return dest;
}

async function buildLaunchOptions({
  root,
  auth,
  loader,
  mcVersion,
  memory,
  forgeVersion,
  fabricLoaderVersion,
  javaPath,
}) {
  const memoryMax = `${memory}G`;
  const memoryMin = `${Math.max(1, Math.floor(memory / 2))}G`;
  const base = {
    authorization: auth,
    root,
    memory: { max: memoryMax, min: memoryMin },
    javaPath,
  };

  if (loader === 'vanilla') {
    return {
      ...base,
      version: { number: mcVersion, type: 'release' },
    };
  }

  if (loader === 'fabric') {
    const loaderVersion =
      fabricLoaderVersion || (await getLatestFabricLoader(mcVersion));
    const { versionId } = await installFabricProfile(
      root,
      mcVersion,
      loaderVersion,
    );

    return {
      ...base,
      version: {
        number: mcVersion,
        type: 'release',
        custom: versionId,
      },
    };
  }

  if (loader === 'forge') {
    const resolvedForgeVersion =
      forgeVersion || (await getForgeVersion(mcVersion));
    const installerPath = await downloadForgeInstaller(
      root,
      mcVersion,
      resolvedForgeVersion,
    );

    return {
      ...base,
      version: { number: mcVersion, type: 'release' },
      forge: installerPath,
    };
  }

  throw new Error(`Unknown loader: ${loader}`);
}

function formatVersionLabel(loader, mcVersion, loaderVersion) {
  if (loader === 'vanilla') return `Vanilla ${mcVersion}`;
  if (loader === 'fabric') {
    return `Fabric ${mcVersion}${loaderVersion ? ` (${loaderVersion})` : ''}`;
  }
  if (loader === 'forge') {
    return `Forge ${mcVersion}${loaderVersion ? ` (${loaderVersion})` : ''}`;
  }
  return mcVersion;
}

module.exports = {
  getVanillaVersions,
  getFabricLoaders,
  getLatestFabricLoader,
  getForgeVersion,
  installFabricProfile,
  buildLaunchOptions,
  formatVersionLabel,
};
