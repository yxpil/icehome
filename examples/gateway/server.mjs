/**
 * ICEHOME 代理网关示例（零依赖，仅用 Node 内置模块）。
 *
 * 职责：
 *   1. 托管前端构建产物 dist（前后端分离部署）
 *   2. 反向代理 /api 与 /v1 到 ICEHOME API（/v1 支持 SSE 直通）
 *   3. 可选的页面缓存：本机内存或 Redis（需 REDIS_URL），仅缓存只读接口
 *   4. /__gateway/stats 暴露命中率等指标
 *
 * 运行：node examples/gateway/server.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(HERE, '..', '..');

const PORT = Number(process.env.GATEWAY_PORT || 8790);
const UPSTREAM = new URL(process.env.GATEWAY_UPSTREAM || 'http://127.0.0.1:8787');
const DIST = path.resolve(process.env.GATEWAY_DIST || path.join(PROJECT_ROOT, 'dist'));
const CACHE_TTL = Number(process.env.GATEWAY_CACHE_TTL ?? 5);
const REDIS_URL = process.env.REDIS_URL || '';

const CACHEABLE = new Set([
  '/api/state',
  '/api/devices',
  '/api/categories',
  '/api/tasks',
  '/api/plugins',
  '/api/events',
  '/api/ai/manual'
]);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8'
};

const stats = {
  startedAt: new Date().toISOString(),
  requests: 0,
  proxied: 0,
  static: 0,
  cacheHits: 0,
  cacheMisses: 0,
  cacheBypass: 0,
  invalidations: 0,
  errors: 0,
  cacheBackend: REDIS_URL ? 'redis' : 'memory'
};

/** 缓存实现：Redis 可用则用 Redis，否则进程内 Map */
async function createCache() {
  const memory = {
    map: new Map(),
    async get(key) {
      const entry = this.map.get(key);
      if (!entry) return null;
      if (entry.expiresAt <= Date.now()) {
        this.map.delete(key);
        return null;
      }
      return entry.body;
    },
    async set(key, body, ttl) {
      this.map.set(key, { body, expiresAt: Date.now() + ttl * 1000 });
      if (this.map.size > 200) this.map.delete(this.map.keys().next().value);
    },
    async clear() {
      this.map.clear();
    }
  };

  if (!REDIS_URL) return { backend: 'memory', ...memory };
  try {
    const { createClient } = await import('redis');
    const client = createClient({ url: REDIS_URL });
    client.on('error', (error) => console.warn(`[gateway] Redis 错误：${error.message}`));
    await client.connect();
    console.log(`[gateway] 页面缓存使用 Redis：${REDIS_URL}`);
    return {
      backend: 'redis',
      async get(key) {
        const raw = await client.get(key);
        return raw ? Buffer.from(raw, 'base64') : null;
      },
      async set(key, body, ttl) {
        await client.set(key, body.toString('base64'), { EX: Math.max(1, Math.round(ttl)) });
      },
      async clear() {
        const keys = await client.keys('gw:*');
        if (keys.length) await client.del(keys);
      }
    };
  } catch (error) {
    console.warn(`[gateway] Redis 不可用，改用内存缓存：${error.message}`);
    return { backend: 'memory', ...memory };
  }
}

/** 缓存键：路径 + 查询串 + 令牌指纹，避免不同令牌互相看到响应 */
function cacheKey(req, pathname) {
  const auth = req.headers['x-ice-token'] || req.headers.authorization || 'anonymous';
  const fingerprint = crypto.createHash('sha256').update(String(auth)).digest('hex').slice(0, 16);
  return `gw:${pathname}${req.url.slice(pathname.length)}:${fingerprint}`;
}

const HOP_HEADERS = ['host', 'connection', 'content-length', 'transfer-encoding', 'keep-alive'];
function upstreamHeaders(req) {
  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (!HOP_HEADERS.includes(key.toLowerCase())) headers[key] = value;
  }
  headers.host = UPSTREAM.host;
  headers['x-forwarded-host'] = req.headers.host || '';
  headers['x-forwarded-proto'] = 'http';
  return headers;
}

function proxy(req, res, body) {
  const target = new URL(req.url, UPSTREAM);
  const options = {
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port || 80,
    path: `${target.pathname}${target.search}`,
    method: req.method,
    headers: upstreamHeaders(req)
  };

  const upstream = http.request(options, (upRes) => {
    const headers = { ...upRes.headers };
    for (const key of HOP_HEADERS) delete headers[key];
    headers['x-gateway'] = 'icehome-gateway';
    res.writeHead(upRes.statusCode || 502, headers);
    upRes.pipe(res);
    upRes.on('end', () => {
      if (req.method !== 'GET' && (upRes.statusCode || 500) < 400) {
        stats.invalidations += 1;
        cache.clear().catch(() => {});
      }
    });
  });

  upstream.on('error', (error) => {
    stats.errors += 1;
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
    }
    res.end(JSON.stringify({ error: { code: 'gateway_upstream', message: `上游不可用：${error.message}` } }));
  });

  if (body) upstream.write(body);
  upstream.end();
}

