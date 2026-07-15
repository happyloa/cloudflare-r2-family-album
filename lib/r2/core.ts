import { AwsClient } from "aws4fetch";
import { XMLParser } from "fast-xml-parser";

import { hasPeriodOnlyPathSegment } from "../path";

// ── 型別 ──

type EnvKeys =
  | "R2_ACCOUNT_ID"
  | "R2_ACCESS_KEY_ID"
  | "R2_SECRET_ACCESS_KEY"
  | "R2_BUCKET_NAME"
  | "R2_PUBLIC_BASE";

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

const processEnv = typeof process !== "undefined" ? process.env : undefined;

// 環境變數快取
let cachedEnv: Record<EnvKeys, string> | null = null;

/**
 * 惰性讀取並驗證必要的環境變數
 * 只在首次呼叫時進行驗證，之後使用快取值
 */
export function getEnv(): Record<EnvKeys, string> {
  if (cachedEnv) return cachedEnv;

  const requiredVars: { key: EnvKeys; description: string }[] = [
    { key: "R2_ACCOUNT_ID", description: "Cloudflare 帳戶 ID" },
    { key: "R2_ACCESS_KEY_ID", description: "R2 Access Key" },
    { key: "R2_SECRET_ACCESS_KEY", description: "R2 Secret Key" },
    { key: "R2_BUCKET_NAME", description: "R2 Bucket 名稱" },
    { key: "R2_PUBLIC_BASE", description: "公開存取的基底 URL" },
  ];

  const missing: string[] = [];
  const entries: Partial<Record<EnvKeys, string>> = {};

  for (const { key, description } of requiredVars) {
    const value = processEnv?.[key];
    if (!value) {
      missing.push(`  - ${key}: ${description}`);
    } else {
      entries[key] = value;
    }
  }

  if (missing.length > 0) {
    const message = [
      "缺少必要的環境變數，請確認已正確設定：",
      "",
      ...missing,
      "",
      "提示：請參考 .env.example 檔案並建立 .env.local 設定",
    ].join("\n");
    throw new Error(message);
  }

  cachedEnv = entries as Record<EnvKeys, string>;
  return cachedEnv;
}

// 初始化 XML 解析器 (用於解析 R2 回傳的 XML)
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  textNodeName: "value",
});

let cachedClient: AwsClient | null = null;

// 初始化並快取 AWS Client (aws4fetch)
function getClient() {
  if (cachedClient) return cachedClient;

  cachedClient = new AwsClient({
    accessKeyId: getEnv().R2_ACCESS_KEY_ID,
    secretAccessKey: getEnv().R2_SECRET_ACCESS_KEY,
    service: "s3",
    region: "auto",
  });

  return cachedClient;
}

// ── 路徑 / Key 建構 ──

// 標準化路徑：移除前後斜線
export function normalizePath(path: string) {
  return path.replace(/^\/+|\/+$/g, "").trim();
}

// 建構物件 Key (單一檔案)
export function buildObjectKey(path: string) {
  return normalizePath(path);
}

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

export function encodeR2ObjectKey(key: string) {
  return key.split("/").map(encodeR2PathSegment).join("/");
}

function assertSafeEndpointObjectKey(key: string) {
  if (hasPeriodOnlyPathSegment(key)) {
    throw new Error("Period-only R2 key segments cannot be addressed safely");
  }
}


// 將 Key 編碼為公開 URL
export function encodeKeyForUrl(key: string, base: string) {
  const url = new URL(base);
  const basePath = url.pathname.replace(/\/+$/, "");
  const encodedKey = encodeR2ObjectKey(key);
  return `${url.origin}${basePath}/${encodedKey}${url.search}`;
}

// 編碼用於 Copy Source 的 Header
function encodeCopySource(bucket: string, key: string) {
  return `/${encodeURIComponent(bucket)}/${encodeR2ObjectKey(key)}`;
}

// 跳脫 XML 特殊字元
function escapeXml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// 確保值為陣列
function ensureArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

// 讀取 XML 文字節點
function readTextNode(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (
    typeof value === "object" &&
    "value" in (value as Record<string, unknown>)
  ) {
    const text = (value as { value?: unknown }).value;
    if (text === undefined || text === null) return "";
    return String(text);
  }
  return "";
}

// ── 簽名請求 / 端點 ──

// 執行簽名請求
export async function signedFetch(input: string, init?: RequestInit) {
  const client = getClient();
  return client.fetch(input, init);
}

