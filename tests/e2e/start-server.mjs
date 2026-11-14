// E2E 专用服务进程：独立端口 + 独立数据目录，保证测试互不污染。
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const port = Number(process.env.E2E_PORT || 8799);
const dataDir = mkdtempSync(path.join(os.tmpdir(), 'icehome-e2e-'));

const child = spawn(process.execPath, ['server/src/index.js'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: String(port),
    DATA_DIR: dataDir,
    NODE_ENV: 'test'
  }
});

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) {
        console.log(`[e2e] ICEHOME ready on http://127.0.0.1:${port} (data: ${dataDir})`);
        return;
      }
    } catch {
      /* 服务还在启动 */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('E2E 服务启动超时');
}

const shutdown = () => {
  child.kill('SIGTERM');
  setTimeout(() => child.kill('SIGKILL'), 2_000).unref();
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('exit', () => child.kill('SIGTERM'));

waitForServer().catch((error) => {
  console.error(error.message);
  shutdown();
  process.exit(1);
});
