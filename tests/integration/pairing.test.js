import { describe, it, expect, afterEach } from 'vitest';
import { createTestContext } from '../helpers.js';

let ctx;
let second;
afterEach(() => {
  ctx?.cleanup();
  second?.cleanup();
  ctx = null;
  second = null;
});

describe('配对流程', () => {
  it('生成配对码与二维码', async () => {
    ctx = createTestContext();
    const res = await ctx.api
      .post('/api/pairing')
      .set(ctx.auth)
      .send({ deviceName: '书房台灯', template: 'light', categoryId: 'cat_living' });
    expect(res.status).toBe(201);
    expect(res.body.pairing.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(res.body.qr.startsWith('<svg')).toBe(true);
    expect(res.body.payload).toContain('icehome://pair?code=');
    expect(res.body.pairing.status).toBe('pending');
    const list = await ctx.api.get('/api/pairing').set(ctx.auth);
    expect(list.body.pairings[0].code).toBe(res.body.pairing.code);
  });

  it('批准后生成设备并入分类', async () => {
    ctx = createTestContext();
    const start = await ctx.api
      .post('/api/pairing')
      .set(ctx.auth)
      .send({ deviceName: '阳台灯', template: 'light', categoryId: 'cat_living' });
    const approve = await ctx.api.post(`/api/pairing/${start.body.pairing.code}/approve`).set(ctx.auth).send({});
    expect(approve.status).toBe(200);
    expect(approve.body.device.name).toBe('阳台灯');
    expect(approve.body.device.source).toBe('pairing');
    expect(approve.body.device.categoryId).toBe('cat_living');
    expect(approve.body.pairing.status).toBe('approved');

    const duplicate = await ctx.api.post(`/api/pairing/${start.body.pairing.code}/approve`).set(ctx.auth).send({});
    expect(duplicate.status).toBe(409);
  });

  it('拒绝配对不会创建设备', async () => {
    ctx = createTestContext();
    const start = await ctx.api
      .post('/api/pairing')
      .set(ctx.auth)
      .send({ deviceName: '可疑设备', template: 'custom' });
    const before = ctx.store.data.devices.length;
    const reject = await ctx.api.post(`/api/pairing/${start.body.pairing.code}/reject`).set(ctx.auth).send({});
    expect(reject.status).toBe(200);
    expect(reject.body.pairing.status).toBe('rejected');
    expect(ctx.store.data.devices.length).toBe(before);
  });

  it('设备名必填', async () => {
    ctx = createTestContext();
    const res = await ctx.api.post('/api/pairing').set(ctx.auth).send({ deviceName: '  ' });
    expect(res.status).toBe(400);
  });
});

describe('插件系统', () => {
  it('安装插件后贡献设备模板', async () => {
    ctx = createTestContext();
    const res = await ctx.api
      .post('/api/plugins')
      .set(ctx.auth)
      .send({
        name: '书房阅读模式',
        version: '1.0.0',
        description: '提供阅读灯模板',
        icon: 'book',
        templates: [{ key: 'reading_lamp', name: '阅读灯', icon: 'bulb', capabilities: ['power', 'brightness'] }],
        hooks: [{ on: 'device.state', action: 'notify' }]
      });
    expect(res.status).toBe(201);
    const state = await ctx.api.get('/api/state').set(ctx.auth);
    expect(state.body.templates.some((item) => item.label === '阅读灯')).toBe(true);
    expect(state.body.plugins.some((plugin) => plugin.name === '书房阅读模式')).toBe(true);

    const device = await ctx.api
      .post('/api/devices')
      .set(ctx.auth)
      .send({ name: '阅读灯', template: 'reading_lamp' });
    expect(device.status).toBe(201);
    expect(device.body.device.capabilities).toEqual(['power', 'brightness']);
  });

  it('停用插件后模板消失，卸载后移除记录', async () => {
    ctx = createTestContext();
    const installed = await ctx.api
      .post('/api/plugins')
      .set(ctx.auth)
      .send({ name: '临时插件', templates: [{ key: 'tmp_tpl', name: '临时模板', capabilities: ['power'] }] });
    const pluginId = installed.body.plugin.id;
    await ctx.api.patch(`/api/plugins/${pluginId}`).set(ctx.auth).send({ enabled: false });
    let state = await ctx.api.get('/api/state').set(ctx.auth);
    expect(state.body.templates.some((item) => item.label === '临时模板')).toBe(false);
    await ctx.api.patch(`/api/plugins/${pluginId}`).set(ctx.auth).send({ enabled: true });
    state = await ctx.api.get('/api/state').set(ctx.auth);
    expect(state.body.templates.some((item) => item.label === '临时模板')).toBe(true);
    const removed = await ctx.api.delete(`/api/plugins/${pluginId}`).set(ctx.auth);
    expect(removed.status).toBe(200);
  });

  it('插件名称必填', async () => {
    ctx = createTestContext();
    const res = await ctx.api.post('/api/plugins').set(ctx.auth).send({ name: '' });
    expect(res.status).toBe(400);
  });
});

describe('导入导出', () => {
  it('导出二维码，再导入到另一套面板', async () => {
    ctx = createTestContext();
    const exported = await ctx.api.get('/api/export').set(ctx.auth);
    expect(exported.status).toBe(200);
    expect(exported.body.qr.startsWith('<svg')).toBe(true);
    expect(exported.body.payload).toContain('icehome://import?payload=');
    expect(exported.body.bundle.devices.length).toBe(ctx.store.data.devices.length);

    second = createTestContext();
    const before = second.store.data.devices.length;
    const imported = await second.api.post('/api/import').set(second.auth).send({ payload: exported.body.payload });
    expect(imported.status).toBe(200);
    expect(imported.body.count).toBe(exported.body.bundle.devices.length);
    expect(second.store.data.devices.length).toBe(before + imported.body.count);
    const importedLight = second.store.data.devices.find((device) => device.name === '客厅主灯');
    expect(importedLight.categoryId).toBe('cat_living');
  });

  it('导入内容非法时返回 400', async () => {
    ctx = createTestContext();
    const res = await ctx.api.post('/api/import').set(ctx.auth).send({ payload: 'not-a-valid-payload' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
    const empty = await ctx.api.post('/api/import').set(ctx.auth).send({});
    expect(empty.status).toBe(400);
  });

  it('导入缺少 devices 字段被拒绝', async () => {
    ctx = createTestContext();
    const encoded = Buffer.from(JSON.stringify({ foo: 1 }), 'utf8').toString('base64url');
    const res = await ctx.api.post('/api/import').set(ctx.auth).send({ payload: encoded });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('devices');
  });
});
