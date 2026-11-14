import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../../server/src/store.js';
import { createInitialDb } from '../../server/src/seed.js';
import { apiKey, maskKey, pairingCode, id } from '../../server/src/ids.js';

let dir;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

describe('本地 JSON 存储', () => {
  it('首次打开写入初始数据', () => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'icehome-store-'));
    const file = path.join(dir, 'db.json');
    const store = createStore(file, createInitialDb);
    expect(store.data.devices.length).toBeGreaterThan(0);
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    expect(raw.version).toBe(1);
    expect(raw.devices[0].id).toMatch(/^dev_/);
  });

  it('重新打开可恢复写入内容', () => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'icehome-store-'));
    const file = path.join(dir, 'db.json');
    const store = createStore(file, createInitialDb);
    store.data.settings.homeName = '测试之家';
    store.data.devices.push({
      id: id('dev'),
      name: '临时设备',
      template: 'custom',
      capabilities: ['power'],
      state: { power: 'off' },
      adapter: { kind: 'mock' },
      order: 99
    });
    store.flush();
    const reopened = createStore(file, createInitialDb);
    expect(reopened.data.settings.homeName).toBe('测试之家');
    expect(reopened.data.devices.some((device) => device.name === '临时设备')).toBe(true);
  });

  it('防抖保存最终落盘', async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'icehome-store-'));
    const file = path.join(dir, 'db.json');
    const store = createStore(file, createInitialDb);
    store.data.settings.homeName = '防抖之家';
    store.save();
    await new Promise((resolve) => setTimeout(resolve, 260));
    expect(JSON.parse(readFileSync(file, 'utf8')).settings.homeName).toBe('防抖之家');
  });
});

describe('ID 与密钥生成', () => {
  it('设备 ID 带前缀且唯一', () => {
    const ids = new Set(Array.from({ length: 500 }, () => id('dev')));
    expect(ids.size).toBe(500);
    expect([...ids][0]).toMatch(/^dev_[0-9a-f]{8}$/);
  });

  it('令牌符合 OpenAI 风格', () => {
    const keys = new Set(Array.from({ length: 200 }, () => apiKey()));
    expect(keys.size).toBe(200);
    for (const key of keys) {
      expect(key).toMatch(/^sk-ice-[a-z0-9]{32}$/);
    }
  });

  it('掩码保留前后缀', () => {
    const key = 'sk-ice-abcdefghijklmnopqrstuvwxyz012345';
    const masked = maskKey(key);
    expect(masked.startsWith('sk-ice-abcde')).toBe(true);
    expect(masked.endsWith(key.slice(-4))).toBe(true);
    expect(masked).toContain('******');
  });

  it('配对码为 6 位且排除易混字符', () => {
    for (let i = 0; i < 100; i += 1) {
      const code = pairingCode();
      expect(code).toMatch(/^[A-Z2-9]{6}$/);
      expect(code).not.toMatch(/[OI01]/);
    }
  });
});
