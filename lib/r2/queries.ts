import { sanitizePath } from "../path";

import {
  BucketUsage,
  MediaFile,
  MediaListing,
  buildFolderKey,
  buildListUrl,
  encodeKeyForUrl,
  getEnv,
  inferType,
  parseListResult,
  signedFetch,
} from "./core";

// R2 容量統計記憶體快取（注意：edge 環境每個 isolate 各一份，僅為盡力而為的快取）
let cachedUsage: { totalBytes: number; timestamp: number } | null = null;
const CACHE_TTL_MS = 30 * 1000; // 30 秒

export function clearUsageCache() {
  cachedUsage = null;
}

// 取得媒體列表 (包含資料夾與檔案)
export async function listMedia(prefix = ""): Promise<MediaListing> {
  const normalizedPrefix = sanitizePath(prefix);
  const searchPrefix = buildFolderKey(normalizedPrefix);

  const response = await signedFetch(
    buildListUrl(searchPrefix, { delimiter: "/" }).toString(),
  );
  if (!response.ok) {
    throw new Error(
      `Failed to list objects: ${response.status} ${response.statusText}`,
    );
  }

  const { folders, contents } = parseListResult(
    await response.text(),
    searchPrefix,
    true,
  );

  const files: MediaFile[] = contents.map((item) => ({
    key: item.key,
    url: encodeKeyForUrl(item.key, getEnv().R2_PUBLIC_BASE),
    type: inferType(item.key),
    size: item.size,
    lastModified: item.lastModified,
  }));

  return {
    prefix: normalizedPrefix,
    folders,
    files,
  } satisfies MediaListing;
}

// 計算整個 Bucket 的已使用容量（以位元組為單位）
export async function calculateBucketUsage(force = false): Promise<BucketUsage> {
  const now = Date.now();
  if (!force && cachedUsage && now - cachedUsage.timestamp < CACHE_TTL_MS) {
    return { totalBytes: cachedUsage.totalBytes } satisfies BucketUsage;
  }

  let continuationToken: string | undefined;
  let totalBytes = 0;

  do {
    const listUrl = buildListUrl("", { continuationToken });
    const response = await signedFetch(listUrl.toString());

    if (!response.ok) {
      throw new Error(
        `Failed to calculate bucket usage: ${response.status} ${response.statusText}`,
      );
    }

    const { contents, nextContinuationToken } = parseListResult(
      await response.text(),
      "",
      false,
      { includePrefixObject: true },
    );

    totalBytes += contents.reduce((sum, item) => sum + (item.size ?? 0), 0);
    continuationToken = nextContinuationToken;
  } while (continuationToken);

  cachedUsage = { totalBytes, timestamp: Date.now() };
  return { totalBytes } satisfies BucketUsage;
}
