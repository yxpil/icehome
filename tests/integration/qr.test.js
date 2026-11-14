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

describe('配置二维码', () => {
  it('导出完整配置，排除账户、令牌与事件', async () => {
    const res = await ctx.api.get('/api/qr/config').set(ctx.auth).expect(200);
    expect(res.body.payload).toMatch(/^icehome:\/\/config\?gz=/);
    expect(res.body.qrPayload).toMatch(/^https?:\/\/.+\/api\/config\/export\//);
    expect(res.body.qrPayload.length).toBeLessThan(200);
    expect(res.body.qr).toBeTruthy();
    expect(res.body.config.schema).toBe('icehome.config/1');
    expect(res.body.config.devices.length).toBe(10);
    expect(res.body.config.devices[0].adapter).toBeDefined();
    expect(res.body.config.settings.wifi.ssid).toContain('ICEHOME');
    expect(res.body.config).not.toHaveProperty('users');
    expect(res.body.config).not.toHaveProperty('tokens');
    expect(res.body.config).not.toHaveProperty('events');
    expect(res.body.stats.bytes).toBeGreaterThan(0);
    expect(res.body.qrSupported).toBe(true);

    const downloadPath = new URL(res.body.qrPayload).pathname;
    const download = await ctx.api.get(downloadPath).expect(200);
    expect(download.headers['content-disposition']).toContain('icehome-config-');
    expect(download.body.schema).toBe('icehome.config/1');
    expect(download.body).not.toHaveProperty('users');
  });

  it('成员不能读取配置二维码', async () => {
    const session = await login('family');
    await ctx.api.get('/api/qr/config').set('Authorization', `Bearer ${session.body.token}`).expect(403);
  });
});

describe('Wi-Fi 二维码与设置', () => {
  it('读取标准 Wi-Fi 二维码并在保存后更新', async () => {
    const initial = await ctx.api.get('/api/qr/wifi').set(ctx.auth).expect(200);
    expect(initial.body.payload).toMatch(/^WIFI:T:WPA;S:/);
    expect(initial.body.qr).toBeTruthy();

    await ctx.api
      .patch('/api/settings')
      .set(ctx.auth)
      .send({ wifi: { ssid: 'Lab;5G', password: 'p:a,ss\\word', security: 'WPA', hidden: true } })
      .expect(200);

    const updated = await ctx.api.get('/api/qr/wifi').set(ctx.auth).expect(200);
    expect(updated.body.wifi).toMatchObject({ ssid: 'Lab;5G', security: 'WPA', hidden: true });
    expect(updated.body.payload).toBe('WIFI:T:WPA;S:Lab\\;5G;P:p\\:a\\,ss\\\\word;H:true;;');
  });

  it('拒绝缺失口令与非法加密方式', async () => {
    await ctx.api
      .patch('/api/settings')
      .set(ctx.auth)
      .send({ wifi: { ssid: 'Home', password: '', security: 'WPA' } })
      .expect(400);
    await ctx.api
      .patch('/api/settings')
      .set(ctx.auth)
      .send({ wifi: { ssid: 'Home', password: 'x', security: 'WPA3' } })
      .expect(400);
  });

  it('成员状态快照不包含 Wi-Fi 口令', async () => {
    const session = await login('family');
    const state = await ctx.api.get('/api/state').set('Authorization', `Bearer ${session.body.token}`).expect(200);
    expect(state.body.settings.wifi.ssid).toBeTruthy();
    expect(state.body.settings.wifi.password).toBeUndefined();
    expect(state.body.settings.wifi.hasPassword).toBe(true);
  });
});

describe('设备标签与巡检', () => {
    it('管理员拿到全部标签，成员只拿到授权设备标签', async () => {
    const admin = await ctx.api.get('/api/qr/devices').set(ctx.auth).expect(200);
    expect(admin.body.labels).toHaveLength(10);
    expect(admin.body.labels[0].payload).toMatch(/^icehome:\/\/device\?id=/);

    const session = await login('family');
    const member = await ctx.api
      .get('/api/qr/devices')
      .set('Authorization', `Bearer ${session.body.token}`)
      .expect(200);
    expect(member.body.labels).toHaveLength(3);
  });

  it('巡检记录按设备权限隔离，扫码可识别设备标签', async () => {
    const deviceId = ctx.store.data.devices[0].id;
    const created = await ctx.api
      .post('/api/inspections')
      .set(ctx.auth)
      .send({ deviceId, status: 'ok', note: '指示灯正常' })
      .expect(201);
    expect(created.body.inspection).toMatchObject({ deviceId, status: 'ok', by: '本地面板令牌' });

    const scanned = await ctx.api
      .post('/api/inspections/scan')
      .set(ctx.auth)
      .send({ code: `icehome://device?id=${deviceId}`, status: 'issue', note: '需要清洁' })
      .expect(201);
    expect(scanned.body.inspection.deviceId).toBe(deviceId);

    await ctx.api
      .post('/api/inspections/scan')
      .set(ctx.auth)
      .send({ code: 'https://example.com', status: 'ok' })
      .expect(400);

    const session = await login('family');
    const memberHeaders = { Authorization: `Bearer ${session.body.token}` };
    await ctx.api
      .post('/api/inspections')
      .set(ctx.auth)
      .send({ deviceId: ctx.store.data.devices[1].id, status: 'ok', note: '未授权设备巡检' })
      .expect(201);
    await ctx.api
      .post('/api/inspections')
      .set(memberHeaders)
      .send({ deviceId, status: 'ok' })
      .expect(201);
    await ctx.api
      .post('/api/inspections')
      .set(memberHeaders)
      .send({ deviceId: ctx.store.data.devices[1].id, status: 'ok' })
      .expect(403);

    const memberState = await ctx.api.get('/api/state').set(memberHeaders).expect(200);
    expect(memberState.body.inspections.every((item) => item.deviceId === deviceId)).toBe(true);
    expect(
      memberState.body.events.some((event) => event.type === 'inspection' && event.meta?.deviceId === ctx.store.data.devices[1].id)
    ).toBe(false);
  });

  it('拒绝未知巡检状态', async () => {
    await ctx.api
      .post('/api/inspections')
      .set(ctx.auth)
      .send({ deviceId: ctx.store.data.devices[0].id, status: 'unknown' })
      .expect(400);
  });
});

describe('网络信息与扫描边界', () => {
  it('管理员可读取网卡信息，成员不可访问', async () => {
    const res = await ctx.api.get('/api/network').set(ctx.auth).expect(200);
    expect(res.body.defaultPorts).toEqual([80, 443, 8080, 8123, 8787, 1883, 554]);
    expect(res.body.suggestedCidr).toMatch(/^\d{1,3}(\.\d{1,3}){2}\.0\/24$/);

    const session = await login('family');
    await ctx.api.get('/api/network').set('Authorization', `Bearer ${session.body.token}`).expect(403);
  });

  it('拒绝公网网段与非法端口', async () => {
    await ctx.api.post('/api/network/scan').set(ctx.auth).send({ cidr: '8.8.8.0/24' }).expect(400);
    await ctx.api.post('/api/network/scan').set(ctx.auth).send({ cidr: '192.168.1.0/24', ports: [0] }).expect(400);
  });
});
