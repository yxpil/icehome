import { describe, it, expect } from 'vitest';
import { normalizeValue, defaultState, template } from '../../server/src/capabilities.js';
import { buildDevice, normalizeAdapter, applyDevicePatch, normalizeCapabilities } from '../../server/src/devices.js';

const categories = [{ id: 'cat_a', name: '客厅' }];

describe('状态值校验', () => {
  it('枚举大小写归一', () => {
    expect(normalizeValue('power', 'ON')).toEqual({ ok: true, value: 'on' });
    expect(normalizeValue('power', 'boost').ok).toBe(false);
  });

  it('数字范围与取整', () => {
    expect(normalizeValue('brightness', 55).value).toBe(55);
    expect(normalizeValue('brightness', 120).ok).toBe(false);
    expect(normalizeValue('brightness', -1).ok).toBe(false);
    expect(normalizeValue('brightness', 55.55).value).toBe(55.6);
    expect(normalizeValue('brightness', 'abc').ok).toBe(false);
  });

  it('布尔值解析', () => {
    expect(normalizeValue('motion', 'true').value).toBe(true);
    expect(normalizeValue('locked', '0').value).toBe(false);
    expect(normalizeValue('motion', 'maybe').ok).toBe(false);
  });

  it('未知能力被拒绝', () => {
    expect(normalizeValue('plasma', 1).ok).toBe(false);
  });

  it('默认状态来自模板能力', () => {
    const state = defaultState(template('light').capabilities);
    expect(state.power).toBe('off');
    expect(state.brightness).toBeGreaterThan(0);
    expect(state.colorTemp).toBe(4000);
  });
});

describe('设备构建', () => {
  it('按模板补齐能力与状态', () => {
    const device = buildDevice({ name: '书房灯', template: 'light', categoryId: 'cat_a' }, { categories });
    expect(device.capabilities).toEqual(['power', 'brightness', 'colorTemp']);
    expect(device.state.power).toBe('off');
    expect(device.categoryId).toBe('cat_a');
    expect(device.adapter.kind).toBe('mock');
    expect(device.id).toMatch(/^dev_/);
  });

  it('自定义设备可声明任意能力组合', () => {
    const device = buildDevice(
      { name: '自建传感器', template: 'custom', capabilities: ['co2', 'pm25', 'battery'], state: { co2: 800 } },
      { categories }
    );
    expect(device.capabilities).toEqual(['co2', 'pm25', 'battery']);
    expect(device.state.co2).toBe(800);
    expect(device.state.pm25).toBe(18);
  });

  it('拒绝空名称、超长名称与未知能力', () => {
    expect(() => buildDevice({ name: '  ' }, { categories })).toThrow('设备名称不能为空');
    expect(() => buildDevice({ name: 'x'.repeat(41) }, { categories })).toThrow('最长 40');
    expect(() => buildDevice({ name: 'a', capabilities: ['nope'] }, { categories })).toThrow('未知能力');
    expect(() => normalizeCapabilities([])).toThrow();
  });

  it('非法分类降级为未分类', () => {
    const device = buildDevice({ name: '孤儿设备', categoryId: 'cat_missing' }, { categories });
    expect(device.categoryId).toBeNull();
  });
});

describe('适配器校验', () => {
  it('HTTP 适配器必须有合法地址', () => {
    expect(() => normalizeAdapter({ kind: 'http', url: '' })).toThrow('必须填写请求地址');
    expect(() => normalizeAdapter({ kind: 'http', url: 'ftp://x' })).toThrow('http://');
    const adapter = normalizeAdapter({
      kind: 'http',
      url: 'http://192.168.1.2/api',
      method: 'post',
      timeoutMs: 100,
      headers: { 'x-a': 1 }
    });
    expect(adapter.method).toBe('POST');
    expect(adapter.timeoutMs).toBe(500);
    expect(adapter.headers).toEqual({ 'x-a': '1' });
  });

  it('未知类型回落到 mock', () => {
    expect(normalizeAdapter({ kind: 'zigbee' }).kind).toBe('mock');
  });
});

describe('设备补丁', () => {
  const base = buildDevice({ name: '客厅灯', template: 'light' }, { categories });

  it('改名与分类', () => {
    const next = applyDevicePatch(base, { name: '客厅主灯', categoryId: 'cat_a' }, { categories });
    expect(next.name).toBe('客厅主灯');
    expect(next.categoryId).toBe('cat_a');
    expect(next.updatedAt).not.toBe(base.updatedAt);
  });

  it('合并状态并校验', () => {
    const next = applyDevicePatch(base, { state: { power: 'on', brightness: 88 } }, { categories });
    expect(next.state.power).toBe('on');
    expect(next.state.brightness).toBe(88);
    expect(() => applyDevicePatch(base, { state: { brightness: 999 } }, { categories })).toThrow();
  });

  it('修改能力后保留合法状态', () => {
    const next = applyDevicePatch(base, { capabilities: ['power'] }, { categories });
    expect(next.capabilities).toEqual(['power']);
    expect(next.state.brightness).toBeUndefined();
  });
});
