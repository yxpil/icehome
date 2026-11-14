import { CAPABILITIES, DEVICE_TEMPLATES, defaultState, normalizeValue, template } from './capabilities.js';
import { id } from './ids.js';

const ADAPTER_KINDS = ['mock', 'http'];
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

export function normalizeAdapter(input = {}) {
  const kind = ADAPTER_KINDS.includes(input.kind) ? input.kind : 'mock';
  const method = HTTP_METHODS.includes(String(input.method || '').toUpperCase())
    ? String(input.method).toUpperCase()
    : 'POST';
  const headers = {};
  if (input.headers && typeof input.headers === 'object' && !Array.isArray(input.headers)) {
    for (const [key, value] of Object.entries(input.headers)) {
      if (key && value !== undefined && value !== null) headers[String(key)] = String(value);
    }
  }
  const rawTimeout = Number(input.timeoutMs ?? 4000);
  const timeoutMs = Number.isFinite(rawTimeout) ? Math.min(30000, Math.max(500, rawTimeout)) : 4000;
  const url = String(input.url || '').trim();
  if (kind === 'http' && !url) throw new Error('HTTP 适配器必须填写请求地址');
  if (kind === 'http' && !/^https?:\/\//i.test(url)) throw new Error('请求地址必须以 http:// 或 https:// 开头');
  return {
    kind,
    url,
    method,
    headers,
    body: String(input.body || ''),
    timeoutMs,
    write: Boolean(input.write),
    readPath: String(input.readPath || '').trim()
  };
}

export function normalizeCapabilities(list) {
  if (!Array.isArray(list) || list.length === 0) throw new Error('至少需要一项设备能力');
  const caps = [];
  for (const key of list) {
    const cap = CAPABILITIES[key];
    if (!cap) throw new Error(`未知能力：${key}`);
    if (!caps.includes(key)) caps.push(key);
  }
  if (caps.length > 8) throw new Error('单台设备最多声明 8 项能力');
  return caps;
}

export function normalizeState(caps, input = {}) {
  const state = defaultState(caps);
  for (const key of caps) {
    if (input[key] !== undefined) {
      const result = normalizeValue(key, input[key]);
      if (!result.ok) throw new Error(result.error);
      state[key] = result.value;
    }
  }
  return state;
}

export function buildDevice(input = {}, { categories, order = 0, source = 'manual', templates } = {}) {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('设备名称不能为空');
  if (name.length > 40) throw new Error('设备名称最长 40 个字符');
  const contributed = Array.isArray(templates) ? templates.find((item) => item.key === input.template) : null;
  const templateKey = contributed ? input.template : DEVICE_TEMPLATES[input.template] ? input.template : 'custom';
  const meta = contributed
    ? { icon: contributed.icon || 'cube', capabilities: contributed.capabilities || ['power'] }
    : template(templateKey);
  const capabilities = normalizeCapabilities(input.capabilities || meta.capabilities);
  const categoryId = categories.some((item) => item.id === input.categoryId) ? input.categoryId : null;
  const now = new Date().toISOString();
  return {
    id: id('dev'),
    name,
    categoryId,
    template: templateKey,
    icon: String(input.icon || meta.icon),
    capabilities,
    state: normalizeState(capabilities, input.state || {}),
    adapter: normalizeAdapter(input.adapter || {}),
    online: input.online === false ? false : true,
    pinned: Boolean(input.pinned),
    order,
    source,
    createdAt: now,
    updatedAt: now
  };
}

export function applyDevicePatch(device, patch = {}, { categories } = {}) {
  const next = { ...device };
  if (patch.name !== undefined) {
    const name = String(patch.name).trim();
    if (!name) throw new Error('设备名称不能为空');
    if (name.length > 40) throw new Error('设备名称最长 40 个字符');
    next.name = name;
  }
  if (patch.categoryId !== undefined) {
    next.categoryId = categories.some((item) => item.id === patch.categoryId) ? patch.categoryId : null;
  }
  if (patch.template !== undefined) {
    const meta = template(patch.template);
    next.template = patch.template;
    next.icon = meta.icon;
  }
  if (patch.capabilities !== undefined) {
    next.capabilities = normalizeCapabilities(patch.capabilities);
    next.state =
      patch.state !== undefined
        ? normalizeState(next.capabilities, { ...next.state, ...patch.state })
        : normalizeState(next.capabilities, next.state);
  } else if (patch.state !== undefined) {
    next.state = normalizeState(next.capabilities, { ...next.state, ...patch.state });
  }
  if (patch.adapter !== undefined) {
    next.adapter = normalizeAdapter({ ...next.adapter, ...patch.adapter });
  }
  if (patch.online !== undefined) next.online = Boolean(patch.online);
  if (patch.pinned !== undefined) next.pinned = Boolean(patch.pinned);
  if (patch.icon !== undefined) next.icon = String(patch.icon);
  if (patch.order !== undefined && Number.isFinite(Number(patch.order))) next.order = Number(patch.order);
  next.updatedAt = new Date().toISOString();
  return next;
}