/** 需要缓存的 GET：先查缓存，未命中则缓冲上游响应后落缓存 */
function proxyWithCache(req, res, body, key) {
  const target = new URL(req.url, UPSTREAM);
  const upstream = http.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || 80,
      path: `${target.pathname}${target.search}`,
      method: req.method,
      headers: upstreamHeaders(req)
    },
    (upRes) => {
      const headers = { ...upRes.headers };
      for (const keyName of HOP_HEADERS) delete headers[keyName];
      const status = upRes.statusCode || 502;
      const type = String(headers['content-type'] || '');
      if (status !== 200 || !type.includes('application/json')) {
        stats.cacheBypass += 1;
        res.writeHead(status, { ...headers, 'x-gateway-cache': 'BYPASS' });
        upRes.pipe(res);
        return;
      }
      const chunks = [];
      let size = 0;
      upRes.on('data', (chunk) => {
        size += chunk.length;
        if (size <= 2 * 1024 * 1024) chunks.push(chunk);
      });
      upRes.on('end', async () => {
        const payload = Buffer.concat(chunks);
        res.writeHead(status, { ...headers, 'x-gateway-cache': 'MISS' });
        res.end(payload);
        try {
          await cache.set(key, payload, CACHE_TTL);
        } catch {
          /* 缓存失败不影响响应 */
        }
      });
    }
  );

  upstream.on('error', (error) => {
    stats.errors += 1;
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: { code: 'gateway_upstream', message: error.message } }));
  });
  if (body) upstream.write(body);
  upstream.end();
}

function serveStatic(req, res, pathname) {
  const relative = pathname.replace(/^\/+/, '');
  const resolved = path.resolve(DIST, relative);
  if (!resolved.startsWith(DIST)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  const exists = fs.existsSync(resolved) && fs.statSync(resolved).isFile();
  const file = exists ? resolved : path.join(DIST, 'index.html');
  if (!fs.existsSync(file)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('未找到构建产物，请先执行 npm run build');
    return;
  }
  const ext = path.extname(file).toLowerCase();
  const immutable = pathname.startsWith('/assets/');
  res.writeHead(200, {
    'content-type': MIME[ext] || 'application/octet-stream',
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache'
  });
  fs.createReadStream(file).pipe(res);
  stats.static += 1;
}

const cache = await createCache();

const server = http.createServer((req, res) => {
  stats.requests += 1;
  const pathname = String(req.url || '/').split('?')[0];

  if (pathname === '/__gateway/stats') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(
      JSON.stringify(
        {
          ...stats,
          cacheBackend: cache.backend,
          uptimeSec: Math.round(process.uptime()),
          upstream: UPSTREAM.origin,
          cacheTtl: CACHE_TTL,
          cacheEnabled: CACHE_TTL > 0
        },
        null,
        2
      )
    );
    return;
  }

  const bodyChunks = [];
  req.on('data', (chunk) => bodyChunks.push(chunk));
  req.on('end', async () => {
    const body = bodyChunks.length ? Buffer.concat(bodyChunks) : null;

    if (pathname.startsWith('/api') || pathname.startsWith('/v1')) {
      stats.proxied += 1;
      const cacheable = req.method === 'GET' && CACHE_TTL > 0 && CACHEABLE.has(pathname);
      if (!cacheable) {
        if (req.method === 'GET') stats.cacheBypass += 1;
        proxy(req, res, body);
        return;
      }
      const key = cacheKey(req, pathname);
      try {
        const hit = await cache.get(key);
        if (hit) {
          stats.cacheHits += 1;
          res.writeHead(200, {
            'content-type': 'application/json; charset=utf-8',
            'x-gateway-cache': 'HIT',
            'cache-control': `public, max-age=${CACHE_TTL}`
          });
          res.end(hit);
          return;
        }
      } catch {
        /* 缓存读失败按未命中处理 */
      }
      stats.cacheMisses += 1;
      proxyWithCache(req, res, body, key);
      return;
    }

    if (req.method !== 'GET') {
      res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' }).end('Method Not Allowed');
      return;
    }
    serveStatic(req, res, pathname);
  });
});

server.listen(PORT, () => {
  console.log(`[gateway] 监听 http://127.0.0.1:${PORT}`);
  console.log(`[gateway] 上游 API：${UPSTREAM.origin}`);
  console.log(`[gateway] 静态目录：${DIST}`);
  console.log(`[gateway] 页面缓存：${cache.backend} · TTL ${CACHE_TTL}s`);
});
