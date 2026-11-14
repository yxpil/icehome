/**
 * 极简 cron 实现：支持星号、星号除以步长、a-b、a-b/n、a,b 与单值，5 段（分 时 日 月 周）。
 * 周日既接受 0 也接受 7。
 */
const LIMITS = [
  { name: '分钟', min: 0, max: 59 },
  { name: '小时', min: 0, max: 23 },
  { name: '日', min: 1, max: 31 },
  { name: '月', min: 1, max: 12 },
  { name: '周', min: 0, max: 7 }
];

function parseField(text, limit) {
  const set = new Set();
  if (!text) throw new Error(`cron ${limit.name}段为空`);
  for (const part of text.split(',')) {
    if (!part) throw new Error(`cron ${limit.name}段格式错误`);
    const [rangeRaw, stepRaw] = part.split('/');
    const step = stepRaw === undefined ? 1 : Number(stepRaw);
    if (!Number.isInteger(step) || step < 1) throw new Error(`cron 步长非法：${part}`);
    let from;
    let to;
    if (rangeRaw === '*') {
      from = limit.min;
      to = limit.max;
    } else if (rangeRaw.includes('-')) {
      const [a, b] = rangeRaw.split('-');
      from = Number(a);
      to = Number(b);
    } else {
      const single = Number(rangeRaw);
      if (!Number.isInteger(single)) throw new Error(`cron ${limit.name}段含非法数值：${rangeRaw}`);
      from = single;
      to = stepRaw === undefined ? single : limit.max;
    }
    if (!Number.isInteger(from) || !Number.isInteger(to)) {
      throw new Error(`cron ${limit.name}段含非法数值：${part}`);
    }
    if (from < limit.min || to > limit.max || from > to) {
      throw new Error(`cron ${limit.name}段超出范围 ${limit.min}-${limit.max}：${part}`);
    }
    for (let value = from; value <= to; value += step) set.add(value);
  }
  return set;
}

export function parseCron(expression) {
  const raw = String(expression || '').trim();
  const parts = raw.split(/\s+/);
  if (parts.length !== 5) throw new Error('cron 表达式必须为 5 段：分 时 日 月 周');
  const [minute, hour, dom, month, dow] = parts.map((part, index) => parseField(part, LIMITS[index]));
  const dowNormalized = new Set([...dow].map((value) => (value === 7 ? 0 : value)));
  return {
    expression: raw,
    minute,
    hour,
    dom,
    month,
    dow: dowNormalized,
    domAny: parts[2] === '*',
    dowAny: parts[4] === '*',
    minuteSorted: [...minute].sort((a, b) => a - b),
    hourSorted: [...hour].sort((a, b) => a - b)
  };
}

export function isValidCron(expression) {
  try {
    parseCron(expression);
    return true;
  } catch {
    return false;
  }
}

function dayMatches(spec, date) {
  const domMatch = spec.dom.has(date.getDate());
  const dowMatch = spec.dow.has(date.getDay());
  if (spec.domAny && spec.dowAny) return true;
  if (spec.domAny) return dowMatch;
  if (spec.dowAny) return domMatch;
  return domMatch || dowMatch;
}

/** 返回严格晚于 from 的下一次触发时间；1800 天内无匹配则返回 null */
export function cronNext(expression, from = new Date()) {
  const spec = typeof expression === 'string' ? parseCron(expression) : expression;
  const base = new Date(from.getTime());
  base.setSeconds(0, 0);
  base.setMinutes(base.getMinutes() + 1);
  for (let offset = 0; offset < 1800; offset += 1) {
    const day = new Date(base.getTime());
    day.setDate(base.getDate() + offset);
    day.setHours(0, 0, 0, 0);
    if (!spec.month.has(day.getMonth() + 1)) continue;
    if (!dayMatches(spec, day)) continue;
    for (const hour of spec.hourSorted) {
      for (const minute of spec.minuteSorted) {
        const candidate = new Date(day.getTime());
        candidate.setHours(hour, minute, 0, 0);
        if (candidate.getTime() >= base.getTime()) return candidate;
      }
    }
  }
  return null;
}

function parseDailyAt(at) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(at || '').trim());
  if (!match) throw new Error('daily 时间格式应为 HH:MM');
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error('daily 时间超出范围');
  return { hour, minute };
}

export function normalizeSchedule(schedule) {
  const kind = schedule?.kind;
  if (kind === 'interval') {
    const everySeconds = Number(schedule.everySeconds);
    if (!Number.isFinite(everySeconds) || everySeconds < 10) {
      throw new Error('间隔任务最短 10 秒');
    }
    return { kind, everySeconds: Math.round(everySeconds) };
  }
  if (kind === 'daily') {
    const { hour, minute } = parseDailyAt(schedule.at);
    return { kind, at: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` };
  }
  if (kind === 'cron') {
    parseCron(schedule.expression);
    return { kind, expression: String(schedule.expression).trim() };
  }
  throw new Error('schedule.kind 只支持 interval / daily / cron');
}

export function nextRunAt(schedule, from = new Date()) {
  if (!schedule) return null;
  if (schedule.kind === 'interval') {
    return new Date(from.getTime() + schedule.everySeconds * 1000);
  }
  if (schedule.kind === 'daily') {
    const { hour, minute } = parseDailyAt(schedule.at);
    const candidate = new Date(from.getTime());
    candidate.setHours(hour, minute, 0, 0);
    if (candidate.getTime() <= from.getTime()) candidate.setDate(candidate.getDate() + 1);
    return candidate;
  }
  if (schedule.kind === 'cron') {
    return cronNext(schedule.expression, from);
  }
  return null;
}

export function describeSchedule(schedule) {
  if (!schedule) return '未设置';
  if (schedule.kind === 'interval') {
    const seconds = schedule.everySeconds;
    if (seconds % 3600 === 0) return `每 ${seconds / 3600} 小时`;
    if (seconds % 60 === 0) return `每 ${seconds / 60} 分钟`;
    return `每 ${seconds} 秒`;
  }
  if (schedule.kind === 'daily') return `每天 ${schedule.at}`;
  if (schedule.kind === 'cron') return `cron ${schedule.expression}`;
  return '未设置';
}
