import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createJsonPersistence,
  createPersistence,
  redactUrl,
  resolveStorageDriver
} from '../../server/src/persistence.js';
import { createStoreFromPersistence } from '../../server/src/store.js';

const dirs = [];

function tempFile(name = 'db.json') {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'icehome-persistence-'));
  dirs.push(dir);
  return path.join(dir, name);
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
});

describe('resolveStorageDriver', () => {
  it('defaults to json', () => {
    expect(resolveStorageDriver({})).toBe('json');
    expect(resolveStorageDriver({ driver: '', url: '' })).toBe('json');
  });

  it('accepts explicit drivers', () => {
    expect(resolveStorageDriver({ driver: 'PostgreSQL' })).toBe('postgres');
    expect(resolveStorageDriver({ driver: 'mysql' })).toBe('mysql');
  });

  it('infers the driver from the connection string', () => {
    expect(resolveStorageDriver({ url: 'postgres://user:pw@db:5432/ice' })).toBe('postgres');
    expect(resolveStorageDriver({ url: 'postgresql://db/ice' })).toBe('postgres');
    expect(resolveStorageDriver({ url: 'mysql://user:pw@db:3306/ice' })).toBe('mysql');
  });

  it('rejects unsupported drivers and redis as primary storage', () => {
    expect(() => resolveStorageDriver({ driver: 'sqlite' })).toThrow('不支持的存储驱动');
    expect(() => resolveStorageDriver({ url: 'redis://cache:6379' })).toThrow('Redis 仅用于缓存');
  });
});

describe('json persistence', () => {
  it('reads and writes the document atomically', async () => {
    const file = tempFile();
    const persistence = createJsonPersistence(file);
    expect(await persistence.read()).toBeNull();
    await persistence.write({ version: 1, settings: { homeName: '测试之家' } });
    expect(await persistence.read()).toMatchObject({ version: 1 });
    expect(persistence.status()).toMatchObject({ driver: 'json', connected: true });
    expect((await persistence.test()).ok).toBe(true);
  });

  it('creates the store from an existing document', async () => {
    const file = tempFile();
    const persistence = createJsonPersistence(file);
    await persistence.write({ version: 2, devices: [], settings: {} });
    const store = await createStoreFromPersistence(persistence, () => {
      throw new Error('不应生成初始数据');
    });
    expect(store.data.version).toBe(2);
    expect(store.persistence.driver).toBe('json');
  });

  it('creates the store with initial data on an empty backend', async () => {
    const file = tempFile();
    const persistence = createJsonPersistence(file);
    const store = await createStoreFromPersistence(persistence, () => ({ version: 7, devices: [] }));
    expect(store.data.version).toBe(7);
    expect(await persistence.read()).toMatchObject({ version: 7 });
  });

  it('createPersistence resolves json by default', async () => {
    const file = tempFile();
    const persistence = await createPersistence({ filePath: file });
    expect(persistence.driver).toBe('json');
  });

  it('requires a connection string for sql drivers', async () => {
    await expect(createPersistence({ driver: 'postgres' })).rejects.toThrow('需要提供 STORAGE_URL');
    await expect(createPersistence({ driver: 'mysql' })).rejects.toThrow('需要提供 STORAGE_URL');
  });
});

describe('redactUrl', () => {
  it('masks the password in connection strings', () => {
    expect(redactUrl('postgres://ice:secret@db.local:5432/icehome')).toBe(
      'postgres://ice:***@db.local:5432/icehome'
    );
    expect(redactUrl('mysql://root@localhost/ice')).toBe('mysql://root@localhost/ice');
  });
});
