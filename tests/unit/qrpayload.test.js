import { describe, expect, it } from 'vitest';
import {
  configPayload,
  deviceQrPayload,
  normalizeWifi,
  parseConfigPayload,
  parseInspectionCode,
  wifiPayload
} from '../../server/src/qrpayload.js';

describe('二维码负载', () => {
  it('WPA Wi-Fi 二维码按标准转义分号、冒号、逗号与反斜杠', () => {
    const payload = wifiPayload({ ssid: 'Home;5G', password: 'p:a,ss\\word', security: 'WPA', hidden: false });
    expect(payload).toBe('WIFI:T:WPA;S:Home\\;5G;P:p\\:a\\,ss\\\\word;H:false;;');
  });

  it('不加密网络不写口令字段', () => {
    const payload = wifiPayload({ ssid: '访客网络', password: '', security: 'nopass', hidden: true });
    expect(payload).toBe('WIFI:T:nopass;S:访客网络;H:true;;');
  });

  it('Wi-Fi 参数校验拒绝空名称与缺失口令', () => {
    expect(() => normalizeWifi({ ssid: '', security: 'WPA', password: 'x' })).toThrow(/名称不能为空/);
    expect(() => normalizeWifi({ ssid: 'Home', security: 'WPA', password: '' })).toThrow(/需要填写/);
    expect(() => normalizeWifi({ ssid: 'Home', security: 'WPA2', password: 'x' })).toThrow(/加密方式/);
  });

  it('配置二维码使用 gzip + base64url，可完整还原设置与设备', () => {
    const config = {
      schema: 'icehome.config/1',
      settings: { homeName: '测试之家' },
      devices: Array.from({ length: 20 }, (_, index) => ({ id: `dev_${index}`, name: `设备 ${index}` }))
    };
    const payload = configPayload(config);
    expect(payload.startsWith('icehome://config?gz=')).toBe(true);
    expect(parseConfigPayload(payload)).toEqual(config);
  });

  it('设备标签可解析，普通文本与错误协议返回 null', () => {
    const payload = deviceQrPayload('dev_abc123');
    expect(payload).toBe('icehome://device?id=dev_abc123');
    expect(parseInspectionCode(payload)).toBe('dev_abc123');
    expect(parseInspectionCode('icehome://inspect?device=dev_other')).toBe('dev_other');
    expect(parseInspectionCode('dev_direct')).toBe('dev_direct');
    expect(parseInspectionCode('https://example.com')).toBeNull();
    expect(parseInspectionCode('')).toBeNull();
  });
});
