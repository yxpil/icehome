import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import QRCode from 'qrcode';
import { WEB_DIST, VERSION } from './config.js';
import { CAPABILITIES, DEVICE_TEMPLATES, describeCapability } from './capabilities.js';
import { applyDevicePatch, buildDevice, normalizeAdapter } from './devices.js';
import { ACTIONS, adapterRequest, applyAction, findDevice, pushEvent, runTask, systemSnapshot } from './engine.js';
import { buildAiManual, parseCommand, describeState } from './ai.js';
import { createCacheMiddleware, createInvalidationMiddleware, createMemoryCache } from './cache.js';
import {
  applyAccountPatch,
  buildAccount,
  canAccessDevice,
  deviceScopeFor,
  normalizeUsername,
  publicAccount,
  scopesForRole,
  verifyPassword
} from './accounts.js';
import { apiKey, id, maskKey, pairingCode } from './ids.js';
import { describeSchedule, isValidCron, nextRunAt, normalizeSchedule } from './cron.js';
import {
  configPayload,
  deviceQrPayload,
  INSPECTION_STATUS,
  normalizeWifi,
  parseInspectionCode,
  wifiPayload
} from './qrpayload.js';
import { listInterfaces, scanNetwork } from './network.js';

const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

const SCOPE_BY_ROUTE = {
  'device:read': ['admin', 'device:read', 'device:write'],
  'device:write': ['admin', 'device:write'],
  'ai:use': ['admin', 'ai:use'],
  admin: ['admin']
};

