import { hasPeriodOnlyPathSegment } from './path';

export const TRASH_PREFIX = '.family-album-trash/';
export const DAY_MS = 86_400_000;

export function isTrashPath(key: string) {
  const normalized = key.replace(/^\/+|\/+$/g, '').trim();
  return normalized === TRASH_PREFIX.slice(0, -1) || normalized.startsWith(TRASH_PREFIX);
}

export function getTrashRetentionDays(value = process.env.TRASH_RETENTION_DAYS) {
  if (value === undefined || value === '') return 15;
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 365) {
    throw new Error('TRASH_RETENTION_DAYS 必須是 1 到 365 的整數');
  }
  return Number(value);
}

export function parseTrashKey(key: string) {
  const match = /^\.family-album-trash\/(\d{13})\/(\d{13})-([a-f0-9-]{36})\/(.+)$/.exec(key);
  if (!match || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(match[3])) return null;
  const expiresAt = Number(match[1]);
  const trashedAt = Number(match[2]);
  const originalKey = match[4];
  if (expiresAt <= trashedAt || expiresAt - trashedAt > 365 * DAY_MS ||
      originalKey.endsWith('/') || originalKey.startsWith('/') || originalKey.includes('//') ||
      /[\u0000-\u001f]/.test(originalKey) || hasPeriodOnlyPathSegment(originalKey) || isTrashPath(originalKey)) return null;
  return { originalKey, trashedAt, expiresAt };
}
