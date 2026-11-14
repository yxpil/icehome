import os from 'node:os';
import { EVENT_LIMIT } from './config.js';
import { normalizeValue } from './capabilities.js';
import { nextRunAt } from './cron.js';
import { id } from './ids.js';

export const ACTIONS = ['turn_on', 'turn_off', 'toggle', 'set', 'sync', 'refresh'];

export function pushEvent(store, { level = 'info', type = 'system', message, meta }) {
  if (!message) return null;
  const event = { id: id('evt'), ts: new Date().toISOString(), level, type, message, meta };
  store.data.events.unshift(event);
  if (store.data.events.length > EVENT_LIMIT) store.data.events.length = EVENT_LIMIT;
  store.save();
  return event;
}

export function findDevice(store, deviceId) {
  return store.data.devices.find((device) => device.id === deviceId) || null;
}

function getPath(object, path) {
  if (!path) return undefined;
  return String(path)
    .split('.')
    .reduce((acc, key) => (acc === null || acc === undefined ? undefined : acc[key]), object);
}

export function renderTemplate(templateText, context) {
  return String(templateText || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
    const value = getPath(context, path);
    if (value === undefined || value === null) return '';
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  });
}

function adapterContext(device, action, payload) {
  return {
    device: { id: device.id, name: device.name, template: device.template },
    state: device.state,
    action,
    payload: payload || {}
  };
}

/** 执行一次 HTTP 适配器请求（自定义接口），返回结构化结果 */
export async function adapterRequest(device, { action = 'read', payload = {}, write = false } = {}) {
  const adapter = device.adapter || {};
  if (adapter.kind !== 'http') return { ok: true, skipped: true, kind: 'mock' };
  if (!adapter.url) return { ok: false, error: '适配器未配置请求地址' };
  const context = adapterContext(device, action, payload);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), adapter.timeoutMs || 4000);
  try {
    const url = renderTemplate(adapter.url, context);
    const headers = {};
    for (const [key, value] of Object.entries(adapter.headers || {})) {
      headers[key] = renderTemplate(value, context);
    }
    const method = (adapter.method || 'POST').toUpperCase();
    const body = ['GET', 'HEAD'].includes(method) ? undefined : renderTemplate(adapter.body, context);
    if (body && !headers['content-type']) headers['content-type'] = 'application/json';
    const response = await fetch(url, { method, headers, body, signal: controller.signal });
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { ok: response.ok, status: response.status, body: text.slice(0, 2000), json, write };
  } catch (error) {
    const aborted = error?.name === 'AbortError';
    return { ok: false, error: aborted ? '请求超时' : String(error?.message || error) };
  } finally {
    clearTimeout(timer);
  }
}

async function syncFromAdapter(store, device) {
  const result = await adapterRequest(device, { action: 'sync' });
  if (!result.ok || result.skipped) {
    if (!result.ok) {
      device.online = false;
      pushEvent(store, {
        level: 'warn',
        type: 'adapter',
        message: `${device.name} 同步失败：${result.error || result.status}`,
        meta: { deviceId: device.id }
      });
    }
    return result;
  }
  device.online = true;
  const source = device.adapter.readPath ? getPath(result.json, device.adapter.readPath) : result.json;
  if (source && typeof source === 'object') {
    let changed = false;
    for (const key of device.capabilities) {
      if (source[key] === undefined) continue;
      const normalized = normalizeValue(key, source[key]);
      if (normalized.ok) {
        device.state[key] = normalized.value;
        changed = true;
      }
    }
    if (changed) device.updatedAt = new Date().toISOString();
  }
  return result;
}

function coerceActionState(device, action, payload) {
  const caps = device.capabilities;
  const changes = {};
  if (action === 'turn_on') {
    if (caps.includes('power')) changes.power = 'on';
    else if (caps.includes('locked')) changes.locked = false;
    else if (caps.includes('position')) changes.position = 100;
    else throw new Error(`${device.name} 不支持开关操作`);
    if (payload.brightness !== undefined && caps.includes('brightness')) changes.brightness = payload.brightness;
    if (payload.targetTemp !== undefined && caps.includes('targetTemp')) changes.targetTemp = payload.targetTemp;
  } else if (action === 'turn_off') {
    if (caps.includes('power')) changes.power = 'off';
    else if (caps.includes('locked')) changes.locked = true;
    else if (caps.includes('position')) changes.position = 0;
    else throw new Error(`${device.name} 不支持开关操作`);
  } else if (action === 'toggle') {
    if (caps.includes('power')) changes.power = device.state.power === 'on' ? 'off' : 'on';
    else if (caps.includes('locked')) changes.locked = !device.state.locked;
    else if (caps.includes('position')) changes.position = device.state.position > 0 ? 0 : 100;
    else throw new Error(`${device.name} 不支持切换操作`);
  } else if (action === 'set') {
    const keys = Object.keys(payload || {});
    if (keys.length === 0) throw new Error('set 操作需要至少一个字段');
    for (const key of keys) {
      if (!caps.includes(key)) throw new Error(`${device.name} 没有「${key}」能力`);
      changes[key] = payload[key];
    }
  }
  return changes;
}

