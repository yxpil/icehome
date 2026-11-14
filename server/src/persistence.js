import fs from 'node:fs';
import path from 'node:path';

const DOC_ID = 'default';

/** 隐藏连接串中的密码，便于在界面展示 */
export function redactUrl(url) {
  const text = String(url || '');
  return text.replace(/\/\/([^:/@]+):([^@]+)@/, '//$1:***@');
}

/**
 * 存储驱动解析：显式 driver 优先，否则看连接串协议，默认 json。
 * Redis 只做缓存，不能当主存储。
 */
export function resolveStorageDriver({ driver, url } = {}) {
  const explicit = String(driver || '').trim().toLowerCase();
  if (explicit) {
    const alias = { postgresql: 'postgres', pg: 'postgres', mysql2: 'mysql' }[explicit] || explicit;
    if (!['json', 'postgres', 'mysql'].includes(alias)) {
      throw new Error(`不支持的存储驱动：${driver}（可选 json / postgres / mysql）`);
    }
    return alias;
  }
  const target = String(url || '').trim();
  if (target.startsWith('postgres://') || target.startsWith('postgresql://')) return 'postgres';
  if (target.startsWith('mysql://') || target.startsWith('mysql2://')) return 'mysql';
  if (target.startsWith('redis://') || target.startsWith('rediss://')) {
    throw new Error('Redis 仅用于缓存，主存储请使用 json / postgres / mysql');
  }
  return 'json';
}

