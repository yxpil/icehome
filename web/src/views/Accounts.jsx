import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '../icons.jsx';
import { Badge, Button, Card, EmptyState, Field, IconButton, Modal, SectionHeader, Switch, cn } from '../ui.jsx';
import { useApp } from '../context.js';
import { api } from '../api.js';

function DevicePicker({ devices, categories, selected, onChange }) {
  const toggle = (deviceId) => {
    onChange(selected.includes(deviceId) ? selected.filter((item) => item !== deviceId) : [...selected, deviceId]);
  };
  return (
    <div className="max-h-[300px] overflow-y-auto rounded-xl border border-line bg-mist/40 p-2">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="label">手动选择设备</span>
        <div className="flex items-center gap-2">
          <button type="button" className="text-[10.5px] text-muted2 hover:text-ink" onClick={() => onChange(devices.map((item) => item.id))}>
            全选
          </button>
          <button type="button" className="text-[10.5px] text-muted2 hover:text-ink" onClick={() => onChange([])}>
            清空
          </button>
        </div>
      </div>
      <div className="grid gap-1 sm:grid-cols-2">
        {devices.map((device) => {
          const category = categories.find((item) => item.id === device.categoryId);
          return (
            <label
              key={device.id}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 transition-colors',
                selected.includes(device.id) ? 'border-ink bg-paper' : 'border-transparent hover:border-line hover:bg-paper'
              )}
            >
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-black"
                checked={selected.includes(device.id)}
                onChange={() => toggle(device.id)}
              />
              <Icon name={device.icon || 'cube'} size={14} className="text-muted2" />
              <span className="min-w-0 flex-1 truncate text-[11.5px]">{device.name}</span>
              {category ? <span className="text-[9.5px] text-muted2">{category.name}</span> : null}
            </label>
          );
        })}
      </div>
    </div>
  );
}

function roleLabel(role) {
  return role === 'admin' ? '管理员' : '成员';
}

