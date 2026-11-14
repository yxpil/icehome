import { useState } from 'react';
import { Icon } from '../icons.jsx';
import { Badge, Button, CopyButton, Drawer, Field, Switch, Tabs, cn } from '../ui.jsx';
import { useApp } from '../context.js';
import { api } from '../api.js';

function CapabilityControl({ cap, value, onCommit }) {
  const [draft, setDraft] = useState(null);
  if (cap.type === 'enum') {
    const values = cap.values || [];
    return (
      <div className="flex flex-wrap gap-1.5">
        {values.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onCommit(item)}
            className={cn('chip px-2.5 py-1.5', value === item && 'chip-active')}
          >
            {item === 'on' ? '开启' : item === 'off' ? '关闭' : item === 'open' ? '打开' : item === 'closed' ? '关闭' : item}
          </button>
        ))}
      </div>
    );
  }
  if (cap.type === 'boolean') {
    return (
      <div className="flex items-center gap-3">
        <Switch checked={Boolean(value)} onChange={onCommit} label={cap.label} />
        <span className="muted">{value ? '是' : '否'}</span>
      </div>
    );
  }
  const current = draft ?? value ?? 0;
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="mono-tag">
          {cap.min} - {cap.max}
          {cap.unit || ''}
        </span>
        <span className="num text-[12px]">
          {current}
          {cap.unit || ''}
        </span>
      </div>
      <input
        type="range"
        min={cap.min}
        max={cap.max}
        step={cap.key === 'colorTemp' ? 100 : 1}
        value={current}
        aria-label={cap.label}
        className="mt-2 h-[3px] w-full cursor-pointer"
        onChange={(event) => setDraft(Number(event.target.value))}
        onPointerUp={() => {
          if (draft !== null) onCommit(draft);
          setDraft(null);
        }}
        onBlur={() => {
          if (draft !== null) onCommit(draft);
          setDraft(null);
        }}
      />
    </div>
  );
}

