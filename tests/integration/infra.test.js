import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext } from '../helpers.js';

let ctx;

beforeEach(() => {
  ctx = createTestContext();
});

afterEach(() => {
  ctx.cleanup();
});

describe('基础设施快照', () => {
  it('在 /api/state 中暴露存储与缓存信息', async () => {
    const res = await ctx.api.get('/api/state').set(ctx.auth).expect(200);
    expect(res.body.infra.storage.driver).toBe('json');
    expect(res.body.infra.storage.connected).toBe(true);
    expect(res.body.infra.cache.backend).toBe('memory');
    expect(res.body.infra.staticServing).toBe(false);
  });

  it('在 /api/system 中给出存储状态与缓存统计', async () => {
    const res = await ctx.api.get('/api/system').set(ctx.auth).expect(200);
    expect(res.body.storage.driver).toBe('json');
    expect(res.body.cache.backend).toBe('memory');
    expect(res.body.cache.hits).toBeGreaterThanOrEqual(0);
  });

  it('可以测试当前存储连接', async () => {
    const res = await ctx.api.post('/api/system/storage/test').set(ctx.auth).expect(200);
    expect(res.body.result.ok).toBe(true);
    expect(res.body.status.driver).toBe('json');
  });

  it('测试存储连接需要 admin 权限', async () => {
    const readToken = ctx.makeToken(['device:read'], '只读令牌');
    await ctx.api
      .post('/api/system/storage/test')
      .set({ Authorization: `Bearer ${readToken.key}` })
      .expect(403);
  });
});

describe('缓存设置与统计', () => {
  it('默认关闭页面缓存', async () => {
    const res = await ctx.api.get('/api/cache/stats').set(ctx.auth).expect(200);
    expect(res.body.settings.enabled).toBe(false);
    expect(res.body.cache.backend).toBe('memory');
  });

  it('拒绝非法 TTL 并保存合法配置', async () => {
    await ctx.api
      .patch('/api/settings')
      .set(ctx.auth)
      .send({ cache: { enabled: true, ttlSeconds: 0 } })
      .expect(400);

    await ctx.api
      .patch('/api/settings')
      .set(ctx.auth)
      .send({ cache: { enabled: true, ttlSeconds: 121 } })
      .expect(400);

    const res = await ctx.api
      .patch('/api/settings')
      .set(ctx.auth)
      .send({ cache: { enabled: true, ttlSeconds: 30 } })
      .expect(200);
    expect(res.body.settings.cache).toEqual({ enabled: true, ttlSeconds: 30 });
  });

  it('清空缓存需要 admin 权限', async () => {
    const readToken = ctx.makeToken(['device:read'], '只读令牌');
    await ctx.api
      .post('/api/cache/purge')
      .set({ Authorization: `Bearer ${readToken.key}` })
      .expect(403);

    const res = await ctx.api.post('/api/cache/purge').set(ctx.auth).expect(200);
    expect(res.body.cleared).toBe(true);
    expect(res.body.cache.keys).toBe(0);
  });

  it('缓存统计需要身份认证', async () => {
    await ctx.api.get('/api/cache/stats').expect(401);
  });
});
