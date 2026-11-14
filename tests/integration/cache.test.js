import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, firstDevice } from '../helpers.js';

let ctx;

async function enableCache(ttlSeconds = 5) {
  await ctx.api
    .patch('/api/settings')
    .set(ctx.auth)
    .send({ cache: { enabled: true, ttlSeconds } })
    .expect(200);
}

beforeEach(() => {
  ctx = createTestContext();
});

afterEach(() => {
  ctx.cleanup();
});

describe('页面缓存中间件', () => {
  it('关闭时不给响应打缓存标记', async () => {
    const res = await ctx.api.get('/api/state').set(ctx.auth).expect(200);
    expect(res.headers['x-cache']).toBeUndefined();
  });

  it('开启后同一请求第二次命中缓存', async () => {
    await enableCache();
    const first = await ctx.api.get('/api/state').set(ctx.auth).expect(200);
    expect(first.headers['x-cache']).toBe('MISS');
    const second = await ctx.api.get('/api/state').set(ctx.auth).expect(200);
    expect(second.headers['x-cache']).toBe('HIT');
    expect(second.body.stats.counts.devices).toBe(first.body.stats.counts.devices);
  });

  it('写操作成功后自动失效缓存', async () => {
    await enableCache();
    await ctx.api.get('/api/state').set(ctx.auth).expect(200);
    await ctx.api.get('/api/state').set(ctx.auth).expect(200);
    const device = firstDevice(ctx.store);
    await ctx.api
      .post(`/api/devices/${device.id}/actions`)
      .set(ctx.auth)
      .send({ action: 'toggle', payload: {} })
      .expect(200);
    const res = await ctx.api.get('/api/state').set(ctx.auth).expect(200);
    expect(res.headers['x-cache']).toBe('MISS');
  });

  it('Cache-Control: no-cache 绕过缓存', async () => {
    await enableCache();
    await ctx.api.get('/api/state').set(ctx.auth).expect(200);
    const res = await ctx.api.get('/api/state').set(ctx.headers({ 'Cache-Control': 'no-cache' })).expect(200);
    expect(res.headers['x-cache']).toBe('BYPASS');
  });

  it('手动清空缓存后重新回源', async () => {
    await enableCache();
    await ctx.api.get('/api/state').set(ctx.auth).expect(200);
    await ctx.api.get('/api/state').set(ctx.auth).expect(200);
    await ctx.api.post('/api/cache/purge').set(ctx.auth).expect(200);
    const res = await ctx.api.get('/api/state').set(ctx.auth).expect(200);
    expect(res.headers['x-cache']).toBe('MISS');
  });

  it('不缓存令牌与控制类接口', async () => {
    await enableCache();
    const res = await ctx.api.get('/api/cache/stats').set(ctx.auth).expect(200);
    expect(res.headers['x-cache']).toBeUndefined();
    expect(res.body.cache.backend).toBe('memory');
  });

  it('缓存键按令牌隔离', async () => {
    await enableCache();
    await ctx.api.get('/api/state').set(ctx.auth).expect(200);
    const readToken = ctx.makeToken(['device:read'], '只读令牌');
    const res = await ctx.api
      .get('/api/state')
      .set({ Authorization: `Bearer ${readToken.key}` })
      .expect(200);
    expect(res.headers['x-cache']).toBe('MISS');
  });
});
