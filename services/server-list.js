const net = require('net');
const dns = require('dns').promises;

const DEFAULT_SERVERS_URL =
  'https://raw.githubusercontent.com/yamanist0/aqua-launcher/refs/heads/main/servers.json';
const PAGE_SIZE = 30;
const CACHE_TTL_MS = 5 * 60 * 1000;
const PING_TIMEOUT_MS = 2000;
const PING_CONCURRENCY = 6;

function writeVarInt(value) {
  const bytes = [];
  while (true) {
    if ((value & 0xffffff80) === 0) {
      bytes.push(value);
      return Buffer.from(bytes);
    }
    bytes.push((value & 0x7f) | 0x80);
    value >>>= 7;
  }
}

function readVarInt(buffer, offset = 0) {
  let numRead = 0;
  let result = 0;
  let read;

  do {
    if (offset + numRead >= buffer.length) {
      throw new Error('Incomplete VarInt');
    }
    read = buffer.readUInt8(offset + numRead);
    result |= (read & 0x7f) << (7 * numRead);
    numRead += 1;
    if (numRead > 5) throw new Error('VarInt is too big');
  } while ((read & 0x80) !== 0);

  return { value: result, bytesRead: numRead };
}

function readString(buffer, offset = 0) {
  const { value: length, bytesRead: lengthBytes } = readVarInt(buffer, offset);
  const start = offset + lengthBytes;
  const end = start + length;

  if (end > buffer.length) {
    throw new Error('Incomplete string');
  }

  return {
    value: buffer.toString('utf8', start, end),
    bytesRead: lengthBytes + length,
  };
}

function writeString(str) {
  const buf = Buffer.from(str, 'utf8');
  return Buffer.concat([writeVarInt(buf.length), buf]);
}

function writeShort(val) {
  const buf = Buffer.alloc(2);
  buf.writeUInt16BE(val);
  return buf;
}

function createPacket(packetId, dataBuffers) {
  const idBuf = writeVarInt(packetId);
  const data = Buffer.concat([idBuf, ...dataBuffers]);
  return Buffer.concat([writeVarInt(data.length), data]);
}

async function resolveServer(address) {
  let host = address.trim();
  let port = 25565;

  if (host.includes(':')) {
    const parts = host.split(':');
    host = parts[0];
    port = parseInt(parts[1], 10) || 25565;
    return { host, port };
  }

  try {
    const records = await dns.resolveSrv(`_minecraft._tcp.${host}`);
    if (records?.length > 0) {
      return { host: records[0].name, port: records[0].port };
    }
  } catch {
    // Use default port.
  }

  return { host, port };
}

async function pingServer(address) {
  const { host, port } = await resolveServer(address);

  return new Promise((resolve) => {
    const client = new net.Socket();
    let buffer = Buffer.alloc(0);
    let finished = false;

    const finish = (result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      client.destroy();
      resolve(result);
    };

    const timer = setTimeout(() => finish({ online: false }), PING_TIMEOUT_MS);

    client.on('error', () => finish({ online: false }));

    client.connect(port, host, () => {
      try {
        const handshake = createPacket(0x00, [
          writeVarInt(765),
          writeString(host),
          writeShort(port),
          writeVarInt(1),
        ]);
        client.write(Buffer.concat([handshake, createPacket(0x00, [])]));
      } catch {
        finish({ online: false });
      }
    });

    client.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);

      try {
        while (buffer.length > 0) {
          const lengthInfo = readVarInt(buffer, 0);
          const packetEnd = lengthInfo.bytesRead + lengthInfo.value;
          if (buffer.length < packetEnd) return;

          const packetData = buffer.subarray(lengthInfo.bytesRead, packetEnd);
          buffer = buffer.subarray(packetEnd);

          const packetIdInfo = readVarInt(packetData, 0);
          if (packetIdInfo.value !== 0x00) continue;

          const { value: jsonText } = readString(packetData, packetIdInfo.bytesRead);
          const status = JSON.parse(jsonText);

          finish({
            online: true,
            onlinePlayers: status.players?.online ?? 0,
            maxPlayers: status.players?.max ?? 0,
            version: status.version?.name || null,
          });
          return;
        }
      } catch {
        // Wait for more data.
      }
    });
  });
}

class ServerListService {
  constructor(sendEvent) {
    this.sendEvent = sendEvent;
    this.cache = null;
    this.cacheTime = 0;
    this.pingGeneration = 0;
  }

  async loadServers(url) {
    const serversUrl = (url || DEFAULT_SERVERS_URL).trim();
    const now = Date.now();
    if (this.cache && this.cacheUrl === serversUrl && now - this.cacheTime < CACHE_TTL_MS) {
      return this.cache;
    }

    const res = await fetch(serversUrl, {
      headers: { 'User-Agent': 'Aqua-Launcher/1.0' },
    });

    if (!res.ok) {
      throw new Error(`Failed to load servers.json (${res.status})`);
    }

    const data = await res.json();
    if (!Array.isArray(data)) {
      throw new Error('servers.json is not a valid array');
    }

    this.cacheUrl = serversUrl;
    this.cache = data;
    this.cacheTime = now;
    return data;
  }

  refreshPlayerCounts(page, servers) {
    const generation = ++this.pingGeneration;

    const emitUpdate = (ip, update) => {
      if (generation !== this.pingGeneration) return;
      this.sendEvent?.('server-players-update', { page, ip, ...update });
    };

    let index = 0;

    const worker = async () => {
      while (index < servers.length) {
        if (generation !== this.pingGeneration) return;

        const current = index;
        index += 1;
        const server = servers[current];
        const ping = await pingServer(server.ip);

        if (generation !== this.pingGeneration) return;

        if (ping.online) {
          emitUpdate(server.ip, {
            players: `${ping.onlinePlayers}/${ping.maxPlayers}`,
            online: true,
            live: true,
            version: ping.version || server.version,
          });
        } else {
          emitUpdate(server.ip, {
            players: server.players,
            online: false,
            live: true,
          });
        }
      }
    };

    const workers = Math.min(PING_CONCURRENCY, servers.length);
    Promise.all(Array.from({ length: workers }, () => worker())).catch(() => {});
  }

  async getServersPage(page = 1, serverListUrl) {
    const allServers = await this.loadServers(serverListUrl);
    const totalServers = allServers.length;
    const totalPages = Math.max(1, Math.ceil(totalServers / PAGE_SIZE));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const start = (safePage - 1) * PAGE_SIZE;
    const slice = allServers.slice(start, start + PAGE_SIZE);

    const servers = slice.map((server) => ({
      ...server,
      live: false,
      online: null,
    }));

    this.refreshPlayerCounts(safePage, slice);

    return {
      servers,
      page: safePage,
      totalPages,
      totalServers,
      pageSize: PAGE_SIZE,
    };
  }
}

module.exports = { ServerListService, pingServer };
