import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createStore } from '../server/src/store.js';
import { createInitialDb } from '../server/src/seed.js';
import { createApp } from '../server/src/app.js';
import { apiKey, id } from '../server/src/ids.js';

/** 每个测试用例一套独立的临时数据目录与 app 实例 */
export function createTestContext() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'icehome-test-'));
  const store = createStore(path.join(dir, 'db.json'), createInitialDb);
  const app = createApp({ store, serveStatic: false });
  const token = store.data.tokens[0];
  const agent = request(app);
  return {
    dir,
    store,
    app,
    api: agent,
    token,
    auth: { Authorization: `Bearer ${token.key}` },
    headers: (extra = {}) => ({ Authorization: `Bearer ${token.key}`, ...extra }),
    makeToken(scopes = ['device:read'], name = '测试令牌') {
      const created = {
        id: id('tok'),
        name,
        key: apiKey(),
        scopes,
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
        requestCount: 0,
        revoked: false
      };
      store.data.tokens.push(created);
      store.save();
      return created;
    },
    cleanup() {
      store.flush();
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

export function firstDevice(store, template) {
  const device = store.data.devices.find((item) => item.template === template) || store.data.devices[0];
  return device;
}
