import { env as workerEnv } from "cloudflare:workers";

import { normalizePath, trimTrailingSlashes } from "../path";

// ── 型別 ──

export type MediaFile = {
  key: string;
  url: string;
  type: "image" | "video";
  size?: number;
  lastModified?: string;
};

export type FolderItem = {
  key: string;
  name: string;
};

export type MediaListing = {
  prefix: string;
  folders: FolderItem[];
  files: MediaFile[];
  nextCursor: string | null;
};

export type BucketUsage = {
  totalBytes: number;
};

export class R2ActionError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

// ── 設定 ──

/** wrangler.jsonc 的 r2_buckets 綁定。本機開發與測試使用模擬 bucket，不會連到正式資料。 */
export function getBucket(): R2Bucket {
  const bucket = (workerEnv as Partial<CloudflareEnv>).ALBUM_BUCKET;
  if (!bucket) throw new Error("缺少 R2 綁定 ALBUM_BUCKET，請確認 wrangler.jsonc 的 r2_buckets 設定");
  return bucket;
}

export function getPublicBase() {
  const value = typeof process !== "undefined" ? process.env.R2_PUBLIC_BASE : undefined;
  if (!value) throw new Error("缺少環境變數 R2_PUBLIC_BASE（公開存取的基底 URL），請參考 .dev.vars.example");
  return value;
}

// ── 路徑 / Key 建構 ──

// 建構資料夾 Key (以 / 結尾)
export function buildFolderKey(path: string) {
  const normalized = normalizePath(path);
  return normalized ? `${normalized}/` : "";
}

function encodeR2PathSegment(segment: string) {
  if (segment === ".") return "%2E";
  if (segment === "..") return "%2E%2E";
  return encodeURIComponent(segment);
}

// 將 Key 編碼為公開 URL
export function encodeKeyForUrl(key: string, base = getPublicBase()) {
  const url = new URL(base);
  const basePath = trimTrailingSlashes(url.pathname);
  const encodedKey = key.split("/").map(encodeR2PathSegment).join("/");
  return `${url.origin}${basePath}/${encodedKey}${url.search}`;
}

const VIDEO_FILE_EXTENSIONS = new Set([
  "3g2", "3gp", "3gpp", "asf", "avi", "f4v", "flv", "m2ts", "m4v", "mkv", "mov",
  "mp4", "mpeg", "mpg", "mts", "ogm", "ogv", "qt", "ts", "webm", "wmv",
]);

// 根據已儲存的 Content-Type 或副檔名推斷媒體類型。
// 列表不會回傳 Content-Type，因此列表及重新命名後以副檔名作為回退。
export function inferType(
  key: string,
  contentType?: string,
): MediaFile["type"] {
  if (contentType?.toLowerCase().startsWith("video/")) return "video";

  const extension = key.toLowerCase().split(".").pop();
  return extension && VIDEO_FILE_EXTENSIONS.has(extension) ? "video" : "image";
}

// ── 列表 ──

export type ListPage = {
  folders: FolderItem[];
  contents: {
    key: string;
    size: number;
    lastModified: string;
  }[];
  nextCursor?: string;
};

/**
 * 讀一頁列表。folders 只在指定 delimiter 時才有；
 * 預設排除與前綴相同的資料夾標記本身。
 */
export async function listPage(
  prefix: string,
  options: { cursor?: string; delimiter?: string; limit?: number; includePrefixObject?: boolean } = {},
): Promise<ListPage> {
  let result: R2Objects;
  try {
    result = await getBucket().list({
      prefix,
      cursor: options.cursor,
      delimiter: options.delimiter,
      limit: options.limit,
    });
  } catch (error) {
    // 改用 binding 前發出的分頁游標格式不同，前端重新整理即可取得新的游標。
    if (options.cursor) throw new R2ActionError("分頁已失效，請重新整理頁面", 400);
    throw error;
  }

  const folders = result.delimitedPrefixes.map((prefixKey) => {
    const key = prefixKey.replace(/\/$/, "");
    return { key, name: key.split("/").pop() ?? key } satisfies FolderItem;
  });
  const contents = result.objects
    .filter((object) => options.includePrefixObject || object.key !== prefix)
    .map((object) => ({
      key: object.key,
      size: object.size,
      lastModified: object.uploaded.toISOString(),
    }));

  return { folders, contents, nextCursor: result.truncated ? result.cursor : undefined };
}

