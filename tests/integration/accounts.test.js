import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext } from '../helpers.js';

let ctx;

beforeEach(() => {
  ctx = createTestContext();
});

afterEach(() => ctx.cleanup());

async function login(username, password = 'icehome') {
  return ctx.api.post('/api/auth/login').send({ username, password });
}

describe('账户登录与会话', () => {
  it('管理员用用户名与口令登录，返回 Bearer 令牌', async () => {
    const res = await login('admin');
    expect(res.status).toBe(200);
    expect(res.body.token).toMatch(/^sk-ice-/);
    expect(res.body.user).toMatchObject({ username: 'admin', role: 'admin' });
    expect(res.body.user.passwordHash).toBeUndefined();

    const me = await ctx.api.get('/api/auth/me').set('Authorization', `Bearer ${res.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.account.role).toBe('admin');
    expect(me.body.token.name).toContain('登录会话');
  });

  it('错误口令返回 401，停用账户返回 403', async () => {
    expect((await login('admin', 'wrong-pass')).status).toBe(401);
    ctx.store.data.users.find((user) => user.username === 'family').active = false;
    expect((await login('family')).status).toBe(403);
  });

  it('登出后当前令牌立即失效', async () => {
    const res = await login('family');
    const token = res.body.token;
    await ctx.api.post('/api/auth/logout').set('Authorization', `Bearer ${token}`).expect(200);
    await ctx.api.get('/api/state').set('Authorization', `Bearer ${token}`).expect(401);
  });

  it('成员只能看到被授权的设备，统计同步裁剪', async () => {
    const res = await login('family');
    const family = ctx.store.data.users.find((user) => user.username === 'family');
    const token = res.body.token;
    const state = await ctx.api.get('/api/state').set('Authorization', `Bearer ${token}`).expect(200);
    expect(state.body.account.role).toBe('member');
    expect(state.body.devices).toHaveLength(family.deviceIds.length);
    expect(state.body.stats.counts.devices).toBe(state.body.devices.length);
    expect(state.body.tasks.every((task) => family.deviceIds.includes(task.deviceId))).toBe(true);
    expect(state.body.tokens).toEqual([]);

    const list = await ctx.api.get('/api/devices').set('Authorization', `Bearer ${token}`).expect(200);
    expect(list.body.devices).toHaveLength(family.deviceIds.length);

    const forbidden = await ctx.api
      .get(`/api/devices/${ctx.store.data.devices[1].id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe('device_forbidden');
  });

  it('成员可控制授权设备，不能控制未授权设备或做结构管理', async () => {
    const res = await login('family');
    const token = res.body.token;
    const granted = await ctx.api
      .post(`/api/devices/${ctx.store.data.devices[0].id}/actions`)
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'turn_off', payload: {} })
      .expect(200);
    expect(granted.body.device.state.power).toBe('off');

    const denied = await ctx.api
      .post(`/api/devices/${ctx.store.data.devices[1].id}/actions`)
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'turn_on', payload: {} });
    expect(denied.status).toBe(403);

    await ctx.api
      .post('/api/devices')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '成员不该创建的设备', template: 'light' })
      .expect(403);
    await ctx.api
      .patch(`/api/devices/${ctx.store.data.devices[0].id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '改名' })
      .expect(403);
  });
});

describe('账户管理与设备授权', () => {
  it('管理员可创建账户，公开字段不含口令散列', async () => {
    const created = await ctx.api
      .post('/api/users')
      .set(ctx.auth)
      .send({ username: 'study', displayName: '书房成员', password: 'secret1', role: 'member', deviceIds: [ctx.store.data.devices[0].id] })
      .expect(201);
    expect(created.body.user.username).toBe('study');
    expect(created.body.user.passwordHash).toBeUndefined();
    expect(created.body.user.deviceIds).toHaveLength(1);

    const list = await ctx.api.get('/api/users').set(ctx.auth).expect(200);
    expect(list.body.users.some((user) => user.username === 'study')).toBe(true);
    expect(list.body.users.every((user) => user.passwordHash === undefined)).toBe(true);

    expect(await login('study', 'secret1')).toMatchObject({ status: 200 });
  });

  it('grants 支持 add / replace / remove，并立即影响新会话', async () => {
    const family = ctx.store.data.users.find((user) => user.username === 'family');
    const first = ctx.store.data.devices[0].id;
    const second = ctx.store.data.devices[1].id;

    await ctx.api.post(`/api/users/${family.id}/grants`).set(ctx.auth).send({ deviceIds: [second], mode: 'add' }).expect(200);
    expect(family.deviceIds).toContain(second);

    const replaced = await ctx.api
      .post(`/api/users/${family.id}/grants`)
      .set(ctx.auth)
      .send({ deviceIds: [first], mode: 'replace' })
      .expect(200);
    expect(replaced.body.user.deviceIds).toEqual([first]);
    expect(replaced.body.removed).toContain(second);

    await ctx.api.post(`/api/users/${family.id}/grants`).set(ctx.auth).send({ deviceIds: [first], mode: 'remove' }).expect(200);
    expect(family.deviceIds).toEqual([]);

    const session = await login('family');
    const state = await ctx.api.get('/api/state').set('Authorization', `Bearer ${session.body.token}`).expect(200);
    expect(state.body.devices).toHaveLength(0);
  });

  it('管理员账户无需设备授权，最后一个管理员不能被降级或停用', async () => {
    const admin = ctx.store.data.users.find((user) => user.username === 'admin');
    const grant = await ctx.api.post(`/api/users/${admin.id}/grants`).set(ctx.auth).send({ deviceIds: [ctx.store.data.devices[0].id] });
    expect(grant.status).toBe(400);

    await ctx.api.patch(`/api/users/${admin.id}`).set(ctx.auth).send({ role: 'member' }).expect(400);
    await ctx.api.patch(`/api/users/${admin.id}`).set(ctx.auth).send({ active: false }).expect(400);
    await ctx.api.delete(`/api/users/${admin.id}`).set(ctx.auth).expect(400);
  });

  it('停用账户会让已有登录令牌立即失效', async () => {
    const family = ctx.store.data.users.find((user) => user.username === 'family');
    const session = await login('family');
    const token = session.body.token;
    await ctx.api.patch(`/api/users/${family.id}`).set(ctx.auth).send({ active: false }).expect(200);
    const res = await ctx.api.get('/api/state').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('account_disabled');
  });

  it('成员不能访问账户管理接口', async () => {
    const session = await login('family');
    await ctx.api.get('/api/users').set('Authorization', `Bearer ${session.body.token}`).expect(403);
    await ctx.api
      .post('/api/users')
      .set('Authorization', `Bearer ${session.body.token}`)
      .send({ username: 'x', password: 'secret1' })
      .expect(403);
  });
});

