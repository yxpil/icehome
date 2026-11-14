import { useState } from 'react';
import { Icon } from './icons.jsx';
import { Button } from './ui.jsx';

export function LoginGate({ message, onLogin, onToken }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setLocalError('');
    try {
      if (mode === 'login') {
        if (!username.trim() || !password) throw new Error('请填写用户名与口令');
        await onLogin(username.trim(), password);
      } else {
        if (!value.trim()) throw new Error('请填写访问令牌');
        await onToken(value.trim());
      }
    } catch (error) {
      setLocalError(error.message || '登录失败');
      if (mode === 'token') setValue('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-mist px-5 py-10">
      <div className="w-full max-w-[440px] animate-fadeUp">
        <div className="mb-5 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink text-white">
            <Icon name="layers" size={18} />
          </div>
          <div>
            <div className="text-[12px] font-semibold tracking-[0.16em]">ICEHOME</div>
            <div className="text-[9.5px] uppercase tracking-[0.2em] text-muted2">multi-account home panel</div>
          </div>
        </div>
        <div className="card p-5">
          <h1 className="text-[17px] font-semibold tracking-tight">登录 ICEHOME</h1>
          <p className="muted mt-1">使用本地账户登录，或改用访问令牌。成员的可见设备由管理员授权决定。</p>
          {message || localError ? (
            <div className="mt-3 rounded-lg border border-line bg-mist px-3 py-2 text-[11.5px] text-ink">
              {localError || message}
            </div>
          ) : null}

          <div className="mt-4 grid grid-cols-2 gap-1 rounded-lg border border-line p-1">
            {[
              { key: 'login', label: '账户登录', icon: 'user' },
              { key: 'token', label: '访问令牌', icon: 'key' }
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  setMode(item.key);
                  setLocalError('');
                }}
                className={`inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11.5px] transition-colors ${
                  mode === item.key ? 'bg-ink text-white' : 'text-muted2 hover:text-ink'
                }`}
              >
                <Icon name={item.icon} size={13} />
                {item.label}
              </button>
            ))}
          </div>

          <form className="mt-4 flex flex-col gap-3" onSubmit={submit}>
            {mode === 'login' ? (
              <>
                <label className="flex flex-col gap-1">
                  <span className="label">用户名</span>
                  <input
                    className="input font-mono"
                    value={username}
                    autoFocus
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="admin"
                    autoComplete="username"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="label">口令</span>
                  <input
                    className="input"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="至少 6 位"
                    autoComplete="current-password"
                  />
                </label>
              </>
            ) : (
              <input
                className="input font-mono"
                placeholder="sk-ice-…"
                value={value}
                autoFocus
                onChange={(event) => setValue(event.target.value)}
              />
            )}
            <Button type="submit" icon={mode === 'login' ? 'user' : 'key'} disabled={busy}>
              {busy ? '验证中…' : '验证并进入'}
            </Button>
          </form>

          <div className="mt-3 rounded-lg border border-line2 px-3 py-2 text-[10.5px] leading-4 text-muted2">
            初始管理员为 <span className="font-mono text-ink">admin</span> / <span className="font-mono text-ink">icehome</span>；
            演示成员为 <span className="font-mono text-ink">family</span> / <span className="font-mono text-ink">icehome</span>，只授权了 3 台设备。
          </div>
        </div>
        <p className="mt-4 text-center text-[10.5px] leading-5 text-muted2">
          管理员可管理账户、令牌、插件与全部设备；成员仅能读写被授权的设备。
        </p>
      </div>
    </div>
  );
}
