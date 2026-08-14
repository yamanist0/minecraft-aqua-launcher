const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

function getOs() {
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'darwin') return 'mac';
  return 'linux';
}

function getArch() {
  if (process.arch === 'x64') return 'x64';
  if (process.arch === 'arm64') return 'aarch64';
  return 'x64';
}

async function downloadJava(version, mcRoot, sendEvent) {
  const os = getOs();
  const arch = getArch();
  const imageType = 'jdk';

  const response = await fetch(
    `https://api.adoptium.net/v3/assets/latest/${version}/hotspot?os=${os}&architecture=${arch}&image_type=${imageType}`
  );
  if (!response.ok) {
    throw new Error(`Failed to query Adoptium API for Java ${version}: ${response.statusText}`);
  }
  
  const data = await response.json();
  if (!data || !data.length) {
    throw new Error(`No Java ${version} binaries found for ${os} ${arch}`);
  }

  const binaryPackageUrl = data[0].binary.package.link;
  const fileName = data[0].binary.package.name;

  const runtimesDir = path.join(mcRoot, 'runtime');
  fs.mkdirSync(runtimesDir, { recursive: true });

  const destZipPath = path.join(runtimesDir, fileName);
  const extractFolder = path.join(runtimesDir, `java-${version}`);

  // daha once indirildiyse atla
  const findExecutable = (dir) => {
    if (!fs.existsSync(dir)) return null;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
         const nested = findExecutable(path.join(dir, entry.name));
         if (nested) return nested;
      } else {
         if ((entry.name.toLowerCase() === 'javaw.exe' || entry.name.toLowerCase() === 'java.exe' || entry.name === 'java') && dir.endsWith('bin')) {
           return path.join(dir, entry.name);
         }
      }
    }
    return null;
  };

  const existingExec = findExecutable(extractFolder);
  if (existingExec) {
    return existingExec;
  }

  sendEvent('launch-status', { state: 'preparing', message: `Downloading Java ${version} (${(data[0].binary.package.size / 1024 / 1024).toFixed(1)} MB)...` });
  
  const binResponse = await fetch(binaryPackageUrl);
  if (!binResponse.ok) {
    throw new Error(`Failed to download Java archive from ${binaryPackageUrl}`);
  }

  const arrayBuffer = await binResponse.arrayBuffer();
  fs.writeFileSync(destZipPath, Buffer.from(arrayBuffer));

  sendEvent('launch-status', { state: 'preparing', message: `Extracting Java ${version}...` });
  
  if (fileName.endsWith('.zip')) {
    const zip = new AdmZip(destZipPath);
    zip.extractAllTo(extractFolder, true);
    fs.unlinkSync(destZipPath);
  } else {
    throw new Error(`Extraction for ${fileName} is not fully supported natively yet on this OS. Please install Java ${version} manually.`);
  }

  const executablePath = findExecutable(extractFolder);
  if (!executablePath) {
    throw new Error(`Could not find Java executable inside ${extractFolder}`);
  }

  if (process.platform !== 'win32') {
    fs.chmodSync(executablePath, '755');
  }

  sendEvent('launch-status', { state: 'preparing', message: `Java ${version} successfully installed.` });
  
  return executablePath;
}

module.exports = { downloadJava };