/** 本地 JSON 文件驱动：保留原子写与同步读取，供测试与默认部署使用 */
export function createJsonPersistence(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  return {
    driver: 'json',
    target: filePath,
    readSync() {
      if (!fs.existsSync(filePath)) return null;
      const raw = fs.readFileSync(filePath, 'utf8');
      return raw.trim() ? JSON.parse(raw) : null;
    },
    writeSync(doc) {
      const tmp = `${filePath}.tmp`;
      fs.writeFileSync(tmp, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
      fs.renameSync(tmp, filePath);
    },
    async read() {
      return this.readSync();
    },
    async write(doc) {
      this.writeSync(doc);
    },
    async test() {
      return { ok: true, driver: 'json', latencyMs: 0, detail: filePath };
    },
    async close() {},
    status() {
      return { driver: 'json', connected: true, target: filePath, latencyMs: 0 };
    }
  };
}

function sqlStatus(state, driver, url, extra = {}) {
  return {
    driver,
    connected: state.connected,
    target: redactUrl(url),
    latencyMs: state.latencyMs,
    ...extra
  };
}

async function createPostgresPersistence(url, logger) {
  let pg;
  try {
    pg = await import('pg');
  } catch {
    throw new Error('PostgreSQL 驱动未安装：请执行 npm i pg，或改用 STORAGE_DRIVER=json');
  }
  const Pool = pg.default?.Pool || pg.Pool;
  const pool = new Pool({ connectionString: url, max: 4, connectionTimeoutMillis: 5000 });
  const state = { connected: false, latencyMs: 0 };
  const started = Date.now();

  async function query(text, params) {
    const begin = Date.now();
    try {
      const result = await pool.query(text, params);
      state.latencyMs = Date.now() - begin;
      state.connected = true;
      return result;
    } catch (error) {
      state.connected = false;
      throw error;
    }
  }

  await query('SELECT 1');
  await query(`CREATE TABLE IF NOT EXISTS icehome_state (
    id text PRIMARY KEY,
    doc jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  state.latencyMs = Date.now() - started;
  logger?.info?.(`[storage] PostgreSQL 已连接（${redactUrl(url)}）`);

  return {
    driver: 'postgres',
    target: redactUrl(url),
    async read() {
      const result = await query('SELECT doc FROM icehome_state WHERE id = $1', [DOC_ID]);
      return result.rows[0]?.doc ?? null;
    },
    async write(doc) {
      await query(
        `INSERT INTO icehome_state (id, doc, updated_at) VALUES ($1, $2::jsonb, now())
         ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc, updated_at = now()`,
        [DOC_ID, JSON.stringify(doc)]
      );
    },
    async test() {
      try {
        const begin = Date.now();
        await pool.query('SELECT 1');
        state.connected = true;
        state.latencyMs = Date.now() - begin;
        return { ok: true, driver: 'postgres', latencyMs: state.latencyMs, detail: redactUrl(url) };
      } catch (error) {
        state.connected = false;
        return { ok: false, driver: 'postgres', detail: error.message };
      }
    },
    status() {
      return sqlStatus(state, 'postgres', url, { table: 'icehome_state' });
    },
    async close() {
      await pool.end();
    }
  };
}

async function createMysqlPersistence(url, logger) {
  let mysql;
  try {
    mysql = await import('mysql2/promise');
  } catch {
    throw new Error('MySQL 驱动未安装：请执行 npm i mysql2，或改用 STORAGE_DRIVER=json');
  }
  const pool = mysql.createPool({ uri: url, connectionLimit: 4, waitForConnections: true });
  const state = { connected: false, latencyMs: 0 };
  const started = Date.now();

  async function query(text, params) {
    const begin = Date.now();
    try {
      const [rows] = await pool.query(text, params);
      state.latencyMs = Date.now() - begin;
      state.connected = true;
      return rows;
    } catch (error) {
      state.connected = false;
      throw error;
    }
  }

  await query('SELECT 1');
  await query(`CREATE TABLE IF NOT EXISTS icehome_state (
    id varchar(64) PRIMARY KEY,
    doc longtext NOT NULL,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  state.latencyMs = Date.now() - started;
  logger?.info?.(`[storage] MySQL 已连接（${redactUrl(url)}）`);

  return {
    driver: 'mysql',
    target: redactUrl(url),
    async read() {
      const rows = await query('SELECT doc FROM icehome_state WHERE id = ?', [DOC_ID]);
      if (!rows.length) return null;
      return typeof rows[0].doc === 'string' ? JSON.parse(rows[0].doc) : rows[0].doc;
    },
    async write(doc) {
      await query(
        'INSERT INTO icehome_state (id, doc) VALUES (?, ?) ON DUPLICATE KEY UPDATE doc = VALUES(doc)',
        [DOC_ID, JSON.stringify(doc)]
      );
    },
    async test() {
      try {
        const begin = Date.now();
        await pool.query('SELECT 1');
        state.connected = true;
        state.latencyMs = Date.now() - begin;
        return { ok: true, driver: 'mysql', latencyMs: state.latencyMs, detail: redactUrl(url) };
      } catch (error) {
        state.connected = false;
        return { ok: false, driver: 'mysql', detail: error.message };
      }
    },
    status() {
      return sqlStatus(state, 'mysql', url, { table: 'icehome_state' });
    },
    async close() {
      await pool.end();
    }
  };
}

/**
 * 创建持久化后端。
 * STORAGE_DRIVER=json|postgres|mysql，STORAGE_URL 可用协议自动推断。
 */
export async function createPersistence({ driver, url, filePath, logger = console } = {}) {
  const resolved = resolveStorageDriver({ driver, url });
  if (resolved === 'json') {
    return createJsonPersistence(filePath || path.resolve(process.cwd(), 'data', 'db.json'));
  }
  if (!url) throw new Error(`${resolved} 存储需要提供 STORAGE_URL 连接串`);
  if (resolved === 'postgres') {
    try {
      return await createPostgresPersistence(url, logger);
    } catch (error) {
      if (error.message.includes('驱动未安装')) throw error;
      throw new Error(`PostgreSQL 连接失败（${redactUrl(url)}）：${error.message}`);
    }
  }
  try {
    return await createMysqlPersistence(url, logger);
  } catch (error) {
    if (error.message.includes('驱动未安装')) throw error;
    throw new Error(`MySQL 连接失败（${redactUrl(url)}）：${error.message}`);
  }
}