export function DeviceDrawer({ device, onClose }) {
  const { state, action, setView } = useApp();
  const [tab, setTab] = useState('state');
  const [basic, setBasic] = useState({ name: device.name, categoryId: device.categoryId || '' });
  const [adapter, setAdapter] = useState({ ...device.adapter });
  const [probe, setProbe] = useState(null);
  const category = state.categories.find((item) => item.id === device.categoryId);
  const caps = state.capabilities.filter((cap) => device.capabilities.includes(cap.key));
  const tasks = state.tasks.filter((task) => task.deviceId === device.id);

  const send = (key, value) => action('', () => api.deviceAction(device.id, 'set', { [key]: value }));

  return (
    <Drawer
      open
      onClose={onClose}
      title={device.name}
      subtitle={`${category?.name || '未分类'} · ${device.template}`}
      footer={
        <div className="flex items-center justify-between gap-2">
          <Button variant="danger" size="sm" icon="trash" onClick={async () => {
            if (!window.confirm(`确认删除「${device.name}」？关联的定时任务也会被移除。`)) return;
            const result = await action('设备已删除', () => api.deleteDevice(device.id));
            if (result) onClose();
          }}>
            删除
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              icon="refresh"
              onClick={() => action('已同步设备状态', () => api.deviceAction(device.id, 'sync'))}
            >
              同步
            </Button>
            <Button size="sm" icon="check" onClick={onClose}>
              完成
            </Button>
          </div>
        </div>
      }
    >
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'state', label: '状态' },
          { value: 'adapter', label: '接口' },
          { value: 'tasks', label: '任务', count: tasks.length },
          { value: 'raw', label: 'JSON' }
        ]}
        className="mb-4"
      />

      {tab === 'state' ? (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="label">基础信息</span>
              <span className="inline-flex items-center gap-1.5 text-[10.5px] text-muted2">
                <span className={cn('h-[6px] w-[6px] rounded-full', device.online === false ? 'bg-line' : 'bg-ink')} />
                {device.online === false ? '离线' : '在线'}
              </span>
            </div>
            <Field label="设备名称">
              <input className="input" value={basic.name} onChange={(event) => setBasic({ ...basic, name: event.target.value })} />
            </Field>
            <Field label="所属分类">
              <select
                className="select"
                value={basic.categoryId}
                onChange={(event) => setBasic({ ...basic, categoryId: event.target.value })}
              >
                <option value="">未分类</option>
                {state.categories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            <Button
              variant="outline"
              size="sm"
              icon="check"
              className="self-start"
              onClick={() => action('设备信息已保存', () => api.updateDevice(device.id, basic))}
            >
              保存信息
            </Button>
          </div>

          <div className="divider" />

          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="label">状态控制</span>
              <span className="mono-tag">{device.capabilities.length} 项能力</span>
            </div>
            {caps.map((cap) => (
              <div key={cap.key} className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[12.5px] font-medium">{cap.label}</span>
                  {cap.type === 'enum' || cap.type === 'boolean' ? null : (
                    <span className="num text-[11px] text-muted2">
                      {device.state[cap.key]}
                      {cap.unit || ''}
                    </span>
                  )}
                </div>
                <CapabilityControl cap={cap} value={device.state[cap.key]} onCommit={(value) => send(cap.key, value)} />
              </div>
            ))}
          </div>

          <div className="divider" />

          <div className="flex flex-col gap-2">
            <span className="label">快捷动作</span>
            <div className="flex flex-wrap gap-1.5">
              <Button variant="outline" size="sm" onClick={() => action('已开启', () => api.deviceAction(device.id, 'turn_on'))}>
                开启
              </Button>
              <Button variant="outline" size="sm" onClick={() => action('已关闭', () => api.deviceAction(device.id, 'turn_off'))}>
                关闭
              </Button>
              <Button variant="outline" size="sm" onClick={() => action('已切换', () => api.deviceAction(device.id, 'toggle'))}>
                切换
              </Button>
              <Button
                variant="outline"
                size="sm"
                icon="sparkle"
                onClick={() => action('', () => api.updateDevice(device.id, { pinned: !device.pinned }))}
              >
                {device.pinned ? '取消置顶' : '置顶'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {tab === 'adapter' ? (
        <div className="flex flex-col gap-3.5">
          <div className="rounded-lg border border-line bg-mist px-3 py-2.5 text-[11.5px] leading-5 text-slate1">
            自定义接口：动作执行时把设备状态写入 <code className="font-mono">body</code> 模板；同步时按
            <code className="ml-1 font-mono">readPath</code> 从响应 JSON 中读取状态。模板支持
            <code className="mx-1 font-mono">{'{{device.id}}'}</code>、<code className="font-mono">{'{{state.power}}'}</code>、<code className="ml-1 font-mono">{'{{action}}'}</code>。
          </div>
          <Field label="适配器类型">
            <select
              className="select"
              value={adapter.kind}
              onChange={(event) => setAdapter({ ...adapter, kind: event.target.value })}
            >
              <option value="mock">内置模拟（本地状态）</option>
              <option value="http">HTTP 接口</option>
            </select>
          </Field>
          {adapter.kind === 'http' ? (
            <>
              <Field label="请求地址" hint="支持 http / https，可含模板变量">
                <input
                  className="input font-mono text-[12px]"
                  placeholder="http://192.168.1.20/api/light"
                  value={adapter.url || ''}
                  onChange={(event) => setAdapter({ ...adapter, url: event.target.value })}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="方法">
                  <select className="select" value={adapter.method} onChange={(event) => setAdapter({ ...adapter, method: event.target.value })}>
                    {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((method) => (
                      <option key={method} value={method}>
                        {method}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="超时（毫秒）">
                  <input
                    className="input num"
                    type="number"
                    min={500}
                    max={30000}
                    value={adapter.timeoutMs}
                    onChange={(event) => setAdapter({ ...adapter, timeoutMs: Number(event.target.value) })}
                  />
                </Field>
              </div>
              <Field label="请求头" hint="JSON 对象">
                <textarea
                  className="textarea"
                  rows={3}
                  value={JSON.stringify(adapter.headers || {}, null, 2)}
                  onChange={(event) => {
                    try {
                      setAdapter({ ...adapter, headers: JSON.parse(event.target.value || '{}') });
                    } catch {
                      /* 保留上一次合法值 */
                    }
                  }}
                />
              </Field>
              <Field label="请求体模板">
                <textarea
                  className="textarea"
                  rows={4}
                  placeholder='{"state":"{{state.power}}"}'
                  value={adapter.body || ''}
                  onChange={(event) => setAdapter({ ...adapter, body: event.target.value })}
                />
              </Field>
              <Field label="状态读取路径" hint="如 data.state">
                <input
                  className="input font-mono text-[12px]"
                  value={adapter.readPath || ''}
                  onChange={(event) => setAdapter({ ...adapter, readPath: event.target.value })}
                />
              </Field>
              <div className="flex items-center justify-between rounded-lg border border-line px-3 py-2.5">
                <div>
                  <div className="text-[12.5px] font-medium">动作写回</div>
                  <div className="text-[11px] text-muted2">执行动作时向该接口发送请求</div>
                </div>
                <Switch checked={Boolean(adapter.write)} onChange={(next) => setAdapter({ ...adapter, write: next })} label="动作写回" />
              </div>
            </>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              icon="check"
              onClick={() => action('接口配置已保存', () => api.updateDevice(device.id, { adapter }))}
            >
              保存接口
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon="link"
              onClick={async () => {
                const result = await action('', () => api.probeDevice(device.id));
                if (result) setProbe(result.result);
              }}
            >
              探测接口
            </Button>
          </div>
          {probe ? (
            <pre className="max-h-40 overflow-auto rounded-lg border border-line bg-mist px-3 py-2 font-mono text-[11px] leading-5">
              {JSON.stringify(probe, null, 2)}
            </pre>
          ) : null}
        </div>
      ) : null}

      {tab === 'tasks' ? (
        <div className="flex flex-col gap-2">
          {tasks.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-[12px] text-muted2">
              该设备还没有定时任务
            </div>
          ) : (
            tasks.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => setView({ kind: 'tasks' })}
                className="flex items-center gap-3 rounded-lg border border-line px-3 py-2.5 text-left transition-colors hover:border-ink/40"
              >
                <Icon name="clock" size={15} className="text-muted2" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-medium">{task.name}</div>
                  <div className="mono-tag mt-0.5">
                    {task.schedule.kind === 'cron' ? task.schedule.expression : task.schedule.kind === 'daily' ? `每天 ${task.schedule.at}` : `每 ${task.schedule.everySeconds}s`}
                  </div>
                </div>
                <Badge tone={task.enabled ? 'ink' : 'line'}>{task.enabled ? '启用' : '停用'}</Badge>
              </button>
            ))
          )}
          <Button
            variant="outline"
            size="sm"
            icon="plus"
            className="mt-1 self-start"
            onClick={() => {
              onClose();
              setView({ kind: 'tasks' });
            }}
          >
            在任务页创建
          </Button>
        </div>
      ) : null}

      {tab === 'raw' ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="label">设备原始数据</span>
            <CopyButton text={JSON.stringify(device, null, 2)} />
          </div>
          <pre className="max-h-[60vh] overflow-auto rounded-lg border border-line bg-mist px-3 py-2 font-mono text-[10.5px] leading-5">
            {JSON.stringify(device, null, 2)}
          </pre>
          <div className="mono-tag">设备 ID：{device.id}</div>
        </div>
      ) : null}
    </Drawer>
  );
}
