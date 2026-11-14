import { describe, it, expect, afterEach } from 'vitest';
import { createTestContext } from '../helpers.js';
import { tickScheduler } from '../../server/src/engine.js';

let ctx;
afterEach(() => {
  ctx?.cleanup();
  ctx = null;
});

const lightDevice = (ctx) => ctx.store.data.devices.find((device) => device.template === 'light');

describe('定时任务 CRUD', () => {
  it('创建 daily 任务并计算下次执行时间', async () => {
    ctx = createTestContext();
    const device = lightDevice(ctx);
    const res = await ctx.api
      .post('/api/tasks')
      .set(ctx.auth)
      .send({
        name: '夜间关灯',
        deviceId: device.id,
        schedule: { kind: 'daily', at: '23:15' },
        action: { type: 'turn_off' }
      });
    expect(res.status).toBe(201);
    expect(res.body.task.nextRunAt).toBeTruthy();
    expect(new Date(res.body.task.nextRunAt).getHours()).toBe(23);
    expect(new Date(res.body.task.nextRunAt).getMinutes()).toBe(15);
    expect(res.body.task.runCount).toBe(0);
  });

  it('创建 cron 任务', async () => {
    ctx = createTestContext();
    const device = lightDevice(ctx);
    const res = await ctx.api
      .post('/api/tasks')
      .set(ctx.auth)
      .send({
        name: '晨间开灯',
        deviceId: device.id,
        schedule: { kind: 'cron', expression: '0 7 * * 1-5' },
        action: { type: 'turn_on', payload: { brightness: 65 } }
      });
    expect(res.status).toBe(201);
    expect(res.body.task.schedule.expression).toBe('0 7 * * 1-5');
    expect(res.body.task.nextRunAt).toBeTruthy();
  });

  it('校验计划、动作与设备', async () => {
    ctx = createTestContext();
    const device = lightDevice(ctx);
    const badCron = await ctx.api
      .post('/api/tasks')
      .set(ctx.auth)
      .send({ name: '坏任务', deviceId: device.id, schedule: { kind: 'cron', expression: '* * *' }, action: { type: 'turn_on' } });
    expect(badCron.status).toBe(400);

    const badInterval = await ctx.api
      .post('/api/tasks')
      .set(ctx.auth)
      .send({ name: '过快', deviceId: device.id, schedule: { kind: 'interval', everySeconds: 3 }, action: { type: 'turn_on' } });
    expect(badInterval.status).toBe(400);

    const badAction = await ctx.api
      .post('/api/tasks')
      .set(ctx.auth)
      .send({ name: '坏动作', deviceId: device.id, schedule: { kind: 'daily', at: '08:00' }, action: { type: 'launch' } });
    expect(badAction.status).toBe(400);

    const badDevice = await ctx.api
      .post('/api/tasks')
      .set(ctx.auth)
      .send({ name: '无设备', deviceId: 'dev_missing', schedule: { kind: 'daily', at: '08:00' }, action: { type: 'turn_on' } });
    expect(badDevice.status).toBe(400);
    expect(badDevice.body.error.message).toContain('设备不存在');
  });

  it('立即执行任务会改变设备状态', async () => {
    ctx = createTestContext();
    const device = lightDevice(ctx);
    ctx.store.data.devices.find((item) => item.id === device.id).state.power = 'off';
    const created = await ctx.api
      .post('/api/tasks')
      .set(ctx.auth)
      .send({ name: '手动开灯', deviceId: device.id, schedule: { kind: 'daily', at: '06:30' }, action: { type: 'turn_on' } });
    const res = await ctx.api.post(`/api/tasks/${created.body.task.id}/run`).set(ctx.auth);
    expect(res.status).toBe(200);
    expect(res.body.task.runCount).toBe(1);
    expect(res.body.task.lastRunAt).toBeTruthy();
    expect(res.body.device.state.power).toBe('on');
    expect(res.body.changes.power).toBe('on');
  });

  it('停用任务会清空下次执行时间', async () => {
    ctx = createTestContext();
    const device = lightDevice(ctx);
    const created = await ctx.api
      .post('/api/tasks')
      .set(ctx.auth)
      .send({ name: '可停用', deviceId: device.id, schedule: { kind: 'interval', everySeconds: 60 }, action: { type: 'toggle' } });
    const patch = await ctx.api.patch(`/api/tasks/${created.body.task.id}`).set(ctx.auth).send({ enabled: false });
    expect(patch.status).toBe(200);
    expect(patch.body.task.enabled).toBe(false);
    expect(patch.body.task.nextRunAt).toBeNull();
    const enable = await ctx.api.patch(`/api/tasks/${created.body.task.id}`).set(ctx.auth).send({ enabled: true });
    expect(enable.body.task.nextRunAt).toBeTruthy();
  });

  it('删除任务', async () => {
    ctx = createTestContext();
    const task = ctx.store.data.tasks[0];
    const res = await ctx.api.delete(`/api/tasks/${task.id}`).set(ctx.auth);
    expect(res.status).toBe(200);
    const list = await ctx.api.get('/api/tasks').set(ctx.auth);
    expect(list.body.tasks.some((item) => item.id === task.id)).toBe(false);
  });
});

describe('调度器心跳', () => {
  it('到点任务被执行并滚动到下一次', async () => {
    ctx = createTestContext();
    const device = lightDevice(ctx);
    const created = await ctx.api
      .post('/api/tasks')
      .set(ctx.auth)
      .send({
        name: '待触发任务',
        deviceId: device.id,
        schedule: { kind: 'daily', at: '23:15' },
        action: { type: 'turn_on' }
      });
    const task = ctx.store.data.tasks.find((item) => item.id === created.body.task.id);
    task.nextRunAt = new Date(Date.now() - 5000).toISOString();
    ctx.store.data.devices.find((item) => item.id === device.id).state.power = 'off';

    const executed = await tickScheduler(ctx.store, new Date());
    expect(executed.length).toBeGreaterThanOrEqual(1);
    const executedTask = executed.find((item) => item.taskId === task.id);
    expect(executedTask).toBeTruthy();
    expect(task.runCount).toBe(1);
    expect(new Date(task.nextRunAt).getTime()).toBeGreaterThan(Date.now());
    expect(ctx.store.data.devices.find((item) => item.id === device.id).state.power).toBe('on');
  });

  it('停用任务不会被调度', async () => {
    ctx = createTestContext();
    const device = lightDevice(ctx);
    const created = await ctx.api
      .post('/api/tasks')
      .set(ctx.auth)
      .send({
        name: '停用任务',
        deviceId: device.id,
        schedule: { kind: 'daily', at: '23:15' },
        action: { type: 'turn_on' },
        enabled: false
      });
    const task = ctx.store.data.tasks.find((item) => item.id === created.body.task.id);
    task.nextRunAt = new Date(Date.now() - 5000).toISOString();
    const executed = await tickScheduler(ctx.store, new Date());
    expect(executed.some((item) => item.taskId === task.id)).toBe(false);
    expect(task.runCount).toBe(0);
  });

  it('首次心跳为未排期任务补充 nextRunAt', async () => {
    ctx = createTestContext();
    const task = ctx.store.data.tasks.find((item) => item.enabled);
    task.nextRunAt = null;
    await tickScheduler(ctx.store, new Date());
    expect(task.nextRunAt).toBeTruthy();
  });
});
