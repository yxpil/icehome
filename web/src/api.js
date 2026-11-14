const TOKEN_KEY = 'icehome.token';

/** 前后端分离部署时，用 VITE_API_BASE 指向独立 API 域名；默认同源 */
const BASE = String((import.meta.env && import.meta.env.VITE_API_BASE) || '').replace(/\/$/, '');

function endpoint(path) {
  return `${BASE}${path}`;
}

let cachedToken = typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) || '' : '';

export function getToken() {
  return cachedToken;
}

export function saveToken(token) {
  cachedToken = token || '';
  if (typeof localStorage !== 'undefined') {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }
}

async function request(path, { method = 'GET', body, auth = true, raw = false } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (auth && cachedToken) headers.authorization = `Bearer ${cachedToken}`;
  const response = await fetch(endpoint(path), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (raw) {
    const text = await response.text();
    if (!response.ok) throw new Error(text || `请求失败 ${response.status}`);
    return text;
  }
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    const message = data?.error?.message || `请求失败 ${response.status}`;
    const error = new Error(message);
    error.code = data?.error?.code;
    error.status = response.status;
    throw error;
  }
  return data;
}

export const api = {
  bootstrap: () => request('/api/auth/bootstrap', { method: 'POST', body: {}, auth: false }),
  login: (username, password) =>
    request('/api/auth/login', { method: 'POST', body: { username, password }, auth: false }),
  me: () => request('/api/auth/me'),
  logout: () => request('/api/auth/logout', { method: 'POST', body: {} }),
  state: () => request('/api/state'),
  system: () => request('/api/system'),
  cacheStats: () => request('/api/cache/stats'),
  purgeCache: () => request('/api/cache/purge', { method: 'POST', body: {} }),
  testStorage: () => request('/api/system/storage/test', { method: 'POST', body: {} }),
  settings: (patch) => request('/api/settings', { method: 'PATCH', body: patch }),
  events: (limit = 40) => request(`/api/events?limit=${limit}`),

  deviceAction: (id, action, payload = {}) =>
    request(`/api/devices/${id}/actions`, { method: 'POST', body: { action, payload } }),
  createDevice: (body) => request('/api/devices', { method: 'POST', body }),
  updateDevice: (id, body) => request(`/api/devices/${id}`, { method: 'PATCH', body }),
  deleteDevice: (id) => request(`/api/devices/${id}`, { method: 'DELETE' }),
  probeDevice: (id) => request(`/api/devices/${id}/probe`, { method: 'POST', body: {} }),

  createCategory: (body) => request('/api/categories', { method: 'POST', body }),
  updateCategory: (id, body) => request(`/api/categories/${id}`, { method: 'PATCH', body }),
  deleteCategory: (id) => request(`/api/categories/${id}`, { method: 'DELETE' }),

  createTask: (body) => request('/api/tasks', { method: 'POST', body }),
  updateTask: (id, body) => request(`/api/tasks/${id}`, { method: 'PATCH', body }),
  runTask: (id) => request(`/api/tasks/${id}/run`, { method: 'POST', body: {} }),
  deleteTask: (id) => request(`/api/tasks/${id}`, { method: 'DELETE' }),

  createToken: (body) => request('/api/tokens', { method: 'POST', body }),
  updateToken: (id, body) => request(`/api/tokens/${id}`, { method: 'PATCH', body }),
  deleteToken: (id) => request(`/api/tokens/${id}`, { method: 'DELETE' }),

  users: () => request('/api/users'),
  createUser: (body) => request('/api/users', { method: 'POST', body }),
  updateUser: (id, body) => request(`/api/users/${id}`, { method: 'PATCH', body }),
  deleteUser: (id) => request(`/api/users/${id}`, { method: 'DELETE' }),
  grantDevices: (id, deviceIds, mode = 'add') =>
    request(`/api/users/${id}/grants`, { method: 'POST', body: { deviceIds, mode } }),

  plans: () => request('/api/plans'),
  createPlan: (body) => request('/api/plans', { method: 'POST', body }),
  updatePlan: (id, body) => request(`/api/plans/${id}`, { method: 'PATCH', body }),
  deletePlan: (id) => request(`/api/plans/${id}`, { method: 'DELETE' }),

  installPlugin: (body) => request('/api/plugins', { method: 'POST', body }),
  updatePlugin: (id, body) => request(`/api/plugins/${id}`, { method: 'PATCH', body }),
  deletePlugin: (id) => request(`/api/plugins/${id}`, { method: 'DELETE' }),

  startPairing: (body) => request('/api/pairing', { method: 'POST', body }),
  approvePairing: (code) => request(`/api/pairing/${code}/approve`, { method: 'POST', body: {} }),
  rejectPairing: (code) => request(`/api/pairing/${code}/reject`, { method: 'POST', body: {} }),

  exportBundle: () => request('/api/export'),
  importBundle: (payload) => request('/api/import', { method: 'POST', body: { payload } }),

  configQr: () => request('/api/qr/config'),
  wifiQr: () => request('/api/qr/wifi'),
  deviceQr: () => request('/api/qr/devices'),
  inspections: (limit = 30) => request(`/api/inspections?limit=${limit}`),
  inspectDevice: (body) => request('/api/inspections', { method: 'POST', body }),
  scanInspection: (body) => request('/api/inspections/scan', { method: 'POST', body }),
  networkInterfaces: () => request('/api/network'),
  scanNetwork: (body) => request('/api/network/scan', { method: 'POST', body }),

  aiCommand: (text, dryRun = false) => request('/api/ai/command', { method: 'POST', body: { text, dryRun } }),
  aiManual: () => request('/api/ai/manual', { raw: true })
};
