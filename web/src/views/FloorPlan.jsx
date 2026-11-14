import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../icons.jsx';
import { Badge, Button, Card, Field, SectionHeader, cn } from '../ui.jsx';
import { useApp } from '../context.js';
import { api } from '../api.js';

const MODES = [
  { key: 'select', label: '选择', icon: 'cursor', hint: '点选房间或设备标记' },
  { key: 'room', label: '画房间', icon: 'plan', hint: '在空白处拖出矩形房间' },
  { key: 'place', label: '放设备', icon: 'plus', hint: '选择设备后点击平面放置' },
  { key: 'box', label: '框选授权', icon: 'users', hint: '拖框选中设备标记' }
];

const clone = (value) => JSON.parse(JSON.stringify(value));

export function FloorPlanView() {
  const { state, action } = useApp();
  const isAdmin = state.account?.role === 'admin';
  const plans = state.plans || [];
  const [planId, setPlanId] = useState(plans[0]?.id || '');
  const plan = plans.find((item) => item.id === planId) || plans[0] || null;
  const [draft, setDraft] = useState(() => (plan ? clone(plan) : null));
  const [mode, setMode] = useState('select');
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(state.devices[0]?.id || '');
  const [drag, setDrag] = useState(null);
  const [users, setUsers] = useState([]);
  const [targetUser, setTargetUser] = useState('');
  const svgRef = useRef(null);

  useEffect(() => {
    if (plan) setDraft(clone(plan));
  }, [planId]);

  const loadUsers = useCallback(async () => {
    if (!isAdmin) return;
    const result = await api.users();
    setUsers(result.users);
    setTargetUser((current) => current || result.users.find((user) => user.role === 'member')?.id || '');
  }, [isAdmin]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const members = useMemo(() => users.filter((user) => user.role === 'member'), [users]);
  const target = members.find((user) => user.id === targetUser);
  const markers = draft?.markers || [];
  const rooms = draft?.rooms || [];

  const point = (event) => {
    const svg = svgRef.current;
    if (!svg || !plan) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * plan.width;
    const y = ((event.clientY - rect.top) / rect.height) * plan.height;
    return {
      x: Math.max(0, Math.min(plan.width, Math.round(x))),
      y: Math.max(0, Math.min(plan.height, Math.round(y)))
    };
  };

  const startBackground = (event) => {
    if (event.button !== 0) return;
    const current = point(event);
    if (mode === 'room') {
      svgRef.current?.setPointerCapture(event.pointerId);
      setDrag({ kind: 'room', start: current, current });
    } else if (mode === 'box') {
      svgRef.current?.setPointerCapture(event.pointerId);
      setDrag({ kind: 'box', start: current, current });
    } else if (mode === 'place') {
      placeDevice(current);
    } else {
      setSelectedRoomId(null);
      setSelectedIds([]);
    }
  };

  const placeDevice = (current) => {
    if (!draft || !selectedDeviceId) return;
    const existing = draft.markers.find((marker) => marker.deviceId === selectedDeviceId);
    if (existing) {
      existing.x = current.x;
      existing.y = current.y;
    } else {
      draft.markers.push({ deviceId: selectedDeviceId, x: current.x, y: current.y });
    }
    setDraft({ ...draft });
  };

  const startMarker = (event, deviceId) => {
    if (!isAdmin) return;
    if (event.button !== 0) return;
    if (mode === 'box') return;
    event.stopPropagation();
    svgRef.current?.setPointerCapture(event.pointerId);
    setSelectedIds([deviceId]);
    if (mode === 'select' || mode === 'place') {
      setDrag({ kind: 'marker', deviceId, current: point(event) });
    }
  };

  const move = (event) => {
    if (!drag) return;
    const current = point(event);
    if (drag.kind === 'marker') {
      setDraft((previous) => {
        if (!previous) return previous;
        const markersNext = previous.markers.map((marker) =>
          marker.deviceId === drag.deviceId ? { ...marker, x: current.x, y: current.y } : marker
        );
        return { ...previous, markers: markersNext };
      });
      return;
    }
    setDrag({ ...drag, current });
  };

  const finish = (event) => {
    if (!drag) return;
    if (drag.kind === 'room') {
      const x = Math.min(drag.start.x, drag.current.x);
      const y = Math.min(drag.start.y, drag.current.y);
      const w = Math.abs(drag.current.x - drag.start.x);
      const h = Math.abs(drag.current.y - drag.start.y);
      if (w >= 60 && h >= 60 && draft) {
        const room = { id: `room_${Date.now()}`, name: `房间 ${rooms.length + 1}`, x, y, w, h };
        setDraft({ ...draft, rooms: [...draft.rooms, room] });
        setSelectedRoomId(room.id);
        setMode('select');
      }
    }
    if (drag.kind === 'box') {
      const minX = Math.min(drag.start.x, drag.current.x);
      const maxX = Math.max(drag.start.x, drag.current.x);
      const minY = Math.min(drag.start.y, drag.current.y);
      const maxY = Math.max(drag.start.y, drag.current.y);
      const hits = markers
        .filter((marker) => marker.x >= minX && marker.x <= maxX && marker.y >= minY && marker.y <= maxY)
        .map((marker) => marker.deviceId);
      setSelectedIds(hits);
    }
    setDrag(null);
  };

  const save = async () => {
    if (!draft || !isAdmin) return;
    await action('平面图已保存', () =>
      api.updatePlan(draft.id, { name: draft.name, rooms: draft.rooms, markers: draft.markers })
    );
  };

  const createPlan = async () => {
    const result = await action('平面图已创建', () =>
      api.createPlan({ name: `平面 ${plans.length + 1}`, width: 1200, height: 760, rooms: [], markers: [] })
    );
    if (result?.plan) setPlanId(result.plan.id);
  };

  const authorize = async (grantMode) => {
    if (!target || !selectedIds.length) return;
    await action(
      { add: '已追加设备授权', replace: '已替换设备授权', remove: '已移除设备授权' }[grantMode],
      () => api.grantDevices(target.id, selectedIds, grantMode)
    );
    await loadUsers();
  };

  const toggleSelected = (deviceId) => {
    setSelectedIds((current) =>
      current.includes(deviceId) ? current.filter((item) => item !== deviceId) : [...current, deviceId]
    );
  };

  if (!plan || !draft) {
    return (
      <div className="flex flex-col gap-4">
        <SectionHeader title="家居平面图" description="在平面图上标注设备，并通过框选把设备授权给成员账户。" />
        <Card className="flex flex-col items-center gap-3 p-8 text-center">
          <Icon name="plan" size={24} />
          <div className="text-[13px] font-medium">还没有平面图</div>
          <p className="muted max-w-sm">创建一张画布，拖出客厅、卧室等房间，再把设备放到对应位置。</p>
          {isAdmin ? <Button icon="plus" onClick={createPlan}>新建平面图</Button> : null}
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="家居平面图"
        description="绘制房间、拖动设备标记；框选一批设备后可直接授权给成员账户，也可以在右侧手动勾选。"
        action={
          <div className="flex items-center gap-2">
            <select className="input h-9 w-auto min-w-[140px]" value={plan.id} onChange={(event) => setPlanId(event.target.value)}>
              {plans.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            {isAdmin ? <Button icon="plus" onClick={createPlan}>新建</Button> : null}
            {isAdmin ? <Button onClick={save}>保存布局</Button> : null}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
        <Card className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-2">
            {MODES.map((item) => (
              <button
                key={item.key}
                type="button"
                disabled={!isAdmin}
                onClick={() => setMode(item.key)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11.5px] transition-colors',
                  mode === item.key ? 'border-ink bg-ink text-white' : 'border-line text-slate1 hover:border-ink/40',
                  !isAdmin && 'cursor-not-allowed opacity-45'
                )}
                title={item.hint}
              >
                <Icon name={item.icon} size={13} />
                {item.label}
              </button>
            ))}
            {mode === 'place' ? (
              <select
                className="input ml-auto h-8 w-auto max-w-[200px] text-[11px]"
                value={selectedDeviceId}
                onChange={(event) => setSelectedDeviceId(event.target.value)}
              >
                {state.devices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="ml-auto text-[10.5px] text-muted2">
                {mode === 'box' ? `框选 ${selectedIds.length} 台` : `${rooms.length} 房间 · ${markers.length} 设备`}
              </span>
            )}
          </div>

          <div className="bg-mist/30 p-3">
            <svg
              ref={svgRef}
              data-plan-canvas="1"
              viewBox={`0 0 ${plan.width} ${plan.height}`}
              className="mx-auto block w-full touch-none select-none rounded-lg border border-line bg-paper"
              style={{ aspectRatio: `${plan.width} / ${plan.height}` }}
              onPointerDown={startBackground}
              onPointerMove={move}
              onPointerUp={finish}
              onPointerCancel={() => setDrag(null)}
            >
              <defs>
                <pattern id="plan-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M40 0H0V40" fill="none" stroke="#ECECE8" strokeWidth="1" />
                </pattern>
              </defs>
              <rect data-bg="1" x="0" y="0" width={plan.width} height={plan.height} fill="url(#plan-grid)" />

              {rooms.map((room) => (
                <g key={room.id}>
                  <rect
                    x={room.x}
                    y={room.y}
                    width={room.w}
                    height={room.h}
                    fill="#F7F7F4"
                    stroke={selectedRoomId === room.id ? '#0A0A0A' : '#C9C9C2'}
                    strokeWidth={selectedRoomId === room.id ? 2 : 1.2}
                    onPointerDown={(event) => {
                      if (mode === 'select') {
                        event.stopPropagation();
                        setSelectedRoomId(room.id);
                      }
                    }}
                  />
                  <text x={room.x + 10} y={room.y + 20} fontSize="12" fill="#0A0A0A" fontWeight="600">
                    {room.name}
                  </text>
                </g>
              ))}

              {markers.map((marker) => {
                const device = state.devices.find((item) => item.id === marker.deviceId);
                if (!device) return null;
                const active = selectedIds.includes(marker.deviceId);
                return (
                  <g
                    key={marker.deviceId}
                    data-marker={marker.deviceId}
                    transform={`translate(${marker.x}, ${marker.y})`}
                    className={cn(isAdmin && 'cursor-grab')}
                    onPointerDown={(event) => startMarker(event, marker.deviceId)}
                  >
                    <circle r="14" fill={active ? '#0A0A0A' : '#FFFFFF'} stroke="#0A0A0A" strokeWidth="1.5" />
                    <circle r="4" fill={active ? '#FFFFFF' : '#0A0A0A'} />
                    <text y="27" textAnchor="middle" fontSize="10.5" fill="#0A0A0A">
                      {device.name.length > 9 ? `${device.name.slice(0, 9)}…` : device.name}
                    </text>
                  </g>
                );
              })}

              {drag && drag.kind === 'room' ? (
                <rect
                  x={Math.min(drag.start.x, drag.current.x)}
                  y={Math.min(drag.start.y, drag.current.y)}
                  width={Math.abs(drag.current.x - drag.start.x)}
                  height={Math.abs(drag.current.y - drag.start.y)}
                  fill="rgba(10,10,10,0.05)"
                  stroke="#0A0A0A"
                  strokeDasharray="4 4"
                />
              ) : null}
              {drag && drag.kind === 'box' ? (
                <rect
                  x={Math.min(drag.start.x, drag.current.x)}
                  y={Math.min(drag.start.y, drag.current.y)}
                  width={Math.abs(drag.current.x - drag.start.x)}
                  height={Math.abs(drag.current.y - drag.start.y)}
                  fill="rgba(10,10,10,0.08)"
                  stroke="#0A0A0A"
                  strokeDasharray="6 4"
                  strokeWidth="1.5"
                />
              ) : null}
            </svg>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2 text-[10.5px] text-muted2">
            <span>{MODES.find((item) => item.key === mode)?.hint}</span>
            <span className="num">
              {selectedIds.length ? `已选 ${selectedIds.length} 台设备` : '未选择设备'} · {draft.updatedAt ? `更新于 ${new Date(draft.updatedAt).toLocaleString('zh-CN', { hour12: false })}` : ''}
            </span>
          </div>
        </Card>

        <div className="flex flex-col gap-3">
          <Card className="p-3">
            <div className="flex items-center justify-between">
              <span className="label">平面名称</span>
              {isAdmin ? <Badge tone="soft">可编辑</Badge> : <Badge tone="line">只读</Badge>}
            </div>
            <input
              className="input mt-2"
              value={draft.name}
              disabled={!isAdmin}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
            <div className="mt-2 flex items-center justify-between text-[10.5px] text-muted2">
              <span className="num">
                {plan.width} × {plan.height}
              </span>
              <span>{rooms.length} 个房间 · {markers.length} 个标记</span>
            </div>
          </Card>

          <Card className="p-3">
            <div className="flex items-center justify-between">
              <span className="label">房间</span>
              <span className="num text-[10.5px] text-muted2">{rooms.length}</span>
            </div>
            <div className="mt-2 flex flex-col gap-1">
              {rooms.map((room) => (
                <div
                  key={room.id}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg border px-2 py-1.5',
                    selectedRoomId === room.id ? 'border-ink bg-mist' : 'border-line'
                  )}
                >
                  <input
                    className="min-w-0 flex-1 bg-transparent text-[11.5px] outline-none"
                    value={room.name}
                    disabled={!isAdmin}
                    onFocus={() => setSelectedRoomId(room.id)}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        rooms: draft.rooms.map((item) => (item.id === room.id ? { ...item, name: event.target.value } : item))
                      })
                    }
                  />
                  {isAdmin ? (
                    <button
                      type="button"
                      className="text-muted2 hover:text-ink"
                      aria-label={`删除房间 ${room.name}`}
                      onClick={() => setDraft({ ...draft, rooms: draft.rooms.filter((item) => item.id !== room.id) })}
                    >
                      <Icon name="close" size={12} />
                    </button>
                  ) : null}
                </div>
              ))}
              {rooms.length === 0 ? <p className="text-[11px] text-muted2">切换到「画房间」，在画布空白处拖出矩形。</p> : null}
            </div>
          </Card>

          <Card className="p-3">
            <div className="flex items-center justify-between">
              <span className="label">框选 / 手动授权</span>
              <span className="num text-[10.5px] text-muted2">已选 {selectedIds.length}</span>
            </div>
            {isAdmin ? (
              <>
                <select
                  className="input mt-2"
                  value={targetUser}
                  onChange={(event) => setTargetUser(event.target.value)}
                >
                  <option value="">选择成员账户</option>
                  {members.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.displayName}（{user.deviceIds?.length || 0} 台）
                    </option>
                  ))}
                </select>
                {target ? (
                  <div className="mt-1.5 text-[10.5px] text-muted2">
                    当前授权：{target.deviceIds?.length || 0} 台设备
                  </div>
                ) : null}
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  <Button size="sm" disabled={!target || !selectedIds.length} onClick={() => authorize('add')}>
                    追加
                  </Button>
                  <Button size="sm" variant="outline" disabled={!target || !selectedIds.length} onClick={() => authorize('replace')}>
                    替换
                  </Button>
                  <Button size="sm" variant="outline" disabled={!target || !selectedIds.length} onClick={() => authorize('remove')}>
                    移除
                  </Button>
                </div>
                <p className="mt-2 text-[10.5px] leading-4 text-muted2">
                  框选画布上的设备标记后点「追加」，即可把这一批设备授权给成员；也可以在下方逐个勾选。
                </p>
              </>
            ) : (
              <p className="mt-2 text-[11px] leading-5 text-muted2">成员账户只能查看平面图与自己的设备标记，授权需要管理员操作。</p>
            )}
          </Card>

          <Card className="p-3">
            <div className="flex items-center justify-between">
              <span className="label">设备清单</span>
              <span className="num text-[10.5px] text-muted2">{markers.length}</span>
            </div>
            <div className="mt-2 max-h-[260px] overflow-y-auto">
              {state.devices.map((device) => {
                const marked = markers.some((marker) => marker.deviceId === device.id);
                return (
                  <label key={device.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1.5 hover:bg-mist">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-black"
                      checked={selectedIds.includes(device.id)}
                      onChange={() => toggleSelected(device.id)}
                    />
                    <Icon name={device.icon || 'cube'} size={13} className="text-muted2" />
                    <span className="min-w-0 flex-1 truncate text-[11.5px]">{device.name}</span>
                    {marked ? <Badge tone="line">已标注</Badge> : null}
                  </label>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
