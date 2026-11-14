import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from './icons.jsx';
import { AppContext } from './context.js';
import { api, getToken, saveToken } from './api.js';
import { Button, Spinner, useToast } from './ui.jsx';
import { Sidebar } from './Sidebar.jsx';
import { LoginGate } from './Login.jsx';
import { Overview } from './views/Overview.jsx';
import { DeviceDrawer } from './views/DeviceDrawer.jsx';
import { AddDeviceModal } from './views/AddDevice.jsx';
import { CategoriesView } from './views/Categories.jsx';
import { TasksView } from './views/Tasks.jsx';
import { TokensView } from './views/Tokens.jsx';
import { PluginsView } from './views/Plugins.jsx';
import { PairingView } from './views/Pairing.jsx';
import { SystemView } from './views/System.jsx';
import { AiView } from './views/Ai.jsx';
import { SettingsView } from './views/Settings.jsx';
import { AccountsView } from './views/Accounts.jsx';
import { FloorPlanView } from './views/FloorPlan.jsx';
import { QrCenterView } from './views/QrCenter.jsx';

const TITLES = {
  overview: '总览',
  categories: '设备分类',
  tasks: '定时任务',
  system: '系统状态',
  tokens: 'API 令牌',
  plugins: '插件',
  pairing: '配对与导入',
  ai: 'AI 操作手册',
  settings: '设置',
  plan: '家居平面图',
  accounts: '账户与权限',
  qr: '二维码巡检',
  uncategorized: '未分类'
};

const ADMIN_ONLY = ['tokens', 'plugins', 'pairing', 'settings', 'accounts'];

function BootScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-ink text-white">
        <Icon name="layers" size={22} />
      </div>
      <div className="text-[12px] uppercase tracking-[0.24em] text-muted2">ICEHOME</div>
      <Spinner label="正在连接本机服务…" />
    </div>
  );
}

