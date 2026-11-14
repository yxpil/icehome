import { gzipSync, gunzipSync } from 'node:zlib';

export const WIFI_SECURITY = ['WPA', 'WEP', 'nopass'];
export const INSPECTION_STATUS = ['ok', 'issue', 'offline'];

function wifiEscape(value) {
  return String(value ?? '').replace(/([\\;,":])/g, '\\$1');
}

export function normalizeWifi(input = {}, current = {}) {
  const ssid = String(input.ssid ?? current.ssid ?? '').trim();
  if (!ssid) throw new Error('Wi-Fi 名称不能为空');
  if (ssid.length > 32) throw new Error('Wi-Fi 名称最长 32 个字符');
  const rawSecurity = String(input.security ?? current.security ?? 'WPA');
  const security = rawSecurity.toLowerCase() === 'nopass' ? 'nopass' : rawSecurity.toUpperCase();
  if (!WIFI_SECURITY.includes(security)) throw new Error('Wi-Fi 加密方式必须是 WPA / WEP / nopass');
  const password = String(input.password ?? current.password ?? '');
  if (password.length > 63) throw new Error('Wi-Fi 口令最长 63 个字符');
  if (security !== 'nopass' && password.length === 0) throw new Error('WPA/WEP 需要填写 Wi-Fi 口令');
  if (security === 'WEP' && password.length > 26) throw new Error('WEP 口令最长 26 个字符');
  return {
    ssid,
    password,
    security,
    hidden: Boolean(input.hidden ?? current.hidden ?? false)
  };
}

export function wifiPayload(wifi) {
  const settings = normalizeWifi(wifi);
  let payload = `WIFI:T:${settings.security};S:${wifiEscape(settings.ssid)};`;
  if (settings.security !== 'nopass') payload += `P:${wifiEscape(settings.password)};`;
  payload += `H:${settings.hidden ? 'true' : 'false'};;`;
  return payload;
}

export function configPayload(config) {
  const compressed = gzipSync(Buffer.from(JSON.stringify(config), 'utf8'), { level: 9 }).toString('base64url');
  return `icehome://config?gz=${compressed}`;
}

export function parseConfigPayload(raw) {
  const text = String(raw || '').trim();
  const match = /^(?:icehome:\/\/config\?|icehome:\/\/import\?)(?:gz=|payload=)([A-Za-z0-9_\-=+/]+)$/.exec(text);
  if (!match) throw new Error('配置二维码格式不正确');
  try {
    const buffer = Buffer.from(match[1], 'base64url');
    const json = text.includes('gz=') ? gunzipSync(buffer).toString('utf8') : buffer.toString('utf8');
    return JSON.parse(json);
  } catch {
    throw new Error('配置二维码无法解压');
  }
}

export function deviceQrPayload(deviceId) {
  return `icehome://device?id=${encodeURIComponent(String(deviceId))}`;
}

export function parseInspectionCode(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  let deviceId = null;
  const device = /icehome:\/\/device\?id=([^&\s]+)/.exec(text);
  const inspect = /icehome:\/\/inspect\?device=([^&\s]+)/.exec(text);
  if (device) deviceId = device[1];
  else if (inspect) deviceId = inspect[1];
  else if (/^dev_[a-z0-9]+$/i.test(text)) deviceId = text;
  if (!deviceId) return null;
  try {
    return decodeURIComponent(deviceId);
  } catch {
    return null;
  }
}
