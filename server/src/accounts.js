import crypto from 'node:crypto';

const KEYLEN = 64;
const USERNAME_RE = /^[a-z0-9._-]{3,24}$/;
const ROLES = ['admin', 'member'];

/** scrypt 口令散列，格式 scrypt:salt:hash */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, KEYLEN).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(stored, password) {
  if (typeof stored !== 'string') return false;
  const [scheme, salt, hash] = stored.split(':');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const candidate = crypto.scryptSync(String(password), salt, KEYLEN);
  const expected = Buffer.from(hash, 'hex');
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

export function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

/** 登录账户可见的 scope：管理员全权，成员可读写自己名下的设备 */
export function scopesForRole(role) {
  return role === 'admin' ? ['admin'] : ['device:read', 'device:write', 'ai:use'];
}

export function publicAccount(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    active: user.active !== false,
    deviceIds: user.role === 'admin' ? null : [...(user.deviceIds || [])],
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || null,
    lastLoginAt: user.lastLoginAt || null,
    passwordSet: Boolean(user.passwordHash)
  };
}

function assertDeviceIds(deviceIds, devices) {
  if (!Array.isArray(deviceIds)) throw new Error('deviceIds 必须是设备 ID 数组');
  const known = new Set(devices.map((device) => device.id));
  const cleaned = [...new Set(deviceIds.map((item) => String(item)))];
  const unknown = cleaned.filter((item) => !known.has(item));
  if (unknown.length) throw new Error(`设备不存在：${unknown.join('、')}`);
  return cleaned;
}

/** 创建账户；用户名唯一、口令强度、角色与设备范围统一校验 */
export function buildAccount(input, { users = [], devices = [] } = {}) {
  const username = normalizeUsername(input.username);
  if (!USERNAME_RE.test(username)) {
    throw new Error('用户名需为 3-24 位小写字母、数字、点、下划线或短横线');
  }
  if (users.some((user) => user.username === username)) throw new Error('用户名已存在');
  const password = String(input.password || '');
  if (password.length < 6 || password.length > 64) throw new Error('口令长度需在 6-64 位之间');
  const role = String(input.role || 'member');
  if (!ROLES.includes(role)) throw new Error('角色只支持 admin / member');
  const displayName = String(input.displayName || username).trim() || username;
  if (displayName.length > 30) throw new Error('显示名称最长 30 个字符');
  const deviceIds = role === 'admin' ? [] : assertDeviceIds(input.deviceIds || [], devices);
  const now = new Date().toISOString();
  return {
    id: input.id || `usr_${crypto.randomBytes(6).toString('hex')}`,
    username,
    displayName,
    role,
    deviceIds,
    passwordHash: hashPassword(password),
    active: true,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null,
    note: String(input.note || '')
  };
}

/** 更新账户：只允许改显示名、角色、授权设备、启停与口令 */
export function applyAccountPatch(user, patch, { users = [], devices = [] } = {}) {
  if (patch.displayName !== undefined) {
    const displayName = String(patch.displayName).trim();
    if (!displayName) throw new Error('显示名称不能为空');
    if (displayName.length > 30) throw new Error('显示名称最长 30 个字符');
    user.displayName = displayName;
  }
  if (patch.role !== undefined) {
    if (!ROLES.includes(patch.role)) throw new Error('角色只支持 admin / member');
    user.role = patch.role;
    if (patch.role === 'admin') user.deviceIds = [];
  }
  if (patch.deviceIds !== undefined) {
    user.deviceIds = user.role === 'admin' ? [] : assertDeviceIds(patch.deviceIds, devices);
  }
  if (patch.active !== undefined) user.active = Boolean(patch.active);
  if (patch.password !== undefined) {
    const password = String(patch.password || '');
    if (password.length < 6 || password.length > 64) throw new Error('口令长度需在 6-64 位之间');
    user.passwordHash = hashPassword(password);
  }
  user.updatedAt = new Date().toISOString();
  return user;
}

/** 当前请求可见的设备集合；null 表示不限制（管理员或旧版全权令牌） */
export function deviceScopeFor(req) {
  if (!req.user || req.user.role === 'admin') return null;
  return new Set(req.user.deviceIds || []);
}

export function canAccessDevice(req, deviceId) {
  const scope = deviceScopeFor(req);
  return !scope || scope.has(deviceId);
}

export function canManageHouse(req) {
  return !req.user || req.user.role === 'admin';
}
