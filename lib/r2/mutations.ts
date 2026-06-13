import { MAX_FOLDER_DEPTH } from "@/components/media/constants";

import { getDepth, sanitizeName, sanitizePath } from "../path";

import {
  FolderItem,
  MediaFile,
  buildEndpointPath,
  buildFolderKey,
  buildObjectKey,
  collectKeys,
  copyObjectWithinBucket,
  deleteObjects,
  encodeKeyForUrl,
  getEnv,
  inferType,
  normalizePath,
  signedFetch,
} from "./core";
import { clearUsageCache, listMedia } from "./queries";

const MAX_FILE_NAME_LENGTH = 255;

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
async function listExistingFileNames(
  prefix: string,
  options: { excludeKey?: string } = {},
) {
  const listing = await listMedia(prefix);
  const existingNames = new Set<string>();

  for (const file of listing.files) {
    if (options.excludeKey && file.key === options.excludeKey) continue;
    const name = file.key.split("/").pop();
    if (name) existingNames.add(name);
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

// 上傳檔案至 R2
export async function uploadToR2(file: File, targetPrefix = "") {
  const normalizedPrefix = sanitizePath(targetPrefix);
  if (getDepth(normalizedPrefix) > MAX_FOLDER_DEPTH) {
    throw new Error("資料夾層數最多兩層，請選擇較淺的路徑");
  }

  const sanitizedFileName = sanitizeName(file.name);

  if (!sanitizedFileName) {
    throw new Error("Invalid file name");
  }

  if (sanitizedFileName.startsWith("..")) {
    throw new Error("檔案名稱包含無效路徑片段");
  }

  if (sanitizedFileName.length > MAX_FILE_NAME_LENGTH) {
    throw new Error(`檔案名稱最多 ${MAX_FILE_NAME_LENGTH} 個字元`);
  }

  const key = `${buildFolderKey(normalizedPrefix)}${Date.now()}-${sanitizedFileName}`;
  const body = new Uint8Array(await file.arrayBuffer());

  const url = buildEndpointPath(`/${getEnv().R2_BUCKET_NAME}/${key}`);
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

  clearUsageCache();
  return {
    key,
    url: encodeKeyForUrl(key, getEnv().R2_PUBLIC_BASE),
    type: inferType(key),
  } satisfies MediaFile;
}

// 建立空資料夾 (以 0-byte object 結尾 / 實作)
export async function createFolder(prefix: string, name: string) {
  const normalizedPrefix = sanitizePath(prefix);
  const normalizedName = sanitizeName(name);
  const folderPath = normalizedPrefix
    ? `${normalizedPrefix}/${normalizedName}`
    : normalizedName;
  const folderKey = `${buildFolderKey(folderPath)}`;

  const url = buildEndpointPath(`/${getEnv().R2_BUCKET_NAME}/${folderKey}`);
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
  const normalizedKey = normalizePath(key);
  const parts = normalizedKey.split("/");
  const parent = parts.slice(0, -1).join("/");

  const currentName = parts[parts.length - 1] ?? "";
  const extension = extractExtension(currentName);
  const sanitizedNewName = sanitizeName(newName);
  const baseName = removeTrailingExtension(sanitizedNewName, extension);
  const parentPrefix = sanitizePath(parent);
  const existingNames = new Set<string>();

  if (parentPrefix || parent === "") {
    const listing = await listMedia(parentPrefix);
    for (const file of listing.files) {
      if (file.key === normalizedKey) continue;
      const name = file.key.split("/").pop();
      if (name) existingNames.add(name);
    }
  }

  const finalName = buildUniqueFileName(baseName, extension, existingNames);

  const newKey = parent ? `${sanitizePath(parent)}/${finalName}` : finalName;

  if (newKey === normalizedKey) {
    return {
      key: newKey,
      url: encodeKeyForUrl(newKey, getEnv().R2_PUBLIC_BASE),
      type: inferType(newKey),
    } satisfies MediaFile;
  }

  const sourceKey = buildObjectKey(normalizedKey);
  const targetKey = buildObjectKey(newKey);

  await copyObjectWithinBucket(sourceKey, targetKey);

  const deleteUrl = buildEndpointPath(`/${getEnv().R2_BUCKET_NAME}/${sourceKey}`);
  const deleteResponse = await signedFetch(deleteUrl, { method: "DELETE" });
  if (!deleteResponse.ok && deleteResponse.status !== 404) {
    throw new Error(
      `Failed to delete old file: ${deleteResponse.status} ${deleteResponse.statusText}`,
    );
  }

  clearUsageCache();
  return {
    key: newKey,
    url: encodeKeyForUrl(targetKey, getEnv().R2_PUBLIC_BASE),
    type: inferType(targetKey),
  } satisfies MediaFile;
}

// 重新命名資料夾 (遞迴移動所有子項目)
export async function renameFolder(key: string, newName: string) {
  const normalizedKey = normalizePath(key);
  const parts = normalizedKey.split("/");
  const parent = parts.slice(0, -1).join("/");
  const newFolderPath = parent
    ? `${sanitizePath(parent)}/${sanitizeName(newName)}`
    : sanitizeName(newName);

  const sourcePrefix = buildFolderKey(normalizedKey);
  const targetPrefix = buildFolderKey(newFolderPath);

  const keys = await collectKeys(normalizedKey, { includePrefixObject: true });

  await Promise.all(
    keys.map((sourceKey) => {
      const targetKey = sourceKey.replace(sourcePrefix, targetPrefix);
      return copyObjectWithinBucket(sourceKey, targetKey);
    }),
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
  const normalizedKey = normalizePath(key);
  const filename = normalizedKey.split("/").pop();
  if (!filename) throw new Error("Invalid file name");

  const safeTargetPrefix = sanitizePath(targetPrefix);
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

  await copyObjectWithinBucket(normalizedKey, newKey);

  const deleteUrl = buildEndpointPath(`/${getEnv().R2_BUCKET_NAME}/${normalizedKey}`);
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
  const normalizedKey = normalizePath(key);
  const folderName = normalizedKey.split("/").pop();
  if (!folderName) throw new Error("Invalid folder");

  const safeTargetPrefix = sanitizePath(targetPrefix);
  const targetFolderPath = safeTargetPrefix
    ? `${safeTargetPrefix}/${folderName}`
    : folderName;

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

  await Promise.all(
    copyTasks.map(({ sourceKey, targetKey }) =>
      copyObjectWithinBucket(sourceKey, targetKey),
    ),
  );

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
  const normalizedKey = normalizePath(folderKey);
  const parent = normalizedKey.split("/").slice(0, -1).join("/");

  const sourcePrefix = buildFolderKey(normalizedKey); // 例如 "trip/"
  const targetPrefixKey = buildFolderKey(sanitizePath(parent)); // 父層 "" 或 "2024/"

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

  await Promise.all(
    copyTasks.map(({ sourceKey, targetKey }) => copyObjectWithinBucket(sourceKey, targetKey)),
  );

  await deleteObjects(keys);
}

// 批次刪除：檔案直接刪除；資料夾則「解包」內容到上一層後移除（較安全、可搭配 Undo）
export async function batchDelete(items: { key: string; isFolder: boolean }[]) {
  const fileKeys = new Set<string>();

  for (const item of items) {
    if (item.isFolder) {
      await dissolveFolder(item.key);
    } else {
      fileKeys.add(normalizePath(item.key));
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
