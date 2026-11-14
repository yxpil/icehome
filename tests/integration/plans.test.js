import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext } from '../helpers.js';

let ctx;

beforeEach(() => {
  ctx = createTestContext();
});

afterEach(() => ctx.cleanup());

describe('家居平面图', () => {
  it('种子提供一张带房间与设备标记的平面图', async () => {
    const res = await ctx.api.get('/api/plans').set(ctx.auth).expect(200);
    expect(res.body.plans).toHaveLength(1);
    expect(res.body.plans[0].rooms.length).toBeGreaterThan(2);
    expect(res.body.plans[0].markers.length).toBe(ctx.store.data.devices.length);
  });

  it('管理员可以新增房间、移动设备标记并保存', async () => {
    const plan = ctx.store.data.plans[0];
    const deviceId = ctx.store.data.devices[0].id;
    const patch = await ctx.api
      .patch(`/api/plans/${plan.id}`)
      .set(ctx.auth)
      .send({
        rooms: [...plan.rooms, { id: 'room_study', name: '书房', x: 700, y: 430, w: 180, h: 160 }],
        markers: [{ deviceId, x: 760, y: 500 }]
      })
      .expect(200);
    expect(patch.body.plan.rooms.some((room) => room.name === '书房')).toBe(true);
    expect(patch.body.plan.markers).toEqual([{ deviceId, x: 760, y: 500 }]);
  });

  it('拒绝不存在的设备、重复标记与越界坐标', async () => {
    const plan = ctx.store.data.plans[0];
    const deviceId = ctx.store.data.devices[0].id;

    const missing = await ctx.api
      .patch(`/api/plans/${plan.id}`)
      .set(ctx.auth)
      .send({ markers: [{ deviceId: 'dev_nope', x: 100, y: 100 }] });
    expect(missing.status).toBe(400);
    expect(missing.body.error.message).toContain('设备不存在');

    const duplicate = await ctx.api
      .patch(`/api/plans/${plan.id}`)
      .set(ctx.auth)
      .send({ markers: [{ deviceId, x: 100, y: 100 }, { deviceId, x: 120, y: 120 }] });
    expect(duplicate.status).toBe(400);

    const outside = await ctx.api
      .patch(`/api/plans/${plan.id}`)
      .set(ctx.auth)
      .send({ markers: [{ deviceId, x: 5000, y: 100 }] });
    expect(outside.status).toBe(400);
    expect(outside.body.error.message).toContain('边界');
  });

  it('成员只能看到已授权设备的标记，且不能编辑平面图', async () => {
    const login = await ctx.api.post('/api/auth/login').send({ username: 'family', password: 'icehome' }).expect(200);
    const token = login.body.token;
    const family = ctx.store.data.users.find((user) => user.username === 'family');
    const res = await ctx.api.get('/api/plans').set('Authorization', `Bearer ${token}`).expect(200);
    expect(res.body.plans[0].markers).toHaveLength(family.deviceIds.length);
    expect(res.body.plans[0].markers.every((marker) => family.deviceIds.includes(marker.deviceId))).toBe(true);

    await ctx.api
      .patch(`/api/plans/${ctx.store.data.plans[0].id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '成员改的平面' })
      .expect(403);
  });

  it('框选后按设备集合授权：grants replace 与平面标记联动', async () => {
    const family = ctx.store.data.users.find((user) => user.username === 'family');
    const boxed = ctx.store.data.devices.slice(0, 2).map((device) => device.id);
    const res = await ctx.api
      .post(`/api/users/${family.id}/grants`)
      .set(ctx.auth)
      .send({ deviceIds: boxed, mode: 'replace' })
      .expect(200);
    expect(res.body.user.deviceIds).toEqual(boxed);

    const login = await ctx.api.post('/api/auth/login').send({ username: 'family', password: 'icehome' }).expect(200);
    const state = await ctx.api.get('/api/state').set('Authorization', `Bearer ${login.body.token}`).expect(200);
    const plan = state.body.plans[0];
    expect(plan.markers.map((marker) => marker.deviceId)).toEqual(boxed);
  });

  it('删除设备会级联清理平面标记与账户授权', async () => {
    const device = ctx.store.data.devices[0];
    const family = ctx.store.data.users.find((user) => user.username === 'family');
    expect(family.deviceIds).toContain(device.id);
    await ctx.api.delete(`/api/devices/${device.id}`).set(ctx.auth).expect(200);
    expect(family.deviceIds).not.toContain(device.id);
    expect(ctx.store.data.plans[0].markers.some((marker) => marker.deviceId === device.id)).toBe(false);
  });
});
