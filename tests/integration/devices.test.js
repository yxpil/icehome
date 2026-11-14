import { describe, it, expect, afterEach } from 'vitest';
import { createServer } from 'node:http';
import { createTestContext } from '../helpers.js';

let ctx;
afterEach(() => {
  ctx?.cleanup();
  ctx = null;
});

describe('设备 CRUD', () => {
  it('创建自定义设备并补齐默认状态', async () => {
    ctx = createTestContext();
    const res = await ctx.api
      .post('/api/devices')
      .set(ctx.auth)
      .send({ name: '书房台灯', template: 'light', categoryId: 'cat_living' });
    expect(res.status).toBe(201);
    expect(res.body.device.name).toBe('书房台灯');
    expect(res.body.device.capabilities).toEqual(['power', 'brightness', 'colorTemp']);
    expect(res.body.device.state.power).toBe('off');
    expect(res.body.device.state.brightness).toBeGreaterThan(0);
    expect(res.body.device.source).toBe('manual');
  });

  it('拒绝非法参数', async () => {
    ctx = createTestContext();
    const empty = await ctx.api.post('/api/devices').set(ctx.auth).send({ name: '  ' });
    expect(empty.status).toBe(400);
    expect(empty.body.error.code).toBe('validation_error');

    const badCap = await ctx.api.post('/api/devices').set(ctx.auth).send({ name: 'x', capabilities: ['plasma'] });
    expect(badCap.status).toBe(400);

    const badHttp = await ctx.api
      .post('/api/devices')
      .set(ctx.auth)
      .send({ name: '接口灯', adapter: { kind: 'http', url: '' } });
    expect(badHttp.status).toBe(400);

    const badState = await ctx.api
      .post('/api/devices')
      .set(ctx.auth)
      .send({ name: '灯', template: 'light', state: { brightness: 300 } });
    expect(badState.status).toBe(400);
  });

  it('读取单个设备与列表', async () => {
    ctx = createTestContext();
    const device = ctx.store.data.devices[0];
    const single = await ctx.api.get(`/api/devices/${device.id}`).set(ctx.auth);
    expect(single.status).toBe(200);
    expect(single.body.device.id).toBe(device.id);
    const missing = await ctx.api.get('/api/devices/dev_missing').set(ctx.auth);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('not_found');
  });

  it('更新名称、分类与能力', async () => {
    ctx = createTestContext();
    const device = ctx.store.data.devices.find((item) => item.template === 'light');
    const res = await ctx.api
      .patch(`/api/devices/${device.id}`)
      .set(ctx.auth)
      .send({ name: '客厅吊灯', capabilities: ['power', 'brightness'], categoryId: 'cat_bed' });
    expect(res.status).toBe(200);
    expect(res.body.device.name).toBe('客厅吊灯');
    expect(res.body.device.categoryId).toBe('cat_bed');
    expect(res.body.device.capabilities).toEqual(['power', 'brightness']);
    expect(res.body.device.state.colorTemp).toBeUndefined();
  });

  it('删除设备会级联移除其任务', async () => {
    ctx = createTestContext();
    const device = ctx.store.data.devices[0];
    const created = await ctx.api
      .post('/api/tasks')
      .set(ctx.auth)
      .send({
        name: '临时任务',
        deviceId: device.id,
        schedule: { kind: 'daily', at: '23:00' },
        action: { type: 'turn_off' }
      });
    expect(created.status).toBe(201);
    const res = await ctx.api.delete(`/api/devices/${device.id}`).set(ctx.auth);
    expect(res.status).toBe(200);
    const tasks = await ctx.api.get('/api/tasks').set(ctx.auth);
    expect(tasks.body.tasks.some((task) => task.deviceId === device.id)).toBe(false);
    const devices = await ctx.api.get('/api/devices').set(ctx.auth);
    expect(devices.body.devices.some((item) => item.id === device.id)).toBe(false);
  });
});

