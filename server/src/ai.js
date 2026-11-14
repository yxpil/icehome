import { CAPABILITIES } from './capabilities.js';
import { describeSchedule } from './cron.js';

const KEYWORDS = {
  turn_on: ['打开', '开启', '启动', '点亮', '开灯', '通电', '开一下'],
  turn_off: ['关闭', '关掉', '关灯', '停止', '断电', '关一下'],
  toggle: ['切换', '反转', '翻转'],
  query: ['状态', '怎么样', '多少', '查询', '看看', '是否', '报告']
};

const TYPE_HINTS = [
  { keys: ['灯', '照明'], templates: ['light'] },
  { keys: ['空调', '温控'], templates: ['climate'] },
  { keys: ['窗帘', '门帘', '卷帘'], templates: ['cover'] },
  { keys: ['插座', '插头'], templates: ['plug', 'switch'] },
  { keys: ['风扇'], templates: ['fan'] },
  { keys: ['门锁', '锁'], templates: ['lock'] },
  { keys: ['摄像头', '监控'], templates: ['camera'] },
  { keys: ['音箱', '音响'], templates: ['speaker'] },
  { keys: ['门磁', '窗磁'], templates: ['contact'] },
  { keys: ['人体', '感应'], templates: ['motion'] },
  { keys: ['空气'], templates: ['air'] },
  { keys: ['温度', '湿度', '传感'], templates: ['sensor'] }
];

const STATE_LABEL = {
  power: (value) => (value === 'on' ? '开启' : '关闭'),
  brightness: (value) => `亮度 ${value}%`,
  colorTemp: (value) => `色温 ${value}K`,
  temperature: (value) => `温度 ${value}°C`,
  targetTemp: (value) => `目标温度 ${value}°C`,
  humidity: (value) => `湿度 ${value}%`,
  battery: (value) => `电量 ${value}%`,
  position: (value) => `开合 ${value}%`,
  volume: (value) => `音量 ${value}%`,
  powerW: (value) => `功率 ${value}W`,
  energyKwh: (value) => `累计 ${value}kWh`,
  contact: (value) => (value === 'open' ? '已打开' : '已关闭'),
  locked: (value) => (value ? '已锁止' : '未锁止'),
  motion: (value) => (value ? '检测到移动' : '无移动'),
  illuminance: (value) => `照度 ${value} lx`,
  co2: (value) => `CO₂ ${value} ppm`,
  pm25: (value) => `PM2.5 ${value}`,
  speed: (value) => `风速 ${value}`
};

export function describeState(device) {
  return Object.entries(device.state || {})
    .map(([key, value]) => (STATE_LABEL[key] ? STATE_LABEL[key](value) : `${key}=${value}`))
    .join(' · ');
}

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[\s，。！？、；：""''（）()]/g, '');
}

function matchDevices(store, text) {
  const normalized = normalizeText(text);
  const byName = store.data.devices.filter((device) => normalized.includes(normalizeText(device.name)));
  if (byName.length) {
    byName.sort((a, b) => b.name.length - a.name.length);
    return { devices: [byName[0]], reason: 'name' };
  }
  const bulk = /全部|所有|都|每个/.test(normalized);
  let templates = [];
  for (const hint of TYPE_HINTS) {
    if (hint.keys.some((key) => normalized.includes(normalizeText(key)))) {
      templates = templates.concat(hint.templates);
    }
  }
  const category = store.data.categories.find((item) => normalized.includes(normalizeText(item.name)));
  let devices = templates.length
    ? store.data.devices.filter((device) => templates.includes(device.template))
    : [];
  if (category) {
    devices = devices.length
      ? devices.filter((device) => device.categoryId === category.id)
      : store.data.devices.filter((device) => device.categoryId === category.id);
  }
  if (bulk && templates.length) return { devices, reason: 'bulk-type', bulk: true };
  if (devices.length === 1) return { devices, reason: 'type' };
  if (devices.length > 1) return { devices, reason: 'ambiguous' };
  return { devices: [], reason: 'none' };
}

function detectAction(normalized) {
  for (const [action, words] of Object.entries(KEYWORDS)) {
    if (action === 'query') continue;
    if (words.some((word) => normalized.includes(normalizeText(word)))) return action;
  }
  return null;
}

