import { describe, expect, it } from 'vitest';
import shared from '../../electron/shared.cjs';

describe('Electron 连接配置', () => {
  it('规范化服务器地址：补协议、去尾斜杠、保留 origin', () => {
    expect(shared.normalizeBaseUrl('192.168.1.10:8787')).toBe('http://192.168.1.10:8787');
    expect(shared.normalizeBaseUrl(' https://home.example.com/ ')).toBe('https://home.example.com');
    expect(shared.normalizeBaseUrl('http://127.0.0.1:8787')).toBe('http://127.0.0.1:8787');
  });

  it('拒绝带路径、查询、账号口令或非 HTTP 的地址', () => {
    expect(() => shared.normalizeBaseUrl('')).toThrow('请填写');
    expect(() => shared.normalizeBaseUrl('ftp://home.local:21')).toThrow('http');
    expect(() => shared.normalizeBaseUrl('http://home.local:8787/api')).toThrow('根地址');
    expect(() => shared.normalizeBaseUrl('http://home.local:8787/?a=1')).toThrow('查询');
    expect(() => shared.normalizeBaseUrl('http://user:pass@home.local:8787')).toThrow('口令');
  });

  it('校验端口与监听范围', () => {
    expect(shared.normalizePort('8788')).toBe(8788);
    expect(shared.normalizePort('')).toBe(shared.DEFAULT_LOCAL_PORT);
    expect(() => shared.normalizePort('0')).toThrow('1–65535');
    expect(() => shared.normalizePort('65536')).toThrow('1–65535');
    expect(shared.normalizeLocalHost('localhost')).toBe('127.0.0.1');
    expect(shared.normalizeLocalHost('0.0.0.0')).toBe('0.0.0.0');
    expect(shared.normalizeLocalHost('192.168.1.2')).toBe('0.0.0.0');
  });

  it('常用服务器去重、限额并生成标签', () => {
    const profiles = shared.normalizeProfiles([
      { url: 'http://192.168.1.10:8787' },
      { url: 'http://192.168.1.10:8787/', label: '客厅主机' },
      { url: 'https://home.example.com', label: '外网' },
      { url: 'not a url', label: '坏地址' }
    ]);
    expect(profiles).toHaveLength(2);
    expect(profiles[0]).toEqual({ url: 'http://192.168.1.10:8787', label: '客厅主机' });
    expect(profiles[1].label).toBe('外网');

    const many = Array.from({ length: 12 }, (_, index) => ({ url: `http://10.0.0.${index + 1}:8787` }));
    expect(shared.normalizeProfiles(many)).toHaveLength(shared.MAX_PROFILES);
  });

  it('合并常用服务器时置顶当前地址并去重', () => {
    const profiles = shared.mergeProfile(
      [{ url: 'http://10.0.0.2:8787', label: 'B' }, { url: 'http://10.0.0.1:8787', label: 'A' }],
      'http://10.0.0.2:8787',
      '当前'
    );
    expect(profiles[0].label).toBe('当前');
    expect(profiles.map((item) => item.url)).toEqual(['http://10.0.0.2:8787', 'http://10.0.0.1:8787']);
  });

  it('设置清洗能容忍损坏字段', () => {
    const settings = shared.sanitizeSettings(
      {
        mode: 'remote',
        localPort: 'oops',
        localHost: 'bad',
        remoteUrl: 'ftp://bad',
        profiles: [{ url: 'http://10.0.0.5:8787' }],
        autoConnect: 1
      },
      { dataDir: 'C:/tmp/data' }
    );
    expect(settings.mode).toBe('remote');
    expect(settings.localPort).toBe(shared.DEFAULT_LOCAL_PORT);
    expect(settings.localHost).toBe('0.0.0.0');
    expect(settings.remoteUrl).toBe(shared.DEFAULT_REMOTE_URL);
    expect(settings.profiles).toHaveLength(1);
    expect(settings.autoConnect).toBe(true);
    expect(settings.dataDir).toBe('C:/tmp/data');
  });

  it('窗口尺寸小于最小值时回退', () => {
    expect(shared.normalizeBounds({ width: 500, height: 400 }).width).toBe(1440);
    expect(shared.normalizeBounds({ width: 1600, height: 1000, x: 10, y: 20 })).toEqual({
      width: 1600,
      height: 1000,
      x: 10,
      y: 20
    });
  });
});
