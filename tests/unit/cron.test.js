import { describe, it, expect } from 'vitest';
import { parseCron, cronNext, isValidCron, nextRunAt, normalizeSchedule, describeSchedule } from '../../server/src/cron.js';

describe('cron 表达式解析', () => {
  it('解析 5 段表达式', () => {
    const spec = parseCron('*/15 9-18 * * 1-5');
    expect([...spec.minute]).toEqual([0, 15, 30, 45]);
    expect([...spec.hour]).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
    expect(spec.domAny).toBe(true);
    expect(spec.dowAny).toBe(false);
  });

  it('拒绝段数不足或越界', () => {
    expect(isValidCron('* * * *')).toBe(false);
    expect(isValidCron('60 * * * *')).toBe(false);
    expect(isValidCron('* 24 * * *')).toBe(false);
    expect(isValidCron('* * * 13 *')).toBe(false);
    expect(isValidCron('*/0 * * * *')).toBe(false);
    expect(isValidCron('9-3 * * * *')).toBe(false);
    expect(() => parseCron('* * * * *')).not.toThrow();
  });

  it('支持列表与步长组合', () => {
    const spec = parseCron('5,10,20-40/10 * * * *');
    expect([...spec.minute].sort((a, b) => a - b)).toEqual([5, 10, 20, 30, 40]);
  });
});

describe('cron 下次触发时间', () => {
  it('每 15 分钟对齐到下一个刻度', () => {
    const from = new Date(2026, 10, 15, 10, 7, 30);
    const next = cronNext('*/15 * * * *', from);
    expect(next.getHours()).toBe(10);
    expect(next.getMinutes()).toBe(15);
    expect(next.getSeconds()).toBe(0);
  });

  it('跨日推进到第二天', () => {
    const from = new Date(2026, 10, 15, 23, 50, 0);
    const next = cronNext('0 7 * * *', from);
    expect(next.getDate()).toBe(16);
    expect(next.getHours()).toBe(7);
    expect(next.getMinutes()).toBe(0);
  });

  it('周日同时接受 0 与 7', () => {
    const from = new Date(2026, 10, 15, 8, 0, 0); // 2026-11-15 是周日
    const next = cronNext('0 9 * * 7', from);
    expect(next.getDay()).toBe(0);
    expect(next.getHours()).toBe(9);
    const nextZero = cronNext('0 9 * * 0', from);
    expect(nextZero.getTime()).toBe(next.getTime());
  });

  it('只在工作日触发', () => {
    const from = new Date(2026, 10, 14, 8, 0, 0); // 周六
    const next = cronNext('0 7 * * 1-5', from);
    expect(next.getDay()).toBe(1);
    expect(next.getDate()).toBe(16);
  });

  it('每月的 1 号 00:00', () => {
    const from = new Date(2026, 10, 15, 12, 0, 0);
    const next = cronNext('0 0 1 * *', from);
    expect(next.getMonth()).toBe(11);
    expect(next.getDate()).toBe(1);
  });
});

describe('计划归一化与下次执行', () => {
  it('interval 最短 10 秒', () => {
    expect(() => normalizeSchedule({ kind: 'interval', everySeconds: 5 })).toThrow();
    expect(normalizeSchedule({ kind: 'interval', everySeconds: 60 })).toEqual({ kind: 'interval', everySeconds: 60 });
  });

  it('daily 时间补齐与校验', () => {
    expect(normalizeSchedule({ kind: 'daily', at: '7:05' })).toEqual({ kind: 'daily', at: '07:05' });
    expect(() => normalizeSchedule({ kind: 'daily', at: '24:00' })).toThrow();
    expect(() => normalizeSchedule({ kind: 'daily', at: '25:61' })).toThrow();
  });

  it('daily 已过时刻顺延到明天', () => {
    const from = new Date(2026, 10, 15, 22, 40, 0);
    const next = nextRunAt({ kind: 'daily', at: '22:30' }, from);
    expect(next.getDate()).toBe(16);
    expect(next.getHours()).toBe(22);
    expect(next.getMinutes()).toBe(30);
  });

  it('interval 以当前时间为基准', () => {
    const from = new Date(2026, 10, 15, 12, 0, 0);
    const next = nextRunAt({ kind: 'interval', everySeconds: 3600 }, from);
    expect(next.getTime() - from.getTime()).toBe(3600 * 1000);
  });

  it('描述可读文本', () => {
    expect(describeSchedule({ kind: 'daily', at: '22:30' })).toBe('每天 22:30');
    expect(describeSchedule({ kind: 'interval', everySeconds: 1800 })).toBe('每 30 分钟');
    expect(describeSchedule({ kind: 'cron', expression: '0 7 * * 1-5' })).toBe('cron 0 7 * * 1-5');
  });
});