function detectSet(normalized, devices) {
  const numberMatch = normalized.match(/(-?\d+(?:\.\d+)?)/);
  if (!numberMatch) return null;
  const value = Number(numberMatch[1]);
  const text = normalized;
  const cues = [
    { keys: ['亮度', '百分', '%'], field: 'brightness' },
    { keys: ['色温'], field: 'colorTemp' },
    { keys: ['目标温度', '设定温度'], field: 'targetTemp' },
    { keys: ['温度', '度'], field: 'targetTemp' },
    { keys: ['音量'], field: 'volume' },
    { keys: ['开合', '窗帘', '开度'], field: 'position' },
    { keys: ['湿度'], field: 'humidity' }
  ];
  const caps = new Set(devices.flatMap((device) => device.capabilities));
  const setIntent = /调到|设为|设置|调整|改成|变成|到/.test(text);
  if (!setIntent) return null;
  for (const cue of cues) {
    if (cue.keys.some((key) => text.includes(normalizeText(key)) && caps.has(cue.field))) {
      return { field: cue.field, value };
    }
  }
  const ordered = ['brightness', 'targetTemp', 'volume', 'position', 'colorTemp'];
  for (const field of ordered) {
    if (caps.has(field)) return { field, value };
  }
  return null;
}

function detectSchedule(normalized) {
  if (!/定时|每天|每周|每|分钟|小时/.test(normalized)) return null;
  if (/每天/.test(normalized)) {
    const time = normalized.match(/(\d{1,2}):(\d{2})/);
    if (time) {
      return {
        schedule: { kind: 'daily', at: `${String(Number(time[1])).padStart(2, '0')}:${time[2]}` },
        label: `每天 ${String(Number(time[1])).padStart(2, '0')}:${time[2]}`
      };
    }
  }
  const every = normalized.match(/每(\d+)分钟/);
  if (every) {
    return {
      schedule: { kind: 'interval', everySeconds: Number(every[1]) * 60 },
      label: `每 ${every[1]} 分钟`
    };
  }
  const everyHour = normalized.match(/每(\d+)小时/);
  if (everyHour) {
    return {
      schedule: { kind: 'interval', everySeconds: Number(everyHour[1]) * 3600 },
      label: `每 ${everyHour[1]} 小时`
    };
  }
  return null;
}

/**
 * 解析中文自然语言指令。不依赖外部模型：基于设备名、类型关键词与状态词表。
 * 返回 plan（可预览）与 reply（可直接展示）。
 */
