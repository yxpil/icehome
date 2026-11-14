/**
 * Electron 主进程与启动器共用的纯逻辑，便于单元测试。
 * 不依赖 electron，可在普通 Node 中加载。
 */
const DEFAULT_LOCAL_PORT = 8788;
const DEFAULT_REMOTE_URL = 'http://127.0.0.1:8787';
const MAX_PROFILES = 8;

function normalizeMode(value) {
  return String(value || '').toLowerCase() === 'remote' ? 'remote' : 'local';
}

function normalizePort(value, fallback = DEFAULT_LOCAL_PORT) {
  const raw = value === undefined || value === null || value === '' ? fallback : value;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('端口必须是 1–65535 的整数');
  }
  return port;
}

function normalizeLocalHost(value) {
  const raw = String(value || '').trim();
  return raw === '127.0.0.1' || raw === 'localhost' ? '127.0.0.1' : '0.0.0.0';
}

function normalizeBaseUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('请填写服务器地址');
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error('服务器地址格式不正确');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('只支持 http:// 或 https:// 地址');
  }
  if (url.username || url.password) {
    throw new Error('地址不能包含用户名或口令');
  }
  if (url.pathname !== '/' && url.pathname !== '') {
    throw new Error('请填写服务器根地址，不要带路径');
  }
  if (url.search || url.hash) {
    throw new Error('服务器地址不能带查询参数或锚点');
  }
  return url.origin;
}

function isLocalHost(value) {
  const host = String(value || '').toLowerCase().replace(/^\[|\]$/g, '');
  return host === '127.0.0.1' || host === 'localhost' || host === '::1';
}

function labelForUrl(value) {
  const base = normalizeBaseUrl(value);
  const url = new URL(base);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const port = url.port || (url.protocol === 'https:' ? '443' : '80');
  if (isLocalHost(host)) return `本机 ${port}`;
  return `${host}:${port}`;
}

function normalizeProfiles(list, { max = MAX_PROFILES } = {}) {
  const result = [];
  const seen = new Map();
  for (const item of Array.isArray(list) ? list : []) {
    let url;
    try {
      url = normalizeBaseUrl(item?.url ?? item);
    } catch {
      continue;
    }
    const explicitLabel = String(item?.label || '').trim().slice(0, 40);
    if (seen.has(url)) {
      if (explicitLabel) seen.get(url).label = explicitLabel;
      continue;
    }
    const entry = { url, label: explicitLabel || labelForUrl(url) };
    seen.set(url, entry);
    result.push(entry);
    if (result.length >= max) break;
  }
  return result;
}

function mergeProfile(list, url, label) {
  const base = normalizeBaseUrl(url);
  const profiles = normalizeProfiles(list).filter((item) => item.url !== base);
  profiles.unshift({ url: base, label: String(label || '').trim().slice(0, 40) || labelForUrl(base) });
  return profiles.slice(0, MAX_PROFILES);
}

function normalizeBounds(value, fallback = { width: 1440, height: 920 }) {
  if (!value || typeof value !== 'object') return fallback;
  const width = Number(value.width);
  const height = Number(value.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1024 || height < 700) {
    return fallback;
  }
  return {
    width: Math.round(width),
    height: Math.round(height),
    x: Number.isFinite(Number(value.x)) ? Math.round(Number(value.x)) : undefined,
    y: Number.isFinite(Number(value.y)) ? Math.round(Number(value.y)) : undefined
  };
}

function sanitizeSettings(raw = {}, defaults = {}) {
  const base = {
    mode: normalizeMode(raw.mode ?? defaults.mode),
    localPort: DEFAULT_LOCAL_PORT,
    localHost: normalizeLocalHost(raw.localHost ?? defaults.localHost),
    dataDir: String(raw.dataDir ?? defaults.dataDir ?? '').trim(),
    remoteUrl: DEFAULT_REMOTE_URL,
    allowSelfSigned: Boolean(raw.allowSelfSigned ?? defaults.allowSelfSigned),
    autoConnect: Boolean(raw.autoConnect ?? defaults.autoConnect),
    profiles: normalizeProfiles(raw.profiles ?? defaults.profiles),
    windowBounds: normalizeBounds(raw.windowBounds ?? defaults.windowBounds)
  };
  try {
    base.localPort = normalizePort(raw.localPort ?? defaults.localPort);
  } catch {
    base.localPort = DEFAULT_LOCAL_PORT;
  }
  try {
    base.remoteUrl = normalizeBaseUrl(raw.remoteUrl ?? defaults.remoteUrl);
  } catch {
    base.remoteUrl = DEFAULT_REMOTE_URL;
  }
  return base;
}

module.exports = {
  DEFAULT_LOCAL_PORT,
  DEFAULT_REMOTE_URL,
  MAX_PROFILES,
  normalizeMode,
  normalizePort,
  normalizeLocalHost,
  normalizeBaseUrl,
  isLocalHost,
  labelForUrl,
  normalizeProfiles,
  mergeProfile,
  normalizeBounds,
  sanitizeSettings
};
