import { describe, expect, it, afterEach } from 'vitest';
import { createServer } from 'node:http';
import { listInterfaces, normalizeCidr, scanNetwork } from '../../server/src/network.js';

let server;

afterEach(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
    server = null;
  }
});

describe('网段扫描边界', () => {
  it('规范化 /24 网段并排除网络地址与广播地址', () => {
    const target = normalizeCidr('192.168.1.42/24');
    expect(target.cidr).toBe('192.168.1.0/24');
    expect(target.size).toBe(254);
    expect(target.hosts).not.toContain('192.168.1.0');
    expect(target.hosts).not.toContain('192.168.1.255');
    expect(target.hosts[0]).toBe('192.168.1.1');
  });

  it('支持 /30 与 /32，拒绝公网与过大的网段', () => {
    expect(normalizeCidr('10.0.0.0/30').hosts).toEqual(['10.0.0.1', '10.0.0.2']);
    expect(normalizeCidr('127.0.0.1/32').hosts).toEqual(['127.0.0.1']);
    expect(() => normalizeCidr('8.8.8.0/24')).toThrow(/私有网段/);
    expect(() => normalizeCidr('192.168.0.0/16')).toThrow(/\/24/);
    expect(() => normalizeCidr('not-a-cidr')).toThrow(/IPv4/);
  });

  it('探测本机临时 HTTP 端口并返回开放端口', async () => {
    server = createServer((req, res) => res.end('ok'));
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const result = await scanNetwork({ cidr: '127.0.0.1/30', ports: [port], timeoutMs: 500, concurrency: 4 });
    expect(result.scanned).toBe(2);
    expect(result.found).toEqual([expect.objectContaining({ ip: '127.0.0.1', ports: [port] })]);
  });

  it('限制单次探测端口数量', async () => {
    await expect(scanNetwork({ cidr: '127.0.0.1/32', ports: [1, 2, 3, 4, 5, 6, 7, 8, 9] })).rejects.toThrow(/8 个/);
  });

  it('列出非内部 IPv4 网卡，格式可直接用于扫描', () => {
    const interfaces = listInterfaces();
    expect(Array.isArray(interfaces)).toBe(true);
    for (const item of interfaces) {
      expect(item.address).toMatch(/^\d{1,3}(\.\d{1,3}){3}$/);
      expect(item.cidr).toContain('/');
    }
  });
});
