import { describe, it, expect } from 'vitest';
import { createInitialDb } from '../../server/src/seed.js';
import { parseCommand, buildAiManual, describeState } from '../../server/src/ai.js';

const store = () => ({ data: createInitialDb(), save: () => {} });

describe('自然语言指令解析', () => {
  it('按设备名匹配并开启', () => {
    const result = parseCommand(store(), '打开客厅主灯');
    expect(result.intent).toBe('control');
    expect(result.action).toBe('turn_on');
    expect(result.devices[0].name).toBe('客厅主灯');
    expect(result.plan.deviceIds).toHaveLength(1);
  });

  it('解析数值设置意图', () => {
    const result = parseCommand(store(), '把客厅主灯亮度调到 40');
    expect(result.intent).toBe('control');
    expect(result.action).toBe('set');
    expect(result.payload).toEqual({ brightness: 40 });
  });

  it('按类型批量匹配', () => {
    const result = parseCommand(store(), '关闭所有灯');
    expect(result.devices.length).toBeGreaterThan(1);
    expect(result.devices.every((device) => device.template === 'light')).toBe(true);
    expect(result.action).toBe('turn_off');
  });

  it('单台类型推断', () => {
    const result = parseCommand(store(), '打开厨房插座');
    expect(result.devices).toHaveLength(1);
    expect(result.devices[0].template).toBe('plug');
  });

  it('查询意图返回状态描述', () => {
    const result = parseCommand(store(), '客厅空调状态怎么样');
    expect(result.intent).toBe('query');
    expect(result.reply).toContain('客厅空调');
    expect(result.reply).toContain('目标温度');
  });

  it('多台同类型设备返回歧义提示', () => {
    const result = parseCommand(store(), '打开灯');
    expect(result.intent).toBe('ambiguous');
    expect(result.candidates.length).toBeGreaterThan(1);
  });

  it('解析定时意图', () => {
    const result = parseCommand(store(), '每天 22:30 关闭客厅主灯');
    expect(result.intent).toBe('schedule');
    expect(result.schedule).toEqual({ kind: 'daily', at: '22:30' });
    expect(result.action).toBe('turn_off');
    expect(result.label).toBe('每天 22:30');
  });

  it('解析间隔意图', () => {
    const result = parseCommand(store(), '每 30 分钟同步厨房计量插座');
    expect(result.intent).toBe('schedule');
    expect(result.schedule).toEqual({ kind: 'interval', everySeconds: 1800 });
  });

  it('未匹配设备给出提示', () => {
    const result = parseCommand(store(), '打开星际传送门');
    expect(result.intent).toBe('unknown');
    expect(result.reply).toContain('没有匹配到设备');
  });

  it('空指令返回引导语', () => {
    expect(parseCommand(store(), '   ').intent).toBe('unknown');
  });

  it('调亮在开启动作上叠加亮度增量', () => {
    const result = parseCommand(store(), '客厅主灯亮一点');
    expect(result.action).toBe('turn_on');
    expect(result.payload.brightness).toBeGreaterThan(70);
  });
});

describe('状态描述与 AI 手册', () => {
  it('描述包含主要字段', () => {
    const db = createInitialDb();
    const light = db.devices.find((device) => device.name === '客厅主灯');
    expect(describeState(light)).toContain('亮度');
    const sensor = db.devices.find((device) => device.template === 'sensor');
    expect(describeState(sensor)).toContain('湿度');
  });

  it('手册覆盖设备、端点与错误码', () => {
    const db = createInitialDb();
    const manual = buildAiManual(
      { data: db },
      { baseUrl: 'http://127.0.0.1:8787' }
    );
    expect(manual).toContain('# ICEHOME · AI 操作手册');
    expect(manual).toContain('http://127.0.0.1:8787/api/devices');
    expect(manual).toContain('/v1/chat/completions');
    expect(manual).toContain('客厅主灯');
    expect(manual).toContain('invalid_token');
    expect(manual).toContain('{"kind":"cron"');
  });
});
