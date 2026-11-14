/**
 * 可嵌入的 ICEHOME 服务运行时。
 *
 * 浏览器/CLI 用 index.js 启动；Electron 本地模式直接调用这里，
 * 这样桌面端不依赖系统安装的 Node，也不会多起一个外部进程。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createStoreFromPersistence } from './store.js';
import { createPersistence } from './persistence.js';
import { createCache } from './cache.js';
import { createInitialDb } from './seed.js';
import { createApp } from './app.js';
import { tickScheduler, pushEvent } from './engine.js';

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

/** 同一个数据目录只允许一个服务进程写入，避免 CLI 与桌面端并发覆盖 db.json。 */
function acquireDataLock(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const lockPath = path.join(dataDir, '.icehome.lock');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
      fs.closeSync(fd);
      let released = false;
      return {
        path: lockPath,
        release() {
          if (released) return;
          released = true;
          try {
            fs.unlinkSync(lockPath);
          } catch {
            /* 已被清理 */
          }
        }
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let owner = null;
      try {
        owner = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      } catch {
        owner = null;
      }
      if (owner?.pid && processAlive(Number(owner.pid))) {
        throw new Error(`数据目录已被进程 ${owner.pid} 使用，请先停止那个服务或换一个数据目录`);
      }
      try {
        fs.unlinkSync(lockPath);
      } catch {
        /* 下一个 attempt 再试 */
      }
    }
  }
  throw new Error(`无法锁定数据目录：${dataDir}`);
}

export async function startIcehomeServer({
  host = '127.0.0.1',
  port = 8787,
  dataDir,
  staticDir = path.resolve(process.cwd(), 'dist'),
  serveStatic = true,
  storageDriver = '',
  storageUrl = '',
  redisUrl = '',
  cachePrefix = 'icehome:',
  schedulerIntervalMs = 15000,
  corsOrigins = [],
  logger = console
} = {}) {
  const resolvedDataDir = path.resolve(dataDir || path.join(process.cwd(), 'data'));
  const filePath = path.join(resolvedDataDir, 'db.json');
  const dataLock = acquireDataLock(resolvedDataDir);

  let persistence;
  let store;
  let cache;
  let server;
  let app;
  try {
    persistence = await createPersistence({
      driver: storageDriver,
      url: storageUrl,
      filePath,
      logger
    });
    store = await createStoreFromPersistence(persistence, createInitialDb);

    store.data.settings = store.data.settings || {};
    store.data.startedAt = new Date().toISOString();
    if (store.data.settings.homeName === undefined) store.data.settings.homeName = 'ICEHOME 之家';
    if (!store.data.settings.cache) store.data.settings.cache = { enabled: false, ttlSeconds: 5 };
    store.flush();

    cache = await createCache({
      redisUrl,
      prefix: cachePrefix,
      ttlSeconds: store.data.settings.cache.ttlSeconds || 5,
      logger
    });

    server = await new Promise((resolve, reject) => {
      app = createApp({
        store,
        cache,
        serveStatic,
        staticDir,
        corsOrigins
      });
      const instance = app.listen(port, host, () => resolve(instance));
      instance.once('error', reject);
    });
  } catch (error) {
    await cache?.close?.();
    await persistence?.close?.();
    dataLock.release();
    throw error;
  }

  const actualPort = server.address().port;
  const localUrl = `http://127.0.0.1:${actualPort}`;

  let timer = null;
  if (schedulerIntervalMs > 0) {
    timer = setInterval(() => {
      tickScheduler(store).catch((error) => {
        pushEvent(store, {
          level: 'error',
          type: 'system',
          message: `调度器异常：${error.message}`
        });
      });
    }, schedulerIntervalMs);
    timer.unref();
  }

  let closing = false;
  async function close() {
    if (closing) return;
    closing = true;
    if (timer) clearInterval(timer);
    try {
      await store.flush();
    } finally {
      try {
        await cache.close?.();
        await persistence.close?.();
      } finally {
        await new Promise((resolve) => {
          const done = setTimeout(resolve, 1500);
          done.unref?.();
          server.close(() => {
            clearTimeout(done);
            resolve();
          });
          server.closeAllConnections?.();
        });
        dataLock.release();
      }
    }
  }

  return {
    app,
    server,
    store,
    cache,
    persistence,
    dataDir: resolvedDataDir,
    file: filePath,
    host,
    port: actualPort,
    localUrl,
    close
  };
}
