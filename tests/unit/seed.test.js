import { describe, expect, it } from 'vitest';
import { migrateState } from '../../server/src/seed.js';

describe('旧数据迁移', () => {
  it('补齐账户，并按分类把设备标记放进对应房间', () => {
    const categories = [
      { id: 'cat_living', name: '客厅' },
      { id: 'cat_bed', name: '卧室' },
      { id: 'cat_kitchen', name: '厨房' },
      { id: 'cat_security', name: '安防' }
    ];
    const group = (categoryId, count, offset) =>
      Array.from({ length: count }, (_, index) => ({ id: `dev_${offset + index}`, categoryId }));
    const legacy = {
      categories,
      devices: [...group('cat_living', 4, 0), ...group('cat_bed', 2, 4), ...group('cat_kitchen', 1, 6), ...group('cat_security', 3, 7)]
    };

    const data = migrateState(legacy);
    expect(data.users.map((user) => user.username)).toEqual(['admin', 'family']);
    expect(data.users[1].deviceIds).toEqual(['dev_0', 'dev_4', 'dev_9']);
    expect(data.settings.wifi).toMatchObject({ ssid: 'ICEHOME-之家', security: 'WPA' });
    expect(data.inspections).toEqual([]);

    const plan = data.plans[0];
    expect(plan.markers).toHaveLength(10);
    const roomOf = (deviceId) => {
      const device = legacy.devices.find((item) => item.id === deviceId);
      if (device.categoryId === 'cat_bed') return '主卧';
      if (device.categoryId === 'cat_kitchen') return '厨房';
      if (device.categoryId === 'cat_security') return '玄关';
      return '客厅';
    };
    for (const marker of plan.markers) {
      const room = plan.rooms.find((item) => item.name === roomOf(marker.deviceId));
      expect(marker.x).toBeGreaterThanOrEqual(room.x);
      expect(marker.x).toBeLessThanOrEqual(room.x + room.w);
      expect(marker.y).toBeGreaterThanOrEqual(room.y);
      expect(marker.y).toBeLessThanOrEqual(room.y + room.h);
    }
  });
});
