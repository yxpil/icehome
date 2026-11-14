import { randomBytes } from 'node:crypto';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

function pick(length, alphabet = ALPHABET) {
  const bytes = randomBytes(length * 2);
  let out = '';
  for (let i = 0; i < bytes.length && out.length < length; i += 1) {
    const value = bytes[i];
    if (value < 256 - (256 % alphabet.length)) {
      out += alphabet[value % alphabet.length];
    }
  }
  return out.padEnd(length, '0');
}

export function id(prefix) {
  return `${prefix}_${randomBytes(4).toString('hex')}`;
}

export function pairingCode() {
  return pick(6, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789').toUpperCase();
}

/** OpenAI 风格密钥：sk-ice-<32位小写字母数字> */
export function apiKey() {
  return `sk-ice-${pick(32)}`;
}

export function maskKey(key) {
  if (!key) return '';
  return `${key.slice(0, 12)}${'*'.repeat(6)}${key.slice(-4)}`;
}