async function listPrefixEntries(
  prefix: string,
  options: { includePrefixObject?: boolean; recursive?: boolean },
) {
  const keys: string[] = [];
  const folders: string[] = [];
  let cursor: string | undefined;
  const searchPrefix = buildFolderKey(normalizePath(prefix));

  do {
    const page = await listPage(searchPrefix, {
      cursor,
      includePrefixObject: options.includePrefixObject,
      ...(options.recursive === false ? { delimiter: "/" } : {}),
    });
    keys.push(...page.contents.map((item) => item.key));
    folders.push(...page.folders.map((folder) => folder.key));
    cursor = page.nextCursor;
  } while (cursor);

  return { keys, folders };
}

// 收集指定 Prefix 下的所有 Key (用於刪除或移動資料夾)
export async function collectKeys(
  prefix: string,
  options: { includePrefixObject?: boolean; recursive?: boolean } = {},
) {
  return (await listPrefixEntries(prefix, options)).keys;
}

// 只列出資料夾的直接子項：物件 key（含資料夾標記本身）與子資料夾路徑（不含結尾 /）。
export async function listDirectEntries(prefix: string) {
  return listPrefixEntries(prefix, { includePrefixObject: true, recursive: false });
}

// 只需知道前綴下有沒有物件時只讀一筆，不把整個子樹列完。
export async function prefixHasObjects(prefix: string) {
  const searchPrefix = buildFolderKey(normalizePath(prefix));
  return (await listPage(searchPrefix, { limit: 1, includePrefixObject: true })).contents.length > 0;
}

// ── 物件操作 ──

export async function objectExists(key: string) {
  return (await getBucket().head(key)) !== null;
}

export async function putObject(key: string, body: Blob | Uint8Array, contentType?: string) {
  await getBucket().put(key, body, contentType ? { httpMetadata: { contentType } } : undefined);
}

// 批次刪除物件（binding 每次最多 1000 個 key）
export async function deleteObjects(keys: string[]) {
  for (let offset = 0; offset < keys.length; offset += 1000) {
    await getBucket().delete(keys.slice(offset, offset + 1000));
  }
}

/**
 * 在 Bucket 內複製物件，目的地已存在時不覆寫。
 * binding 沒有伺服器端複製：讀出來源後直接把內容串流寫入目的地，並保留 Content-Type 等中繼資料。
 */
export async function copyObjectWithinBucket(sourceKey: string, targetKey: string) {
  const bucket = getBucket();
  const source = await bucket.get(sourceKey);
  // 改名、移動、解散、移入與還原垃圾桶都共用這裡，訊息不限定垃圾桶情境。
  if (!source) throw new R2ActionError("項目已不存在，請重新整理後再試", 404);

  const copied = await bucket.put(targetKey, source.body, {
    httpMetadata: source.httpMetadata,
    customMetadata: source.customMetadata,
    // 條件在寫入時檢查，避免同時進行的操作覆寫已存在的目的地。
    onlyIf: new Headers({ "If-None-Match": "*" }),
  });
  if (!copied) throw new R2ActionError("目的地已有同名項目，請重新整理後再試", 409);
  // 確認寫入的大小一致後才讓呼叫端刪除來源；不一致的副本由這裡移除，來源保留。
  if (copied.size !== source.size) {
    await bucket.delete(targetKey);
    throw new Error("R2 did not confirm the object copy");
  }
}
