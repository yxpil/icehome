import { describe, expect, it } from 'vitest';
import {
  applyAccountPatch,
  buildAccount,
  canAccessDevice,
  deviceScopeFor,
  hashPassword,
  publicAccount,
  scopesForRole,
  verifyPassword
} from '../../server/src/accounts.js';

const devices = [
  { id: 'dev_a', name: 'A' },
  { id: 'dev_b', name: 'B' },
  { id: 'dev_c', name: 'C' }
];

describe('账户与口令', () => {
  it('scrypt 散列可校验，错误口令不通过', () => {
    const stored = hashPassword('icehome');
    expect(stored.startsWith('scrypt:')).toBe(true);
    expect(verifyPassword(stored, 'icehome')).toBe(true);
    expect(verifyPassword(stored, 'wrong-pass')).toBe(false);
    expect(verifyPassword('', 'icehome')).toBe(false);
  });

  it('同一口令每次散列结果不同（随机盐）', () => {
    expect(hashPassword('icehome')).not.toBe(hashPassword('icehome'));
  });

  it('创建账户校验用户名、口令与设备授权', () => {
    const user = buildAccount(
      { username: 'family', displayName: '家人', password: 'secret1', role: 'member', deviceIds: ['dev_a', 'dev_a'] },
      { devices }
    );
    expect(user.deviceIds).toEqual(['dev_a']);
    expect(publicAccount(user).passwordSet).toBe(true);
    expect(publicAccount(user).passwordHash).toBeUndefined();

    expect(() => buildAccount({ username: 'A!', password: 'secret1' }, { devices })).toThrow('用户名');
    expect(() => buildAccount({ username: 'abc', password: '123' }, { devices })).toThrow('口令');
    expect(() => buildAccount({ username: 'abc', password: 'secret1', role: 'owner' }, { devices })).toThrow('角色');
    expect(() => buildAccount({ username: 'abc', password: 'secret1', deviceIds: ['dev_x'] }, { devices })).toThrow('设备不存在');
  });

  it('用户名重复会被拒绝', () => {
    const users = [{ username: 'family' }];
    expect(() => buildAccount({ username: 'Family', password: 'secret1' }, { users, devices })).toThrow('已存在');
  });

  it('管理员不需要设备集合，成员补齐设备', () => {
    const admin = buildAccount({ username: 'root', password: 'secret1', role: 'admin' }, { devices });
    expect(admin.deviceIds).toEqual([]);
    expect(scopesForRole('admin')).toEqual(['admin']);
    expect(scopesForRole('member')).toEqual(['device:read', 'device:write', 'ai:use']);
  });

  it('更新账户时限制显示名、角色与设备', () => {
    const user = buildAccount({ username: 'family', password: 'secret1', deviceIds: ['dev_a'] }, { devices });
    applyAccountPatch(user, { displayName: '客厅成员', deviceIds: ['dev_b'] }, { devices });
    expect(user.displayName).toBe('客厅成员');
    expect(user.deviceIds).toEqual(['dev_b']);
    expect(() => applyAccountPatch(user, { displayName: ' ' }, { devices })).toThrow('显示名称');
    expect(() => applyAccountPatch(user, { role: 'owner' }, { devices })).toThrow('角色');
    applyAccountPatch(user, { role: 'admin' }, { devices });
    expect(user.deviceIds).toEqual([]);
  });

  it('权限范围：管理员不限，成员按 deviceIds 判断', () => {
    const member = { role: 'member', deviceIds: ['dev_a'] };
    expect(deviceScopeFor({ user: member }).has('dev_a')).toBe(true);
    expect(deviceScopeFor({ user: member }).has('dev_b')).toBe(false);
    expect(canAccessDevice({ user: member }, 'dev_b')).toBe(false);
    expect(deviceScopeFor({ user: null })).toBeNull();
    expect(canAccessDevice({ user: null }, 'dev_b')).toBe(true);
    expect(deviceScopeFor({ user: { role: 'admin', deviceIds: [] } })).toBeNull();
  });
});
