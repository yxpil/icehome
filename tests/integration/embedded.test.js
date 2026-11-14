import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startIcehomeServer } from '../../server/src/runtime.js';

let runtime = null;
let dataDir = null;

afterEach(async () => {
  if (runtime) {
    await runtime.close();
    runtime = null;
  }
  if (dataDir) {
    fs.rmSync(dataDir, { recursive: true, force: true });
    dataDir = null;
  }
});

async function boot() {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'icehome-embedded-'));
  const staticDir = path.join(dataDir, 'web');
  fs.mkdirSync(staticDir, { recursive: true });
  fs.writeFileSync(path.join(staticDir, 'index.html'), '<!doctype html><html><body>ICEHOME</body></html>');
  runtime = await startIcehomeServer({
    host: '127.0.0.1',
    port: 0,
    dataDir,
    staticDir,
    schedulerIntervalMs: 0,
    logger: { info() {}, warn() {}, error() {} }
  });
  return runtime;
}

describe('Electron 内嵌服务运行时', () => {
  it('在随机端口启动、提供静态页与健康接口，并写入数据文件', async () => {
    const server = await boot();
    expect(server.port).toBeGreaterThan(0);
    expect(server.localUrl).toBe(`http://127.0.0.1:${server.port}`);
    expect(fs.existsSync(path.join(dataDir, 'db.json'))).toBe(true);

    const health = await fetch(`${server.localUrl}/api/health`).then((response) => response.json());
    expect(health.ok).toBe(true);

    const page = await fetch(`${server.localUrl}/`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('ICEHOME');
  });

  it('同一数据目录不允许第二个服务同时写入', async () => {
    const first = await boot();
    const staticDir = path.join(dataDir, 'web');
    await expect(
      startIcehomeServer({
        host: '127.0.0.1',
        port: 0,
        dataDir,
        staticDir,
        schedulerIntervalMs: 0,
        logger: { info() {}, warn() {}, error() {} }
      })
    ).rejects.toThrow('数据目录已被进程');
    expect(first.store.data.devices).toHaveLength(10);
  });

  it('登录后能读到种子设备，关闭再启动仍保留同一份数据', async () => {
    const first = await boot();
    const login = await fetch(`${first.localUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'icehome' })
    }).then((response) => response.json());
    expect(login.token).toMatch(/^sk-ice-/);

    const state = await fetch(`${first.localUrl}/api/state`, {
      headers: { authorization: `Bearer ${login.token}` }
    }).then((response) => response.json());
    expect(state.devices).toHaveLength(10);
    expect(state.settings.wifi.ssid).toBe('ICEHOME-之家');

    await first.close();
    runtime = null;

    runtime = await startIcehomeServer({
      host: '127.0.0.1',
      port: 0,
      dataDir,
      staticDir: path.join(dataDir, 'web'),
      schedulerIntervalMs: 0,
      logger: { info() {}, warn() {}, error() {} }
    });
    const again = await fetch(`${runtime.localUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'icehome' })
    }).then((response) => response.json());
    const stateAgain = await fetch(`${runtime.localUrl}/api/state`, {
      headers: { authorization: `Bearer ${again.token}` }
    }).then((response) => response.json());
    expect(stateAgain.devices).toHaveLength(10);
    expect(stateAgain.settings.homeName).toBeTruthy();
  });
});