export function AccountsView() {
  const { state, action } = useApp();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('member');
  const [deviceIds, setDeviceIds] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await api.users();
    setUsers(result.users);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const devices = state.devices;
  const counts = useMemo(
    () => ({
      admin: users.filter((user) => user.role === 'admin').length,
      member: users.filter((user) => user.role === 'member').length,
      granted: users.filter((user) => user.role === 'member').length
        ? Math.round(
            users
              .filter((user) => user.role === 'member')
              .reduce((sum, user) => sum + user.deviceIds.length, 0) /
              users.filter((user) => user.role === 'member').length
          )
        : 0
    }),
    [users]
  );

  const openCreate = () => {
    setUsername('');
    setDisplayName('');
    setPassword('');
    setRole('member');
    setDeviceIds([]);
    setModal({ mode: 'create' });
  };

  const openEdit = (user) => {
    setUsername(user.username);
    setDisplayName(user.displayName);
    setPassword('');
    setRole(user.role);
    setDeviceIds(user.deviceIds || []);
    setModal({ mode: 'edit', user });
  };

  const close = () => {
    if (busy) return;
    setModal(null);
  };

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    if (modal.mode === 'create') {
      const result = await action('账户已创建', () =>
        api.createUser({ username, displayName, password, role, deviceIds: role === 'admin' ? [] : deviceIds })
      );
      if (result) {
        await load();
        setModal(null);
      }
    } else {
      const patch = { displayName, role, deviceIds: role === 'admin' ? [] : deviceIds, active: modal.user.active !== false };
      if (password.trim()) patch.password = password.trim();
      const result = await action('账户已更新', () => api.updateUser(modal.user.id, patch));
      if (result) {
        await load();
        setModal(null);
      }
    }
    setBusy(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="账户与权限"
        description="本地面板支持多账户。管理员拥有全部设备，成员只能看到并控制被授权的设备；授权可在平面图上框选，也可在此手动勾选。"
        action={
          <Button icon="plus" onClick={openCreate}>
            新增账户
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {[
          { label: '账户总数', value: users.length },
          { label: '管理员', value: counts.admin },
          { label: '成员', value: counts.member },
          { label: '成员平均设备', value: counts.granted }
        ].map((item) => (
          <div key={item.label} className="kpi">
            <span className="label">{item.label}</span>
            <span className="num text-[20px] font-semibold leading-none tracking-tight">{item.value}</span>
          </div>
        ))}
      </div>

      {loading ? (
        <Card className="p-6 text-center text-[12px] text-muted2">正在读取账户…</Card>
      ) : users.length === 0 ? (
        <EmptyState icon="users" title="还没有账户" action={<Button icon="plus" onClick={openCreate}>新增账户</Button>} />
      ) : (
        <div className="card overflow-hidden">
          <div className="hidden grid-cols-12 gap-3 border-b border-line px-4 py-2.5 text-[10px] uppercase tracking-[0.12em] text-muted2 md:grid">
            <span className="col-span-3">账户</span>
            <span className="col-span-2">角色</span>
            <span className="col-span-3">设备权限</span>
            <span className="col-span-2">最近登录</span>
            <span className="col-span-2 text-right">操作</span>
          </div>
          {users.map((user) => (
            <div
              key={user.id}
              className={cn(
                'grid gap-3 border-b border-line2 px-4 py-3 md:grid-cols-12 md:items-center',
                user.active === false && 'opacity-55'
              )}
            >
              <div className="min-w-0 md:col-span-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-line bg-mist">
                    <Icon name="user" size={14} />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[12.5px] font-medium">{user.displayName}</div>
                    <div className="mono-tag mt-0.5 truncate">{user.username}</div>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 md:col-span-2">
                <Badge tone={user.role === 'admin' ? 'ink' : 'soft'}>{roleLabel(user.role)}</Badge>
                {user.active === false ? <Badge tone="line">停用</Badge> : null}
              </div>
              <div className="md:col-span-3">
                {user.role === 'admin' ? (
                  <span className="text-[11.5px] text-muted2">全部 {devices.length} 台设备</span>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {(user.deviceIds || []).slice(0, 3).map((deviceId) => {
                      const device = devices.find((item) => item.id === deviceId);
                      return device ? (
                        <span key={deviceId} className="chip">
                          {device.name}
                        </span>
                      ) : null;
                    })}
                    {(user.deviceIds || []).length > 3 ? (
                      <span className="chip">+{(user.deviceIds || []).length - 3}</span>
                    ) : null}
                    {(user.deviceIds || []).length === 0 ? <span className="text-[11.5px] text-muted2">未授权任何设备</span> : null}
                  </div>
                )}
              </div>
              <div className="num text-[11px] text-muted2 md:col-span-2">
                {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('zh-CN', { hour12: false }) : '从未登录'}
              </div>
              <div className="flex items-center justify-end gap-1 md:col-span-2">
                <Button variant="outline" size="sm" onClick={() => openEdit(user)}>
                  编辑
                </Button>
                <IconButton
                  icon="trash"
                  label="删除账户"
                  disabled={user.id === state.account?.id}
                  onClick={async () => {
                    if (!window.confirm(`删除账户「${user.displayName}」？该账户的登录会话会立即失效。`)) return;
                    const result = await action('账户已删除', () => api.deleteUser(user.id));
                    if (result) await load();
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(modal)}
        onClose={close}
        title={modal?.mode === 'edit' ? '编辑账户' : '新增账户'}
        description={
          modal?.mode === 'edit'
            ? '修改角色、启停状态和设备授权；口令留空表示不修改。'
            : '创建本地账户。成员只能访问勾选的设备，管理员默认访问全部设备。'
        }
        footer={
          <>
            <Button variant="outline" onClick={close} disabled={busy}>
              取消
            </Button>
            <Button onClick={submit} disabled={busy || !username.trim() || (modal?.mode === 'create' && password.length < 6)}>
              {busy ? '保存中…' : '保存'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="用户名" hint="3-24 位小写字母、数字或 . _ -">
              <input
                className="input font-mono"
                value={username}
                disabled={modal?.mode === 'edit'}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="例如 living-room"
              />
            </Field>
            <Field label="显示名称">
              <input className="input" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="例如 家人" />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="角色">
              <select className="input" value={role} onChange={(event) => setRole(event.target.value)}>
                <option value="member">成员 · 仅授权设备</option>
                <option value="admin">管理员 · 全部设备</option>
              </select>
            </Field>
            <Field label={modal?.mode === 'edit' ? '新口令（可选）' : '登录口令'} hint="6-64 位">
              <input
                className="input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={modal?.mode === 'edit' ? '留空则不修改' : '至少 6 位'}
              />
            </Field>
          </div>
          {modal?.mode === 'edit' ? (
            <div className="flex items-center justify-between rounded-xl border border-line px-3 py-2.5">
              <div>
                <div className="text-[12px] font-medium">启用账户</div>
                <div className="text-[10.5px] text-muted2">停用后该账户已有会话立即失效</div>
              </div>
              <Switch
                checked={modal.user.active !== false}
                onChange={(checked) => setModal({ ...modal, user: { ...modal.user, active: checked } })}
                label="启用账户"
              />
            </div>
          ) : null}
          {role === 'member' ? (
            <Field label={`设备授权（已选 ${deviceIds.length} / ${devices.length}）`}>
              <DevicePicker devices={devices} categories={state.categories} selected={deviceIds} onChange={setDeviceIds} />
            </Field>
          ) : (
            <div className="rounded-xl border border-line bg-mist/50 px-3 py-2.5 text-[11.5px] text-muted2">
              管理员默认拥有全部设备，无需单独授权。
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
