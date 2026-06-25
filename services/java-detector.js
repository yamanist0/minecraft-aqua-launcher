const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const javaCache = new Map();

function parseMcVersion(mcVersion) {
  const [major = '1', minor = '0', patch = '0'] = mcVersion.split('.');
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
  };
}

function getRequiredJavaVersion(mcVersion) {
  const { major, minor, patch } = parseMcVersion(mcVersion);

  if (major >= 1 && minor >= 21) return 21;
  if (major >= 1 && minor === 20 && patch >= 5) return 21;
  if (major >= 1 && minor >= 18) return 17;
  if (major >= 1 && minor === 17) return 16;
  return 8;
}

function parseJavaVersion(output) {
  const match = output.match(/version "([^"]+)"/);
  if (!match) return null;

  const parts = match[1].split('.').map((part) => Number(part));
  if (parts[0] === 1 && parts.length > 1) {
    return parts[1];
  }

  return parts[0];
}

async function probeJava(javaPath) {
  try {
    const { stderr, stdout } = await execAsync(`"${javaPath}" -version`);
    const version = parseJavaVersion(stderr || stdout);
    if (!version) return null;

    return {
      path: javaPath,
      version,
      label: (stderr || stdout).trim().split('\n')[0],
    };
  } catch (error) {
    const version = parseJavaVersion(error.stderr || error.stdout || '');
    if (!version) return null;

    return {
      path: javaPath,
      version,
      label: (error.stderr || error.stdout || '').trim().split('\n')[0],
    };
  }
}

function collectCandidatePaths() {
  const candidates = new Set();
  const isWindows = process.platform === 'win32';
  const javaName = isWindows ? 'javaw.exe' : 'java';

  const addJavaFromRoot = (root) => {
    if (!root || !fs.existsSync(root)) return;

    const direct = path.join(root, 'bin', javaName);
    if (fs.existsSync(direct)) {
      candidates.add(direct);
    }

    let entries = [];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const nested = path.join(root, entry.name, 'bin', javaName);
      if (fs.existsSync(nested)) {
        candidates.add(nested);
      }
    }
  };

  if (process.env.JAVA_HOME) {
    addJavaFromRoot(process.env.JAVA_HOME);
  }

  if (process.env.JDK_HOME) {
    addJavaFromRoot(process.env.JDK_HOME);
  }

  if (isWindows) {
    const programFiles = [
      process.env['ProgramFiles'],
      process.env['ProgramFiles(x86)'],
      process.env.LOCALAPPDATA,
    ].filter(Boolean);

    const vendorRoots = [
      'Java',
      'Eclipse Adoptium',
      'Microsoft',
      'Zulu',
      'BellSoft',
      'Amazon Corretto',
      'Temurin',
    ];

    for (const base of programFiles) {
      for (const vendor of vendorRoots) {
        addJavaFromRoot(path.join(base, vendor));
      }
    }
  } else if (process.platform === 'darwin') {
    const jvmRoots = [
      '/Library/Java/JavaVirtualMachines',
      path.join(process.env.HOME || '', 'Library/Java/JavaVirtualMachines'),
    ];

    for (const jvmRoot of jvmRoots) {
      if (!fs.existsSync(jvmRoot)) continue;

      for (const entry of fs.readdirSync(jvmRoot)) {
        addJavaFromRoot(path.join(jvmRoot, entry, 'Contents', 'Home'));
      }
    }
  } else {
    addJavaFromRoot('/usr/lib/jvm');
    addJavaFromRoot('/usr/local/lib/jvm');
  }

  candidates.add(isWindows ? 'javaw' : 'java');
  return [...candidates];
}

async function findInstalledJava() {
  const discovered = new Map();
  const candidates = collectCandidatePaths();

  for (const candidate of candidates) {
    const info = await probeJava(candidate);
    if (!info) continue;

    const existing = discovered.get(info.version);
    if (!existing || existing.path.length > info.path.length) {
      discovered.set(info.version, info);
    }
  }

  try {
    const isWindows = process.platform === 'win32';
    const command = isWindows ? 'where java' : 'which -a java';
    const { stdout } = await execAsync(command);
    const paths = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (const javaPath of paths) {
      const normalized = isWindows
        ? javaPath.replace(/java\.exe$/i, 'javaw.exe')
        : javaPath;
      const target = fs.existsSync(normalized) ? normalized : javaPath;
      const info = await probeJava(target);
      if (!info) continue;

      const existing = discovered.get(info.version);
      if (!existing) {
        discovered.set(info.version, info);
      }
    }
  } catch {
    // No java on PATH.
  }

  return [...discovered.values()].sort((a, b) => b.version - a.version);
}

async function resolveJavaPath(mcVersion) {
  const required = getRequiredJavaVersion(mcVersion);
  const cacheKey = String(required);

  if (javaCache.has(cacheKey)) {
    return javaCache.get(cacheKey);
  }

  const installations = await findInstalledJava();
  const compatible = installations.filter((item) => item.version >= required);
  const selected = compatible[0];

  if (!selected) {
    const installedText = installations.length
      ? installations.map((item) => `Java ${item.version}`).join(', ')
      : 'none detected';

    throw new Error(
      `Minecraft ${mcVersion} requires Java ${required}+. Found: ${installedText}. Install Java ${required} or newer from https://adoptium.net/`,
    );
  }

  javaCache.set(cacheKey, selected.path);
  return selected.path;
}

async function getJavaInfo(mcVersion) {
  const required = getRequiredJavaVersion(mcVersion);
  const installations = await findInstalledJava();
  const selected = installations.find((item) => item.version >= required) || null;

  return {
    required,
    selected: selected
      ? { version: selected.version, path: selected.path, label: selected.label }
      : null,
    installed: installations.map((item) => ({
      version: item.version,
      path: item.path,
      label: item.label,
    })),
  };
}

module.exports = {
  getRequiredJavaVersion,
  resolveJavaPath,
  getJavaInfo,
};