export function parseCommand(store, rawText) {
  const text = String(rawText || '').trim();
  if (!text) return { intent: 'unknown', reply: '请描述要执行的操作，例如「打开客厅主灯」。', plan: null };
  const normalized = normalizeText(text);
  const matched = matchDevices(store, text);

  if (!matched.devices.length) {
    return {
      intent: 'unknown',
      reply: '没有匹配到设备。可以说设备全名，或用「客厅的灯」这类类型描述。',
      plan: null,
      candidates: []
    };
  }

  if (matched.reason === 'ambiguous') {
    return {
      intent: 'ambiguous',
      reply: `匹配到多台设备：${matched.devices.map((device) => device.name).join('、')}。请使用完整名称。`,
      plan: null,
      candidates: matched.devices.map((device) => ({ id: device.id, name: device.name }))
    };
  }

  const setIntent = detectSet(normalized, matched.devices);
  const action = detectAction(normalized);
  const wantsQuery = KEYWORDS.query.some((word) => normalized.includes(normalizeText(word)));
  const schedule = detectSchedule(normalized);

  if (schedule) {
    const planAction = action && action !== 'query' ? action : setIntent ? 'set' : 'sync';
    const verbText = planAction === 'set' ? '状态设置' : planAction === 'turn_off' ? '关闭' : planAction === 'sync' ? '同步' : '开启';
    return {
      intent: 'schedule',
      action: planAction,
      payload: setIntent ? { [setIntent.field]: setIntent.value } : {},
      devices: matched.devices,
      schedule: schedule.schedule,
      label: schedule.label,
      reply: `将为「${matched.devices.map((device) => device.name).join('、')}」创建${schedule.label}的${verbText}任务。`
    };
  }

  if (wantsQuery && !action && !setIntent) {
    return {
      intent: 'query',
      devices: matched.devices,
      reply: matched.devices
        .map((device) => `${device.name}：${device.online === false ? '离线' : '在线'}，${describeState(device)}`)
        .join('\n'),
      plan: { action: 'query', deviceIds: matched.devices.map((device) => device.id) }
    };
  }

  if (setIntent) {
    return {
      intent: 'control',
      action: 'set',
      payload: { [setIntent.field]: setIntent.value },
      devices: matched.devices,
      reply: `将 ${matched.devices.map((device) => device.name).join('、')} 的${CAPABILITIES[setIntent.field]?.label || setIntent.field}设为 ${setIntent.value}${CAPABILITIES[setIntent.field]?.unit || ''}。`,
      plan: {
        action: 'set',
        payload: { [setIntent.field]: setIntent.value },
        deviceIds: matched.devices.map((device) => device.id)
      }
    };
  }

  const brightUp = /调亮|亮一点|亮一些|太暗/.test(normalized);
  const brightDown = /调暗|暗一点|暗一些|太亮/.test(normalized);
  if (brightUp || brightDown) {
    const target = matched.devices.find((device) => device.capabilities.includes('brightness'));
    if (target) {
      const delta = brightUp ? 20 : -20;
      const brightness = Math.max(1, Math.min(100, (target.state.brightness ?? 60) + delta));
      return {
        intent: 'control',
        action: brightUp ? 'turn_on' : 'set',
        payload: { brightness },
        devices: matched.devices,
        reply: `将 ${target.name} 亮度${brightUp ? '提高' : '降低'}到 ${brightness}%。`,
        plan: {
          action: brightUp ? 'turn_on' : 'set',
          payload: { brightness },
          deviceIds: matched.devices.map((device) => device.id)
        }
      };
    }
  }

  if (action && action !== 'query') {
    const payload = {};
    if (action === 'turn_on' && matched.devices.length === 1) {
      if (/亮一点|调亮/.test(normalized) && matched.devices[0].capabilities.includes('brightness')) {
        payload.brightness = Math.min(100, (matched.devices[0].state.brightness || 50) + 20);
      }
      if (/暗一点|调暗/.test(normalized) && matched.devices[0].capabilities.includes('brightness')) {
        payload.brightness = Math.max(1, (matched.devices[0].state.brightness || 50) - 20);
      }
    }
    const verb = action === 'turn_on' ? '开启' : action === 'turn_off' ? '关闭' : '切换';
    return {
      intent: 'control',
      action,
      payload,
      devices: matched.devices,
      reply: `将${verb} ${matched.devices.map((device) => device.name).join('、')}。`,
      plan: { action, payload, deviceIds: matched.devices.map((device) => device.id) }
    };
  }

  return {
    intent: 'query',
    devices: matched.devices,
    reply: matched.devices
      .map((device) => `${device.name}：${device.online === false ? '离线' : '在线'}，${describeState(device)}`)
      .join('\n'),
    plan: { action: 'query', deviceIds: matched.devices.map((device) => device.id) }
  };
}