function fail(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

function hasScope(token, scope, user) {
  const allowed = SCOPE_BY_ROUTE[scope] || ['admin'];
  const effective = user ? scopesForRole(user.role) : token.scopes;
  return effective.some((item) => allowed.includes(item));
}

function isLoopback(req) {
  const ip = req.ip || req.socket?.remoteAddress || '';
  const normalized = ip.replace(/^::ffff:/, '');
  return normalized === '127.0.0.1' || normalized === '::1' || normalized === 'localhost';
}

function authenticate(store) {
  return (req, res, next) => {
    const header = String(req.get('authorization') || '');
    const bearer = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
    const fallback = String(req.get('x-ice-token') || '').trim();
    const key = bearer || fallback;
    if (!key) return fail(res, 401, 'unauthorized', '缺少 Bearer Token');
    const token = store.data.tokens.find((item) => item.key === key && !item.revoked);
    if (!token) return fail(res, 401, 'invalid_token', '令牌不存在或已吊销');
    let user = null;
    if (token.userId) {
      user = (store.data.users || []).find((item) => item.id === token.userId);
      if (!user || user.active === false) {
        return fail(res, 401, 'account_disabled', '账户不存在或已停用');
      }
    }
    token.lastUsedAt = new Date().toISOString();
    token.requestCount = (token.requestCount || 0) + 1;
    store.save();
    req.token = token;
    req.user = user;
    req.scopeGuard = (scope) => {
      if (!hasScope(token, scope, user)) {
        const label = user && user.role !== 'admin' ? `账户「${user.displayName}」缺少 ${scope} 权限` : `令牌缺少 ${scope} 权限`;
        fail(res, 403, 'forbidden', label);
        return false;
      }
      return true;
    };
    return next();
  };
}

function visibleDevices(store, req) {
  const scope = deviceScopeFor(req);
  if (!scope) return store.data.devices;
  return store.data.devices.filter((device) => scope.has(device.id));
}

function visibleTasks(store, req) {
  const scope = deviceScopeFor(req);
  if (!scope) return store.data.tasks;
  return store.data.tasks.filter((task) => scope.has(task.deviceId));
}

function requestAccount(req) {
  if (req.user) return publicAccount(req.user);
  return { id: null, username: null, displayName: '本地面板令牌', role: 'admin', active: true, legacy: true, deviceIds: null };
}

function publicSettings(settings, req) {
  if (requestAccount(req).role === 'admin') return settings;
  const wifi = settings.wifi
    ? {
        ssid: settings.wifi.ssid || '',
        security: settings.wifi.security || 'WPA',
        hidden: Boolean(settings.wifi.hidden),
        hasPassword: Boolean(settings.wifi.password)
      }
    : null;
  return { ...settings, wifi };
}

function visibleEvents(store, req) {
  const scope = deviceScopeFor(req);
  const events = store.data.events;
  if (!scope) return events;
  return events.filter((event) => {
    if (['device', 'adapter', 'task', 'inspection'].includes(event.type)) {
      return Boolean(event.meta?.deviceId && scope.has(event.meta.deviceId));
    }
    return true;
  });
}

function scopedStore(store, req) {
  const scope = deviceScopeFor(req);
  if (!scope) return store;
  return {
    ...store,
    data: {
      ...store.data,
      devices: store.data.devices.filter((device) => scope.has(device.id)),
      tasks: store.data.tasks.filter((task) => scope.has(task.deviceId)),
      tokens: [],
      users: []
    }
  };
}

async function qr(payload, { width = 220 } = {}) {
  const base = {
    type: 'svg',
    width,
    margin: 1,
    color: { dark: '#0A0A0A', light: '#FFFFFF' }
  };
  try {
    return await QRCode.toString(payload, { ...base, errorCorrectionLevel: 'M' });
  } catch {
    return QRCode.toString(payload, { ...base, errorCorrectionLevel: 'L' });
  }
}

function publicToken(token) {
  return {
    id: token.id,
    name: token.name,
    prefix: maskKey(token.key),
    scopes: token.scopes,
    userId: token.userId || null,
    createdAt: token.createdAt,
    lastUsedAt: token.lastUsedAt,
    requestCount: token.requestCount,
    revoked: Boolean(token.revoked),
    note: token.note || ''
  };
}

function templatesFor(store) {
  const builtin = Object.entries(DEVICE_TEMPLATES).map(([key, value]) => ({
    key,
    label: value.label,
    icon: value.icon,
    capabilities: value.capabilities,
    origin: 'builtin'
  }));
  const contributed = store.data.plugins
    .filter((plugin) => plugin.enabled)
    .flatMap((plugin) =>
      (plugin.templates || []).map((item) => ({
        key: item.key,
        label: item.name,
        icon: item.icon || 'cube',
        capabilities: item.capabilities || ['power'],
        origin: plugin.name
      }))
    );
  return [...builtin, ...contributed];
}

function snapshot(store, infra = {}, req = { token: null, user: null }) {
  const scope = deviceScopeFor(req);
  const devices = visibleDevices(store, req);
  const tasks = visibleTasks(store, req);
  const plans = (store.data.plans || []).map((plan) =>
    scope ? { ...plan, markers: (plan.markers || []).filter((marker) => scope.has(marker.deviceId)) } : plan
  );
  const inspections = (store.data.inspections || []).filter((item) => !scope || scope.has(item.deviceId)).slice(0, 60);
  return {
    settings: publicSettings(store.data.settings, req),
    stats: systemSnapshot(store, { devices, tasks, hideTokens: Boolean(scope) }),
    infra,
    account: requestAccount(req),
    categories: store.data.categories,
    devices,
    tasks,
    plans,
    inspections,
    plugins: store.data.plugins,
    tokens: scope ? [] : store.data.tokens.map(publicToken),
    pairings: scope ? [] : store.data.pairings,
    events: visibleEvents(store, req).slice(0, 80),
    templates: templatesFor(store),
    capabilities: Object.keys(CAPABILITIES).map(describeCapability),
    templatesMeta: DEVICE_TEMPLATES,
    actions: ACTIONS,
    version: VERSION
  };
}

function normalizeTaskInput(store, input, { allowMissingSchedule = false } = {}) {  const device = findDevice(store, input.deviceId);
  if (!device) throw new Error('任务关联的设备不存在');
  const name = String(input.name || '').trim();
  if (!name) throw new Error('任务名称不能为空');
  if (name.length > 40) throw new Error('任务名称最长 40 个字符');
  const actionType = String(input.action?.type || '');
  if (!ACTIONS.includes(actionType)) throw new Error(`任务动作必须是 ${ACTIONS.join(' / ')}`);
  const schedule = input.schedule ? normalizeSchedule(input.schedule) : null;
  if (!schedule && !allowMissingSchedule) throw new Error('必须提供 schedule');
  return {
    name,
    deviceId: device.id,
    schedule,
    action: { type: actionType, payload: input.action?.payload || {} },
    enabled: input.enabled === undefined ? true : Boolean(input.enabled)
  };
}

function normalizePlanInput(store, input, existing = null) {
  const base = existing || {};
  const width = Math.round(Number(input.width ?? base.width ?? 1200));
  const height = Math.round(Number(input.height ?? base.height ?? 760));
  if (!Number.isFinite(width) || width < 480 || width > 4000) throw new Error('平面图宽度需在 480-4000 之间');
  if (!Number.isFinite(height) || height < 360 || height > 4000) throw new Error('平面图高度需在 360-4000 之间');
  const name = String(input.name ?? base.name ?? '家庭平面').trim() || '家庭平面';
  if (name.length > 40) throw new Error('平面图名称最长 40 个字符');

  const rooms = input.rooms === undefined ? base.rooms || [] : input.rooms;
  if (!Array.isArray(rooms)) throw new Error('rooms 必须是房间数组');
  if (rooms.length > 40) throw new Error('房间数量不能超过 40');

  const normalizedRooms = rooms.map((room) => {
    const roomName = String(room?.name ?? '房间').trim() || '房间';
    if (roomName.length > 24) throw new Error('房间名称最长 24 个字符');
    const x = Math.round(Number(room?.x));
    const y = Math.round(Number(room?.y));
    const w = Math.round(Number(room?.w));
    const h = Math.round(Number(room?.h));
    if (![x, y, w, h].every(Number.isFinite)) throw new Error('房间坐标必须是数字');
    if (w < 60 || h < 60) throw new Error('房间宽高至少 60');
    if (x < 0 || y < 0 || x + w > width || y + h > height) throw new Error('房间超出平面图边界');
    return { id: String(room.id || id('room')), name: roomName, x, y, w, h };
  });

  const markers = input.markers === undefined ? base.markers || [] : input.markers;
  if (!Array.isArray(markers)) throw new Error('markers 必须是设备标记数组');
  if (markers.length > 200) throw new Error('设备标记不能超过 200 个');
  const deviceIds = new Set(store.data.devices.map((device) => device.id));
  const seen = new Set();
  const normalizedMarkers = markers.map((marker) => {
    const deviceId = String(marker?.deviceId || '');
    if (!deviceIds.has(deviceId)) throw new Error(`标记的设备不存在：${deviceId || '(空)'}`);
    if (seen.has(deviceId)) throw new Error(`设备重复标记：${deviceId}`);
    seen.add(deviceId);
    const x = Math.round(Number(marker?.x));
    const y = Math.round(Number(marker?.y));
    if (![x, y].every(Number.isFinite)) throw new Error('设备坐标必须是数字');
    if (x < 0 || y < 0 || x > width || y > height) throw new Error('设备标记超出平面图边界');
    return { deviceId, x, y };
  });

  return {
    id: existing?.id || id('plan'),
    name,
    width,
    height,
    rooms: normalizedRooms,
    markers: normalizedMarkers,
    updatedAt: new Date().toISOString()
  };
}

function buildConfigBundle(store) {
  const exportedAt = new Date().toISOString();
  return {
    schema: 'icehome.config/1',
    version: VERSION,
    exportedAt,
    settings: { ...store.data.settings },
    categories: store.data.categories.map(({ id: categoryId, name, icon, description, order }) => ({
      id: categoryId,
      name,
      icon,
      description: description || '',
      order
    })),
    devices: store.data.devices.map((device) => ({
      id: device.id,
      name: device.name,
      template: device.template,
      capabilities: device.capabilities,
      state: device.state,
      adapter: device.adapter,
      online: device.online,
      categoryName: store.data.categories.find((item) => item.id === device.categoryId)?.name || null,
      order: device.order
    })),
    tasks: store.data.tasks,
    plugins: store.data.plugins,
    plans: store.data.plans || []
  };
}

function recordInspection(store, req, device, body = {}) {
  const status = String(body.status || 'ok');
  if (!INSPECTION_STATUS.includes(status)) throw new Error('巡检状态必须是 ok / issue / offline');
  const note = String(body.note || '').trim();
  if (note.length > 120) throw new Error('巡检备注最长 120 个字符');
  const inspection = {
    id: id('insp'),
    deviceId: device.id,
    deviceName: device.name,
    status,
    note,
    by: requestAccount(req).displayName || '本地面板',
    ts: new Date().toISOString()
  };
  if (!Array.isArray(store.data.inspections)) store.data.inspections = [];
  store.data.inspections.unshift(inspection);
  store.data.inspections = store.data.inspections.slice(0, 200);
  store.save();
  pushEvent(store, {
    level: status === 'ok' ? 'info' : 'warn',
    type: 'inspection',
    message: `${inspection.by} 巡检「${device.name}」：${status}`,
    meta: { deviceId: device.id, status }
  });
  return inspection;
}

export function createApp({ store, cache, serveStatic = true, corsOrigins = [], staticDir = WEB_DIST }) {
  const app = express();
  const configExports = new Map();
  const pageCache = cache || createMemoryCache({ ttlSeconds: store.data.settings.cache?.ttlSeconds || 5 });
  const infra = () => ({
    storage: store.persistence?.status?.() || {
      driver: 'json',
      connected: true,
      target: store.file || null,
      latencyMs: 0
    },
    cache: pageCache.stats(),
    staticServing: Boolean(serveStatic)
  });

  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(express.json({ limit: '2mb' }));

  if (corsOrigins.length) {
    app.use((req, res, next) => {
      const origin = req.get('origin');
      if (origin && (corsOrigins.includes('*') || corsOrigins.includes(origin))) {
        res.set('Access-Control-Allow-Origin', origin);
        res.set('Vary', 'Origin');
        res.set('Access-Control-Allow-Headers', 'authorization,content-type,x-ice-token,cache-control');
        res.set('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
        res.set('Access-Control-Max-Age', '600');
      }
      if (req.method === 'OPTIONS') return res.status(204).end();
      return next();
    });
  }

  app.use(createInvalidationMiddleware({ store, cache: pageCache }));

  app.get('/api/health', (req, res) => {
    res.json({ ok: true, service: 'icehome', version: VERSION, now: new Date().toISOString() });
  });

  app.post(
    '/api/auth/bootstrap',
    wrap(async (req, res) => {
      if (!store.data.settings.allowLocalBootstrap) {
        return fail(res, 403, 'forbidden', '本机自动签发已关闭，请手动填入令牌');
      }
      if (!isLoopback(req)) {
        return fail(res, 403, 'forbidden', '仅允许本机浏览器自动获取面板令牌');
      }
      let token = store.data.tokens.find((item) => item.name === '本地面板' && !item.revoked);
      if (!token) {
        token = {
          id: id('tok'),
          name: '本地面板',
          key: apiKey(),
          scopes: ['admin'],
          createdAt: new Date().toISOString(),
          lastUsedAt: null,
          requestCount: 0,
          revoked: false
        };
        store.data.tokens.unshift(token);
        store.save();
      }
      res.json({ token: token.key, homeName: store.data.settings.homeName, version: VERSION });
    })
  );

  const loginFailures = new Map();
  const loginWindowMs = 10 * 60 * 1000;
  const loginLimit = 5;

  app.post(
    '/api/auth/login',
    wrap(async (req, res) => {
      const username = normalizeUsername(req.body?.username);
      const password = String(req.body?.password || '');
      if (!username || !password) return fail(res, 400, 'validation_error', '请填写用户名与口令');
      const throttleKey = `${req.ip || 'local'}:${username}`;
      const record = loginFailures.get(throttleKey);
      const now = Date.now();
      if (record && record.count >= loginLimit && now < record.resetAt) {
        return fail(res, 429, 'too_many_attempts', '登录尝试过于频繁，请稍后再试');
      }
      if (record && now >= record.resetAt) loginFailures.delete(throttleKey);
      const user = (store.data.users || []).find((item) => item.username === username);
      if (!user || !verifyPassword(user.passwordHash, password)) {
        const next = { count: (record?.count || 0) + 1, resetAt: record?.resetAt || now + loginWindowMs };
        loginFailures.set(throttleKey, next);
        return fail(res, 401, 'invalid_credentials', '用户名或口令不正确');
      }
      if (user.active === false) return fail(res, 403, 'account_disabled', '账户已停用，请联系管理员');
      loginFailures.delete(throttleKey);
      const token = {
        id: id('tok'),
        name: `登录会话 · ${user.displayName}`,
        key: apiKey(),
        scopes: scopesForRole(user.role),
        userId: user.id,
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
        requestCount: 0,
        revoked: false,
        note: `账户 ${user.username}`
      };
      user.lastLoginAt = token.createdAt;
      store.data.tokens.unshift(token);
      store.save();
      pushEvent(store, {
        level: 'info',
        type: 'system',
        message: `账户「${user.displayName}」登录`,
        meta: { userId: user.id }
      });
      return res.json({ token: token.key, user: publicAccount(user) });
    })
  );

  app.get('/api/config/export/:token', (req, res) => {
    const token = String(req.params.token || '');
    const entry = configExports.get(token);
    if (!entry || entry.expiresAt < Date.now()) {
      configExports.delete(token);
      return fail(res, 404, 'not_found', '配置下载链接已过期，请重新生成二维码');
    }
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="${entry.filename}"`);
    return res.send(JSON.stringify(entry.config, null, 2));
  });

  app.use('/api', authenticate(store));
  app.use('/v1', authenticate(store));
  app.use('/api', createCacheMiddleware({ store, cache: pageCache }));

  app.get(
    '/api/auth/me',
    wrap(async (req, res) => {
      if (!req.scopeGuard('device:read')) return undefined;
      return res.json({ account: requestAccount(req), token: publicToken(req.token) });
    })
  );

  app.post(
    '/api/auth/logout',
    wrap(async (req, res) => {
      req.token.revoked = true;
      req.token.revokedAt = new Date().toISOString();
      store.save();
      return res.json({ ok: true, account: requestAccount(req) });
    })
  );

  // ---------- 状态快照 ----------
  app.get(
    '/api/state',
    wrap(async (req, res) => {
      if (!req.scopeGuard('device:read')) return undefined;
      return res.json(snapshot(store, infra(), req));
    })
  );

  app.get(
    '/api/system',
    wrap(async (req, res) => {
      if (!req.scopeGuard('device:read')) return undefined;
      return res.json({
        ...systemSnapshot(store, { devices: visibleDevices(store, req), tasks: visibleTasks(store, req) }),
        ...infra()
      });
    })
  );

  app.post(
    '/api/system/storage/test',
    wrap(async (req, res) => {
      if (!req.scopeGuard('admin')) return undefined;
      if (!store.persistence?.test) return res.json({ result: { ok: true, driver: 'json', latencyMs: 0 } });
      const result = await store.persistence.test();
      return res.json({ result, status: infra().storage });
    })
  );

  app.get(
    '/api/cache/stats',
    wrap(async (req, res) => {
      if (!req.scopeGuard('device:read')) return undefined;
      return res.json({ cache: pageCache.stats(), settings: store.data.settings.cache || null });
    })
  );

  app.post(
    '/api/cache/purge',
    wrap(async (req, res) => {
      if (!req.scopeGuard('admin')) return undefined;
      await pageCache.clear();
      pushEvent(store, { level: 'info', type: 'system', message: '页面缓存已清空' });
      store.save();
      return res.json({ cleared: true, cache: pageCache.stats() });
    })
  );

  app.get(
    '/api/events',
    wrap(async (req, res) => {
      if (!req.scopeGuard('device:read')) return undefined;
      const limit = Math.min(Number(req.query.limit) || 40, 200);
      return res.json({ events: visibleEvents(store, req).slice(0, limit) });
    })
  );

  app.patch(
    '/api/settings',
    wrap(async (req, res) => {
      if (!req.scopeGuard('admin')) return undefined;
      const patch = req.body || {};
      if (patch.homeName !== undefined) {
        const homeName = String(patch.homeName).trim();
        if (!homeName) return fail(res, 400, 'validation_error', '家庭名称不能为空');
        store.data.settings.homeName = homeName;
      }
      if (patch.allowLocalBootstrap !== undefined) {
        store.data.settings.allowLocalBootstrap = Boolean(patch.allowLocalBootstrap);
      }
      if (patch.cache !== undefined) {
        const current = store.data.settings.cache || { enabled: false, ttlSeconds: 5 };
        const ttl = Number(patch.cache.ttlSeconds ?? current.ttlSeconds ?? 5);
        if (!Number.isFinite(ttl) || ttl < 1 || ttl > 120) {
          return fail(res, 400, 'validation_error', '缓存 TTL 需要在 1 - 120 秒之间');
        }
        store.data.settings.cache = {
          enabled: patch.cache.enabled === undefined ? Boolean(current.enabled) : Boolean(patch.cache.enabled),
          ttlSeconds: Math.round(ttl)
        };
      }
      if (patch.wifi !== undefined) {
        try {
          store.data.settings.wifi = normalizeWifi(patch.wifi, store.data.settings.wifi || {});
        } catch (error) {
          return fail(res, 400, 'validation_error', error.message);
        }
      }
      store.save();
      return res.json({ settings: publicSettings(store.data.settings, req) });
    })
  );

  // ---------- 设备 ----------
  app.get(
    '/api/devices',
    wrap(async (req, res) => {
      if (!req.scopeGuard('device:read')) return undefined;
      res.json({ devices: visibleDevices(store, req) });
    })
  );

  app.post(
    '/api/devices',
    wrap(async (req, res) => {
      if (!req.scopeGuard('admin')) return undefined;
      const body = req.body || {};
      const nextOrder = Math.max(0, ...store.data.devices.map((device) => Number(device.order) || 0)) + 1;
      const device = buildDevice(body, {
        categories: store.data.categories,
        order: body.order ?? nextOrder,
        source: body.source || 'manual',
        templates: templatesFor(store)
      });
      store.data.devices.push(device);
      store.save();
      pushEvent(store, {
        level: 'info',
        type: 'device',
        message: `新增设备「${device.name}」`,
        meta: { deviceId: device.id }
      });
      res.status(201).json({ device });
    })
  );

  app.get(
    '/api/devices/:id',
    wrap(async (req, res) => {
      if (!req.scopeGuard('device:read')) return undefined;
      if (!canAccessDevice(req, req.params.id)) {
        return fail(res, 403, 'device_forbidden', '当前账户无权访问该设备');
      }
      const device = findDevice(store, req.params.id);
      if (!device) return fail(res, 404, 'not_found', '设备不存在');
      return res.json({ device });
    })
  );

  app.patch(
    '/api/devices/:id',
    wrap(async (req, res) => {
      if (!req.scopeGuard('admin')) return undefined;
      const device = findDevice(store, req.params.id);
      if (!device) return fail(res, 404, 'not_found', '设备不存在');
      const next = applyDevicePatch(device, req.body || {}, { categories: store.data.categories });
      Object.assign(device, next);
      store.save();
      pushEvent(store, {
        level: 'info',
        type: 'device',
        message: `更新设备「${device.name}」`,
        meta: { deviceId: device.id }
      });
      return res.json({ device });
    })
  );

  app.delete(
    '/api/devices/:id',
    wrap(async (req, res) => {
      if (!req.scopeGuard('admin')) return undefined;
      const device = findDevice(store, req.params.id);
      if (!device) return fail(res, 404, 'not_found', '设备不存在');
      store.data.devices = store.data.devices.filter((item) => item.id !== device.id);
      store.data.tasks = store.data.tasks.filter((task) => task.deviceId !== device.id);
      for (const plan of store.data.plans || []) {
        plan.markers = (plan.markers || []).filter((marker) => marker.deviceId !== device.id);
        plan.updatedAt = new Date().toISOString();
      }
      for (const user of store.data.users || []) {
        if (user.deviceIds?.includes(device.id)) {
          user.deviceIds = user.deviceIds.filter((item) => item !== device.id);
          user.updatedAt = new Date().toISOString();
        }
      }
      store.save();
      pushEvent(store, {
        level: 'warn',
        type: 'device',
        message: `删除设备「${device.name}」`,
        meta: { deviceId: device.id }
      });
      return res.json({ ok: true, removed: device.id });
    })
  );

  app.post(
    '/api/devices/:id/actions',
    wrap(async (req, res) => {
      if (!req.scopeGuard('device:write')) return undefined;
      if (!canAccessDevice(req, req.params.id)) {
        return fail(res, 403, 'device_forbidden', '当前账户无权控制该设备');
      }
      if (!findDevice(store, req.params.id)) return fail(res, 404, 'not_found', '设备不存在');
      const { action, payload } = req.body || {};
      const result = await applyAction(store, req.params.id, action, payload || {});
      return res.json({ device: result.device, changes: result.changes || {}, adapter: result.adapter || null });
    })
  );

  app.post(
    '/api/devices/:id/probe',
    wrap(async (req, res) => {
      if (!req.scopeGuard('device:write')) return undefined;
      if (!canAccessDevice(req, req.params.id)) {
        return fail(res, 403, 'device_forbidden', '当前账户无权探测该设备');
      }
      const device = findDevice(store, req.params.id);
      if (!device) return fail(res, 404, 'not_found', '设备不存在');
      const result = await adapterRequest(device, { action: 'probe' });
      device.online = result.ok !== false;
      store.save();
      pushEvent(store, {
        level: result.ok ? 'info' : 'warn',
        type: 'adapter',
        message: `${device.name} 接口探测${result.ok ? '成功' : `失败：${result.error || result.status}`}`,
        meta: { deviceId: device.id }
      });
      return res.json({ result });
    })
  );

  // ---------- 分类 ----------
  app.get(
    '/api/categories',
    wrap(async (req, res) => {
      if (!req.scopeGuard('device:read')) return undefined;
      res.json({ categories: store.data.categories });
    })
  );

  app.post(
    '/api/categories',
    wrap(async (req, res) => {
      if (!req.scopeGuard('admin')) return undefined;
      const body = req.body || {};
      const name = String(body.name || '').trim();
      if (!name) return fail(res, 400, 'validation_error', '分类名称不能为空');
      if (store.data.categories.some((item) => item.name === name)) {
        return fail(res, 409, 'conflict', '分类名称已存在');
      }
      const category = {
        id: id('cat'),
        name,
        icon: String(body.icon || 'grid'),
        description: String(body.description || ''),
        order: Number.isFinite(Number(body.order))
          ? Number(body.order)
          : Math.max(0, ...store.data.categories.map((item) => item.order)) + 1,
        createdAt: new Date().toISOString()
      };
      store.data.categories.push(category);
      store.save();
      pushEvent(store, { level: 'info', type: 'system', message: `新增分类「${name}」` });
      return res.status(201).json({ category });
    })
  );

  app.patch(
    '/api/categories/:id',
    wrap(async (req, res) => {
      if (!req.scopeGuard('admin')) return undefined;
      const category = store.data.categories.find((item) => item.id === req.params.id);
      if (!category) return fail(res, 404, 'not_found', '分类不存在');
      const body = req.body || {};
      if (body.name !== undefined) {
        const name = String(body.name).trim();
        if (!name) return fail(res, 400, 'validation_error', '分类名称不能为空');
        category.name = name;
      }
      if (body.icon !== undefined) category.icon = String(body.icon);
      if (body.description !== undefined) category.description = String(body.description);
      if (body.order !== undefined && Number.isFinite(Number(body.order))) category.order = Number(body.order);
      store.save();
      return res.json({ category });
    })
  );

  app.delete(
    '/api/categories/:id',
    wrap(async (req, res) => {
      if (!req.scopeGuard('admin')) return undefined;
      const category = store.data.categories.find((item) => item.id === req.params.id);
      if (!category) return fail(res, 404, 'not_found', '分类不存在');
      store.data.categories = store.data.categories.filter((item) => item.id !== category.id);
      for (const device of store.data.devices) {
        if (device.categoryId === category.id) device.categoryId = null;
      }
      store.save();
      return res.json({ ok: true, removed: category.id, orphanDevices: store.data.devices.filter((d) => !d.categoryId).length });
    })
  );

  // ---------- 定时任务 ----------
  app.get(
    '/api/tasks',
    wrap(async (req, res) => {
      if (!req.scopeGuard('device:read')) return undefined;
      res.json({ tasks: visibleTasks(store, req) });
    })
  );

  app.post(
    '/api/tasks',
    wrap(async (req, res) => {
      if (!req.scopeGuard('device:write')) return undefined;
      if (!canAccessDevice(req, req.body?.deviceId)) {
        return fail(res, 403, 'device_forbidden', '当前账户无权为该设备创建任务');
      }
      const normalized = normalizeTaskInput(store, req.body || {});
      const task = {
        id: id('task'),
        ...normalized,
        lastRunAt: null,
        nextRunAt: null,
        runCount: 0,
        createdAt: new Date().toISOString()
      };
      task.nextRunAt = task.enabled ? nextRunAt(task.schedule, new Date())?.toISOString() || null : null;
      store.data.tasks.push(task);
      store.save();
      pushEvent(store, {
        level: 'info',
        type: 'task',
        message: `创建任务「${task.name}」· ${describeSchedule(task.schedule)}`
      });
      return res.status(201).json({ task });
    })
  );

  app.patch(
    '/api/tasks/:id',
    wrap(async (req, res) => {
      if (!req.scopeGuard('device:write')) return undefined;
      const task = store.data.tasks.find((item) => item.id === req.params.id);
      if (!task) return fail(res, 404, 'not_found', '任务不存在');
      if (!canAccessDevice(req, task.deviceId)) {
        return fail(res, 403, 'device_forbidden', '当前账户无权修改该任务');
      }
      const body = req.body || {};
      if (body.name !== undefined) {
        const name = String(body.name).trim();
        if (!name) return fail(res, 400, 'validation_error', '任务名称不能为空');
        task.name = name;
      }
      if (body.deviceId !== undefined) {
        if (!canAccessDevice(req, body.deviceId)) {
          return fail(res, 403, 'device_forbidden', '当前账户无权把任务改到该设备');
        }
        if (!findDevice(store, body.deviceId)) return fail(res, 400, 'validation_error', '设备不存在');
        task.deviceId = body.deviceId;
      }
      if (body.schedule !== undefined) {
        try {
          task.schedule = normalizeSchedule(body.schedule);
        } catch (error) {
          return fail(res, 400, 'validation_error', error.message);
        }
      }
      if (body.action !== undefined) {
        if (!ACTIONS.includes(body.action?.type)) {
          return fail(res, 400, 'validation_error', `任务动作必须是 ${ACTIONS.join(' / ')}`);
        }
        task.action = { type: body.action.type, payload: body.action.payload || {} };
      }
      if (body.enabled !== undefined) task.enabled = Boolean(body.enabled);
      task.nextRunAt = task.enabled ? nextRunAt(task.schedule, new Date())?.toISOString() || null : null;
      store.save();
      return res.json({ task });
    })
  );

  app.post(
    '/api/tasks/:id/run',
    wrap(async (req, res) => {
      if (!req.scopeGuard('device:write')) return undefined;
      const task = store.data.tasks.find((item) => item.id === req.params.id);
      if (!task) return fail(res, 404, 'not_found', '任务不存在');
      if (!canAccessDevice(req, task.deviceId)) {
        return fail(res, 403, 'device_forbidden', '当前账户无权执行该任务');
      }
      const result = await runTask(store, req.params.id, { source: 'manual' });
      return res.json({ task: result.task, device: result.device, changes: result.changes });
    })
  );

  app.delete(
    '/api/tasks/:id',
    wrap(async (req, res) => {
      if (!req.scopeGuard('device:write')) return undefined;
      const task = store.data.tasks.find((item) => item.id === req.params.id);
      if (!task) return fail(res, 404, 'not_found', '任务不存在');
      if (!canAccessDevice(req, task.deviceId)) {
        return fail(res, 403, 'device_forbidden', '当前账户无权删除该任务');
      }
      store.data.tasks = store.data.tasks.filter((item) => item.id !== task.id);
      store.save();
      return res.json({ ok: true, removed: task.id });
    })
  );

  // ---------- 账户与权限 ----------
  app.get(
    '/api/users',
    wrap(async (req, res) => {
      if (!req.scopeGuard('admin')) return undefined;
      return res.json({
        users: (store.data.users || []).map(publicAccount),
        counts: {
          total: (store.data.users || []).length,
          admins: (store.data.users || []).filter((user) => user.role === 'admin').length,
          active: (store.data.users || []).filter((user) => user.active !== false).length
        }
      });
    })
  );

  app.post(
    '/api/users',
    wrap(async (req, res) => {
      if (!req.scopeGuard('admin')) return undefined;
      let user;
      try {
        user = buildAccount(req.body || {}, { users: store.data.users || [], devices: store.data.devices });
      } catch (error) {
        return fail(res, 400, 'validation_error', error.message);
      }
      store.data.users = store.data.users || [];
      store.data.users.push(user);
      store.save();
      pushEvent(store, {
        level: 'info',
        type: 'system',
        message: `创建账户「${user.displayName}」（${user.role === 'admin' ? '管理员' : '成员'}）`,
        meta: { userId: user.id }
      });
      return res.status(201).json({ user: publicAccount(user) });
    })
  );

  app.patch(
    '/api/users/:id',
    wrap(async (req, res) => {
      if (!req.scopeGuard('admin')) return undefined;
      const user = (store.data.users || []).find((item) => item.id === req.params.id);
      if (!user) return fail(res, 404, 'not_found', '账户不存在');
      const activeAdmins = (store.data.users || []).filter((item) => item.role === 'admin' && item.active !== false);
      const nextRole = req.body?.role ?? user.role;
      const nextActive = req.body?.active === undefined ? user.active !== false : Boolean(req.body.active);
      if (user.role === 'admin' && activeAdmins.length <= 1 && (nextRole !== 'admin' || !nextActive)) {
        return fail(res, 400, 'validation_error', '必须保留至少一个启用中的管理员');
      }
      try {
        applyAccountPatch(user, req.body || {}, { users: store.data.users, devices: store.data.devices });
      } catch (error) {
        return fail(res, 400, 'validation_error', error.message);
      }
      store.save();
      return res.json({ user: publicAccount(user) });
    })
  );

  app.delete(
    '/api/users/:id',
    wrap(async (req, res) => {
      if (!req.scopeGuard('admin')) return undefined;
      const user = (store.data.users || []).find((item) => item.id === req.params.id);
      if (!user) return fail(res, 404, 'not_found', '账户不存在');
      if (req.user && req.user.id === user.id) return fail(res, 400, 'validation_error', '不能删除当前登录账户');
      const admins = (store.data.users || []).filter((item) => item.role === 'admin');
      if (user.role === 'admin' && admins.length <= 1) {
        return fail(res, 400, 'validation_error', '必须保留至少一个管理员');
      }
      store.data.users = store.data.users.filter((item) => item.id !== user.id);
      for (const token of store.data.tokens) {
        if (token.userId === user.id) {
          token.revoked = true;
          token.revokedAt = new Date().toISOString();
        }
      }
      for (const plan of store.data.plans || []) {
        delete plan.permissions?.[user.id];
      }
      store.save();
      return res.json({ ok: true, removed: user.id });
    })
  );

  app.post(
    '/api/users/:id/grants',
    wrap(async (req, res) => {
      if (!req.scopeGuard('admin')) return undefined;
      const user = (store.data.users || []).find((item) => item.id === req.params.id);
      if (!user) return fail(res, 404, 'not_found', '账户不存在');
      if (user.role === 'admin') return fail(res, 400, 'validation_error', '管理员默认拥有全部设备，无需单独授权');
      const incoming = req.body?.deviceIds;
      if (!Array.isArray(incoming)) return fail(res, 400, 'validation_error', 'deviceIds 必须是设备 ID 数组');
      const mode = String(req.body?.mode || 'add');
      if (!['add', 'remove', 'replace'].includes(mode)) {
        return fail(res, 400, 'validation_error', 'mode 只支持 add / remove / replace');
      }
      const known = new Set(store.data.devices.map((device) => device.id));
      const cleaned = [...new Set(incoming.map((item) => String(item)))];
      const unknown = cleaned.filter((item) => !known.has(item));
      if (unknown.length) return fail(res, 400, 'validation_error', `设备不存在：${unknown.join('、')}`);
      const before = new Set(user.deviceIds || []);
      if (mode === 'replace') {
        user.deviceIds = cleaned;
      } else if (mode === 'remove') {
        user.deviceIds = [...before].filter((item) => !cleaned.includes(item));
      } else {
        user.deviceIds = [...new Set([...before, ...cleaned])];
      }
      user.updatedAt = new Date().toISOString();
      store.save();
      const added = user.deviceIds.filter((item) => !before.has(item));
      const removed = [...before].filter((item) => !user.deviceIds.includes(item));
      pushEvent(store, {
        level: 'info',
        type: 'system',
        message: `更新账户「${user.displayName}」设备权限（${mode}）`,
        meta: { userId: user.id }
      });
      return res.json({ user: publicAccount(user), added, removed, mode });
    })
  );

  // ---------- 家居平面图 ----------
  app.get(
    '/api/plans',
    wrap(async (req, res) => {
      if (!req.scopeGuard('device:read')) return undefined;
      const scope = deviceScopeFor(req);
      const plans = (store.data.plans || []).map((plan) =>
        scope ? { ...plan, markers: (plan.markers || []).filter((marker) => scope.has(marker.deviceId)) } : plan
      );
      return res.json({ plans });
    })
  );

  app.post(
    '/api/plans',
    wrap(async (req, res) => {
      if (!req.scopeGuard('admin')) return undefined;
      let plan;
      try {
        plan = normalizePlanInput(store, req.body || {});
      } catch (error) {
        return fail(res, 400, 'validation_error', error.message);
      }
      store.data.plans = store.data.plans || [];
      store.data.plans.push(plan);
      store.save();
      return res.status(201).json({ plan });
    })
  );

  app.patch(
    '/api/plans/:id',
    wrap(async (req, res) => {
      if (!req.scopeGuard('admin')) return undefined;
      const plan = (store.data.plans || []).find((item) => item.id === req.params.id);
      if (!plan) return fail(res, 404, 'not_found', '平面图不存在');
      let next;
      try {
        next = normalizePlanInput(store, req.body || {}, plan);
      } catch (error) {
        return fail(res, 400, 'validation_error', error.message);
      }
      Object.assign(plan, next);
      store.save();
      return res.json({ plan });
    })
  );

  app.delete(
    '/api/plans/:id',
    wrap(async (req, res) => {
      if (!req.scopeGuard('admin')) return undefined;
      const plan = (store.data.plans || []).find((item) => item.id === req.params.id);
      if (!plan) return fail(res, 404, 'not_found', '平面图不存在');
      store.data.plans = store.data.plans.filter((item) => item.id !== plan.id);
      store.save();
      return res.json({ ok: true, removed: plan.id });
    })
  );

  // ---------- 二维码 / 巡检 / 网络 ----------
  app.get(
    '/api/qr/config',
    wrap(async (req, res) => {
      if (!req.scopeGuard('admin')) return undefined;
      const config = buildConfigBundle(store);
      const json = JSON.stringify(config);
      const payload = configPayload(config);
      const filename = `icehome-config-${config.exportedAt.slice(0, 10)}.json`;
      for (const [key, value] of configExports) {
        if (value.expiresAt < Date.now()) configExports.delete(key);
      }
      const token = randomBytes(24).toString('base64url');
      const expiresAt = Date.now() + 10 * 60 * 1000;
      configExports.set(token, { config, filename, expiresAt });
      const protocol = String(req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
      const hostHeader = String(req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
      const port = req.socket?.localPort;
      const lan = listInterfaces()[0]?.address;
      const origin =
        /^(localhost|127\.|\[::1\])/i.test(hostHeader) && lan
          ? `${protocol}://${lan}:${port}`
          : `${protocol}://${hostHeader || `${lan}:${port}`}`;
      const qrPayload = `${origin}/api/config/export/${token}`;
      const qrSvg = await qr(qrPayload, { width: 300 }).catch(() => null);
      return res.json({
        config,
        payload,
        qrPayload,
        downloadUrl: qrPayload,
        expiresAt: new Date(expiresAt).toISOString(),
        qr: qrSvg,
        filename,
        stats: {
          devices: config.devices.length,
          tasks: config.tasks.length,
          plugins: config.plugins.length,
          plans: config.plans.length,
          bytes: Buffer.byteLength(json),
          payloadBytes: Buffer.byteLength(payload)
        },
        qrSupported: Boolean(qrSvg)
      });
    })
  );

  app.get(
    '/api/qr/wifi',
    wrap(async (req, res) => {
      if (!req.scopeGuard('admin')) return undefined;
      let wifi;
      try {
        wifi = normalizeWifi(store.data.settings.wifi || {}, {});
      } catch {
        wifi = { ssid: 'ICEHOME', password: '', security: 'nopass', hidden: false };
      }
      const payload = wifiPayload(wifi);
      const svg = await qr(payload, { width: 240 });
      return res.json({ wifi, payload, qr: svg });
    })
  );

  app.get(
    '/api/qr/devices',
    wrap(async (req, res) => {
      if (!req.scopeGuard('device:read')) return undefined;
      const labels = await Promise.all(
        visibleDevices(store, req).map(async (device) => ({
          deviceId: device.id,
          name: device.name,
          categoryId: device.categoryId,
          payload: deviceQrPayload(device.id),
          qr: await qr(deviceQrPayload(device.id), { width: 150 })
        }))
      );
      return res.json({ labels });
    })
  );

  app.get(
    '/api/inspections',
    wrap(async (req, res) => {
      if (!req.scopeGuard('device:read')) return undefined;
      const limit = Math.min(Number(req.query.limit) || 30, 100);
      const scope = deviceScopeFor(req);
      const items = (store.data.inspections || []).filter((item) => !scope || scope.has(item.deviceId));
      return res.json({ inspections: items.slice(0, limit) });
    })
  );

  app.post(
    '/api/inspections',
    wrap(async (req, res) => {
      if (!req.scopeGuard('device:read')) return undefined;
      const device = findDevice(store, String(req.body?.deviceId || ''));
      if (!device) return fail(res, 404, 'not_found', '设备不存在');
      if (!canAccessDevice(req, device.id)) return fail(res, 403, 'device_forbidden', '当前账户没有该设备的权限');
      try {
        const inspection = recordInspection(store, req, device, req.body || {});
        return res.status(201).json({ inspection });
      } catch (error) {
        return fail(res, 400, 'validation_error', error.message);
      }
    })
  );

  app.post(
    '/api/inspections/scan',
    wrap(async (req, res) => {
      if (!req.scopeGuard('device:read')) return undefined;
      const deviceId = parseInspectionCode(req.body?.code);
      if (!deviceId) return fail(res, 400, 'validation_error', '扫码内容不是 ICEHOME 设备标签');
      const device = findDevice(store, deviceId);
      if (!device) return fail(res, 404, 'not_found', '二维码对应的设备不存在');
      if (!canAccessDevice(req, device.id)) return fail(res, 403, 'device_forbidden', '当前账户没有该设备的权限');
      try {
        const inspection = recordInspection(store, req, device, req.body || {});
        return res.status(201).json({ inspection, device: { id: device.id, name: device.name } });
      } catch (error) {
        return fail(res, 400, 'validation_error', error.message);
      }
    })
  );

  app.get(
    '/api/network',
    wrap(async (req, res) => {
      if (!req.scopeGuard('admin')) return undefined;
      const interfaces = listInterfaces().map((entry) => {
        const octets = entry.address.split('.');
        return { ...entry, cidr: `${octets[0]}.${octets[1]}.${octets[2]}.0/24` };
      });
      return res.json({
        interfaces,
        suggestedCidr: interfaces[0]?.cidr || '192.168.1.0/24',
        defaultPorts: [80, 443, 8080, 8123, 8787, 1883, 554]
      });
    })
  );

  app.post(
    '/api/network/scan',
    wrap(async (req, res) => {
      if (!req.scopeGuard('admin')) return undefined;
      try {
        const result = await scanNetwork(req.body || {});
        return res.json(result);
      } catch (error) {
        return fail(res, 400, 'validation_error', error.message);
      }
    })
  );

  // ---------- 令牌 ----------
  app.get(
    '/api/tokens',
    wrap(async (req, res) => {
      if (!req.scopeGuard('admin')) return undefined;
      res.json({ tokens: store.data.tokens.map(publicToken) });
    })
  );

  app.post(
    '/api/tokens',
    wrap(async (req, res) => {
      if (!req.scopeGuard('admin')) return undefined;
      const body = req.body || {};
      const name = String(body.name || '').trim();
      if (!name) return fail(res, 400, 'validation_error', '令牌名称不能为空');
      const scopes = Array.isArray(body.scopes) ? body.scopes : ['device:read'];
      const allowed = ['device:read', 'device:write', 'ai:use', 'admin'];
      if (!scopes.every((scope) => allowed.includes(scope))) {
        return fail(res, 400, 'validation_error', `scope 只支持 ${allowed.join(' / ')}`);
      }
      const token = {
        id: id('tok'),
        name,
        key: apiKey(),
        scopes,
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
        requestCount: 0,
        revoked: false,
        note: String(body.note || '')
      };
      store.data.tokens.unshift(token);
      store.save();
      pushEvent(store, { level: 'info', type: 'system', message: `签发令牌「${name}」` });
      return res.status(201).json({ token: publicToken(token), key: token.key });
    })
  );

  app.patch(
    '/api/tokens/:id',
    wrap(async (req, res) => {
      if (!req.scopeGuard('admin')) return undefined;
      const token = store.data.tokens.find((item) => item.id === req.params.id);
      if (!token) return fail(res, 404, 'not_found', '令牌不存在');
      const body = req.body || {};
      if (body.revoked !== undefined) {
        token.revoked = Boolean(body.revoked);
        token.revokedAt = token.revoked ? new Date().toISOString() : null;
      }
      if (body.name !== undefined) {
        const name = String(body.name).trim();
        if (!name) return fail(res, 400, 'validation_error', '令牌名称不能为空');
        token.name = name;
      }
      store.save();
      return res.json({ token: publicToken(token) });
    })
  );

  app.delete(
    '/api/tokens/:id',
    wrap(async (req, res) => {
      if (!req.scopeGuard('admin')) return undefined;
      const token = store.data.tokens.find((item) => item.id === req.params.id);
      if (!token) return fail(res, 404, 'not_found', '令牌不存在');
      if (token.key === req.token.key) {
        return fail(res, 400, 'validation_error', '不能删除当前正在使用的令牌');
      }
      store.data.tokens = store.data.tokens.filter((item) => item.id !== token.id);
      store.save();
      return res.json({ ok: true, removed: token.id });
    })
  );

  // ---------- 插件 ----------
  app.get(
    '/api/plugins',
    wrap(async (req, res) => {
      if (!req.scopeGuard('device:read')) return undefined;
      res.json({ plugins: store.data.plugins });
    })
  );

  app.post(
    '/api/plugins',
    wrap(async (req, res) => {
      if (!req.scopeGuard('admin')) return undefined;
      const body = req.body || {};
      const name = String(body.name || '').trim();
      if (!name) return fail(res, 400, 'validation_error', '插件名称不能为空');
      const plugin = {
        id: id('plug'),
        key: String(body.key || `local.${name.toLowerCase().replace(/\s+/g, '-')}`),
        name,
        version: String(body.version || '1.0.0'),
        author: String(body.author || '本地安装'),
        description: String(body.description || ''),
        icon: String(body.icon || 'puzzle'),
        enabled: body.enabled === undefined ? true : Boolean(body.enabled),
        builtin: false,
        templates: Array.isArray(body.templates)
          ? body.templates.map((item) => ({
              key: String(item.key || '').trim() || `tpl_${id('t')}`,
              name: String(item.name || '自定义模板').trim(),
              icon: String(item.icon || 'cube'),
              capabilities: Array.isArray(item.capabilities) ? item.capabilities : ['power']
            }))
          : [],
        hooks: Array.isArray(body.hooks) ? body.hooks : [],
        installedAt: new Date().toISOString()
      };
      store.data.plugins.push(plugin);
      store.save();
      pushEvent(store, { level: 'info', type: 'plugin', message: `安装插件「${plugin.name}」` });
      return res.status(201).json({ plugin });
    })
  );

  app.patch(
    '/api/plugins/:id',
    wrap(async (req, res) => {
      if (!req.scopeGuard('admin')) return undefined;
      const plugin = store.data.plugins.find((item) => item.id === req.params.id);
      if (!plugin) return fail(res, 404, 'not_found', '插件不存在');
      if (req.body?.enabled !== undefined) plugin.enabled = Boolean(req.body.enabled);
      store.save();
      return res.json({ plugin });
    })
  );

  app.delete(
    '/api/plugins/:id',
    wrap(async (req, res) => {
      if (!req.scopeGuard('admin')) return undefined;
      const plugin = store.data.plugins.find((item) => item.id === req.params.id);
      if (!plugin) return fail(res, 404, 'not_found', '插件不存在');
      store.data.plugins = store.data.plugins.filter((item) => item.id !== plugin.id);
      store.save();
      return res.json({ ok: true, removed: plugin.id });
    })
  );

  // ---------- 配对 ----------
  app.post(
    '/api/pairing',
    wrap(async (req, res) => {
      if (!req.scopeGuard('admin')) return undefined;
      const body = req.body || {};
      const deviceName = String(body.deviceName || '').trim();
      if (!deviceName) return fail(res, 400, 'validation_error', '请填写待配对设备名称');
      const existing = new Set(store.data.pairings.map((item) => item.code));
      let code = pairingCode();
      while (existing.has(code)) code = pairingCode();
      const pairing = {
        id: id('pair'),
        code,
        deviceName,
        template: DEVICE_TEMPLATES[body.template] ? body.template : 'custom',
        categoryId: store.data.categories.some((item) => item.id === body.categoryId) ? body.categoryId : null,
        capabilities: Array.isArray(body.capabilities) ? body.capabilities : null,
        status: 'pending',
        createdAt: new Date().toISOString()
      };
      store.data.pairings.unshift(pairing);
      store.save();
      const payload = `icehome://pair?code=${code}&name=${encodeURIComponent(deviceName)}`;
      const svg = await qr(payload, { width: 200 });
      pushEvent(store, { level: 'info', type: 'pairing', message: `生成配对码 ${code}` });
      return res.status(201).json({ pairing, qr: svg, payload });
    })
  );

  app.get(
    '/api/pairing',
    wrap(async (req, res) => {
      if (!req.scopeGuard('admin')) return undefined;
      res.json({ pairings: store.data.pairings });
    })
  );

  app.get(
    '/api/pairing/:code',
    wrap(async (req, res) => {
      if (!req.scopeGuard('admin')) return undefined;
      const pairing = store.data.pairings.find((item) => item.code === req.params.code.toUpperCase());
      if (!pairing) return fail(res, 404, 'not_found', '配对码不存在');
      return res.json({ pairing });
    })
  );

  app.post(
    '/api/pairing/:code/approve',
    wrap(async (req, res) => {
      if (!req.scopeGuard('admin')) return undefined;
      const pairing = store.data.pairings.find((item) => item.code === req.params.code.toUpperCase());
      if (!pairing) return fail(res, 404, 'not_found', '配对码不存在');
      if (pairing.status !== 'pending') return fail(res, 409, 'conflict', '配对码已处理');
      const nextOrder = Math.max(0, ...store.data.devices.map((device) => Number(device.order) || 0)) + 1;
      const device = buildDevice(
        {
          name: pairing.deviceName,
          categoryId: pairing.categoryId,
          template: pairing.template,
          capabilities: pairing.capabilities || undefined,
          adapter: req.body?.adapter || { kind: 'mock' }
        },
        { categories: store.data.categories, order: nextOrder, source: 'pairing', templates: templatesFor(store) }
      );
      store.data.devices.push(device);
      pairing.status = 'approved';
      pairing.deviceId = device.id;
      pairing.decidedAt = new Date().toISOString();
      store.save();
      pushEvent(store, {
        level: 'info',
        type: 'pairing',
        message: `配对完成：${device.name}`,
        meta: { deviceId: device.id, code: pairing.code }
      });
      return res.json({ pairing, device });
    })
  );

  app.post(
    '/api/pairing/:code/reject',
    wrap(async (req, res) => {
      if (!req.scopeGuard('admin')) return undefined;
      const pairing = store.data.pairings.find((item) => item.code === req.params.code.toUpperCase());
      if (!pairing) return fail(res, 404, 'not_found', '配对码不存在');
      pairing.status = 'rejected';
      pairing.decidedAt = new Date().toISOString();
      store.save();
      return res.json({ pairing });
    })
  );

  // ---------- 导入 / 导出 ----------
  app.get(
    '/api/export',
    wrap(async (req, res) => {
      if (!req.scopeGuard('admin')) return undefined;
      const bundle = {
        v: 1,
        exportedAt: new Date().toISOString(),
        categories: store.data.categories.map(({ name, icon }) => ({ name, icon })),
        devices: store.data.devices.map((device) => ({
          name: device.name,
          template: device.template,
          capabilities: device.capabilities,
          state: device.state,
          categoryName: store.data.categories.find((item) => item.id === device.categoryId)?.name || null
        }))
      };
      const encoded = Buffer.from(JSON.stringify(bundle), 'utf8').toString('base64url');
      const payload = `icehome://import?payload=${encoded}`;
      const svg = await qr(payload, { width: 240 });
      return res.json({ bundle, payload, qr: svg });
    })
  );

  app.post(
    '/api/import',
    wrap(async (req, res) => {
      if (!req.scopeGuard('admin')) return undefined;
      const raw = String(req.body?.payload || req.body?.code || req.body?.text || '').trim();
      if (!raw) return fail(res, 400, 'validation_error', '请提供导入码');
      const match = /payload=([A-Za-z0-9_\-=+/]+)/.exec(raw);
      const encoded = match ? match[1] : raw;
      let bundle;
      try {
        bundle = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
      } catch {
        return fail(res, 400, 'validation_error', '导入码无法解析');
      }
      if (!bundle || !Array.isArray(bundle.devices)) {
        return fail(res, 400, 'validation_error', '导入内容缺少 devices 字段');
      }
      const createdCategories = [];
      const createdDevices = [];
      for (const category of bundle.categories || []) {
        if (!category?.name) continue;
        let target = store.data.categories.find((item) => item.name === category.name);
        if (!target) {
          target = {
            id: id('cat'),
            name: category.name,
            icon: category.icon || 'grid',
            description: category.description || '',
            order: store.data.categories.length,
            createdAt: new Date().toISOString()
          };
          store.data.categories.push(target);
          createdCategories.push(target);
        }
      }
      if (Array.isArray(bundle.plugins)) {
        for (const plugin of bundle.plugins) {
          if (!plugin?.name) continue;
          if (store.data.plugins.some((item) => item.name === plugin.name)) continue;
          store.data.plugins.push({
            id: id('plug'),
            key: `import.${plugin.name}`,
            name: plugin.name,
            version: plugin.version || '1.0.0',
            author: plugin.author || '导入',
            description: plugin.description || '',
            icon: plugin.icon || 'puzzle',
            enabled: true,
            builtin: false,
            templates: plugin.templates || [],
            hooks: plugin.hooks || [],
            installedAt: new Date().toISOString()
          });
        }
      }
      for (const item of bundle.devices) {
        if (!item?.name) continue;
        const category = item.categoryName
          ? store.data.categories.find((entry) => entry.name === item.categoryName)
          : null;
        const nextOrder = Math.max(0, ...store.data.devices.map((device) => Number(device.order) || 0)) + 1;
        const device = buildDevice(
          {
            name: item.name,
            template: item.template,
            capabilities: item.capabilities,
            state: item.state,
            adapter: { ...(item.adapter || {}), write: false },
            categoryId: category?.id || null
          },
          { categories: store.data.categories, order: nextOrder, source: 'import', templates: templatesFor(store) }
        );
        store.data.devices.push(device);
        createdDevices.push(device);
      }
      store.save();
      pushEvent(store, {
        level: 'info',
        type: 'system',
        message: `导入 ${createdDevices.length} 台设备、${createdCategories.length} 个分类`
      });
      return res.json({ categories: createdCategories, devices: createdDevices, count: createdDevices.length });
    })
  );

  // ---------- AI ----------
  app.post(
    '/api/ai/command',
    wrap(async (req, res) => {
      if (!req.scopeGuard('ai:use')) return undefined;
      const text = String(req.body?.text || '').trim();
      const dryRun = Boolean(req.body?.dryRun);
      const parsed = parseCommand(scopedStore(store, req), text);
      if (dryRun || !['control', 'schedule'].includes(parsed.intent)) {
        return res.json({ ...parsed, executed: false });
      }
      if (parsed.intent === 'schedule') {
        const device = parsed.devices[0];
        const task = {
          id: id('task'),
          name: `AI · ${device.name} ${parsed.label}`,
          deviceId: device.id,
          schedule: normalizeSchedule(parsed.schedule),
          action: { type: parsed.action, payload: parsed.payload || {} },
          enabled: true,
          lastRunAt: null,
          nextRunAt: null,
          runCount: 0,
          createdAt: new Date().toISOString()
        };
        task.nextRunAt = nextRunAt(task.schedule, new Date())?.toISOString() || null;
        store.data.tasks.push(task);
        store.save();
        return res.json({ ...parsed, executed: true, task, created: ['task'] });
      }
      const results = [];
      for (const device of parsed.devices) {
        const result = await applyAction(store, device.id, parsed.action, parsed.payload || {}, { source: 'ai' });
        results.push({ deviceId: device.id, name: device.name, changes: result.changes });
      }
      return res.json({ ...parsed, executed: true, results });
    })
  );

  app.get(
    '/api/ai/manual',
    wrap(async (req, res) => {
      if (!req.scopeGuard('ai:use')) return undefined;
      const baseUrl = String(req.query.baseUrl || `${req.protocol}://${req.get('host')}`);
      const markdown = buildAiManual(scopedStore(store, req), { baseUrl });
      if (req.query.format === 'json') return res.json({ markdown });
      res.type('text/markdown; charset=utf-8').send(markdown);
      return undefined;
    })
  );

  // ---------- OpenAI 兼容 ----------
  app.get(
    '/v1/models',
    wrap(async (req, res) => {
      if (!req.scopeGuard('ai:use')) return undefined;
      return res.json({
        object: 'list',
        data: [{ id: 'icehome-1', object: 'model', created: Math.floor(Date.now() / 1000), owned_by: 'icehome' }]
      });
    })
  );

  app.post(
    '/v1/chat/completions',
    wrap(async (req, res) => {
      if (!req.scopeGuard('ai:use')) return undefined;
      const body = req.body || {};
      const messages = Array.isArray(body.messages) ? body.messages : [];
      const lastUser = [...messages].reverse().find((message) => message.role === 'user');
      if (!lastUser) return fail(res, 400, 'validation_error', 'messages 中缺少 user 消息');
      const content = Array.isArray(lastUser.content)
        ? lastUser.content.map((part) => part.text || '').join(' ')
        : String(lastUser.content || '');
      const parsed = parseCommand(scopedStore(store, req), content);
      let reply = parsed.reply;
      let executed = null;
      if (!body.dry_run && ['control', 'schedule'].includes(parsed.intent)) {
        if (parsed.intent === 'schedule') {
          reply = `${parsed.reply} 已自动创建对应定时任务。`;
          executed = { type: 'task' };
          const task = {
            id: id('task'),
            name: `AI · ${parsed.devices[0].name} ${parsed.label}`,
            deviceId: parsed.devices[0].id,
            schedule: normalizeSchedule(parsed.schedule),
            action: { type: parsed.action, payload: parsed.payload || {} },
            enabled: true,
            lastRunAt: null,
            nextRunAt: null,
            runCount: 0,
            createdAt: new Date().toISOString()
          };
          task.nextRunAt = nextRunAt(task.schedule, new Date())?.toISOString() || null;
          store.data.tasks.push(task);
          store.save();
        } else {
          for (const device of parsed.devices) {
            await applyAction(store, device.id, parsed.action, parsed.payload || {}, { source: 'openai' });
          }
          reply = `${parsed.reply} 已执行。`;
          executed = { type: 'action', action: parsed.action, devices: parsed.devices.map((device) => device.id) };
        }
      }
      const completionId = `chatcmpl-${id('c')}`;
      const created = Math.floor(Date.now() / 1000);
      const payload = {
        id: completionId,
        object: 'chat.completion',
        created,
        model: body.model || 'icehome-1',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: reply },
            finish_reason: 'stop'
          }
        ],
        usage: {
          prompt_tokens: content.length,
          completion_tokens: reply.length,
          total_tokens: content.length + reply.length
        },
        icehome: { intent: parsed.intent, executed }
      };
      if (body.stream) {
        res.setHeader('content-type', 'text/event-stream; charset=utf-8');
        res.setHeader('cache-control', 'no-cache');
        const chunk = { ...payload, object: 'chat.completion.chunk', choices: [{ index: 0, delta: { role: 'assistant', content: reply }, finish_reason: null }] };
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        res.write(
          `data: ${JSON.stringify({ ...payload, object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`
        );
        res.write('data: [DONE]\n\n');
        return res.end();
      }
      return res.json(payload);
    })
  );

  // ---------- 静态资源 ----------
  if (serveStatic && fs.existsSync(staticDir)) {
    app.use(express.static(staticDir, { index: 'index.html' }));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/v1')) return next();
      return res.sendFile('index.html', { root: staticDir });
    });
  }

  app.use((req, res) => fail(res, 404, 'not_found', `未知路径 ${req.method} ${req.path}`));

  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, next) => {
    const status = error.status || 400;
    const code = error.code || (status === 400 ? 'validation_error' : 'server_error');
    if (status >= 500) {
      pushEvent(store, { level: 'error', type: 'system', message: `服务异常：${error.message}` });
    }
    if (res.headersSent) return;
    res.status(status).json({ error: { code, message: error.message || '请求失败' } });
  });

  app.locals.store = store;
  app.locals.os = os;
  return app;
}