describe('设备动作', () => {
  it('开启、设置与切换会更新状态并记录事件', async () => {
    ctx = createTestContext();
    const device = ctx.store.data.devices.find((item) => item.template === 'light');
    const on = await ctx.api.post(`/api/devices/${device.id}/actions`).set(ctx.auth).send({ action: 'turn_on' });
    expect(on.status).toBe(200);
    expect(on.body.device.state.power).toBe('on');

    const set = await ctx.api
      .post(`/api/devices/${device.id}/actions`)
      .set(ctx.auth)
      .send({ action: 'set', payload: { brightness: 33, colorTemp: 2700 } });
    expect(set.status).toBe(200);
    expect(set.body.device.state.brightness).toBe(33);
    expect(set.body.device.state.colorTemp).toBe(2700);

    const toggle = await ctx.api.post(`/api/devices/${device.id}/actions`).set(ctx.auth).send({ action: 'toggle' });
    expect(toggle.body.device.state.power).toBe('off');

    const events = await ctx.api.get('/api/events?limit=10').set(ctx.auth);
    expect(events.body.events.some((event) => event.message.includes(device.name))).toBe(true);
  });

  it('拒绝未声明的能力与越界值', async () => {
    ctx = createTestContext();
    const switchDevice = ctx.store.data.devices.find((item) => item.template === 'plug');
    const res = await ctx.api
      .post(`/api/devices/${switchDevice.id}/actions`)
      .set(ctx.auth)
      .send({ action: 'set', payload: { brightness: 50 } });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('没有「brightness」能力');

    const overflow = await ctx.api
      .post(`/api/devices/${switchDevice.id}/actions`)
      .set(ctx.auth)
      .send({ action: 'set', payload: { powerW: 99999 } });
    expect(overflow.status).toBe(400);
  });

  it('未知动作返回 400', async () => {
    ctx = createTestContext();
    const device = ctx.store.data.devices[0];
    const res = await ctx.api
      .post(`/api/devices/${device.id}/actions`)
      .set(ctx.auth)
      .send({ action: 'explode' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('不支持的动作');
  });

  it('不存在的设备返回 404', async () => {
    ctx = createTestContext();
    const res = await ctx.api.post('/api/devices/dev_nope/actions').set(ctx.auth).send({ action: 'turn_on' });
    expect(res.status).toBe(404);
  });
});

describe('自定义 HTTP 接口适配器', () => {
  it('探测接口并在动作写回时发出请求', async () => {
    ctx = createTestContext();
    let received = [];
    const server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        received.push({ method: req.method, url: req.url, body });
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: true, data: { power: 'on', brightness: 77 } }));
      });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    const created = await ctx.api
      .post('/api/devices')
      .set(ctx.auth)
      .send({
        name: '接口灯',
        template: 'light',
        adapter: {
          kind: 'http',
          url: `http://127.0.0.1:${port}/light/{{device.id}}`,
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{"power":"{{state.power}}","brightness":{{state.brightness}}}',
          write: true,
          readPath: 'data'
        }
      });
    expect(created.status).toBe(201);
    const device = created.body.device;

    const probe = await ctx.api.post(`/api/devices/${device.id}/probe`).set(ctx.auth);
    expect(probe.status).toBe(200);
    expect(probe.body.result.ok).toBe(true);
    expect(probe.body.result.status).toBe(200);
    expect(received.length).toBe(1);
    expect(received[0].url).toBe(`/light/${device.id}`);

    const action = await ctx.api
      .post(`/api/devices/${device.id}/actions`)
      .set(ctx.auth)
      .send({ action: 'turn_on' });
    expect(action.status).toBe(200);
    expect(action.body.changes.power).toBe('on');
    expect(received.length).toBe(2);
    expect(JSON.parse(received[1].body).power).toBe('on');

    const sync = await ctx.api.post(`/api/devices/${device.id}/actions`).set(ctx.auth).send({ action: 'sync' });
    expect(sync.status).toBe(200);
    expect(sync.body.device.state.brightness).toBe(77);

    await new Promise((resolve) => server.close(resolve));
  });

  it('接口不可达时标记离线并记录告警', async () => {
    ctx = createTestContext();
    const created = await ctx.api
      .post('/api/devices')
      .set(ctx.auth)
      .send({
        name: '离线灯',
        template: 'light',
        adapter: { kind: 'http', url: 'http://127.0.0.1:9/never', method: 'POST', timeoutMs: 800 }
      });
    const device = created.body.device;
    const sync = await ctx.api.post(`/api/devices/${device.id}/actions`).set(ctx.auth).send({ action: 'sync' });
    expect(sync.status).toBe(200);
    expect(sync.body.device.online).toBe(false);
    const events = await ctx.api.get('/api/events?limit=5').set(ctx.auth);
    expect(events.body.events[0].level).toBe('warn');
    expect(events.body.events[0].message).toContain('同步失败');
  });
});
