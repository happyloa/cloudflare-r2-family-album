import {
  BucketUsage,
  MediaFile,
  MediaListing,
  buildFolderKey,
  encodeKeyForUrl,
  inferType,
  listPage,
} from "./core";
import { isTrashPath } from '../trash-policy';
import { normalizePath } from '../path';
import { R2ActionError } from './core';

// R2 容量統計記憶體快取（容量查詢經 ALBUM_MUTATIONS 處理，快取存在該 Durable Object 的記憶體，重新啟動後歸零，僅為盡力而為的快取）
let cachedUsage: { totalBytes: number; timestamp: number } | null = null;
let usageRequest: Promise<BucketUsage> | null = null;
let usageVersion = 0;
const CACHE_TTL_MS = 30 * 1000; // 30 秒

export function clearUsageCache() {
  cachedUsage = null;
  usageRequest = null;
  usageVersion += 1;
}

// 取得媒體列表 (包含資料夾與檔案)
export type ListMediaOptions = {
  cursor?: string;
  limit?: number;
};

export async function listMedia(prefix = "", options: ListMediaOptions = {}): Promise<MediaListing> {
  const normalizedPrefix = normalizePath(prefix);
  if (isTrashPath(normalizedPrefix)) throw new R2ActionError('垃圾桶須由管理模式查看', 403);
  const searchPrefix = buildFolderKey(normalizedPrefix);

  const { folders, contents, nextCursor } = await listPage(searchPrefix, {
    cursor: options.cursor,
    delimiter: "/",
    limit: options.limit,
  });

  const files: MediaFile[] = contents.filter(item => !isTrashPath(item.key)).map((item) => ({
    key: item.key,
    url: encodeKeyForUrl(item.key),
    type: inferType(item.key),
    size: item.size,
    lastModified: item.lastModified,
  }));

  return {
    prefix: normalizedPrefix,
    folders: folders.filter(folder => !isTrashPath(folder.key)),
    files,
    nextCursor: nextCursor ?? null,
  } satisfies MediaListing;
}

// 計算整個 Bucket 的已使用容量（以位元組為單位）
export async function calculateBucketUsage(force = false): Promise<BucketUsage> {
  const now = Date.now();
  if (!force && cachedUsage && now - cachedUsage.timestamp < CACHE_TTL_MS) {
    return { totalBytes: cachedUsage.totalBytes } satisfies BucketUsage;
  }
  if (usageRequest) return usageRequest;

  const version = usageVersion;
  const request = scanBucketUsage().then(usage => {
    // A write may have invalidated the cache while this scan was in progress.
    if (version === usageVersion) cachedUsage = { totalBytes: usage.totalBytes, timestamp: Date.now() };
    return usage;
  }).finally(() => {
    if (usageRequest === request) usageRequest = null;
  });
  usageRequest = request;
  return request;
}

async function scanBucketUsage(): Promise<BucketUsage> {
  let cursor: string | undefined;
  let totalBytes = 0;

  do {
    const page = await listPage("", { cursor, includePrefixObject: true });
    totalBytes += page.contents.reduce((sum, item) => sum + item.size, 0);
    cursor = page.nextCursor;
  } while (cursor);

  return { totalBytes } satisfies BucketUsage;
}
