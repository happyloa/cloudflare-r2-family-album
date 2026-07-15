import { MAX_FOLDER_DEPTH } from "@/lib/constants";

import { getDepth, hasPeriodOnlyPathSegment, isPeriodOnlyPathSegment, sanitizeName } from "../path";

import {
  FolderItem,
  MediaFile,
  buildObjectUrl,
  buildFolderKey,
  collectKeys,
  copyObjectWithinBucket,
  deleteObjects,
  encodeKeyForUrl,
  getEnv,
  inferType,
  normalizePath,
  signedFetch,
  objectExists,
} from "./core";
import { clearUsageCache } from "./queries";

const MAX_FILE_NAME_LENGTH = 255;
const COPY_CONCURRENCY = 4;

// ── 檔名衝突處理 ──

function extractExtension(name: string) {
  const lastDot = name.lastIndexOf(".");
  return lastDot >= 0 ? name.slice(lastDot) : "";
}

function removeTrailingExtension(name: string, extension: string) {
  if (!extension) return name;
  return name.toLowerCase().endsWith(extension.toLowerCase())
    ? name.slice(0, -extension.length)
    : name;
}

// 產生不重複檔名 (若重複則自動加上編號)
function buildUniqueFileName(
  baseName: string,
  extension: string,
  existingNames: Set<string>,
) {
  let counter = 2;
  let candidate = extension ? `${baseName}${extension}` : baseName;

  while (existingNames.has(candidate)) {
    const numberedBase = `${baseName} (${counter})`;
    candidate = extension ? `${numberedBase}${extension}` : numberedBase;
    counter += 1;
  }

  return candidate;
}

function buildUniqueFileNameForConflict(
  fileName: string,
  existingNames: Set<string>,
) {
  const extension = extractExtension(fileName);
  const baseName = removeTrailingExtension(fileName, extension);
  return buildUniqueFileName(baseName, extension, existingNames);
}

// 列出既有檔名集合 (用於檢查衝突)
function normalizeStoredKey(key: string, label: string) {
  const normalized = normalizePath(key);
  if (!normalized) {
    throw new Error(`Invalid ${label}`);
  }
  if (hasPeriodOnlyPathSegment(normalized)) {
    throw new Error(`${label} contains an unsafe period-only path segment`);
  }
  return normalized;
}

function normalizeStoredPrefix(prefix: string, label: string) {
  const normalized = normalizePath(prefix);
  if (hasPeriodOnlyPathSegment(normalized)) {
    throw new Error(`${label} contains an unsafe period-only path segment`);
  }
  return normalized;
}

function normalizeNewName(value: string, label: string) {
  const normalized = sanitizeName(value);
  if (!normalized || isPeriodOnlyPathSegment(normalized)) {
    throw new Error(`Invalid ${label}`);
  }
  return normalized;
}

function isSameOrDescendantPath(path: string, ancestor: string) {
  return path === ancestor || path.startsWith(`${ancestor}/`);
}

async function copyObjectsInBatches(tasks: { sourceKey: string; targetKey: string }[]) {
  for (let offset = 0; offset < tasks.length; offset += COPY_CONCURRENCY) {
    await Promise.all(
      tasks.slice(offset, offset + COPY_CONCURRENCY).map(({ sourceKey, targetKey }) =>
        copyObjectWithinBucket(sourceKey, targetKey),
      ),
    );
  }
}

async function assertFolderDestinationAvailable(folderPath: string) {
  const [exactObjectExists, nestedKeys] = await Promise.all([
    objectExists(folderPath),
    collectKeys(folderPath, { includePrefixObject: true }),
  ]);

  if (exactObjectExists || nestedKeys.length > 0) {
    throw new Error("A folder or object already exists at the destination");
  }
}

async function assertFileDestinationDoesNotConflictWithFolder(key: string) {
  const nestedKeys = await collectKeys(key, { includePrefixObject: true });
  if (nestedKeys.length > 0) {
    throw new Error("A folder already exists at the destination");
  }
}

