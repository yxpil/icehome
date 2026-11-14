import { apiKey, id } from './ids.js';
import { defaultState, template } from './capabilities.js';
import { hashPassword } from './accounts.js';

function device({ name, categoryId, templateKey, state, order, capabilities, adapter }) {
  const meta = template(templateKey);
  const caps = capabilities || meta.capabilities;
  return {
    id: id('dev'),
    name,
    categoryId,
    template: templateKey,
    icon: meta.icon,
    capabilities: caps,
    state: { ...defaultState(caps), ...(state || {}) },
    adapter: adapter || {
      kind: 'mock',
      url: '',
      method: 'POST',
      headers: {},
      body: '',
      timeoutMs: 4000,
      write: false,
      readPath: ''
    },
    online: true,
    pinned: false,
    order,
    source: 'seed',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function migrateState(data) {
  if (!data || typeof data !== 'object') return data;
  if (!Array.isArray(data.users) || data.users.length === 0) {
    const now = new Date().toISOString();
    const devices = Array.isArray(data.devices) ? data.devices : [];
    data.users = [
      {
        id: 'usr_admin',
        username: 'admin',
        displayName: '管理员',
        role: 'admin',
        deviceIds: [],
        passwordHash: hashPassword('icehome'),
        active: true,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: null,
        note: '由旧数据升级生成，默认口令 icehome，请尽快修改'
      },
      {
        id: 'usr_family',
        username: 'family',
        displayName: '家人',
        role: 'member',
        deviceIds: [devices[0], devices[4], devices[9]].filter(Boolean).map((device) => device.id),
        passwordHash: hashPassword('icehome'),
        active: true,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: null,
        note: '演示成员账户'
      }
    ];
  }
  if (!data.settings || typeof data.settings !== 'object') data.settings = {};
  if (!data.settings.wifi) {
    data.settings.wifi = { ssid: 'ICEHOME-之家', password: 'icehome2026', security: 'WPA', hidden: false };
  }
  if (!Array.isArray(data.inspections)) data.inspections = [];
  if (!Array.isArray(data.plans)) {
    const now = new Date().toISOString();
    const devices = Array.isArray(data.devices) ? data.devices : [];
    const categories = Array.isArray(data.categories) ? data.categories : [];
    const rooms = [
      { id: 'room_living', name: '客厅', x: 60, y: 90, w: 500, h: 340 },
      { id: 'room_bed', name: '主卧', x: 660, y: 90, w: 480, h: 300 },
      { id: 'room_kitchen', name: '厨房', x: 60, y: 500, w: 360, h: 200 },
      { id: 'room_entry', name: '玄关', x: 500, y: 500, w: 640, h: 200 }
    ];
    const roomFor = (device) => {
      const category = categories.find((item) => item.id === device.categoryId);
      const name = category?.name || '';
      if (/厨/.test(name)) return rooms[2];
      if (/卧/.test(name)) return rooms[1];
      if (/安|玄关|门|摄像/.test(name)) return rooms[3];
      return rooms[0];
    };
    const counters = {};
    const markers = devices.map((device) => {
      const room = roomFor(device);
      const index = counters[room.id] || 0;
      counters[room.id] = index + 1;
      const column = index % 2;
      const row = Math.floor(index / 2);
      return {
        deviceId: device.id,
        x: Math.max(room.x + 40, Math.min(room.x + room.w - 40, room.x + 90 + column * 180)),
        y: Math.max(room.y + 30, Math.min(room.y + room.h - 30, room.y + 70 + row * 160))
      };
    });
    data.plans = [
      {
        id: 'plan_ground',
        name: '一层平面',
        width: 1200,
        height: 760,
        rooms,
        markers,
        updatedAt: now
      }
    ];
  }
  return data;
}

export function createInitialDb() {
  const now = new Date().toISOString();
  const categories = [
    { id: 'cat_living', name: '客厅', icon: 'sofa', order: 0, description: '客厅与阳台设备', createdAt: now },
    { id: 'cat_bed', name: '卧室', icon: 'moon', order: 1, description: '主卧与次卧', createdAt: now },
    { id: 'cat_kitchen', name: '厨房', icon: 'cup', order: 2, description: '厨电与计量插座', createdAt: now },
    { id: 'cat_security', name: '安防', icon: 'shield', order: 3, description: '门锁、门磁与摄像头', createdAt: now }
  ];

  const devices = [
    device({
      name: '客厅主灯',
      categoryId: 'cat_living',
      templateKey: 'light',
      state: { power: 'on', brightness: 78, colorTemp: 4200 },
      order: 0,
      pinned: true
    }),
    device({
      name: '客厅氛围灯带',
      categoryId: 'cat_living',
      templateKey: 'light',
      state: { power: 'off', brightness: 32, colorTemp: 2700 },
      order: 1
    }),
    device({
      name: '客厅窗帘',
      categoryId: 'cat_living',
      templateKey: 'cover',
      state: { position: 45 },
      order: 2
    }),
    device({
      name: '客厅空调',
      categoryId: 'cat_living',
      templateKey: 'climate',
      state: { power: 'off', targetTemp: 25, temperature: 23.4, speed: 'auto' },
      order: 3
    }),
    device({
      name: '主卧顶灯',
      categoryId: 'cat_bed',
      templateKey: 'light',
      state: { power: 'off', brightness: 55, colorTemp: 3500 },
      order: 0
    }),
    device({
      name: '卧室温湿度',
      categoryId: 'cat_bed',
      templateKey: 'sensor',
      state: { temperature: 21.6, humidity: 46, battery: 88 },
      order: 1
    }),
    device({
      name: '厨房计量插座',
      categoryId: 'cat_kitchen',
      templateKey: 'plug',
      state: { power: 'on', powerW: 42, energyKwh: 18.6 },
      order: 0,
      adapter: {
        kind: 'http',
        url: '',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"deviceId":"{{device.id}}","action":"{{action}}"}',
        timeoutMs: 4000,
        write: false,
        readPath: 'data'
      }
    }),
    device({
      name: '玄关门窗磁',
      categoryId: 'cat_security',
      templateKey: 'contact',
      state: { contact: 'closed', battery: 91 },
      order: 0
    }),
    device({
      name: '客厅人体感应',
      categoryId: 'cat_security',
      templateKey: 'motion',
      state: { motion: false, illuminance: 210, battery: 76 },
      order: 1
    }),
    device({
      name: '门口摄像头',
      categoryId: 'cat_security',
      templateKey: 'camera',
      state: { power: 'on', motion: false },
      order: 2
    })
  ];

  const tasks = [
    {
      id: id('task'),
      name: '夜间关灯',
      deviceId: devices[0].id,
      schedule: { kind: 'daily', at: '22:30' },
      action: { type: 'turn_off', payload: {} },
      enabled: true,
      lastRunAt: null,
      nextRunAt: null,
      runCount: 0,
      createdAt: now
    },
    {
      id: id('task'),
      name: '插座功率采样',
      deviceId: devices[6].id,
      schedule: { kind: 'interval', everySeconds: 1800 },
      action: { type: 'sync', payload: {} },
      enabled: true,
      lastRunAt: null,
      nextRunAt: null,
      runCount: 0,
      createdAt: now
    },
    {
      id: id('task'),
      name: '工作日晨间照明',
      deviceId: devices[4].id,
      schedule: { kind: 'cron', expression: '0 7 * * 1-5' },
      action: { type: 'turn_on', payload: { brightness: 60 } },
      enabled: false,
      lastRunAt: null,
      nextRunAt: null,
      runCount: 0,
      createdAt: now
    }
  ];

  const plugins = [
    {
      id: id('plug'),
      key: 'builtin.motion-light',
      name: '人来灯亮',
      version: '1.0.0',
      author: 'ICEHOME',
      description: '人体感应触发后自动点亮指定灯光，并在 5 分钟后回落。',
      icon: 'motion',
      enabled: true,
      builtin: true,
      templates: [],
      hooks: [{ on: 'device.motion', action: 'turn_on', target: 'category' }],
      installedAt: now
    },
    {
      id: id('plug'),
      key: 'builtin.energy-audit',
      name: '能耗审计',
      version: '1.2.0',
      author: 'ICEHOME',
      description: '为插座类设备累计电量并生成每日摘要事件。',
      icon: 'chart',
      enabled: true,
      builtin: true,
      templates: [],
      hooks: [{ on: 'schedule.daily', action: 'snapshot' }],
      installedAt: now
    },
    {
      id: id('plug'),
      key: 'builtin.air-report',
      name: '空气质量播报',
      version: '0.9.0',
      author: 'ICEHOME',
      description: '把 CO₂ 与 PM2.5 读数合并成一条可读的播报事件。',
      icon: 'leaf',
      enabled: false,
      builtin: true,
      templates: [
        {
          key: 'air_monitor',
          name: '空气质量面板',
          icon: 'leaf',
          capabilities: ['co2', 'pm25', 'temperature', 'humidity']
        }
      ],
      hooks: [{ on: 'device.state', action: 'notify' }],
      installedAt: now
    }
  ];

  const plans = [
    {
      id: 'plan_ground',
      name: '一层平面',
      width: 1200,
      height: 760,
      rooms: [
        { id: 'room_living', name: '客厅', x: 60, y: 90, w: 500, h: 340 },
        { id: 'room_bed', name: '主卧', x: 660, y: 90, w: 480, h: 300 },
        { id: 'room_kitchen', name: '厨房', x: 60, y: 500, w: 360, h: 200 },
        { id: 'room_entry', name: '玄关', x: 500, y: 500, w: 640, h: 200 }
      ],
      markers: [
        { deviceId: devices[0].id, x: 150, y: 160 },
        { deviceId: devices[1].id, x: 330, y: 160 },
        { deviceId: devices[2].id, x: 150, y: 320 },
        { deviceId: devices[3].id, x: 330, y: 320 },
        { deviceId: devices[4].id, x: 760, y: 170 },
        { deviceId: devices[5].id, x: 900, y: 170 },
        { deviceId: devices[6].id, x: 180, y: 570 },
        { deviceId: devices[7].id, x: 580, y: 570 },
        { deviceId: devices[8].id, x: 720, y: 570 },
        { deviceId: devices[9].id, x: 860, y: 570 }
      ],
      updatedAt: now
    }
  ];

  const users = [
    {
      id: 'usr_admin',
      username: 'admin',
      displayName: '管理员',
      role: 'admin',
      deviceIds: [],
      passwordHash: hashPassword('icehome'),
      active: true,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null,
      note: '初始管理员，首次登录后请修改口令'
    },
    {
      id: 'usr_family',
      username: 'family',
      displayName: '家人',
      role: 'member',
      deviceIds: [devices[0].id, devices[4].id, devices[9].id],
      passwordHash: hashPassword('icehome'),
      active: true,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null,
      note: '演示成员：仅可控制客厅主灯、主卧顶灯与门口摄像头'
    }
  ];

  return {
    version: 1,
    settings: {
      homeName: 'ICEHOME 之家',
      allowLocalBootstrap: true,
      aiEnabled: true,
      cache: { enabled: false, ttlSeconds: 5 },
      wifi: { ssid: 'ICEHOME-之家', password: 'icehome2026', security: 'WPA', hidden: false },
      created: now
    },
    categories,
    devices,
    tasks,
    plugins,
    plans,
    users,
    pairings: [],
    inspections: [],
    events: [
      { id: id('evt'), ts: now, level: 'info', type: 'system', message: 'ICEHOME 服务已初始化' },
      { id: id('evt'), ts: now, level: 'info', type: 'device', message: '已载入 9 台演示设备' },
      { id: id('evt'), ts: now, level: 'info', type: 'system', message: '已创建初始管理员与演示成员账户' }
    ],
    tokens: [
      {
        id: id('tok'),
        name: '本地面板',
        key: apiKey(),
        scopes: ['admin'],
        createdAt: now,
        lastUsedAt: null,
        requestCount: 0,
        revoked: false,
        note: '浏览器首次访问时自动签发的本地面板密钥'
      }
    ]
  };
}
