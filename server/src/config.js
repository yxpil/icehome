import path from 'node:path';

export const VERSION = '1.0.0';
export const PORT = Number(process.env.PORT || 8787);
export const HOST = process.env.HOST || '0.0.0.0';
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(process.cwd(), 'data');
export const DB_FILE = path.join(DATA_DIR, 'db.json');
export const WEB_DIST = path.resolve(process.cwd(), 'dist');
export const SCHEDULER_INTERVAL_MS = Number(process.env.ICE_TICK_MS || 15000);
export const EVENT_LIMIT = 240;

/** 存储：显式 driver 或由连接串协议推断，默认 json 文件 */
export const STORAGE_DRIVER = process.env.STORAGE_DRIVER || '';
export const STORAGE_URL = process.env.STORAGE_URL || process.env.DATABASE_URL || '';
/** 缓存：留空则使用进程内存 */
export const REDIS_URL = process.env.REDIS_URL || '';
export const CACHE_PREFIX = process.env.CACHE_PREFIX || 'icehome:';
/** 前后端分离：SERVE_STATIC=false 时只提供 API，静态资源交给 nginx / 网关 */
export const SERVE_STATIC = String(process.env.SERVE_STATIC || 'true').toLowerCase() !== 'false';
export const CORS_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
