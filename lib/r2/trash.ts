import {
  type MediaFile, R2ActionError, buildListUrl, buildObjectUrl, collectKeys,
  copyObjectWithinBucket, deleteObjects, encodeKeyForUrl, getEnv, inferType,
  normalizePath, objectExists, parseListResult, signedFetch,
} from './core';
import { hasPeriodOnlyPathSegment, getDepth } from '../path';
import { MAX_FOLDER_DEPTH } from '../constants';
import { DAY_MS, getTrashRetentionDays, isTrashPath, parseTrashKey, TRASH_PREFIX } from '../trash-policy';
import { clearUsageCache } from './queries';

export type TrashMedia = MediaFile & { originalKey: string; trashedAt: string; expiresAt: string };

export async function trashFiles(keys: string[], now = Date.now()) {
  const days = getTrashRetentionDays();
  const tasks = [...new Set(keys)].map(key => {
    const originalKey = normalizePath(key);
    if (!originalKey || originalKey.endsWith('/') || getDepth(originalKey) > MAX_FOLDER_DEPTH + 1 || isTrashPath(originalKey) || hasPeriodOnlyPathSegment(originalKey)) {
      throw new R2ActionError('無效的媒體路徑');
    }
    const trashKey = `${TRASH_PREFIX}${String(now + days * DAY_MS).padStart(13, '0')}/${String(now).padStart(13, '0')}-${crypto.randomUUID()}/${originalKey}`;
    if (!parseTrashKey(trashKey)) throw new R2ActionError('無效的媒體路徑，無法移入垃圾桶');
    if (new TextEncoder().encode(trashKey).length > 1024) throw new R2ActionError('媒體路徑太長，無法移入垃圾桶');
    return { originalKey, trashKey };
  });
  for (const { originalKey, trashKey } of tasks) {
    // 重試已完成的移入操作時，不新增空項目或重複副本。
    if (!await objectExists(originalKey)) continue;
    await copyObjectWithinBucket(originalKey, trashKey, { requireAbsentDestination: true });
    // 複製已確認後才移除原物件；若刪除失敗，保留可救回的副本。
    await deleteObjects([originalKey]);
  }
  clearUsageCache();
}

export async function listTrash(options: { cursor?: string; limit?: number } = {}) {
  const response = await signedFetch(buildListUrl(TRASH_PREFIX, {
    continuationToken: options.cursor, maxKeys: options.limit ?? 100,
  }).toString());
  if (!response.ok) throw new Error('無法讀取垃圾桶');
  const parsed = parseListResult(await response.text(), TRASH_PREFIX, false);
  const files: TrashMedia[] = parsed.contents.flatMap(item => {
    const record = parseTrashKey(item.key);
    if (!record) return [];
    return [{ ...item, url: encodeKeyForUrl(item.key, getEnv().R2_PUBLIC_BASE),
      type: inferType(record.originalKey), originalKey: record.originalKey,
      trashedAt: new Date(record.trashedAt).toISOString(), expiresAt: new Date(record.expiresAt).toISOString(),
    }];
  });
  return { files, nextCursor: parsed.nextContinuationToken ?? null, retentionDays: getTrashRetentionDays() };
}

function requireTrashRecord(key: string) {
  const record = parseTrashKey(key);
  if (!record) throw new R2ActionError('無效的垃圾桶項目');
  return record;
}

export async function restoreTrashFile(key: string, now = Date.now()) {
  const record = requireTrashRecord(key);
  if (record.expiresAt <= now) throw new R2ActionError('項目已到期，無法還原', 410);
  if (getDepth(record.originalKey) > MAX_FOLDER_DEPTH + 1) throw new R2ActionError('原路徑超過資料夾層數上限');
  if (await objectExists(record.originalKey) || (await collectKeys(record.originalKey, { includePrefixObject: true })).length) {
    throw new R2ActionError('原位置已有同名項目，請先移動或重新命名該項目', 409);
  }
  // R2 的目的地條件在提交時檢查，避免同時還原覆寫另一個檔案。
  await copyObjectWithinBucket(key, record.originalKey, { requireAbsentDestination: true });
  await deleteObjects([key]);
  clearUsageCache();
  return { key: record.originalKey, url: encodeKeyForUrl(record.originalKey, getEnv().R2_PUBLIC_BASE), type: inferType(record.originalKey) } satisfies MediaFile;
}

export async function permanentlyDeleteTrashFile(key: string) {
  requireTrashRecord(key);
  await deleteObjects([key]);
  clearUsageCache();
}

/** 每次最多讀五頁，每頁一百筆；只清理本功能建立且已到期的媒體。 */
export async function purgeExpiredTrash(now = Date.now()) {
  let cursor: string | undefined;
  let deleted = 0;
  for (let page = 0; page < 5; page++) {
    const response = await signedFetch(buildListUrl(TRASH_PREFIX, { continuationToken: cursor, maxKeys: 100 }).toString());
    if (!response.ok) throw new Error('無法讀取到期垃圾桶項目');
    const result = parseListResult(await response.text(), TRASH_PREFIX, false);
    const expired = result.contents.filter(item => {
      const record = parseTrashKey(item.key);
      return record && record.expiresAt <= now;
    }).map(item => item.key);
    if (expired.length) { await deleteObjects(expired); deleted += expired.length; clearUsageCache(); }
    // 到期時間是 key 的第一段，後續頁面不會有更早到期的項目。
    if (result.contents.some(item => { const record = parseTrashKey(item.key); return record && record.expiresAt > now; }) || !result.nextContinuationToken) break;
    cursor = result.nextContinuationToken;
  }
  return deleted;
}
