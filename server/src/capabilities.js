/**
 * 能力注册表：设备状态字段的类型、范围与展示单位。
 * 自定义设备可以自由声明 capabilities，取值仍受本表约束。
 */
export const CAPABILITIES = {
  power: { key: 'power', label: '开关', type: 'enum', values: ['on', 'off'], default: 'off' },
  brightness: { key: 'brightness', label: '亮度', type: 'number', min: 1, max: 100, unit: '%', default: 60 },
  colorTemp: { key: 'colorTemp', label: '色温', type: 'number', min: 2000, max: 6500, unit: 'K', default: 4000 },
  temperature: { key: 'temperature', label: '温度', type: 'number', min: -10, max: 45, unit: '°C', default: 22 },
  targetTemp: { key: 'targetTemp', label: '目标温度', type: 'number', min: 5, max: 35, unit: '°C', default: 24 },
  humidity: { key: 'humidity', label: '湿度', type: 'number', min: 0, max: 100, unit: '%', default: 48 },
  battery: { key: 'battery', label: '电量', type: 'number', min: 0, max: 100, unit: '%', default: 86 },
  position: { key: 'position', label: '开合度', type: 'number', min: 0, max: 100, unit: '%', default: 40 },
  volume: { key: 'volume', label: '音量', type: 'number', min: 0, max: 100, unit: '%', default: 30 },
  powerW: { key: 'powerW', label: '功率', type: 'number', min: 0, max: 6000, unit: 'W', default: 0 },
  energyKwh: { key: 'energyKwh', label: '累计电量', type: 'number', min: 0, max: 99999, unit: 'kWh', default: 0 },
  motion: { key: 'motion', label: '移动侦测', type: 'boolean', default: false },
  contact: { key: 'contact', label: '门磁', type: 'enum', values: ['open', 'closed'], default: 'closed' },
  locked: { key: 'locked', label: '锁止', type: 'boolean', default: true },
  illuminance: { key: 'illuminance', label: '照度', type: 'number', min: 0, max: 200000, unit: 'lx', default: 320 },
  co2: { key: 'co2', label: '二氧化碳', type: 'number', min: 300, max: 5000, unit: 'ppm', default: 620 },
  pm25: { key: 'pm25', label: 'PM2.5', type: 'number', min: 0, max: 999, unit: 'µg/m³', default: 18 },
  speed: { key: 'speed', label: '风速', type: 'enum', values: ['low', 'mid', 'high', 'auto'], default: 'auto' }
};

export function capability(key) {
  return CAPABILITIES[key] || null;
}

export function defaultState(caps = []) {
  const state = {};
  for (const key of caps) {
    const cap = CAPABILITIES[key];
    if (cap) state[key] = cap.default;
  }
  return state;
}

/**
 * 设备模板：新建设备时的默认能力集合与展示图标。
 * 自定义设备使用 template=custom，并自行传入 capabilities。
 */
export const DEVICE_TEMPLATES = {
  light: { label: '灯光', icon: 'bulb', capabilities: ['power', 'brightness', 'colorTemp'] },
  switch: { label: '开关', icon: 'power', capabilities: ['power'] },
  plug: { label: '插座', icon: 'plug', capabilities: ['power', 'powerW', 'energyKwh'] },
  climate: { label: '空调/温控', icon: 'wind', capabilities: ['power', 'targetTemp', 'temperature', 'speed'] },
  fan: { label: '风扇', icon: 'fan', capabilities: ['power', 'speed'] },
  cover: { label: '窗帘/门帘', icon: 'blinds', capabilities: ['position'] },
  lock: { label: '门锁', icon: 'lock', capabilities: ['locked', 'battery'] },
  sensor: { label: '环境传感器', icon: 'thermo', capabilities: ['temperature', 'humidity', 'battery'] },
  air: { label: '空气质量', icon: 'leaf', capabilities: ['co2', 'pm25', 'temperature'] },
  contact: { label: '门窗磁', icon: 'door', capabilities: ['contact', 'battery'] },
  motion: { label: '人体感应', icon: 'motion', capabilities: ['motion', 'illuminance', 'battery'] },
  camera: { label: '摄像头', icon: 'camera', capabilities: ['power', 'motion'] },
  speaker: { label: '音箱', icon: 'speaker', capabilities: ['power', 'volume'] },
  custom: { label: '自定义设备', icon: 'cube', capabilities: ['power'] }
};

export function template(key) {
  return DEVICE_TEMPLATES[key] || DEVICE_TEMPLATES.custom;
}

/** 校验并归一化写入的状态值，返回 {ok, value} 或 {ok:false, error} */
export function normalizeValue(key, raw) {
  const cap = CAPABILITIES[key];
  if (!cap) return { ok: false, error: `未知能力：${key}` };
  if (cap.type === 'enum') {
    const value = String(raw).toLowerCase();
    if (!cap.values.includes(value)) {
      return { ok: false, error: `${key} 只接受 ${cap.values.join(' / ')}` };
    }
    return { ok: true, value };
  }
  if (cap.type === 'boolean') {
    if (typeof raw === 'boolean') return { ok: true, value: raw };
    const value = String(raw).toLowerCase();
    if (['true', '1', 'on', 'yes'].includes(value)) return { ok: true, value: true };
    if (['false', '0', 'off', 'no'].includes(value)) return { ok: true, value: false };
    return { ok: false, error: `${key} 只接受布尔值` };
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) return { ok: false, error: `${key} 需要数字` };
  if (value < cap.min || value > cap.max) {
    return { ok: false, error: `${key} 需要在 ${cap.min} - ${cap.max} 之间` };
  }
  return { ok: true, value: Math.round(value * 10) / 10 };
}

export function describeCapability(key) {
  const cap = CAPABILITIES[key];
  if (!cap) return { key, label: key, type: 'any' };
  return { ...cap, key };
}
