import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { startIcehomeServer } from '../../server/src/runtime.js';

const ROOT = path.resolve('.');
const SHOTS = path.resolve('test-results', 'shots');

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function launchApp(name) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), `icehome-desktop-${name}-`));
  const userData = path.join(base, 'profile');
  const dataDir = path.join(base, 'data');
  const app = await electron.launch({
    args: [ROOT, '--no-sandbox'],
    env: {
      ...process.env,
      ICEHOME_DESKTOP_USER_DATA: userData,
      ICEHOME_DESKTOP_DATA_DIR: dataDir
    }
  });
  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  return { app, window, base };
}

async function cleanup(app, base) {
  if (app) await app.close().catch(() => {});
  if (base) fs.rmSync(base, { recursive: true, force: true });
}

test('Electron 启动器：本地模式启动内嵌服务并打开面板', async () => {
  const port = await freePort();
  const launched = await launchApp('local');
  try {
    const { app, window, base } = launched;
    await expect(window.locator('h1')).toContainText('连接你的家');
    await expect(window.locator('#platformText')).not.toHaveText('—');
    fs.mkdirSync(SHOTS, { recursive: true });
    await window.screenshot({ path: path.join(SHOTS, 'desktop-electron-launcher.png'), fullPage: true });
    await window.locator('#localPort').fill(String(port));
    const newWindow = app.waitForEvent('window');
    await window.locator('#connectLocal').click();

    const panel = await newWindow;
    await panel.waitForLoadState('domcontentloaded');
    await expect(panel.locator('.nav-row').filter({ hasText: '二维码巡检' })).toBeVisible();
    await expect(panel).toHaveURL(new RegExp(`http://127\\.0\\.0\\.1:${port}`));

    fs.mkdirSync(SHOTS, { recursive: true });
    await panel.waitForTimeout(800);
    await panel.screenshot({ path: path.join(SHOTS, 'desktop-electron.png'), fullPage: true });

    await app.close();
    expect(fs.existsSync(path.join(base, 'data', 'db.json'))).toBe(true);
  } finally {
    await cleanup(launched.app, launched.base);
  }
});

test('Electron 启动器：远程模式测试并连接既有服务', async () => {
  const remoteBase = fs.mkdtempSync(path.join(os.tmpdir(), 'icehome-desktop-remote-srv-'));
  const remote = await startIcehomeServer({
    host: '127.0.0.1',
    port: 0,
    dataDir: remoteBase,
    staticDir: path.resolve('dist'),
    schedulerIntervalMs: 0,
    logger: { info() {}, warn() {}, error() {} }
  });
  const launched = await launchApp('remote');
  try {
    const { app, window } = launched;
    await expect(window.locator('h1')).toContainText('连接你的家');
    await window.locator('#remoteUrl').fill(remote.localUrl);
    await window.locator('#testRemote').click();
    await expect(window.locator('#remoteStatusTitle')).toContainText('连接正常');
    const newWindow = app.waitForEvent('window');
    await window.locator('#connectRemote').click();

    const panel = await newWindow;
    await panel.waitForLoadState('domcontentloaded');
    await expect(panel.locator('.nav-row').filter({ hasText: '账户与权限' })).toBeVisible();
    await expect(panel).toHaveURL(new RegExp(remote.localUrl));
    await app.close();
  } finally {
    await cleanup(launched.app, launched.base);
    await remote.close();
    fs.rmSync(remoteBase, { recursive: true, force: true });
  }
});
