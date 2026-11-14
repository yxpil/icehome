/**
 * 页面缓存：GET 响应级缓存，支持内存与 Redis 两种后端。
 * 缓存键包含令牌 ID，避免不同权限看到彼此的响应；任何写请求成功后清空缓存。
 */

const CACHEABLE_PATHS = [
  '/api/state',
  '/api/devices',
  '/api/categories',
  '/api/tasks',
  '/api/plugins',
  '/api/events',
  '/api/ai/manual'
];

export function isCacheablePath(pathname) {
  return CACHEABLE_PATHS.some((item) => pathname === item || pathname.startsWith(`${item}/`));
}

export function createMemoryCache({ prefix = 'icehome:', ttlSeconds = 5, max = 400 } = {}) {
  const map = new Map();
  const state = { hits: 0, misses: 0, sets: 0, clears: 0 };

  return {
    backend: 'memory',
    connected: true,
    fallbackReason: null,
    async get(key) {
      const entry = map.get(prefix + key);
      if (!entry) {
        state.misses += 1;
        return null;
      }
      if (entry.expiresAt && entry.expiresAt <= Date.now()) {
        map.delete(prefix + key);
        state.misses += 1;
        return null;
      }
      state.hits += 1;
      return entry.value;
    },
    async set(key, value, ttl = ttlSeconds) {
      const actual = Number(ttl) > 0 ? Number(ttl) : ttlSeconds;
      if (map.size >= max) {
        const oldest = map.keys().next().value;
        if (oldest) map.delete(oldest);
      }
      map.set(prefix + key, {
        value,
        expiresAt: actual > 0 ? Date.now() + actual * 1000 : 0
      });
      state.sets += 1;
    },
    async clear() {
      map.clear();
      state.clears += 1;
    },
    async close() {},
    stats() {
      return {
        backend: 'memory',
        connected: true,
        fallbackReason: this.fallbackReason || null,
        hits: state.hits,
        misses: state.misses,
        sets: state.sets,
        clears: state.clears,
        keys: map.size,
        ttlSeconds,
        prefix
      };
    }
  };
}

/** Redis 缓存；client 需兼容 node-redis v4 的 get/set/del/keys API */
export function createRedisCache({ client, prefix = 'icehome:', ttlSeconds = 5 } = {}) {
  const state = { hits: 0, misses: 0, sets: 0, clears: 0, connected: true };
  const keys = new Set();
  if (typeof client.on === 'function') {
    client.on('error', () => {
      state.connected = false;
    });
  }

  return {
    backend: 'redis',
    get connected() {
      return state.connected;
    },
    fallbackReason: null,
    client,
    async get(key) {
      const raw = await client.get(prefix + key);
      if (raw === null || raw === undefined) {
        state.misses += 1;
        return null;
      }
      state.hits += 1;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },
    async set(key, value, ttl = ttlSeconds) {
      const actual = Number(ttl) > 0 ? Number(ttl) : ttlSeconds;
      if (actual > 0) {
        await client.set(prefix + key, JSON.stringify(value), { EX: Math.max(1, Math.round(actual)) });
      } else {
        await client.set(prefix + key, JSON.stringify(value));
      }
      keys.add(prefix + key);
      state.sets += 1;
    },
    async clear() {
      const matched = await client.keys(`${prefix}*`);
      if (matched.length) await client.del(matched);
      keys.clear();
      state.clears += 1;
    },
    async close() {
      try {
        await client.quit();
      } catch {
        /* 已断开 */
      }
    },
    stats() {
      return {
        backend: 'redis',
        connected: state.connected,
        fallbackReason: null,
        hits: state.hits,
        misses: state.misses,
        sets: state.sets,
        clears: state.clears,
        keys: keys.size,
        ttlSeconds,
        prefix
      };
    }
  };
}

/**
 * 优先连 Redis，失败则降级内存缓存（并记录原因，界面可见）。
 */
export async function createCache({
  redisUrl = process.env.REDIS_URL || '',
  prefix = 'icehome:',
  ttlSeconds = 5,
  logger = console,
  connect
} = {}) {
  if (!redisUrl && !connect) return createMemoryCache({ prefix, ttlSeconds });
  try {
    const client = connect ? await connect() : await defaultConnect(redisUrl);
    logger?.info?.(`[cache] Redis 已连接（${prefix}）`);
    return createRedisCache({ client, prefix, ttlSeconds });
  } catch (error) {
    const fallback = createMemoryCache({ prefix, ttlSeconds });
    fallback.fallbackReason = `Redis 不可用：${error.message}`;
    logger?.warn?.(`[cache] Redis 连接失败，降级内存缓存：${error.message}`);
    return fallback;
  }
}

async function defaultConnect(redisUrl) {
  let redis;
  try {
    redis = await import('redis');
  } catch {
    throw new Error('Redis 驱动未安装：请执行 npm i redis');
  }
  const client = redis.createClient({
    url: redisUrl,
    socket: {
      connectTimeout: 5000,
      // 不在后台无限重试；连不上就交给上层降级内存缓存
      reconnectStrategy: false
    }
  });
  client.on('error', (error) => {
    console.warn(`[cache] Redis 运行时错误：${error.message}`);
  });
  try {
    await client.connect();
  } catch (error) {
    try {
      client.destroy?.();
    } catch {
      /* 已断开 */
    }
    throw error;
  }
  return client;
}

/** GET 响应缓存中间件；是否启用由 settings.cache 决定 */
export function createCacheMiddleware({ store, cache }) {
  return async (req, res, next) => {
    const config = store.data.settings.cache || {};
    /** 该中间件挂在 /api 下，req.path 已被剥离前缀，这里按原始 URL 判断 */
    const pathname = String(req.originalUrl || '').split('?')[0];
    if (!config.enabled || !config.ttlSeconds || req.method !== 'GET' || !isCacheablePath(pathname)) {
      return next();
    }
    if (String(req.get('cache-control') || '').toLowerCase() === 'no-cache') {
      res.set('x-cache', 'BYPASS');
      return next();
    }
    const key = `${req.token?.id || 'anon'}:${req.originalUrl}`;
    let hit = null;
    try {
      hit = await cache.get(key);
    } catch {
      hit = null;
    }
    if (hit !== null && hit !== undefined) {
      res.set('x-cache', 'HIT');
      return res.status(200).json(hit);
    }
    res.set('x-cache', 'MISS');
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode === 200) {
        Promise.resolve(cache.set(key, body, config.ttlSeconds)).catch(() => {});
      }
      return originalJson(body);
    };
    return next();
  };
}

/** 任意写请求成功后清空页面缓存，保证读到最新状态 */
export function createInvalidationMiddleware({ store, cache }) {
  return (req, res, next) => {
    res.on('finish', () => {
      if (req.method === 'GET' || res.statusCode >= 400) return;
      if (!store.data.settings.cache?.enabled) return;
      Promise.resolve(cache.clear()).catch(() => {});
    });
    next();
  };
}
