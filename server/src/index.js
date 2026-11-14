import { startIcehomeServer } from './runtime.js';
import {
  CACHE_PREFIX,
  CORS_ORIGINS,
  DATA_DIR,
  HOST,
  PORT,
  REDIS_URL,
  SCHEDULER_INTERVAL_MS,
  SERVE_STATIC,
  STORAGE_DRIVER,
  STORAGE_URL,
  VERSION,
  WEB_DIST
} from './config.js';

async function main() {
  const runtime = await startIcehomeServer({
    host: HOST,
    port: PORT,
    dataDir: DATA_DIR,
    staticDir: WEB_DIST,
    serveStatic: SERVE_STATIC,
    storageDriver: STORAGE_DRIVER,
    storageUrl: STORAGE_URL,
    redisUrl: REDIS_URL,
    cachePrefix: CACHE_PREFIX,
    schedulerIntervalMs: SCHEDULER_INTERVAL_MS,
    corsOrigins: CORS_ORIGINS
  });

  console.log(`[ICEHOME] v${VERSION} 服务已启动`);
  console.log(`[ICEHOME] 面板地址：http://127.0.0.1:${runtime.port}`);
  console.log(`[ICEHOME] 存储：${runtime.persistence.driver} · ${runtime.persistence.target}`);
  console.log(
    `[ICEHOME] 缓存：${runtime.cache.backend}${runtime.cache.fallbackReason ? `（${runtime.cache.fallbackReason}）` : ''}`
  );
  console.log(`[ICEHOME] 静态托管：${SERVE_STATIC ? '开启（dist）' : '关闭（前后端分离）'}`);
  if (CORS_ORIGINS.length) console.log(`[ICEHOME] CORS 允许：${CORS_ORIGINS.join(', ')}`);
  console.log(`[ICEHOME] 调度心跳：${SCHEDULER_INTERVAL_MS} ms`);

  let closing = false;
  async function shutdown(signal) {
    if (closing) return;
    closing = true;
    console.log(`[ICEHOME] 收到 ${signal}，正在写入数据…`);
    try {
      await runtime.close();
    } finally {
      process.exit(0);
    }
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error(`[ICEHOME] 启动失败：${error.message}`);
  process.exit(1);
});