// 建構 R2 API 端點 URL
export function buildEndpointPath(path: string) {
  const endpoint = `https://${getEnv().R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  return new URL(path, endpoint).toString();
}

export function buildObjectUrl(key: string) {
  assertSafeEndpointObjectKey(key);
  const env = getEnv();
  const endpoint = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const bucket = encodeURIComponent(env.R2_BUCKET_NAME);
  return `${endpoint}/${bucket}/${encodeR2ObjectKey(key)}`;
}

// 建構 List Objects URL
export function buildListUrl(
  prefix: string,
  options: {
    continuationToken?: string;
    delimiter?: string;
    maxKeys?: number;
  } = {},
) {
  const url = new URL(buildEndpointPath(`/${getEnv().R2_BUCKET_NAME}`));
  url.searchParams.set("list-type", "2");
  url.searchParams.set("prefix", prefix);
  if (options.delimiter) {
    url.searchParams.set("delimiter", options.delimiter);
  }
  if (options.maxKeys) {
    url.searchParams.set("max-keys", String(options.maxKeys));
  }
  if (options.continuationToken) {
    url.searchParams.set("continuation-token", options.continuationToken);
  }
  return url;
}

// 根據副檔名推斷媒體類型
export function inferType(key: string): MediaFile["type"] {
  const lowered = key.toLowerCase();
  if (
    lowered.endsWith(".mp4") ||
    lowered.endsWith(".mov") ||
    lowered.endsWith(".webm")
  ) {
    return "video";
  }
  return "image";
}

// ── List 解析與批次操作 ──

export type ParsedListResult = {
  folders: FolderItem[];
  contents: {
    key: string;
    size: number | undefined;
    lastModified: string | undefined;
  }[];
  isTruncated: boolean;
  nextContinuationToken?: string;
};

// 解析 List Objects XML 回傳
export function parseListResult(
  xml: string,
  searchPrefix: string,
  includeFolders: boolean,
  options: { includePrefixObject?: boolean } = {},
): ParsedListResult {
  const parsed = xmlParser.parse(xml).ListBucketResult;

  const folders: FolderItem[] = includeFolders
    ? ensureArray(parsed.CommonPrefixes).map((item: Record<string, unknown>) => {
        const prefixKey = readTextNode(item.Prefix);
        const relativeKey = prefixKey.replace(/\/$/, "");
        const name = relativeKey.split("/").pop() ?? relativeKey;
        return { key: relativeKey, name } as FolderItem;
      })
    : [];

  const contents = ensureArray(parsed.Contents)
    .map((item: Record<string, unknown>) => {
      const key = readTextNode(item.Key);
      if (!key || (!options.includePrefixObject && key === searchPrefix)) {
        return null;
      }

      const sizeText = readTextNode(item.Size);
      const lastModified = readTextNode(item.LastModified) || undefined;

      return {
        key,
        size: sizeText ? Number(sizeText) : undefined,
        lastModified,
      };
    })
    .filter(
      (
        item,
      ): item is {
        key: string;
        size: number | undefined;
        lastModified: string | undefined;
      } => Boolean(item),
    );

  const isTruncated = readTextNode(parsed.IsTruncated) === "true";
  const nextContinuationToken = isTruncated
    ? readTextNode(parsed.NextContinuationToken) || undefined
    : undefined;

  return { folders, contents, isTruncated, nextContinuationToken };
}

// 收集指定 Prefix 下的所有 Key (用於刪除或移動資料夾)
export async function collectKeys(
  prefix: string,
  options: { includePrefixObject?: boolean } = {},
) {
  const keys: string[] = [];
  let continuationToken: string | undefined;
  const searchPrefix = buildFolderKey(normalizePath(prefix));

  do {
    const url = buildListUrl(searchPrefix, { continuationToken });
    const response = await signedFetch(url.toString());
    if (!response.ok) {
      throw new Error(
        `Failed to list folder for processing: ${response.status} ${response.statusText}`,
      );
    }

    const { contents, nextContinuationToken } = parseListResult(
      await response.text(),
      searchPrefix,
      false,
      options,
    );
    keys.push(...contents.map((item) => item.key));
    continuationToken = nextContinuationToken;
  } while (continuationToken);

  return keys;
}

export async function objectExists(key: string) {
  const response = await signedFetch(buildObjectUrl(key), { method: "HEAD" });
  if (response.status === 404) return false;
  if (!response.ok) {
    throw new Error(`Failed to check object: ${response.status} ${response.statusText}`);
  }
  return true;
}

// 批次刪除物件（支援進度回報）
type DeleteObjectsOptions = {
  onProgress?: (deletedCount: number, totalCount: number) => void;
};

export async function deleteObjects(
  keys: string[],
  options: DeleteObjectsOptions = {},
) {
  const totalCount = keys.length;
  let deletedCount = 0;
  const keysToDelete = [...keys]; // 複製陣列避免修改原陣列

  while (keysToDelete.length > 0) {
    const batch = keysToDelete.splice(0, 1000);
    const deleteUrl = buildEndpointPath(`/${getEnv().R2_BUCKET_NAME}?delete`);
    const deleteBody = `<Delete>${batch
      .map((key) => `<Object><Key>${escapeXml(key)}</Key></Object>`)
      .join("")}</Delete>`;

    const deleteResponse = await signedFetch(deleteUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/xml",
      },
      body: deleteBody,
    });

    const resultXml = await deleteResponse.text();
    if (resultXml.trim()) {
      const deleteResult = xmlParser.parse(resultXml).DeleteResult;
      const errors = ensureArray(deleteResult?.Error);
      if (errors.length) {
        throw new Error("R2 reported one or more failed object deletions");
      }
    }

    if (!deleteResponse.ok) {
      throw new Error(
        `Failed to delete objects: ${deleteResponse.status} ${deleteResponse.statusText}`,
      );
    }

    deletedCount += batch.length;
    options.onProgress?.(deletedCount, totalCount);
  }
}

// 在 Bucket 內複製物件
export async function copyObjectWithinBucket(sourceKey: string, targetKey: string) {
  assertSafeEndpointObjectKey(sourceKey);
  const copyUrl = buildObjectUrl(targetKey);
  const copyResponse = await signedFetch(copyUrl, {
    method: "PUT",
    headers: {
      "x-amz-copy-source": encodeCopySource(getEnv().R2_BUCKET_NAME, sourceKey),
      "x-amz-acl": "private",
    },
  });

  if (!copyResponse.ok) {
    throw new Error(
      `Failed to copy object: ${copyResponse.status} ${copyResponse.statusText}`,
    );
  }
}
