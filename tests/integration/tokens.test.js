import { describe, it, expect, afterEach } from 'vitest';
import { createTestContext } from '../helpers.js';

let ctx;
afterEach(() => {
  ctx?.cleanup();
  ctx = null;
});

describe('令牌管理', () => {
  it('签发令牌时返回完整密钥，列表只给掩码', async () => {
    ctx = createTestContext();
    const res = await ctx.api
      .post('/api/tokens')
      .set(ctx.auth)
      .send({ name: '脚本令牌', scopes: ['device:read', 'ai:use'], note: '给自动化用' });
    expect(res.status).toBe(201);
    expect(res.body.key).toMatch(/^sk-ice-[a-z0-9]{32}$/);
    expect(res.body.token.key).toBeUndefined();
    expect(res.body.token.prefix).toContain('*');

    const list = await ctx.api.get('/api/tokens').set(ctx.auth);
    expect(list.body.tokens.some((token) => token.key)).toBe(false);
    expect(list.body.tokens.find((token) => token.name === '脚本令牌').scopes).toEqual(['device:read', 'ai:use']);
  });

  it('新令牌可读取设备但缺少写权限', async () => {
    ctx = createTestContext();
    const issued = await ctx.api.post('/api/tokens').set(ctx.auth).send({ name: '只读', scopes: ['device:read'] });
    const read = await ctx.api.get('/api/devices').set('Authorization', `Bearer ${issued.body.key}`);
    expect(read.status).toBe(200);
    const write = await ctx.api
      .post('/api/devices/dev_test/actions')
      .set('Authorization', `Bearer ${issued.body.key}`)
      .send({ action: 'turn_on' });
    expect(write.status).toBe(403);
  });

  it('吊销后令牌立即失效，可恢复', async () => {
    ctx = createTestContext();
    const issued = await ctx.api.post('/api/tokens').set(ctx.auth).send({ name: '临时', scopes: ['device:read'] });
    const revoke = await ctx.api.patch(`/api/tokens/${issued.body.token.id}`).set(ctx.auth).send({ revoked: true });
    expect(revoke.body.token.revoked).toBe(true);
    const denied = await ctx.api.get('/api/devices').set('Authorization', `Bearer ${issued.body.key}`);
    expect(denied.status).toBe(401);
    expect(denied.body.error.code).toBe('invalid_token');
    const restore = await ctx.api.patch(`/api/tokens/${issued.body.token.id}`).set(ctx.auth).send({ revoked: false });
    expect(restore.body.token.revoked).toBe(false);
    const allowed = await ctx.api.get('/api/devices').set('Authorization', `Bearer ${issued.body.key}`);
    expect(allowed.status).toBe(200);
  });

  it('不能删除当前正在使用的令牌', async () => {
    ctx = createTestContext();
    const res = await ctx.api.delete(`/api/tokens/${ctx.token.id}`).set(ctx.auth);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('不能删除当前正在使用的令牌');
  });

  it('可以删除其他令牌，非法 scope 被拒绝', async () => {
    ctx = createTestContext();
    const issued = await ctx.api.post('/api/tokens').set(ctx.auth).send({ name: '待删', scopes: ['device:read'] });
    const res = await ctx.api.delete(`/api/tokens/${issued.body.token.id}`).set(ctx.auth);
    expect(res.status).toBe(200);
    const bad = await ctx.api.post('/api/tokens').set(ctx.auth).send({ name: '非法', scopes: ['root'] });
    expect(bad.status).toBe(400);
  });

  it('调用会累计计数与最后使用时间', async () => {
    ctx = createTestContext();
    await ctx.api.get('/api/devices').set(ctx.auth);
    await ctx.api.get('/api/devices').set(ctx.auth);
    const list = await ctx.api.get('/api/tokens').set(ctx.auth);
    const self = list.body.tokens.find((token) => token.name === '本地面板');
    expect(self.requestCount).toBeGreaterThanOrEqual(3);
    expect(self.lastUsedAt).toBeTruthy();
  });
});

describe('分类管理', () => {
  it('创建、更新与删除分类', async () => {
    ctx = createTestContext();
    const created = await ctx.api
      .post('/api/categories')
      .set(ctx.auth)
      .send({ name: '书房', icon: 'book', description: '阅读区' });
    expect(created.status).toBe(201);
    expect(created.body.category.order).toBeGreaterThan(0);

    const dup = await ctx.api.post('/api/categories').set(ctx.auth).send({ name: '书房' });
    expect(dup.status).toBe(409);

    const patch = await ctx.api.patch(`/api/categories/${created.body.category.id}`).set(ctx.auth).send({ name: '书房与阳台' });
    expect(patch.body.category.name).toBe('书房与阳台');

    const device = ctx.store.data.devices[0];
    await ctx.api.patch(`/api/devices/${device.id}`).set(ctx.auth).send({ categoryId: created.body.category.id });
    const removed = await ctx.api.delete(`/api/categories/${created.body.category.id}`).set(ctx.auth);
    expect(removed.status).toBe(200);
    expect(removed.body.orphanDevices).toBeGreaterThanOrEqual(1);
    expect(ctx.store.data.devices.find((item) => item.id === device.id).categoryId).toBeNull();
  });

  it('缺少名称返回 400', async () => {
    ctx = createTestContext();
    const res = await ctx.api.post('/api/categories').set(ctx.auth).send({ name: '   ' });
    expect(res.status).toBe(400);
  });
});

describe('设置项', () => {
  it('修改家庭名称并关闭本机自动签发', async () => {
    ctx = createTestContext();
    const res = await ctx.api.patch('/api/settings').set(ctx.auth).send({ homeName: '云上小屋', allowLocalBootstrap: false });
    expect(res.status).toBe(200);
    expect(res.body.settings.homeName).toBe('云上小屋');
    const bootstrap = await ctx.api.post('/api/auth/bootstrap');
    expect(bootstrap.status).toBe(403);
  });

  it('空家庭名称被拒绝', async () => {
    ctx = createTestContext();
    const res = await ctx.api.patch('/api/settings').set(ctx.auth).send({ homeName: ' ' });
    expect(res.status).toBe(400);
  });
});