async function listExistingFileNames(
  prefix: string,
  options: { excludeKey?: string } = {},
) {
  const normalizedPrefix = normalizeStoredPrefix(prefix, "folder path");
  const folderKey = buildFolderKey(normalizedPrefix);
  const keys = await collectKeys(normalizedPrefix, { includePrefixObject: true });
  const existingNames = new Set<string>();

  for (const key of keys) {
    if (options.excludeKey && key === options.excludeKey) continue;
    if (key === folderKey || key.endsWith("/")) continue;

    const relative = folderKey ? key.slice(folderKey.length) : key;
    if (!relative || relative.includes("/")) continue;
    existingNames.add(relative);
  }


  return existingNames;
}
// 依資料夾列出既有檔名 (用於大量移動時檢查衝突)
async function listExistingFileNamesByFolder(prefix: string) {
  const existingNamesByFolder = new Map<string, Set<string>>();
  const keys = await collectKeys(prefix, { includePrefixObject: true });

  for (const key of keys) {
    if (key.endsWith("/")) continue;
    const segments = key.split("/");
    const name = segments.pop();
    if (!name) continue;
    const folderPath = segments.join("/");
    const names = existingNamesByFolder.get(folderPath) ?? new Set<string>();
    names.add(name);
    existingNamesByFolder.set(folderPath, names);
  }

  return existingNamesByFolder;
}

// ── 上傳 / 建立 ──

// 驗證並清理單一上傳檔名，回傳清理後的檔名（不含時間戳記前綴）
function resolveUploadFileName(file: File) {
  const sanitizedFileName = normalizeNewName(file.name, "file name");

  if (!sanitizedFileName) {
    throw new Error("Invalid file name");
  }

  if (sanitizedFileName.startsWith("..")) {
    throw new Error("檔案名稱包含無效路徑片段");
  }

  if (sanitizedFileName.length > MAX_FILE_NAME_LENGTH) {
    throw new Error(`檔案名稱最多 ${MAX_FILE_NAME_LENGTH} 個字元`);
  }

  return sanitizedFileName;
}

// 批次上傳檔案至 R2。
// 同一批次內若有多個檔案清理後同名（例如兩支手機都叫 IMG_0001.HEIC），
// 由於 Promise.all 平行處理時彼此的 Date.now() 幾乎必定相同，會產生一樣的 key 而互相覆蓋、
// 靜默遺失照片；因此先比照 renameFile/moveFolder 既有的衝突改名邏輯，同步算好每個檔案最終不重複
// 的 key，再平行上傳。
export async function uploadFilesToR2(
  files: File[],
  targetPrefix = "",
): Promise<MediaFile[]> {
  const normalizedPrefix = normalizeStoredPrefix(targetPrefix, "target folder");
  if (getDepth(normalizedPrefix) > MAX_FOLDER_DEPTH) {
    throw new Error("資料夾層數最多兩層，請選擇較淺的路徑");
  }

  const folderKey = buildFolderKey(normalizedPrefix);
  const existingNames = await listExistingFileNames(normalizedPrefix);

  const prepared = files.map((file) => {
    const sanitizedFileName = resolveUploadFileName(file);
    const candidateName = `${Date.now()}-${sanitizedFileName}`;
    const finalName = buildUniqueFileNameForConflict(candidateName, existingNames);
    existingNames.add(finalName);
    return { file, key: `${folderKey}${finalName}` };
  });

  const uploads = await Promise.all(
    prepared.map(async ({ file, key }) => {
      const body = new Uint8Array(await file.arrayBuffer());
      const url = buildObjectUrl(key);
      const response = await signedFetch(url, {
        method: "PUT",
        body,
        headers: {
          // 儲存時帶上檔案類型，讓 R2 與 CDN 能正確推斷 Content-Type
          "Content-Type": file.type || "application/octet-stream",
          "x-amz-acl": "private",
        },
      });

      if (!response.ok) {
        throw new Error(
          `Failed to upload file: ${response.status} ${response.statusText}`,
        );
      }

      return {
        key,
        url: encodeKeyForUrl(key, getEnv().R2_PUBLIC_BASE),
        type: inferType(key),
      } satisfies MediaFile;
    }),
  );

  clearUsageCache();
  return uploads;
}

