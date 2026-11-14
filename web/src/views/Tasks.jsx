import { useState } from 'react';
import { Icon } from '../icons.jsx';
import { Badge, Button, Card, EmptyState, Field, IconButton, Modal, SectionHeader, Switch, cn } from '../ui.jsx';
import { useApp } from '../context.js';
import { api } from '../api.js';

function formatTime(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  const minutes = Math.round(diff / 60000);
  if (Math.abs(minutes) < 1) return '即将执行';
  if (minutes < 0) {
    if (minutes > -1440) return `${Math.abs(minutes)} 分钟前`;
    return `${Math.abs(Math.round(minutes / 1440))} 天前`;
  }
  if (minutes < 60) return `${minutes} 分钟后`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} 小时后`;
  return `${Math.round(minutes / 1440)} 天后`;
}

function scheduleText(schedule) {
  if (!schedule) return '未设置';
  if (schedule.kind === 'cron') return schedule.expression;
  if (schedule.kind === 'daily') return `每天 ${schedule.at}`;
  const seconds = schedule.everySeconds;
  if (seconds % 3600 === 0) return `每 ${seconds / 3600} 小时`;
  if (seconds % 60 === 0) return `每 ${seconds / 60} 分钟`;
  return `每 ${seconds} 秒`;
}

const ACTIONS = [
  { value: 'turn_on', label: '开启' },
  { value: 'turn_off', label: '关闭' },
  { value: 'toggle', label: '切换' },
  { value: 'set', label: '设置状态' },
  { value: 'sync', label: '同步状态' }
];

export function TasksView() {
  const { state, action } = useApp();
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(null);

  const blank = () => ({
    name: '',
    deviceId: state.devices[0]?.id || '',
    kind: 'daily',
    at: '22:00',
    expression: '0 7 * * 1-5',
    everyMinutes: 30,
    actionType: 'turn_off',
    payload: '{}',
    enabled: true
  });

  const openNew = () => {
    setEditing({ id: null });
    setForm(blank());
  };

  const openEdit = (task) => {
    setEditing(task);
    setForm({
      name: task.name,
      deviceId: task.deviceId,
      kind: task.schedule.kind,
      at: task.schedule.at || '22:00',
      expression: task.schedule.expression || '0 7 * * 1-5',
      everyMinutes: Math.round((task.schedule.everySeconds || 1800) / 60),
      actionType: task.action.type,
      payload: JSON.stringify(task.action.payload || {}, null, 2),
      enabled: task.enabled
    });
  };

  const buildSchedule = () => {
    if (form.kind === 'daily') return { kind: 'daily', at: form.at };
    if (form.kind === 'cron') return { kind: 'cron', expression: form.expression.trim() };
    return { kind: 'interval', everySeconds: Math.max(10, Number(form.everyMinutes) * 60) };
  };

  const submit = async () => {
    let payload = {};
    try {
      payload = form.payload.trim() ? JSON.parse(form.payload) : {};
    } catch {
      return;
    }
    const body = {
      name: form.name.trim(),
      deviceId: form.deviceId,
      schedule: buildSchedule(),
      action: { type: form.actionType, payload },
      enabled: form.enabled
    };
    if (!body.name || !body.deviceId) return;
    const result = editing.id
      ? await action('任务已更新', () => api.updateTask(editing.id, body))
      : await action('任务已创建', () => api.createTask(body));
    if (result) setEditing(null);
  };

  const deviceName = (id) => state.devices.find((device) => device.id === id)?.name || '未知设备';

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="定时任务"
        description="按时间自动执行设备动作，支持 interval、每天定点与 5 段 cron。"
        action={
          <Button icon="plus" onClick={openNew} disabled={state.devices.length === 0}>
            新建任务
          </Button>
        }
      />

      {state.tasks.length === 0 ? (
        <EmptyState
          icon="clock"
          title="还没有定时任务"
          description="例如每天 22:30 关闭客厅主灯，或每 30 分钟同步一次插座功率。"
          action={<Button icon="plus" onClick={openNew}>新建任务</Button>}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {state.tasks.map((task) => {
            const device = state.devices.find((item) => item.id === task.deviceId);
            const offlineDevice = !device;
            return (
              <Card key={task.id} className={cn('p-3.5', offlineDevice && 'opacity-60')}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border', task.enabled ? 'border-ink bg-ink text-white' : 'border-line bg-mist text-muted2')}>
                      <Icon name="clock" size={15} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[13px] font-medium">{task.name}</span>
                        {task.action.type === 'sync' ? <Badge tone="soft">同步</Badge> : null}
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-muted2">
                        {deviceName(task.deviceId)} · {scheduleText(task.schedule)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 sm:w-[300px] sm:justify-end">
                    <div className="flex flex-col">
                      <span className="text-[9.5px] uppercase tracking-[0.12em] text-muted2">下次执行</span>
                      <span className="num text-[11.5px]">{task.enabled ? formatTime(task.nextRunAt) : '已停用'}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[9.5px] uppercase tracking-[0.12em] text-muted2">执行次数</span>
                      <span className="num text-[11.5px]">{task.runCount || 0}</span>
                    </div>
                    <Switch
                      checked={task.enabled}
                      onChange={(next) => action(next ? '任务已启用' : '任务已停用', () => api.updateTask(task.id, { enabled: next }))}
                      label={`启用 ${task.name}`}
                    />
                    <div className="flex items-center gap-0.5">
                      <IconButton
                        icon="play"
                        label="立即执行"
                        onClick={() => action('任务已执行', () => api.runTask(task.id))}
                      />
                      <IconButton icon="pen" label="编辑任务" onClick={() => openEdit(task)} />
                      <IconButton
                        icon="trash"
                        label="删除任务"
                        onClick={async () => {
                          if (!window.confirm(`删除任务「${task.name}」？`)) return;
                          await action('任务已删除', () => api.deleteTask(task.id));
                        }}
                      />
                    </div>
                  </div>
                </div>
                {task.lastRunAt ? (
                  <div className="mono-tag mt-2 border-t border-line2 pt-2">上次执行 {new Date(task.lastRunAt).toLocaleString('zh-CN', { hour12: false })}</div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? '编辑任务' : '新建任务'}
        description="任务由服务端调度器每 15 秒检查一次，到点后立即执行。"
        width="max-w-xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              取消
            </Button>
            <Button icon="check" onClick={submit} disabled={!form?.name.trim() || !form?.deviceId}>
              保存任务
            </Button>
          </>
        }
      >
        {form ? (
          <div className="flex flex-col gap-3.5">
            <Field label="任务名称">
              <input
                className="input"
                value={form.name}
                placeholder="例如：夜间关灯"
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </Field>
            <Field label="目标设备">
              <select className="select" value={form.deviceId} onChange={(event) => setForm({ ...form, deviceId: event.target.value })}>
                {state.devices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="计划类型">
              <select className="select" value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })}>
                <option value="daily">每天定点</option>
                <option value="interval">固定间隔</option>
                <option value="cron">cron 表达式</option>
              </select>
            </Field>
            {form.kind === 'daily' ? (
              <Field label="执行时刻">
                <input className="input num" type="time" value={form.at} onChange={(event) => setForm({ ...form, at: event.target.value })} />
              </Field>
            ) : null}
            {form.kind === 'cron' ? (
              <Field label="cron 表达式" hint="分 时 日 月 周，例如 0 7 * * 1-5">
                <input
                  className="input font-mono text-[12px]"
                  value={form.expression}
                  onChange={(event) => setForm({ ...form, expression: event.target.value })}
                />
              </Field>
            ) : null}
            {form.kind === 'interval' ? (
              <Field label="间隔（分钟）" hint="最短 10 秒，即 0.17 分钟">
                <input
                  className="input num"
                  type="number"
                  min={1}
                  value={form.everyMinutes}
                  onChange={(event) => setForm({ ...form, everyMinutes: Number(event.target.value) })}
                />
              </Field>
            ) : null}
            <Field label="执行动作">
              <select className="select" value={form.actionType} onChange={(event) => setForm({ ...form, actionType: event.target.value })}>
                {ACTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>
            {form.actionType === 'set' ? (
              <Field label="状态参数" hint="JSON，例如 {&quot;brightness&quot;: 40}">
                <textarea
                  className="textarea"
                  rows={3}
                  value={form.payload}
                  onChange={(event) => setForm({ ...form, payload: event.target.value })}
                />
              </Field>
            ) : null}
            <div className="flex items-center justify-between rounded-lg border border-line px-3 py-2.5">
              <div>
                <div className="text-[12.5px] font-medium">启用任务</div>
                <div className="text-[11px] text-muted2">停用后调度器跳过该任务</div>
              </div>
              <Switch checked={form.enabled} onChange={(next) => setForm({ ...form, enabled: next })} label="启用任务" />
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