export default function App() {
  const toast = useToast();
  const [status, setStatus] = useState('boot');
  const [error, setError] = useState('');
  const [state, setState] = useState(null);
  const [view, setView] = useState({ kind: 'overview' });
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [navOpen, setNavOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const refresh = useCallback(async () => {
    const next = await api.state();
    setState(next);
    return next;
  }, []);

  useEffect(() => {
    let alive = true;
    async function boot() {
      try {
        if (!getToken()) {
          if (typeof localStorage !== 'undefined' && localStorage.getItem('icehome.loggedOut') === '1') {
            if (alive) setStatus('guest');
            return;
          }
          try {
            const result = await api.bootstrap();
            saveToken(result.token);
          } catch (bootError) {
            if (alive) {
              setError(bootError.message);
              setStatus('guest');
            }
            return;
          }
        }
        await refresh();
        if (alive) setStatus('ready');
      } catch (bootError) {
        if (!alive) return;
        if (bootError.status === 401) {
          saveToken('');
          setStatus('guest');
        } else {
          setError(bootError.message || '服务不可达');
          setStatus('error');
        }
      }
    }
    boot();
    return () => {
      alive = false;
    };
  }, [refresh]);

  const action = useCallback(
    async (message, fn) => {
      try {
        const result = await fn();
        await refresh();
        if (message) toast(message, 'success');
        return result ?? true;
      } catch (actionError) {
        toast(actionError.message || '操作失败', 'warn');
        if (actionError.status === 401) setStatus('guest');
        return null;
      }
    },
    [refresh, toast]
  );

  const device = useMemo(
    () => (selectedId ? state?.devices.find((item) => item.id === selectedId) : null),
    [selectedId, state]
  );

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // 令牌可能已失效，仍然清理本地会话
    }
    saveToken('');
    if (typeof localStorage !== 'undefined') localStorage.setItem('icehome.loggedOut', '1');
    setState(null);
    setSelectedId(null);
    setView({ kind: 'overview' });
    setStatus('guest');
  }, []);

  useEffect(() => {
    if (state && state.account?.role !== 'admin' && ADMIN_ONLY.includes(view.kind)) {
      setView({ kind: 'overview' });
    }
  }, [state, view.kind]);

  if (status === 'boot') return <BootScreen />;
  if (status === 'guest') {
    return (
      <LoginGate
        message={error}
        onLogin={async (username, password) => {
          const result = await api.login(username, password);
          saveToken(result.token);
          try {
            await refresh();
            if (typeof localStorage !== 'undefined') localStorage.removeItem('icehome.loggedOut');
            setStatus('ready');
            setError('');
          } catch (loginError) {
            saveToken('');
            throw loginError;
          }
        }}
        onToken={async (token) => {
          saveToken(token);
          try {
            await refresh();
            if (typeof localStorage !== 'undefined') localStorage.removeItem('icehome.loggedOut');
            setStatus('ready');
            setError('');
          } catch (loginError) {
            saveToken('');
            throw loginError;
          }
        }}
      />
    );
  }
  if (status === 'error') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <Icon name="alert" size={26} />
        <div>
          <div className="text-[15px] font-semibold">无法连接 ICEHOME 服务</div>
          <p className="muted mt-1 max-w-sm">{error}</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setStatus('boot')} icon="refresh">
            重试
          </Button>
        </div>
        <p className="mono-tag">先运行 npm start 或 npm run dev:server</p>
      </div>
    );
  }

  const title =
    view.kind === 'category'
      ? state.categories.find((item) => item.id === view.id)?.name || '分类'
      : TITLES[view.kind] || '总览';
  const showAdd =
    state.account?.role === 'admin' &&
    (['overview', 'uncategorized'].includes(view.kind) || (view.kind === 'category' && Boolean(view.id)));

  const contextValue = {
    state,
    refresh,
    view,
    setView,
    query,
    setQuery,
    action,
    logout,
    openDevice: (id) => setSelectedId(id)
  };

  return (
    <AppContext.Provider value={contextValue}>
      <div className="min-h-screen bg-paper">
        <Sidebar mobileOpen={navOpen} onClose={() => setNavOpen(false)} />

        <div className="lg:pl-[300px]">
          <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur-md">
            <div className="mx-auto flex max-w-[1440px] items-center gap-3 px-4 py-3 lg:px-8">
              <button type="button" className="btn-icon lg:hidden" onClick={() => setNavOpen(true)} aria-label="打开导航">
                <Icon name="menu" size={18} />
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.16em] text-muted2">
                  <span>ICEHOME · {state.settings.homeName}</span>
                  <Icon name="chevronRight" size={10} />
                  <span>{title}</span>
                </div>
                <h1 className="truncate text-[18px] font-semibold tracking-tight lg:text-[19px]">{title}</h1>
              </div>
              <div className="hidden items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[10.5px] text-muted2 sm:inline-flex">
                <span className="h-[6px] w-[6px] animate-pulseDot rounded-full bg-ink" />
                {state.account?.displayName || '本机服务在线'}
                <span className="text-muted2/70">·</span>
                {state.account?.role === 'admin' ? '管理员' : '成员'}
              </div>
              {showAdd ? (
                <Button icon="plus" onClick={() => setAddOpen(true)}>
                  <span className="hidden sm:inline">添加设备</span>
                </Button>
              ) : null}
            </div>
          </header>

          <main className="mx-auto max-w-[1440px] px-4 py-5 lg:px-8 lg:py-6">
            {view.kind === 'overview' || view.kind === 'category' || view.kind === 'uncategorized' ? <Overview /> : null}
            {view.kind === 'categories' ? <CategoriesView /> : null}
            {view.kind === 'tasks' ? <TasksView /> : null}
            {view.kind === 'system' ? <SystemView /> : null}
            {view.kind === 'tokens' ? <TokensView /> : null}
            {view.kind === 'plugins' ? <PluginsView /> : null}
            {view.kind === 'pairing' ? <PairingView /> : null}
            {view.kind === 'ai' ? <AiView /> : null}
            {view.kind === 'settings' ? <SettingsView /> : null}
            {view.kind === 'plan' ? <FloorPlanView /> : null}
            {view.kind === 'accounts' ? <AccountsView /> : null}
            {view.kind === 'qr' ? <QrCenterView /> : null}
          </main>

          <footer className="mx-auto flex max-w-[1440px] flex-col gap-1 border-t border-line px-4 py-4 text-[10.5px] text-muted2 sm:flex-row sm:items-center sm:justify-between lg:px-8">
            <span className="uppercase tracking-[0.14em]">ICEHOME · 黑白家庭控制面板</span>
            <span className="num">
              v{state.version} · {state.account?.displayName || '本地面板'} · {state.devices.length} 设备 · {state.tasks.length} 任务
              {state.account?.role === 'admin' ? ` · ${state.tokens.length} 令牌` : ''}
            </span>
          </footer>
        </div>

        {device ? <DeviceDrawer key={device.id} device={device} onClose={() => setSelectedId(null)} /> : null}
        <AddDeviceModal open={addOpen} onClose={() => setAddOpen(false)} />
      </div>
    </AppContext.Provider>
  );
}
