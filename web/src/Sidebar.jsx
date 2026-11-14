import { Icon } from './icons.jsx';
import { Dot, Meter, cn } from './ui.jsx';
import { useApp } from './context.js';

const NAV = [
  { kind: 'plan', label: '家居平面图', icon: 'plan' },
  { kind: 'qr', label: '二维码巡检', icon: 'camera' },
  { kind: 'accounts', label: '账户与权限', icon: 'users', admin: true },
  { kind: 'tasks', label: '定时任务', icon: 'clock' },
  { kind: 'system', label: '系统状态', icon: 'cpu' },
  { kind: 'tokens', label: 'API 令牌', icon: 'key', admin: true },
  { kind: 'plugins', label: '插件', icon: 'puzzle', admin: true },
  { kind: 'pairing', label: '配对与导入', icon: 'qr', admin: true },
  { kind: 'ai', label: 'AI 操作手册', icon: 'book' },
  { kind: 'settings', label: '设置', icon: 'sliders', admin: true }
];

export function Sidebar({ mobileOpen, onClose }) {
  const { state, view, setView, query, setQuery, logout } = useApp();
  const isAdmin = state.account?.role === 'admin';
  const stats = state.stats;
  const categories = [...state.categories].sort((a, b) => a.order - b.order);
  const counts = state.devices.reduce((acc, device) => {
    acc[device.categoryId || 'none'] = (acc[device.categoryId || 'none'] || 0) + 1;
    return acc;
  }, {});

  const navigate = (next) => {
    setView(next);
    onClose?.();
  };

  const isActive = (kind, id) => (id ? view.kind === kind && view.id === id : view.kind === kind);

  return (
    <>
      {mobileOpen ? <div className="fixed inset-0 z-40 bg-ink/25 lg:hidden" onClick={onClose} /> : null}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[300px] flex-col border-r border-line bg-paper transition-transform duration-200 lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-line px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-white">
            <Icon name="layers" size={17} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-semibold tracking-[0.16em]">ICEHOME</div>
            <div className="text-[9.5px] uppercase tracking-[0.2em] text-muted2">home control panel</div>
          </div>
          <button type="button" className="btn-icon lg:hidden" onClick={onClose} aria-label="关闭导航">
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="px-3 pt-3">
          <div className="relative">
            <Icon name="search" size={14} className="absolute left-2.5 top-[11px] text-muted2" />
            <input
              className="input h-9 pl-8"
              placeholder="搜索设备 / 类型"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="搜索设备"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          <div className="mb-1.5 flex items-center justify-between px-1">
            <span className="label">设备分类</span>
            <button
              type="button"
              className="text-muted2 transition-colors hover:text-ink"
              onClick={() => navigate({ kind: 'categories' })}
              aria-label="管理分类"
            >
              <Icon name="plus" size={14} />
            </button>
          </div>

          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => navigate({ kind: 'overview' })}
              className={cn(
                'flex items-center gap-2.5 rounded-lg border px-2.5 py-[7px] text-left transition-colors',
                isActive('overview')
                  ? 'border-ink bg-ink text-white'
                  : 'border-transparent text-slate1 hover:border-line hover:bg-mist'
              )}
            >
              <Icon name="grid" size={15} className={isActive('overview') ? 'opacity-90' : 'text-muted2'} />
              <span className="flex-1 truncate text-[12.5px]">全部设备</span>
              <span className="num text-[11px] opacity-60">{state.devices.length}</span>
            </button>

            {categories.map((category) => {
              const active = isActive('category', category.id);
              const count = counts[category.id] || 0;
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => navigate({ kind: 'category', id: category.id })}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg border px-2.5 py-[7px] text-left transition-colors',
                    active ? 'border-ink bg-ink text-white' : 'border-transparent text-slate1 hover:border-line hover:bg-mist'
                  )}
                >
                  <Icon name={category.icon} size={15} className={active ? 'opacity-90' : 'text-muted2'} />
                  <span className="flex-1 truncate text-[12.5px]">{category.name}</span>
                  <span className="num text-[11px] opacity-60">{count}</span>
                </button>
              );
            })}

            {state.devices.some((device) => !device.categoryId) ? (
              <button
                type="button"
                onClick={() => navigate({ kind: 'uncategorized' })}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg border px-2.5 py-[7px] text-left transition-colors',
                  isActive('uncategorized') ? 'border-ink bg-ink text-white' : 'border-transparent text-slate1 hover:border-line hover:bg-mist'
                )}
              >
                <Icon name="dots" size={15} className={isActive('uncategorized') ? 'opacity-90' : 'text-muted2'} />
                <span className="flex-1 truncate text-[12.5px]">未分类</span>
                <span className="num text-[11px] opacity-60">{counts.none || 0}</span>
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => navigate({ kind: 'pairing' })}
              className="mt-1 flex items-center gap-2.5 rounded-lg border border-dashed border-line px-2.5 py-[7px] text-left text-muted2 transition-colors hover:border-ink hover:text-ink"
            >
              <Icon name="plus" size={14} />
              <span className="text-[12px]">添加配对</span>
            </button>
          </div>

          <div className="mt-5 mb-1.5 flex items-center justify-between px-1">
            <span className="label">控制台</span>
            <span className="mono-tag">v{state.version}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            {NAV.filter((item) => !item.admin || isAdmin).map((item) => (
              <button
                key={item.kind}
                type="button"
                onClick={() => navigate({ kind: item.kind })}
                className={cn('nav-row text-left', isActive(item.kind) && 'nav-row-active')}
              >
                <Icon name={item.icon} size={15} />
                <span className="flex-1 text-[12.5px]">{item.label}</span>
                {item.kind === 'tasks' ? (
                  <span className="num text-[11px] opacity-60">{stats.counts.activeTasks}</span>
                ) : null}
                {item.kind === 'pairing' && stats.counts.pendingPairings ? (
                  <span className="num text-[11px] opacity-60">{stats.counts.pendingPairings}</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>

        <div className="shrink-0 border-t border-line p-3">
          <div className="mb-2 flex items-center gap-2 rounded-xl border border-line px-2.5 py-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-mist">
              <Icon name="user" size={14} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11.5px] font-medium">{state.account?.displayName || '本地面板'}</div>
              <div className="text-[9.5px] uppercase tracking-[0.12em] text-muted2">
                {isAdmin ? '管理员 · 全部设备' : `成员 · ${state.devices.length} 台设备`}
              </div>
            </div>
            <button type="button" className="text-muted2 hover:text-ink" onClick={logout} aria-label="退出登录">
              <Icon name="arrowRight" size={14} />
            </button>
          </div>
          <button
            type="button"
            onClick={() => navigate({ kind: 'system' })}
            className="w-full rounded-xl border border-line p-3 text-left transition-colors hover:border-ink/40"
          >
            <div className="flex items-center justify-between">
              <span className="label">系统状态</span>
              <span className="inline-flex items-center gap-1.5 text-[10.5px] text-muted2">
                <Dot online />
                运行中
              </span>
            </div>
            <div className="mt-1.5 flex items-baseline gap-1">
              <span className="num text-[20px] font-semibold leading-none tracking-tight">{stats.onlineRatio}%</span>
              <span className="text-[10.5px] text-muted2">设备在线</span>
            </div>
            <Meter value={stats.onlineRatio} className="mt-2" />
            <div className="mt-2 flex items-center justify-between text-[10.5px] text-muted2">
              <span className="num">
                {stats.counts.online}/{stats.counts.devices}
              </span>
              <span className="num">{stats.memory.rssMb} MB</span>
              <span className="num">UP {Math.floor(stats.uptimeSec / 60)}m</span>
            </div>
          </button>
        </div>
      </aside>
    </>
  );
}
