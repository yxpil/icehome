import net from 'node:net';
import http from 'node:http';
import tls from 'node:tls';
import os from 'node:os';

const DEFAULT_PORTS = [80, 443, 8080, 8123, 8787, 1883, 554];
const HTTP_PORTS = new Set([80, 8080, 8123, 5000, 8787]);

function ipToInt(ip) {
  return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

function intToIp(value) {
  return [24, 16, 8, 0].map((shift) => Math.floor(value / 2 ** shift) % 256).join('.');
}

function isPrivateIp(value) {
  const first = Math.floor(value / 2 ** 24) % 256;
  const second = Math.floor(value / 2 ** 16) % 256;
  if (first === 10 || first === 127) return true;
  if (first === 172 && second >= 16 && second <= 31) return true;
  if (first === 192 && second === 168) return true;
  return false;
}

export function normalizeCidr(input) {
  const text = String(input || '').trim();
  const match = /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/.exec(text);
  if (!match) throw new Error('请填写 IPv4 网段，例如 192.168.1.0/24');
  const [, address, prefixText] = match;
  const parts = address.split('.').map(Number);
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    throw new Error('网段地址不合法');
  }
  const prefix = Number(prefixText);
  if (prefix < 24 || prefix > 32) throw new Error('只支持 /24 - /32 的家庭网段，避免一次扫描过多主机');
  const ip = ipToInt(address);
  if (!isPrivateIp(ip)) throw new Error('只允许扫描私有网段（10.x / 172.16-31.x / 192.168.x / 127.x）');
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = (ip & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  let hosts = [];
  if (prefix === 32) hosts = [network];
  else if (prefix === 31) hosts = [network, broadcast];
  else {
    for (let current = network + 1; current < broadcast; current += 1) hosts.push(current);
  }
  return {
    cidr: `${intToIp(network)}/${prefix}`,
    hosts: hosts.map(intToIp),
    size: hosts.length,
    network: intToIp(network),
    broadcast: intToIp(broadcast)
  };
}

export function listInterfaces() {
  const result = [];
  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family !== 'IPv4' || entry.internal) continue;
      result.push({
        name,
        address: entry.address,
        netmask: entry.netmask,
        cidr: `${entry.address}/${entry.cidr ? entry.cidr.split('/')[1] : 24}`
      });
    }
  }
  return result;
}

function tcpConnect(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = net.connect({ host, port });
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish({ port, latencyMs: Date.now() - started, service: 'tcp' }));
    socket.once('timeout', () => finish(null));
    socket.once('error', () => finish(null));
  });
}

function httpProbe(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const started = Date.now();
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const req = http.get(
      {
        host,
        port,
        path: '/',
        timeout: timeoutMs,
        agent: false,
        headers: { Host: `${host}:${port}`, Connection: 'close' }
      },
      (res) => {
        finish({ port, latencyMs: Date.now() - started, service: 'http', detail: `HTTP ${res.statusCode}` });
        res.destroy();
      }
    );
    req.once('timeout', () => {
      req.destroy();
      finish(null);
    });
    req.once('error', () => finish(null));
  });
}

function tlsProbe(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = tls.connect({ host, port, rejectUnauthorized: false });
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs);
    socket.once('secureConnect', () => finish({ port, latencyMs: Date.now() - started, service: 'https' }));
    socket.once('timeout', () => finish(null));
    socket.once('error', () => finish(null));
  });
}

function rtspProbe(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = net.connect({ host, port });
    let settled = false;
    let buffer = '';
    const finish = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      socket.write(`OPTIONS rtsp://${host}:${port}/ RTSP/1.0\r\nCSeq: 1\r\nUser-Agent: ICEHOME\r\n\r\n`);
    });
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      if (/^RTSP\/\d\.\d/.test(buffer)) {
        finish({ port, latencyMs: Date.now() - started, service: 'rtsp', detail: buffer.split('\r\n')[0] });
      }
    });
    socket.once('timeout', () => finish(null));
    socket.once('error', () => finish(null));
  });
}

function mqttProbe(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = net.connect({ host, port });
    const clientId = 'icehome-scan';
    const remaining = 10 + 2 + Buffer.byteLength(clientId);
    const connectPacket = Buffer.concat([
      Buffer.from([0x10, remaining, 0x00, 0x04]),
      Buffer.from('MQTT', 'utf8'),
      Buffer.from([0x04, 0x02, 0x00, 0x3c, 0x00, clientId.length]),
      Buffer.from(clientId, 'utf8')
    ]);
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => socket.write(connectPacket));
    socket.on('data', (chunk) => {
      if (chunk.length >= 2 && chunk[0] === 0x20) {
        finish({ port, latencyMs: Date.now() - started, service: 'mqtt', detail: `CONNACK ${chunk[1]}` });
      }
    });
    socket.once('timeout', () => finish(null));
    socket.once('error', () => finish(null));
  });
}

function probePort(host, port, timeoutMs) {
  if (port === 443) return tlsProbe(host, port, timeoutMs);
  if (port === 1883) return mqttProbe(host, port, timeoutMs);
  if (port === 554) return rtspProbe(host, port, timeoutMs);
  if (HTTP_PORTS.has(port)) return httpProbe(host, port, timeoutMs);
  return tcpConnect(host, port, timeoutMs);
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

export async function scanNetwork(input = {}) {
  const target = normalizeCidr(input.cidr || '192.168.1.0/24');
  const ports = Array.isArray(input.ports) && input.ports.length ? input.ports : DEFAULT_PORTS;
  if (ports.length > 8) throw new Error('单次最多探测 8 个端口');
  const normalizedPorts = ports.map((port) => Number(port));
  if (normalizedPorts.some((port) => !Number.isInteger(port) || port < 1 || port > 65535)) {
    throw new Error('端口必须是 1 - 65535 的整数');
  }
  const timeoutMs = Math.min(1500, Math.max(100, Number(input.timeoutMs) || 350));
  const concurrency = Math.min(64, Math.max(4, Number(input.concurrency) || 32));
  const started = Date.now();

  const hosts = await mapLimit(target.hosts, concurrency, async (host) => {
    const portsFound = (await Promise.all(normalizedPorts.map((port) => probePort(host, port, timeoutMs)))).filter(Boolean);
    if (portsFound.length === 0) return null;
    return {
      ip: host,
      ports: portsFound.map((item) => item.port),
      details: portsFound,
      latencyMs: Math.min(...portsFound.map((item) => item.latencyMs))
    };
  });

  return {
    cidr: target.cidr,
    ports: normalizedPorts,
    scanned: target.hosts.length,
    found: hosts.filter(Boolean),
    startedAt: new Date(started).toISOString(),
    durationMs: Date.now() - started
  };
}
