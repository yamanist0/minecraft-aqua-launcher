const fs = require('fs');
const path = require('path');

const MODRINTH_API_BASE = 'https://api.modrinth.com/v2/';

function normalizeGameVersion(version) {
  return String(version || '').trim();
}

function normalizeLoader(loader) {
  return String(loader || '').toLowerCase();
}

function projectSlugFromUrl(url) {
  const match = url.match(/modrinth\.com\/(?:mod|project)\/([^\/?#]+)/i);
  return match ? match[1] : null;
}

function isCompatibleGameVersion(requested, candidate) {
  if (!requested || !candidate) return false;
  const normalizedRequested = String(requested).trim();
  const normalizedCandidate = String(candidate).trim();
  return normalizedRequested === normalizedCandidate;
}

async function modrinthFetch(pathname) {
  const url = `${MODRINTH_API_BASE}${pathname}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Modrinth API ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

async function getProjectVersions(projectId) {
  return modrinthFetch(`project/${projectId}/version`);
}

async function resolveModrinthLink(url, mcVersion, loader) {
  const projectId = projectSlugFromUrl(url);
  if (!projectId) return url;

  const normalizedVersion = normalizeGameVersion(mcVersion);
  const normalizedLoader = normalizeLoader(loader);

  let versions = [];
  try {
    versions = await getProjectVersions(projectId);
  } catch (err) {
    console.error('Failed to load Modrinth versions', err);
    return url;
  }

  const matching = versions.filter((ver) => {
    const gameMatch = normalizedVersion
      ? (ver.game_versions || []).some((candidate) => isCompatibleGameVersion(normalizedVersion, candidate))
      : true;
    const loaderMatch = normalizedLoader
      ? (ver.loaders || []).map(normalizeLoader).includes(normalizedLoader)
      : true;
    return gameMatch && loaderMatch;
  });

  if (matching.length > 0) {
    const chosen = matching.sort((a, b) => new Date(b.date_published) - new Date(a.date_published))[0];
    const files = chosen.files || [];
    const primary = files.find((f) => f.primary) || files.find((f) => /\.jar$/i.test(f.filename)) || files[0];
    if (primary && primary.url) {
      return primary.url;
    }
  }

  console.warn(`Modrinth resolver did not find a compatible jar for ${projectId} ${mcVersion}/${loader}`);
  return url;
}

module.exports = { resolveModrinthLink };