/** 本地执行设备动作，可选回写 HTTP 适配器 */
export async function applyAction(store, deviceId, action, payload = {}, { source = 'api' } = {}) {
  const device = findDevice(store, deviceId);
  if (!device) throw new Error('设备不存在');
  if (!ACTIONS.includes(action)) throw new Error(`不支持的动作：${action}`);

  if (action === 'sync' || action === 'refresh') {
    const result = await syncFromAdapter(store, device);
    store.save();
    pushEvent(store, {
      level: result.ok ? 'info' : 'warn',
      type: 'device',
      message: `${device.name} 同步${result.ok ? '完成' : '失败'}`,
      meta: { deviceId: device.id, source }
    });
    return { device, action, adapter: result };
  }

  const changes = coerceActionState(device, action, payload);
  const normalized = {};
  for (const [key, raw] of Object.entries(changes)) {
    const result = normalizeValue(key, raw);
    if (!result.ok) throw new Error(result.error);
    normalized[key] = result.value;
  }
  device.state = { ...device.state, ...normalized };
  device.updatedAt = new Date().toISOString();
  device.online = true;

  let adapter = null;
  if (device.adapter?.kind === 'http' && device.adapter.write) {
    adapter = await adapterRequest(device, { action, payload: normalized, write: true });
    if (!adapter.ok) {
      device.online = false;
      pushEvent(store, {
        level: 'warn',
        type: 'adapter',
        message: `${device.name} 写回失败：${adapter.error || adapter.status}`,
        meta: { deviceId: device.id }
      });
    }
  }

  store.save();
  pushEvent(store, {
    level: 'info',
    type: 'device',
    message: `${device.name} · ${actionLabel(action)}`,
    meta: { deviceId: device.id, action, changes: normalized, source }
  });
  return { device, action, changes: normalized, adapter };
}

export function actionLabel(action) {
  const labels = {
    turn_on: '开启',
    turn_off: '关闭',
    toggle: '切换',
    set: '设置状态',
    sync: '同步',
    refresh: '刷新'
  };
  return labels[action] || action;
}

export function getTask(store, taskId) {
  return store.data.tasks.find((task) => task.id === taskId) || null;
}

/** 立即执行一条定时任务并滚动到下一次触发时间 */
export async function runTask(store, taskId, { source = 'manual', now = new Date() } = {}) {
  const task = getTask(store, taskId);
  if (!task) throw new Error('任务不存在');
  const device = findDevice(store, task.deviceId);
  if (!device) throw new Error('任务关联的设备不存在');
  const result = await applyAction(store, task.deviceId, task.action.type, task.action.payload || {}, {
    source: `task:${task.name}`
  });
  task.lastRunAt = now.toISOString();
  task.runCount = (task.runCount || 0) + 1;
  task.lastSource = source;
  task.nextRunAt = task.enabled ? nextRunAt(task.schedule, new Date(now.getTime() + 1000))?.toISOString() || null : null;
  store.save();
  pushEvent(store, {
    level: 'info',
    type: 'task',
    message: `任务「${task.name}」已执行（${source}）`,
    meta: { taskId: task.id, deviceId: device.id }
  });
  return { task, device: result.device, changes: result.changes };
}

/** 调度器心跳：没有 nextRunAt 的任务先排期，到期的执行一次 */
export async function tickScheduler(store, now = new Date()) {
  const executed = [];
  for (const task of store.data.tasks) {
    if (!task.enabled) {
      if (task.nextRunAt) {
        task.nextRunAt = null;
        store.save();
      }
      continue;
    }
    if (!task.nextRunAt) {
      task.nextRunAt = nextRunAt(task.schedule, now)?.toISOString() || null;
      store.save();
      continue;
    }
    if (new Date(task.nextRunAt).getTime() <= now.getTime()) {
      try {
        const result = await runTask(store, task.id, { source: 'scheduler', now });
        executed.push({ taskId: task.id, name: task.name, deviceId: task.deviceId, changes: result.changes });
      } catch (error) {
        pushEvent(store, {
          level: 'error',
          type: 'task',
          message: `任务「${task.name}」执行失败：${error.message}`,
          meta: { taskId: task.id }
        });
        task.nextRunAt = nextRunAt(task.schedule, now)?.toISOString() || null;
        store.save();
      }
    }
  }
  return executed;
}

export function systemSnapshot(store, { devices: scopedDevices, tasks: scopedTasks, hideTokens = false } = {}) {
  const devices = scopedDevices || store.data.devices;
  const tasks = scopedTasks || store.data.tasks;
  const online = devices.filter((device) => device.online !== false).length;
  const memory = process.memoryUsage();
  const activeTasks = tasks.filter((task) => task.enabled).length;
  return {
    version: '1.0.0',
    homeName: store.data.settings.homeName,
    now: new Date().toISOString(),
    startedAt: store.data.startedAt || null,
    uptimeSec: Math.round(process.uptime()),
    platform: `${os.type()} ${os.release()}`,
    cpuCount: os.cpus().length,
    loadAvg: Number((os.loadavg()[0] || 0).toFixed(2)),
    memory: {
      rssMb: Math.round(memory.rss / 1048576),
      heapMb: Math.round(memory.heapUsed / 1048576),
      totalMb: Math.round(os.totalmem() / 1048576)
    },
    counts: {
      devices: devices.length,
      online,
      offline: devices.length - online,
      categories: store.data.categories.length,
      tasks: tasks.length,
      activeTasks,
      tokens: hideTokens ? 0 : store.data.tokens.filter((token) => !token.revoked).length,
      plugins: store.data.plugins.length,
      activePlugins: store.data.plugins.filter((plugin) => plugin.enabled).length,
      events: store.data.events.length,
      pendingPairings: store.data.pairings.filter((item) => item.status === 'pending').length
    },
    onlineRatio: devices.length ? Math.round((online / devices.length) * 100) : 0
  };
}
