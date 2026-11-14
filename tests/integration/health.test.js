import { describe, it, expect, afterEach } from 'vitest';
import { createTestContext } from '../helpers.js';

let ctx;
afterEach(() => ctx?.cleanup());

describe('服务健康与鉴权', () => {
  it('健康检查无需令牌', async () => {
    ctx = createTestContext();
    const res = await ctx.api.get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.version).toBe('1.0.0');
  });

  it('缺少令牌返回 401 unauthorized', async () => {
    ctx = createTestContext();
    const res = await ctx.api.get('/api/state');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('unauthorized');
  });

  it('伪造令牌返回 401 invalid_token', async () => {
    ctx = createTestContext();
    const res = await ctx.api.get('/api/state').set('Authorization', 'Bearer sk-ice-not-a-real-key');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('invalid_token');
  });

  it('只读令牌无法执行写操作', async () => {
    ctx = createTestContext();
    const readToken = ctx.makeToken(['device:read']);
    const res = await ctx.api
      .post('/api/devices')
      .set('Authorization', `Bearer ${readToken.key}`)
      .send({ name: '越权设备', template: 'light' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('forbidden');
  });

  it('只读令牌无法访问令牌管理接口', async () => {
    ctx = createTestContext();
    const readToken = ctx.makeToken(['device:read']);
    const res = await ctx.api.get('/api/tokens').set('Authorization', `Bearer ${readToken.key}`);
    expect(res.status).toBe(403);
  });

  it('本机可自动签发面板令牌', async () => {
    ctx = createTestContext();
    const res = await ctx.api.post('/api/auth/bootstrap');
    expect(res.status).toBe(200);
    expect(res.body.token).toMatch(/^sk-ice-/);
  });
});

describe('状态快照', () => {
  it('返回设备、分类、任务、模板与统计', async () => {
    ctx = createTestContext();
    const res = await ctx.api.get('/api/state').set(ctx.auth);
    expect(res.status).toBe(200);
    expect(res.body.devices.length).toBeGreaterThan(5);
    expect(res.body.categories.length).toBeGreaterThan(2);
    expect(res.body.templates.some((item) => item.key === 'light')).toBe(true);
    expect(res.body.stats.counts.devices).toBe(res.body.devices.length);
    expect(res.body.devices[0].capabilities).toContain('power');
  });

  it('令牌列表不泄露完整密钥', async () => {
    ctx = createTestContext();
    const res = await ctx.api.get('/api/state').set(ctx.auth);
    const token = res.body.tokens[0];
    expect(token.key).toBeUndefined();
    expect(token.prefix).toContain('*');
  });
});
