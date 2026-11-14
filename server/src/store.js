import { createJsonPersistence } from './persistence.js';
import { migrateState } from './seed.js';

/**
 * 把数据文档包装成 store：150ms 防抖保存，flush 立即写。
 * persistence 可以是 JSON（同步写）或 SQL（异步写）。
 */
function wrapStore(data, persistence) {
  let timer = null;
  let pending = Promise.resolve();

  function writeNow() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (typeof persistence.writeSync === 'function') {
      persistence.writeSync(data);
      return undefined;
    }
    pending = persistence.write(data).catch((error) => {
      console.error(`[storage] 写入失败：${error.message}`);
    });
    return pending;
  }

  function save() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(writeNow, 150);
    if (typeof timer.unref === 'function') timer.unref();
  }

  return { data, save, flush: writeNow, file: persistence.target, persistence };
}

/** 同步创建 JSON 文件存储（默认部署与单元测试使用） */
export function createStore(filePath, initialFactory) {
  const persistence = createJsonPersistence(filePath);
  const loaded = persistence.readSync();
  const data = loaded || initialFactory();
  migrateState(data);
  if (!loaded) persistence.writeSync(data);
  return wrapStore(data, persistence);
}

/** 从任意持久化后端异步打开（数据库驱动使用） */
export async function createStoreFromPersistence(persistence, initialFactory) {
  const loaded = await persistence.read();
  const data = loaded || initialFactory();
  migrateState(data);
  if (!loaded) await persistence.write(data);
  return wrapStore(data, persistence);
}