export function buildAiManual(store, { baseUrl = 'http://127.0.0.1:8787' } = {}) {
  const devices = store.data.devices;
  const lines = [];
  lines.push('# ICEHOME · AI 操作手册');
  lines.push('');
  lines.push('本手册面向自动化脚本与 AI Agent，全部能力通过 HTTP + Bearer Token 访问。');
  lines.push('');
  lines.push('## 1. 接入信息');
  lines.push('');
  lines.push(`- 基地址：\`${baseUrl}\``);
  lines.push('- 认证头：`Authorization: Bearer sk-ice-...`（在「API 令牌」页面签发）');
  lines.push('- 兼容端点：`/v1/chat/completions`（OpenAI Chat Completions 形态）');
  lines.push('- 所有响应为 JSON；错误响应形如 `{"error":{"code":"forbidden","message":"..."}}`');
  lines.push('');
  lines.push('## 2. 令牌与权限');
  lines.push('');
  lines.push('| scope | 说明 |');
  lines.push('| --- | --- |');
  lines.push('| device:read | 读取设备、分类、系统状态 |');
  lines.push('| device:write | 设备动作、分类与任务的增删改 |');
  lines.push('| ai:use | 调用自然语言指令端点 |');
  lines.push('| admin | 令牌、插件、配对、导入导出 |');
  lines.push('');
  lines.push('## 3. 设备清单');
  lines.push('');
  lines.push('| 设备 | 类型 | 能力 | 当前状态 |');
  lines.push('| --- | --- | --- | --- |');
  for (const device of devices) {
    lines.push(
      `| ${device.name} | ${device.template} | ${device.capabilities.join(', ')} | ${describeState(device)} |`
    );
  }
  lines.push('');
  lines.push('## 4. 常用请求');
  lines.push('');
  lines.push('读取全部设备：');
  lines.push('```bash');
  lines.push(`curl -H "Authorization: Bearer $ICE_TOKEN" ${baseUrl}/api/devices`);
  lines.push('```');
  lines.push('');
  lines.push('开启设备并设置亮度：');
  lines.push('```bash');
  lines.push(`curl -X POST ${baseUrl}/api/devices/<设备ID>/actions \\`);
  lines.push('  -H "Authorization: Bearer $ICE_TOKEN" -H "content-type: application/json" \\');
  lines.push('  -d \'{"action":"set","payload":{"power":"on","brightness":65}}\'');
  lines.push('```');
  lines.push('');
  lines.push('创建定时任务（每天 22:30 关灯）：');
  lines.push('```bash');
  lines.push(`curl -X POST ${baseUrl}/api/tasks \\`);
  lines.push('  -H "Authorization: Bearer $ICE_TOKEN" -H "content-type: application/json" \\');
  lines.push('  -d \'{"name":"夜间关灯","deviceId":"<设备ID>","schedule":{"kind":"daily","at":"22:30"},"action":{"type":"turn_off"}}\'');
  lines.push('```');
  lines.push('');
  lines.push('自然语言控制：');
  lines.push('```bash');
  lines.push(`curl -X POST ${baseUrl}/api/ai/command \\`);
  lines.push('  -H "Authorization: Bearer $ICE_TOKEN" -H "content-type: application/json" \\');
  lines.push('  -d \'{"text":"把客厅主灯亮度调到 40"}\'');
  lines.push('```');
  lines.push('');
  lines.push('OpenAI 兼容调用：');
  lines.push('```bash');
  lines.push(`curl -X POST ${baseUrl}/v1/chat/completions \\`);
  lines.push('  -H "Authorization: Bearer $ICE_TOKEN" -H "content-type: application/json" \\');
  lines.push('  -d \'{"model":"icehome-1","messages":[{"role":"user","content":"打开客厅主灯"}]}\'');
  lines.push('```');
  lines.push('');
  lines.push('## 5. 定时任务表达式');
  lines.push('');
  lines.push('- `{"kind":"interval","everySeconds":1800}`：固定间隔，最短 10 秒');
  lines.push('- `{"kind":"daily","at":"22:30"}`：每天固定时刻');
  lines.push('- `{"kind":"cron","expression":"0 7 * * 1-5"}`：5 段 cron，支持 `*`、`*/n`、`a-b`、`a,b`');
  lines.push('');
  lines.push('现有任务：');
  for (const task of store.data.tasks) {
    lines.push(`- ${task.name} · ${describeSchedule(task.schedule)} · ${task.enabled ? '启用' : '停用'}`);
  }
  lines.push('');
  lines.push('## 6. 设备状态字段');
  lines.push('');
  lines.push('| 字段 | 含义 | 取值 |');
  lines.push('| --- | --- | --- |');
  for (const cap of Object.values(CAPABILITIES)) {
    const range =
      cap.type === 'enum'
        ? cap.values.join(' / ')
        : cap.type === 'boolean'
          ? 'true / false'
          : `${cap.min} - ${cap.max}${cap.unit ? ` ${cap.unit}` : ''}`;
    lines.push(`| ${cap.key} | ${cap.label} | ${range} |`);
  }
  lines.push('');
  lines.push('## 7. 自然语言指令示例');
  lines.push('');
  lines.push('- 打开客厅主灯');
  lines.push('- 把客厅主灯亮度调到 40');
  lines.push('- 关闭所有灯');
  lines.push('- 客厅空调几点状态怎么样');
  lines.push('- 每天 22:30 关闭客厅主灯');
  lines.push('');
  lines.push('## 8. 错误码');
  lines.push('');
  lines.push('| code | HTTP | 说明 |');
  lines.push('| --- | --- | --- |');
  lines.push('| unauthorized | 401 | 缺少 Bearer Token |');
  lines.push('| invalid_token | 401 | 令牌不存在或已吊销 |');
  lines.push('| forbidden | 403 | scope 不足 |');
  lines.push('| not_found | 404 | 资源不存在 |');
  lines.push('| validation_error | 400 | 参数校验失败 |');
  lines.push('');
  return lines.join('\n');
}
