import { useState } from 'react';
import { Icon } from '../icons.jsx';
import { Badge, Button, Card, Meter, SectionHeader, cn } from '../ui.jsx';
import { useApp } from '../context.js';
import { api } from '../api.js';

const LEVEL_TONE = { info: 'line', warn: 'soft', error: 'ink' };
const TYPE_LABEL = {
  system: '系统',
  device: '设备',
  task: '任务',
  plugin: '插件',
  pairing: '配对',
  adapter: '接口'
};

export function SystemView() {
  const { state, refresh, action } = useApp();
  const [filter, setFilter] = useState('all');
  const stats = state.stats;
  const infra = state.infra || {};
  const storage = infra.storage || {};
  const cache = infra.cache || {};
  const events = state.events.filter((event) => filter === 'all' || event.type === filter);

  const uptime = stats.uptimeSec;
  const uptimeText = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`;
  const driverLabel = { json: '本地 JSON', postgres: 'PostgreSQL', mysql: 'MySQL' }[storage.driver] || storage.driver || '未知';
  const modeLabel = `${driverLabel}${infra.staticServing ? ' · 单进程' : ' · 前后端分离'}`;

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="系统状态"
        description="服务进程、设备在线率与事件流的实时快照。"
        action={
          <Button variant="outline" icon="refresh" onClick={() => refresh()}>
            刷新
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {[
          { label: '设备在线率', value: `${stats.onlineRatio}%`, hint: `${stats.counts.online}/${stats.counts.devices} 在线` },
          { label: '运行时长', value: uptimeText, hint: `进程 RSS ${stats.memory.rssMb} MB` },
          { label: '活跃任务', value: stats.counts.activeTasks, hint: `共 ${stats.counts.tasks} 条` },
          { label: '事件总数', value: stats.counts.events, hint: `插件 ${stats.counts.activePlugins}/${stats.counts.plugins} 启用` }
        ].map((item) => (
          <div key={item.label} className="kpi">
            <span className="label">{item.label}</span>
            <span className="num text-[21px] font-semibold leading-none tracking-tight">{item.value}</span>
            <span className="text-[10.5px] text-muted2">{item.hint}</span>
          </div>
        ))}
      </div>

      <div className="grid gap-2.5 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <span className="label">存储与缓存</span>
            <Badge tone={storage.connected === false ? 'warn' : 'soft'}>
              {storage.connected === false ? '存储未连接' : '运行正常'}
            </Badge>
          </div>
          <div className="grid gap-x-6 gap-y-2.5 text-[11.5px] sm:grid-cols-2">
            {[
              ['存储驱动', driverLabel],
              ['连接地址', storage.target || '内存'],
              ['写入延迟', `${storage.latencyMs ?? 0} ms`],
              ['缓存后端', cache.backend === 'redis' ? 'Redis' : '进程内存'],
              ['缓存命中 / 未命中', `${cache.hits ?? 0} / ${cache.misses ?? 0}`],
              ['缓存 TTL', `${state.settings.cache?.ttlSeconds ?? 0} s`]
            ].map(([key, value]) => (
              <div key={key} className="flex items-center justify-between gap-2 border-b border-line2 pb-1.5">
                <span className="text-muted2">{key}</span>
                <span className="num truncate text-[11px]" title={String(value)}>
                  {value}
                </span>
              </div>
            ))}
          </div>
          {cache.fallbackReason ? (
            <div className="mt-2.5 rounded-lg border border-line px-2.5 py-1.5 text-[11px] leading-5 text-muted2">
              {cache.fallbackReason}
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line2 pt-3">
            <Button
              variant="outline"
              size="sm"
              icon="database"
              onClick={() => action(null, () => api.testStorage())}
            >
              测试存储连接
            </Button>
            <Button variant="ghost" size="sm" icon="refresh" onClick={() => action('缓存已清空', api.purgeCache)}>
              清空页面缓存
            </Button>
            <Badge tone="soft">
              <Icon name={cache.backend === 'redis' ? 'layers' : 'server'} size={10} />
              {state.settings.cache?.enabled ? '缓存已启用' : '缓存已关闭'}
            </Badge>
          </div>
        </Card>

        <Card className="p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <span className="label">运行时信息</span>
            <Badge tone="soft">v{state.version}</Badge>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-[11.5px]">
            {[
              ['平台', stats.platform],
              ['CPU 核心', `${stats.cpuCount} 核`],
              ['负载', stats.loadAvg],
              ['堆内存', `${stats.memory.heapMb} MB`],
              ['面板地址', window.location.host],
              ['数据模式', modeLabel]
            ].map(([key, value]) => (
              <div key={key} className="flex items-center justify-between gap-2 border-b border-line2 pb-1.5">
                <span className="text-muted2">{key}</span>
                <span className="num truncate text-[11px]">{value}</span>
              </div>
            ))}
          </div>
          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between text-[10.5px] text-muted2">
              <span>设备在线</span>
              <span className="num">
                {stats.counts.online}/{stats.counts.devices}
              </span>
            </div>
            <Meter value={stats.onlineRatio} />
          </div>
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="label">资源分布</span>
            <Icon name="cpu" size={14} className="text-muted2" />
          </div>
          {[
            { label: '设备', value: stats.counts.devices, max: Math.max(10, stats.counts.devices) },
            { label: '任务', value: stats.counts.tasks, max: Math.max(10, stats.counts.tasks) },
            { label: '令牌', value: stats.counts.tokens, max: Math.max(10, stats.counts.tokens) },
            { label: '插件', value: stats.counts.plugins, max: Math.max(10, stats.counts.plugins) }
          ].map((item) => (
            <div key={item.label} className="mb-2.5">
              <div className="mb-1 flex items-center justify-between text-[10.5px] text-muted2">
                <span>{item.label}</span>
                <span className="num">{item.value}</span>
              </div>
              <Meter value={(item.value / item.max) * 100} />
            </div>
          ))}
          <div className="mt-3 border-t border-line2 pt-2.5 text-[11px] leading-5 text-muted2">
            调度器每 15 秒检查一次任务；数据在 150ms 防抖后原子写盘。
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="label">事件日志</span>
          <div className="flex flex-wrap gap-1">
            {[
              ['all', '全部'],
              ['device', '设备'],
              ['task', '任务'],
              ['adapter', '接口'],
              ['pairing', '配对'],
              ['system', '系统']
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={cn('chip transition-colors', filter === value && 'chip-active')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="max-h-[520px] overflow-y-auto">
          {events.length === 0 ? (
            <div className="py-8 text-center text-[12px] text-muted2">该类型暂无事件</div>
          ) : (
            <div className="flex flex-col divide-y divide-line2">
              {events.map((event) => (
                <div key={event.id} className="flex items-start gap-3 py-2">
                  <span className="num w-[66px] shrink-0 text-[10.5px] text-muted2">
                    {new Date(event.ts).toLocaleTimeString('zh-CN', { hour12: false })}
                  </span>
                  <Badge tone={LEVEL_TONE[event.level] || 'line'} className="shrink-0">
                    {TYPE_LABEL[event.type] || event.type}
                  </Badge>
                  <span className="min-w-0 flex-1 text-[11.5px] leading-5 text-slate1">{event.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