// 建立空資料夾 (以 0-byte object 結尾 / 實作)
export async function createFolder(prefix: string, name: string) {
  const normalizedPrefix = normalizeStoredPrefix(prefix, "parent folder");
  const normalizedName = normalizeNewName(name, "folder name");
  const folderPath = normalizedPrefix
    ? `${normalizedPrefix}/${normalizedName}`
    : normalizedName;
  const folderKey = `${buildFolderKey(folderPath)}`;
  await assertFolderDestinationAvailable(folderPath);

  const url = buildObjectUrl(folderKey);
  const response = await signedFetch(url, {
    method: "PUT",
    body: new Uint8Array(),
    headers: {
      "x-amz-acl": "private",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to create folder: ${response.status} ${response.statusText}`,
    );
  }

  clearUsageCache();
  return { key: folderPath, name: normalizedName } satisfies FolderItem;
}

// ── 重新命名 ──

// 重新命名檔案
export async function renameFile(key: string, newName: string) {
  const normalizedKey = normalizeStoredKey(key, "file key");
  const parts = normalizedKey.split("/");
  const parent = parts.slice(0, -1).join("/");

  const currentName = parts[parts.length - 1] ?? "";
  const extension = extractExtension(currentName);
  const sanitizedNewName = normalizeNewName(newName, "file name");
  const baseName = removeTrailingExtension(sanitizedNewName, extension);
  const parentPrefix = normalizeStoredPrefix(parent, "parent folder");
  const existingNames = await listExistingFileNames(parentPrefix, { excludeKey: normalizedKey });

  const finalName = buildUniqueFileName(baseName, extension, existingNames);

  const newKey = parent ? `${parentPrefix}/${finalName}` : finalName;

  if (newKey === normalizedKey) {
    return {
      key: newKey,
      url: encodeKeyForUrl(newKey, getEnv().R2_PUBLIC_BASE),
      type: inferType(newKey),
    } satisfies MediaFile;
  }

  await assertFileDestinationDoesNotConflictWithFolder(newKey);
  await copyObjectWithinBucket(normalizedKey, newKey);

  const deleteUrl = buildObjectUrl(normalizedKey);
  const deleteResponse = await signedFetch(deleteUrl, { method: "DELETE" });
  if (!deleteResponse.ok && deleteResponse.status !== 404) {
    throw new Error(
      `Failed to delete old file: ${deleteResponse.status} ${deleteResponse.statusText}`,
    );
  }

  clearUsageCache();
  return {
    key: newKey,
    url: encodeKeyForUrl(newKey, getEnv().R2_PUBLIC_BASE),
    type: inferType(newKey),
  } satisfies MediaFile;
}

// 重新命名資料夾 (遞迴移動所有子項目)
export async function renameFolder(key: string, newName: string) {
  const normalizedKey = normalizeStoredKey(key, "folder key");
  const parts = normalizedKey.split("/");
  const parent = parts.slice(0, -1).join("/");
  const parentPrefix = normalizeStoredPrefix(parent, "parent folder");
  const normalizedName = normalizeNewName(newName, "folder name");
  const newFolderPath = parent
    ? `${parentPrefix}/${normalizedName}`
    : normalizedName;

  if (newFolderPath === normalizedKey) {
    return {
      key: newFolderPath,
      name: newFolderPath.split("/").pop() || newFolderPath,
    } satisfies FolderItem;
  }

  await assertFolderDestinationAvailable(newFolderPath);

  const sourcePrefix = buildFolderKey(normalizedKey);
  const targetPrefix = buildFolderKey(newFolderPath);
  const keys = await collectKeys(normalizedKey, { includePrefixObject: true });

  await copyObjectsInBatches(
    keys.map((sourceKey) => ({
      sourceKey,
      targetKey: sourceKey.replace(sourcePrefix, targetPrefix),
    })),
  );

  await deleteObjects(keys);

  clearUsageCache();
  return {
    key: newFolderPath,
    name: newFolderPath.split("/").pop() || newFolderPath,
  } satisfies FolderItem;
}

// ── 移動 ──

// 移動檔案
export async function moveFile(key: string, targetPrefix: string) {
  const normalizedKey = normalizeStoredKey(key, "file key");
  const filename = normalizedKey.split("/").pop();
  if (!filename) throw new Error("Invalid file name");

  const safeTargetPrefix = normalizeStoredPrefix(targetPrefix, "target folder");
  const existingNames = await listExistingFileNames(safeTargetPrefix, {
    excludeKey: normalizedKey,
  });
  const resolvedName = buildUniqueFileNameForConflict(filename, existingNames);
  const newKey = safeTargetPrefix
    ? `${safeTargetPrefix}/${resolvedName}`
    : resolvedName;

  if (newKey === normalizedKey) {
    return {
      key: newKey,
      url: encodeKeyForUrl(newKey, getEnv().R2_PUBLIC_BASE),
      type: inferType(newKey),
    } satisfies MediaFile;
  }

  await assertFileDestinationDoesNotConflictWithFolder(newKey);
  await copyObjectWithinBucket(normalizedKey, newKey);

  const deleteUrl = buildObjectUrl(normalizedKey);
  const deleteResponse = await signedFetch(deleteUrl, { method: "DELETE" });
  if (!deleteResponse.ok && deleteResponse.status !== 404) {
    throw new Error(
      `Failed to delete old file after move: ${deleteResponse.status} ${deleteResponse.statusText}`,
    );
  }

  clearUsageCache();
  return {
    key: newKey,
    url: encodeKeyForUrl(newKey, getEnv().R2_PUBLIC_BASE),
    type: inferType(newKey),
  } satisfies MediaFile;
}

// 移動資料夾
export async function moveFolder(key: string, targetPrefix: string) {
  const normalizedKey = normalizeStoredKey(key, "folder key");
  const folderName = normalizedKey.split("/").pop();
  if (!folderName) throw new Error("Invalid folder");

  const safeTargetPrefix = normalizeStoredPrefix(targetPrefix, "target folder");
  const parent = normalizedKey.split("/").slice(0, -1).join("/");

  if (safeTargetPrefix === parent) {
    return {
      key: normalizedKey,
      name: folderName,
    } satisfies FolderItem;
  }

  if (isSameOrDescendantPath(safeTargetPrefix, normalizedKey)) {
    throw new Error("Cannot move a folder into itself or one of its descendants");
  }

  const targetFolderPath = safeTargetPrefix
    ? `${safeTargetPrefix}/${folderName}`
    : folderName;
  await assertFolderDestinationAvailable(targetFolderPath);

  const sourcePrefix = buildFolderKey(normalizedKey);
  const targetPrefixKey = buildFolderKey(targetFolderPath);

  const keys = await collectKeys(normalizedKey, { includePrefixObject: true });
  const existingNamesByFolder =
    await listExistingFileNamesByFolder(targetFolderPath);

  const copyTasks: { sourceKey: string; targetKey: string }[] = [];

  for (const sourceKey of keys) {
    const targetKey = sourceKey.replace(sourcePrefix, targetPrefixKey);
    if (sourceKey.endsWith("/")) {
      copyTasks.push({ sourceKey, targetKey });
      continue;
    }

    const segments = targetKey.split("/");
    const fileName = segments.pop();
    if (!fileName) continue;
    const targetFolder = segments.join("/");
    const existingNames =
      existingNamesByFolder.get(targetFolder) ?? new Set<string>();
    const resolvedName = buildUniqueFileNameForConflict(fileName, existingNames);
    existingNames.add(resolvedName);
    existingNamesByFolder.set(targetFolder, existingNames);
    const resolvedTargetKey = targetFolder
      ? `${targetFolder}/${resolvedName}`
      : resolvedName;

    copyTasks.push({ sourceKey, targetKey: resolvedTargetKey });
  }

  await copyObjectsInBatches(copyTasks);

  await deleteObjects(keys);

  clearUsageCache();
  return {
    key: targetFolderPath,
    name: targetFolderPath.split("/").pop() || targetFolderPath,
  } satisfies FolderItem;
}

// ── 批次 ──

// 解包資料夾：把整個子樹「上移一層」到父層（保留子資料夾結構、含重名自動編號），
// 再移除原本的資料夾與其標記。內容不會被刪除，較安全。
export async function dissolveFolder(folderKey: string) {
  const normalizedKey = normalizeStoredKey(folderKey, "folder key");
  const parent = normalizedKey.split("/").slice(0, -1).join("/");

  const sourcePrefix = buildFolderKey(normalizedKey); // 例如 "trip/"
  const targetPrefixKey = buildFolderKey(parent); // 父層 "" 或 "2024/"

  const keys = await collectKeys(normalizedKey, { includePrefixObject: true });
  if (keys.length === 0) return;

  // 以父層既有檔名為基準做衝突改名
  const existingNamesByFolder = await listExistingFileNamesByFolder(parent);

  const copyTasks: { sourceKey: string; targetKey: string }[] = [];
  for (const sourceKey of keys) {
    // 把 "trip/..." 換成父層前綴："trip/sub/x.jpg" → "sub/x.jpg"（root）或 "2024/sub/x.jpg"
    const mappedKey = sourceKey.replace(sourcePrefix, targetPrefixKey);

    if (sourceKey.endsWith("/")) {
      // 資料夾標記：原資料夾本身映射到父層（root 時為空字串）→ 跳過；子資料夾標記照搬保留
      if (mappedKey) copyTasks.push({ sourceKey, targetKey: mappedKey });
      continue;
    }

    const segments = mappedKey.split("/");
    const fileName = segments.pop();
    if (!fileName) continue;
    const targetFolder = segments.join("/");
    const existingNames = existingNamesByFolder.get(targetFolder) ?? new Set<string>();
    const resolvedName = buildUniqueFileNameForConflict(fileName, existingNames);
    existingNames.add(resolvedName);
    existingNamesByFolder.set(targetFolder, existingNames);
    copyTasks.push({
      sourceKey,
      targetKey: targetFolder ? `${targetFolder}/${resolvedName}` : resolvedName,
    });
  }

  await copyObjectsInBatches(copyTasks);

  await deleteObjects(keys);
}

// 批次刪除：檔案直接刪除；資料夾則「解包」內容到上一層後移除（較安全、可搭配 Undo）
export async function batchDelete(items: { key: string; isFolder: boolean }[]) {
  const fileKeys = new Set<string>();

  for (const item of items) {
    if (item.isFolder) {
      await dissolveFolder(item.key);
    } else {
      fileKeys.add(normalizeStoredKey(item.key, "file key"));
    }
  }

  if (fileKeys.size > 0) {
    await deleteObjects([...fileKeys]);
  }

  clearUsageCache();
}

// 批次移動多個項目到同一個目標路徑（依序處理以避免並行檔名衝突競態）
export async function batchMove(
  items: { key: string; isFolder: boolean }[],
  targetPrefix: string,
) {
  for (const item of items) {
    if (item.isFolder) {
      await moveFolder(item.key, targetPrefix);
    } else {
      await moveFile(item.key, targetPrefix);
    }
  }
  clearUsageCache();
}
