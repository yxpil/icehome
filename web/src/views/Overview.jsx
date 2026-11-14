import { useMemo, useState } from 'react';
import { Icon } from '../icons.jsx';
import { Badge, Button, Card, Dot, EmptyState, Meter, Switch, cn } from '../ui.jsx';
import { useApp } from '../context.js';
import { api } from '../api.js';

function metricOf(device) {
  const state = device.state || {};
  const power = state.power;
  switch (device.template) {
    case 'light':
      return power === 'on'
        ? { value: `${state.brightness ?? 0}`, unit: '%', label: '亮度', meter: state.brightness }
        : { value: 'OFF', label: '灯光已关闭' };
    case 'cover':
      return { value: `${state.position ?? 0}`, unit: '%', label: '开合度', meter: state.position };
    case 'climate':
      return power === 'on'
        ? { value: `${state.targetTemp ?? '--'}`, unit: '°C', label: '目标温度' }
        : { value: 'OFF', label: '温控已关闭' };
    case 'plug':
      return { value: `${state.powerW ?? 0}`, unit: 'W', label: '实时功率' };
    case 'sensor':
      return { value: `${state.temperature ?? '--'}`, unit: '°C', label: `湿度 ${state.humidity ?? '--'}%` };
    case 'air':
      return { value: `${state.co2 ?? '--'}`, unit: 'ppm', label: 'CO₂ 浓度' };
    case 'contact':
      return state.contact === 'open' ? { value: 'OPEN', label: '门窗已打开' } : { value: 'CLOSED', label: '门窗已关闭' };
    case 'motion':
      return state.motion ? { value: 'MOTION', label: '检测到移动' } : { value: 'IDLE', label: '无活动' };
    case 'lock':
      return state.locked ? { value: 'LOCKED', label: '已锁止' } : { value: 'OPEN', label: '未锁止' };
    case 'speaker':
      return { value: `${state.volume ?? 0}`, unit: '%', label: '音量' };
    case 'camera':
      return power === 'on' ? { value: 'ON', label: '正在录制' } : { value: 'OFF', label: '已关闭' };
    default:
      return power === 'on' ? { value: 'ON', label: '已开启' } : { value: 'OFF', label: '已关闭' };
  }
}

function secondaryChips(device, primaryLabel) {
  const state = device.state || {};
  const chips = [];
  if (state.battery !== undefined && !primaryLabel.includes('电量')) chips.push(`电量 ${state.battery}%`);
  if (state.temperature !== undefined && !primaryLabel.includes('温度') && device.template !== 'sensor') {
    chips.push(`${state.temperature}°C`);
  }
  if (state.humidity !== undefined && device.template !== 'sensor') chips.push(`湿度 ${state.humidity}%`);
  if (state.colorTemp !== undefined) chips.push(`${state.colorTemp}K`);
  if (state.energyKwh !== undefined) chips.push(`累计 ${state.energyKwh}kWh`);
  if (state.speed !== undefined) chips.push(`风速 ${state.speed}`);
  return chips.slice(0, 2);
}

function InlineSlider({ value, max = 100, onCommit, disabled }) {
  const [draft, setDraft] = useState(null);
  const current = draft ?? value ?? 0;
  const commit = () => {
    if (draft === null) return;
    onCommit(draft);
    setDraft(null);
  };
  return (
    <div className="mt-3" onClick={(event) => event.stopPropagation()}>
      <input
        type="range"
        min={1}
        max={max}
        value={current}
        disabled={disabled}
        aria-label="快速调节"
        className={cn('h-[3px] w-full cursor-pointer', disabled && 'opacity-40')}
        onChange={(event) => setDraft(Number(event.target.value))}
        onPointerUp={commit}
        onKeyUp={(event) => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') commit();
        }}
        onBlur={commit}
      />
    </div>
  );
}

