import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { test, expect, _electron as electron } from '@playwright/test';

const ROOT = path.resolve('.');
const SHOTS = path.join(ROOT, 'test-results', 'shots');

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

function packagedExecutable() {
  if (process.platform === 'win32') return path.join(ROOT, 'release/win-unpacked/ICEHOME.exe');
  if (process.platform === 'darwin') return path.join(ROOT, 'release/mac/ICEHOME.app/Contents/MacOS/ICEHOME');
  return path.join(ROOT, 'release/linux-unpacked/ICEHOME');
}

test('打包后的 Electron 应用能启动本地服务并打开面板', async () => {
  const executable = packagedExecutable();
  test.skip(
    process.env.ICEHOME_TEST_PACKAGED !== '1' || !fs.existsSync(executable),
    '先运行 npm run desktop:dist:dir，并设置 ICEHOME_TEST_PACKAGED=1'
  );

  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'icehome-desktop-packed-'));
  const app = await electron.launch({
    executablePath: executable,
    env: {
      ...process.env,
      ICEHOME_DESKTOP_USER_DATA: base,
      ICEHOME_DESKTOP_DATA_DIR: path.join(base, 'data')
    }
  });
  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await expect(window.locator('h1')).toContainText('连接你的家');
    await expect(window.locator('#versionText')).not.toHaveText('—');
    const port = await freePort();
    await window.locator('#localPort').fill(String(port));
    const newWindow = app.waitForEvent('window');
    await window.locator('#connectLocal').click();
    const panel = await newWindow;
    await panel.waitForLoadState('domcontentloaded');
    await expect(panel.locator('body')).toContainText('总览');
    await expect(panel.locator('body')).toContainText('设备总数');
    fs.mkdirSync(SHOTS, { recursive: true });
    await panel.screenshot({ path: path.join(SHOTS, 'desktop-electron-packed.png'), fullPage: true });
    expect(fs.existsSync(path.join(base, 'data', 'db.json'))).toBeTruthy();
  } finally {
    await app.close().catch(() => {});
    fs.rmSync(base, { recursive: true, force: true });
  }
});
