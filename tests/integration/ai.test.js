import { describe, it, expect, afterEach } from 'vitest';
import { createTestContext } from '../helpers.js';

let ctx;
afterEach(() => {
  ctx?.cleanup();
  ctx = null;
});

const light = (ctx) => ctx.store.data.devices.find((device) => device.name === '客厅主灯');

describe('AI 指令端点', () => {
  it('执行开关指令并改变设备状态', async () => {
    ctx = createTestContext();
    light(ctx).state.power = 'off';
    const res = await ctx.api.post('/api/ai/command').set(ctx.auth).send({ text: '打开客厅主灯' });
    expect(res.status).toBe(200);
    expect(res.body.intent).toBe('control');
    expect(res.body.executed).toBe(true);
    expect(res.body.results[0].name).toBe('客厅主灯');
    expect(light(ctx).state.power).toBe('on');
  });

  it('dryRun 只解析不执行', async () => {
    ctx = createTestContext();
    light(ctx).state.power = 'off';
    const res = await ctx.api.post('/api/ai/command').set(ctx.auth).send({ text: '打开客厅主灯', dryRun: true });
    expect(res.body.executed).toBe(false);
    expect(res.body.plan.action).toBe('turn_on');
    expect(light(ctx).state.power).toBe('off');
  });

  it('设置数值状态', async () => {
    ctx = createTestContext();
    const res = await ctx.api.post('/api/ai/command').set(ctx.auth).send({ text: '把客厅主灯亮度调到 35' });
    expect(res.body.action).toBe('set');
    expect(light(ctx).state.brightness).toBe(35);
  });

  it('排程指令自动创建任务', async () => {
    ctx = createTestContext();
    const before = ctx.store.data.tasks.length;
    const res = await ctx.api.post('/api/ai/command').set(ctx.auth).send({ text: '每天 22:30 关闭客厅主灯' });
    expect(res.body.intent).toBe('schedule');
    expect(res.body.executed).toBe(true);
    expect(ctx.store.data.tasks.length).toBe(before + 1);
    const task = res.body.task;
    expect(task.schedule).toEqual({ kind: 'daily', at: '22:30' });
    expect(task.action.type).toBe('turn_off');
    expect(task.nextRunAt).toBeTruthy();
  });

  it('查询指令返回状态文本且不执行', async () => {
    ctx = createTestContext();
    const res = await ctx.api.post('/api/ai/command').set(ctx.auth).send({ text: '客厅空调状态怎么样' });
    expect(res.body.intent).toBe('query');
    expect(res.body.executed).toBe(false);
    expect(res.body.reply).toContain('客厅空调');
  });

  it('歧义指令给出候选设备', async () => {
    ctx = createTestContext();
    const res = await ctx.api.post('/api/ai/command').set(ctx.auth).send({ text: '打开灯' });
    expect(res.body.intent).toBe('ambiguous');
    expect(res.body.candidates.length).toBeGreaterThan(1);
    expect(res.body.executed).toBe(false);
  });

  it('缺少 ai:use 权限返回 403', async () => {
    ctx = createTestContext();
    const readToken = ctx.makeToken(['device:read']);
    const res = await ctx.api
      .post('/api/ai/command')
      .set('Authorization', `Bearer ${readToken.key}`)
      .send({ text: '打开客厅主灯' });
    expect(res.status).toBe(403);
  });
});

describe('AI 操作手册', () => {
  it('返回 markdown 且包含设备与端点', async () => {
    ctx = createTestContext();
    const res = await ctx.api.get('/api/ai/manual').set(ctx.auth);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/markdown');
    expect(res.text).toContain('AI 操作手册');
    expect(res.text).toContain('客厅主灯');
    expect(res.text).toContain('/api/devices/<设备ID>/actions');
    expect(res.text).toContain('sk-ice-');
  });

  it('支持 json 包装与自定义 baseUrl', async () => {
    ctx = createTestContext();
    const res = await ctx.api
      .get('/api/ai/manual?format=json&baseUrl=http://demo.local:9000')
      .set(ctx.auth);
    expect(res.status).toBe(200);
    expect(res.body.markdown).toContain('http://demo.local:9000/api/devices');
  });
});

describe('OpenAI 兼容端点', () => {
  it('列出模型', async () => {
    ctx = createTestContext();
    const res = await ctx.api.get('/v1/models').set(ctx.auth);
    expect(res.status).toBe(200);
    expect(res.body.object).toBe('list');
    expect(res.body.data[0].id).toBe('icehome-1');
    expect(res.body.data[0].owned_by).toBe('icehome');
  });

  it('chat/completions 返回标准结构并执行动作', async () => {
    ctx = createTestContext();
    light(ctx).state.power = 'off';
    const res = await ctx.api
      .post('/v1/chat/completions')
      .set(ctx.auth)
      .send({ model: 'icehome-1', messages: [{ role: 'user', content: '打开客厅主灯' }] });
    expect(res.status).toBe(200);
    expect(res.body.object).toBe('chat.completion');
    expect(res.body.id).toMatch(/^chatcmpl-/);
    expect(res.body.choices[0].message.role).toBe('assistant');
    expect(res.body.choices[0].message.content).toContain('开启');
    expect(res.body.usage.total_tokens).toBeGreaterThan(0);
    expect(res.body.icehome.intent).toBe('control');
    expect(light(ctx).state.power).toBe('on');
  });

  it('支持 SSE 流式返回', async () => {
    ctx = createTestContext();
    const res = await ctx.api
      .post('/v1/chat/completions')
      .set(ctx.auth)
      .send({ model: 'icehome-1', stream: true, messages: [{ role: 'user', content: '客厅主灯状态' }] });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.text).toContain('data: ');
    expect(res.text).toContain('[DONE]');
    expect(res.text).toContain('chat.completion.chunk');
  });

  it('缺少 user 消息返回 400', async () => {
    ctx = createTestContext();
    const res = await ctx.api
      .post('/v1/chat/completions')
      .set(ctx.auth)
      .send({ model: 'icehome-1', messages: [{ role: 'system', content: 'hi' }] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
  });

  it('无令牌调用被拒绝', async () => {
    ctx = createTestContext();
    const res = await ctx.api.post('/v1/chat/completions').send({ messages: [{ role: 'user', content: 'hi' }] });
    expect(res.status).toBe(401);
  });
});