function DeviceCard({ device, categoryName, onOpen, onAction }) {
  const metric = metricOf(device);
  const offline = device.online === false;
  const canToggle = device.capabilities.includes('power') || device.capabilities.includes('locked');
  const isOn =
    device.capabilities.includes('power')
      ? device.state.power === 'on'
      : device.capabilities.includes('locked')
        ? !device.state.locked
        : false;
  const chips = secondaryChips(device, metric.label);

  const slider =
    device.template === 'light' && device.state.power === 'on' && device.capabilities.includes('brightness')
      ? { value: device.state.brightness, onCommit: (value) => onAction(device, 'set', { brightness: value }) }
      : device.capabilities.includes('position')
        ? { value: device.state.position, onCommit: (value) => onAction(device, 'set', { position: value }) }
        : null;

  return (
    <Card
      className={cn('card-hover group cursor-pointer p-4', offline && 'opacity-70')}
      onClick={() => onOpen(device.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onOpen(device.id);
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors',
              isOn ? 'border-ink bg-ink text-white' : 'border-line bg-mist text-slate1'
            )}
          >
            <Icon name={device.icon} size={17} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium leading-5">{device.name}</div>
            <div className="flex items-center gap-1.5 text-[10.5px] text-muted2">
              <span className="truncate">{categoryName || '未分类'}</span>
              {offline ? (
                <>
                  <span className="h-[1px] w-2 bg-line" />
                  <span>离线</span>
                </>
              ) : null}
            </div>
          </div>
        </div>
        {canToggle ? (
          <Switch checked={isOn} onChange={() => onAction(device, 'toggle')} label={`切换 ${device.name}`} />
        ) : (
          <span className="text-muted2 opacity-0 transition-opacity group-hover:opacity-100">
            <Icon name="arrowRight" size={15} />
          </span>
        )}
      </div>

      <div className="mt-4 flex items-end justify-between gap-2">
        <div className="flex items-baseline gap-1">
          <span className="num text-[25px] font-semibold leading-none tracking-tight">{metric.value}</span>
          {metric.unit ? <span className="text-[11px] text-muted2">{metric.unit}</span> : null}
        </div>
        <span className="mb-[2px] text-[10px] uppercase tracking-[0.12em] text-muted2">{metric.label}</span>
      </div>

      {metric.meter !== undefined && !slider ? <Meter value={metric.meter} className="mt-2.5" /> : null}
      {slider ? <InlineSlider value={slider.value} max={100} onCommit={slider.onCommit} disabled={offline} /> : null}

      <div className="mt-3 flex min-h-[20px] flex-wrap items-center gap-1.5">
        {chips.map((chip) => (
          <Badge key={chip}>{chip}</Badge>
        ))}
        {device.adapter?.kind === 'http' ? (
          <Badge tone="soft">
            <Icon name="link" size={10} />
            HTTP 接口
          </Badge>
        ) : null}
        {device.pinned ? (
          <Badge tone="soft">
            <Icon name="sparkle" size={10} />
            置顶
          </Badge>
        ) : null}
        <span className="ml-auto inline-flex items-center gap-1 text-[10.5px] text-muted2">
          <Dot online={!offline} />
          {offline ? '离线' : '在线'}
        </span>
      </div>
    </Card>
  );
}

export function Overview() {
  const { state, view, query, openDevice, action, setView } = useApp();
  const category = view.kind === 'category' ? state.categories.find((item) => item.id === view.id) : null;
  const scopeLabel = category ? category.name : view.kind === 'uncategorized' ? '未分类' : '全部设备';

  const devices = useMemo(() => {
    let list = state.devices;
    if (view.kind === 'category') list = list.filter((device) => device.categoryId === view.id);
    if (view.kind === 'uncategorized') list = list.filter((device) => !device.categoryId);
    const needle = query.trim().toLowerCase();
    if (needle) {
      list = list.filter((device) =>
        `${device.name} ${device.template} ${device.capabilities.join(' ')}`.toLowerCase().includes(needle)
      );
    }
    return [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.order - b.order);
  }, [state.devices, view, query]);

  const categoryOf = (device) => state.categories.find((item) => item.id === device.categoryId)?.name;
  const online = devices.filter((device) => device.online !== false).length;
  const active = devices.filter((device) => device.state?.power === 'on').length;

  const onAction = (device, actionName, payload) =>
    action('', () => api.deviceAction(device.id, actionName || 'toggle', payload || {}));

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {[
          { label: '设备总数', value: devices.length, hint: scopeLabel },
          { label: '在线设备', value: `${online}/${devices.length}`, hint: `${Math.round((online / (devices.length || 1)) * 100)}% 在线率` },
          { label: '运行中', value: active, hint: '状态为开启' },
          { label: '活跃任务', value: state.stats.counts.activeTasks, hint: `共 ${state.stats.counts.tasks} 条任务` }
        ].map((item) => (
          <div key={item.label} className="kpi">
            <span className="label">{item.label}</span>
            <span className="num text-[22px] font-semibold leading-none tracking-tight">{item.value}</span>
            <span className="text-[10.5px] text-muted2">{item.hint}</span>
          </div>
        ))}
      </div>

      {devices.length === 0 ? (
        <EmptyState
          icon="cube"
          title="这个范围内还没有设备"
          description="可以通过右上角「添加设备」创建，或用配对码 / 二维码导入已有设备。"
          action={
            <Button icon="plus" onClick={() => setView({ kind: 'pairing' })}>
              去配对
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 items-start gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {devices.map((device) => (
            <DeviceCard
              key={device.id}
              device={device}
              categoryName={categoryOf(device)}
              onOpen={openDevice}
              onAction={onAction}
            />
          ))}
        </div>
      )}

      {view.kind === 'overview' && state.events.length ? (
        <Card className="p-4">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="label">最近事件</span>
            <button
              type="button"
              className="text-[11px] text-muted2 transition-colors hover:text-ink"
              onClick={() => setView({ kind: 'system' })}
            >
              查看全部
            </button>
          </div>
          <div className="flex flex-col divide-y divide-line2">
            {state.events.slice(0, 3).map((event) => (
              <div key={event.id} className="flex items-center gap-2.5 py-2 text-[12px]">
                <span className="mono-tag shrink-0">{new Date(event.ts).toLocaleTimeString('zh-CN', { hour12: false })}</span>
                <span className="truncate text-slate1">{event.message}</span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
