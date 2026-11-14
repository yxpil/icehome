import { afterEach, describe, expect, it } from 'vitest';
import {
  createCache,
  createMemoryCache,
  createRedisCache,
  isCacheablePath
} from '../../server/src/cache.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fakeRedisClient() {
  const store = new Map();
  return {
    store,
    async get(key) {
      return store.has(key) ? store.get(key) : null;
    },
    async set(key, value, options) {
      store.set(key, value);
      return 'OK';
    },
    async del(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) store.delete(key);
      return 1;
    },
    async keys(pattern) {
      const prefix = pattern.replace(/\*$/, '');
      return [...store.keys()].filter((key) => key.startsWith(prefix));
    },
    async quit() {
      store.clear();
    }
  };
}

describe('memory cache', () => {
  it('caches values and counts hits / misses', async () => {
    const cache = createMemoryCache({ prefix: 'test:', ttlSeconds: 5 });
    expect(await cache.get('a')).toBeNull();
    await cache.set('a', { ok: true });
    expect(await cache.get('a')).toEqual({ ok: true });
    expect(cache.stats()).toMatchObject({ backend: 'memory', hits: 1, misses: 1, keys: 1 });
  });

  it('expires entries after ttl', async () => {
    const cache = createMemoryCache({ ttlSeconds: 0.05 });
    await cache.set('k', 1, 0.05);
    await sleep(90);
    expect(await cache.get('k')).toBeNull();
  });

  it('evicts the oldest entry when over capacity', async () => {
    const cache = createMemoryCache({ max: 2, ttlSeconds: 5 });
    await cache.set('a', 1);
    await cache.set('b', 2);
    await cache.set('c', 3);
    expect(await cache.get('a')).toBeNull();
    expect(await cache.get('c')).toBe(3);
    expect(cache.stats().keys).toBe(2);
  });

  it('clears all entries and records the clear', async () => {
    const cache = createMemoryCache({ ttlSeconds: 5 });
    await cache.set('a', 1);
    await cache.clear();
    expect(await cache.get('a')).toBeNull();
    expect(cache.stats()).toMatchObject({ keys: 0, clears: 1 });
  });
});

describe('redis cache', () => {
  it('stores JSON values under the configured prefix', async () => {
    const client = fakeRedisClient();
    const cache = createRedisCache({ client, prefix: 'icehome:', ttlSeconds: 5 });
    await cache.set('tok:state', { devices: 3 });
    expect(client.store.has('icehome:tok:state')).toBe(true);
    expect(await cache.get('tok:state')).toEqual({ devices: 3 });
    expect(cache.stats()).toMatchObject({ backend: 'redis', hits: 1, keys: 1 });
  });

  it('deletes prefixed keys on clear', async () => {
    const client = fakeRedisClient();
    client.store.set('other:key', 'keep');
    const cache = createRedisCache({ client, prefix: 'icehome:' });
    await cache.set('a', 1);
    await cache.clear();
    expect(client.store.has('icehome:a')).toBe(false);
    expect(client.store.has('other:key')).toBe(true);
  });
});

describe('createCache', () => {
  afterEach(() => {
    delete process.env.REDIS_URL;
  });

  it('falls back to memory with a reason when redis is unreachable', async () => {
    const cache = await createCache({
      redisUrl: 'redis://127.0.0.1:1',
      logger: { info() {}, warn() {} },
      connect: async () => {
        throw new Error('ECONNREFUSED');
      }
    });
    expect(cache.backend).toBe('memory');
    expect(cache.fallbackReason).toContain('Redis 不可用');
    expect(cache.stats().fallbackReason).toContain('Redis 不可用');
    expect(cache.stats().connected).toBe(true);
  });

  it('uses redis when the connection succeeds', async () => {
    const client = fakeRedisClient();
    const cache = await createCache({
      redisUrl: 'redis://localhost:6379',
      logger: { info() {}, warn() {} },
      connect: async () => client
    });
    expect(cache.backend).toBe('redis');
  });

  it('uses memory when no redis url is configured', async () => {
    const cache = await createCache({ redisUrl: '', ttlSeconds: 9 });
    expect(cache.backend).toBe('memory');
    expect(cache.stats().ttlSeconds).toBe(9);
  });
});

describe('cacheable paths', () => {
  it('allows only read-only snapshot endpoints', () => {
    expect(isCacheablePath('/api/state')).toBe(true);
    expect(isCacheablePath('/api/devices')).toBe(true);
    expect(isCacheablePath('/api/ai/manual')).toBe(true);
    expect(isCacheablePath('/api/cache/stats')).toBe(false);
    expect(isCacheablePath('/api/tokens')).toBe(false);
    expect(isCacheablePath('/api/settings')).toBe(false);
  });
});
