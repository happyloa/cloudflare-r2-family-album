import { MAX_FOLDER_DEPTH, MAX_MOVE_ITEMS_PER_REQUEST, MAX_TRASH_ITEMS_PER_REQUEST } from "@/lib/constants";
import type { ValidatedUploadFile } from "@/lib/upload/media-validation";

import { getDepth, hasPeriodOnlyPathSegment, isPeriodOnlyPathSegment, normalizePath, sanitizeName } from "../path";

import {
  FolderItem,
  MediaFile,
  buildFolderKey,
  collectKeys,
  copyObjectWithinBucket,
  deleteObjects,
  encodeKeyForUrl,
  inferType,
  listDirectEntries,
  objectExists,
  prefixHasObjects,
  putObject,
  R2ActionError,
} from "./core";
import { UPLOAD_ID_PREFIX } from "../media-name";
import { clearUsageCache } from "./queries";
import { getTrashRetentionDays, isTrashPath } from '../trash-policy';
import { trashFiles } from './trash';

const MAX_FILE_NAME_LENGTH = 255;
const COPY_CONCURRENCY = 4;

export type UploadFailure = {
  name: string;
  error: string;
};

export type UploadFilesResult = {
  media: MediaFile[];
  failures: UploadFailure[];
};

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
  if (isTrashPath(normalized)) throw new R2ActionError('垃圾桶路徑不能用於一般相簿操作');
  if (hasPeriodOnlyPathSegment(normalized)) {
    throw new Error(`${label} contains an unsafe period-only path segment`);
  }
  return normalized;
}

function normalizeStoredPrefix(prefix: string, label: string) {
  const normalized = normalizePath(prefix);
  if (isTrashPath(normalized)) throw new R2ActionError('垃圾桶路徑不能用於一般相簿操作');
  if (hasPeriodOnlyPathSegment(normalized)) {
    throw new Error(`${label} contains an unsafe period-only path segment`);
  }
  return normalized;
}

function normalizeNewName(value: string, label: string) {
  const normalized = sanitizeName(value);
  if (isTrashPath(normalized)) throw new R2ActionError('此名稱保留給垃圾桶使用');
  if (!normalized || isPeriodOnlyPathSegment(normalized)) {
    throw new Error(`Invalid ${label}`);
  }
  return normalized;
}

function isSameOrDescendantPath(path: string, ancestor: string) {
  return path === ancestor || path.startsWith(`${ancestor}/`);
}

// 不用 String.replace：資料夾名稱可含 `$`，會被當成取代樣式（`$$`、`$&`）而改寫目的地。
function swapKeyPrefix(key: string, sourcePrefix: string, targetPrefix: string) {
  // 列出的 key 不在來源前綴下時寧可中止，也不要切出錯的目的地再刪掉來源。
  if (!key.startsWith(sourcePrefix)) throw new Error("Listed key is outside the source folder");
  return targetPrefix + key.slice(sourcePrefix.length);
}

// 分批複製，任何一批只要有一個失敗，就嘗試刪除這批（含同批次裡其他已成功）以及
// 前面批次已成功複製的目的地物件，再往上拋出原本的錯誤；來源一律保留。
// 回滾只是盡力而為，刪除失敗會被忽略，目的地會留下部分副本：之後改名或移動到
// 同一位置會被「目的地已存在」的檢查回 409，解散則會把殘留副本當成既有檔名另外
// 編號，都需要手動清理。
// 用 allSettled 而非 all，確保回滾前一定等到同批次所有複製都真正結束，
// 不會漏掉跟失敗項目同時仍在進行、稍後才完成的複製。
async function copyObjectsInBatches(tasks: { sourceKey: string; targetKey: string }[]) {
  const completedTargetKeys: string[] = [];

  for (let offset = 0; offset < tasks.length; offset += COPY_CONCURRENCY) {
    const batch = tasks.slice(offset, offset + COPY_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(({ sourceKey, targetKey }) => copyObjectWithinBucket(sourceKey, targetKey)),
    );

    results.forEach((result, index) => {
      if (result.status === "fulfilled") completedTargetKeys.push(batch[index].targetKey);
    });

    const failure = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (failure) {
      if (completedTargetKeys.length > 0) {
        await deleteObjects(completedTargetKeys).catch(() => {
          // 回滾本身失敗也沒有更好的辦法，仍然把原本的複製錯誤往上拋出。
        });
      }
      throw failure.reason;
    }
  }
}

async function assertFolderDestinationAvailable(folderPath: string) {
  const [exactObjectExists, hasNestedObjects] = await Promise.all([
    objectExists(folderPath),
    prefixHasObjects(folderPath),
  ]);

  if (exactObjectExists || hasNestedObjects) {
    throw new R2ActionError("目的地已有同名資料夾或檔案，請選擇其他名稱或位置。", 409);
  }
}

async function assertFileDestinationDoesNotConflictWithFolder(key: string) {
  if (await prefixHasObjects(key)) {
    throw new R2ActionError("目的地已有同名資料夾，請選擇其他名稱或位置。", 409);
  }
}

async function listExistingFileNames(
  prefix: string,
  options: { excludeKey?: string } = {},
) {
  const normalizedPrefix = normalizeStoredPrefix(prefix, "folder path");
  const folderKey = buildFolderKey(normalizedPrefix);
  const keys = await collectKeys(normalizedPrefix, { includePrefixObject: true, recursive: false });
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
// 解散時只列出實際會寫入的資料夾：父層的直接子項，加上父層裡已存在、會收到內容的子資料夾。
// 不遞迴列出父層，根目錄的資料夾才不會為了檢查同名而掃過整個 bucket（含垃圾桶）。
// 子資料夾前綴只代表底下有物件，可能只是待解散的來源本身；標記是否已存在，
// 以該資料夾自己的列表裡有沒有標記物件為準。
async function listDissolveDestinations(parent: string, targetKeys: string[]) {
  const parentKey = buildFolderKey(parent);
  const existingNamesByFolder = new Map<string, Set<string>>();
  const existingKeys = new Set<string>();
  const addKeys = (keys: string[]) => {
    for (const key of keys) {
      if (isTrashPath(key)) continue;
      existingKeys.add(key);
      if (key.endsWith("/")) continue;
      const segments = key.split("/");
      const name = segments.pop();
      if (!name) continue;
      const folderPath = segments.join("/");
      const names = existingNamesByFolder.get(folderPath) ?? new Set<string>();
      names.add(name);
      existingNamesByFolder.set(folderPath, names);
    }
  };

  // 只剩來源自己的標記（空資料夾在根目錄）時不會寫入任何東西，不必列表。
  if (!targetKeys.some(Boolean)) return { existingNamesByFolder, existingKeys };

  const parentEntries = await listDirectEntries(parent);
  addKeys(parentEntries.keys);
  const existingChildren = new Set(parentEntries.folders.filter(folder => !isTrashPath(folder)));

  const targetFolders = new Set<string>();
  for (const targetKey of targetKeys) {
    const folder = targetKey.endsWith("/") ? targetKey.slice(0, -1) : targetKey.split("/").slice(0, -1).join("/");
    if (!folder || folder === parent) continue;
    // 父層沒有這個子資料夾時，底下不會有既有檔名或標記，不必再列。
    const child = `${parentKey}${folder.slice(parentKey.length).split("/")[0]}`;
    if (existingChildren.has(child)) targetFolders.add(folder);
  }
  const listings = await Promise.all([...targetFolders].map(folder => listDirectEntries(folder)));
  for (const { keys } of listings) addKeys(keys);

  return { existingNamesByFolder, existingKeys };
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
// 以時間戳與 UUID 區分同名檔案，先算好 key 再平行上傳。
export async function uploadFilesToR2(
  files: ValidatedUploadFile[],
  targetPrefix = "",
): Promise<UploadFilesResult> {
  const normalizedPrefix = normalizeStoredPrefix(targetPrefix, "target folder");
  if (getDepth(normalizedPrefix) > MAX_FOLDER_DEPTH) {
    throw new Error("資料夾層數最多兩層，請選擇較淺的路徑");
  }

  const folderKey = buildFolderKey(normalizedPrefix);
  // 隨機識別碼已避免跨請求碰撞，上傳前不必遞迴掃描整個資料夾。
  const existingNames = new Set<string>();

  const prepared = files.map(({ file, contentType }) => {
    const sanitizedFileName = resolveUploadFileName(file);
    const candidateName = `${Date.now()}-${crypto.randomUUID()}-${sanitizedFileName}`;
    const finalName = buildUniqueFileNameForConflict(candidateName, existingNames);
    existingNames.add(finalName);
    return { file, contentType, key: `${folderKey}${finalName}` };
  });

  const results = await Promise.allSettled(
    prepared.map(async ({ file, contentType, key }) => {
      // 只使用 server 驗證過的 MIME，不能信任 client 宣告的 File.type。
      await putObject(key, file, contentType);

      return {
        key,
        url: encodeKeyForUrl(key),
        type: inferType(key, contentType),
        size: file.size,
        lastModified: new Date().toISOString(),
      } satisfies MediaFile;
    }),
  );

  const media: MediaFile[] = [];
  const failures: UploadFailure[] = [];

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      media.push(result.value);
      return;
    }

    console.error("R2 upload failed", {
      key: prepared[index].key,
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
    });
    failures.push({
      name: prepared[index].file.name,
      error: "儲存檔案時失敗，請重試。",
    });
  });

  if (media.length > 0) clearUsageCache();
  return { media, failures };
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

  await putObject(folderKey, new Uint8Array());

  clearUsageCache();
  return { key: folderPath, name: normalizedName } satisfies FolderItem;
}

// ── 重新命名 ──

// 檔案重新命名與移動共用複製、確認、刪除來源的流程。
async function relocateFile(sourceKey: string, targetKey: string): Promise<MediaFile> {
  if (sourceKey !== targetKey) {
    await assertFileDestinationDoesNotConflictWithFolder(targetKey);
    await copyObjectWithinBucket(sourceKey, targetKey);
    await deleteObjects([sourceKey]);
    clearUsageCache();
  }
  return {
    key: targetKey,
    url: encodeKeyForUrl(targetKey),
    type: inferType(targetKey),
  };
}

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

  // 保留上傳識別碼：key 的排序位置與上傳時間不變，大資料夾裡改名後的檔案不會跑到還沒載入的分頁。
  const uploadId = currentName.match(UPLOAD_ID_PREFIX)?.[0] ?? "";
  const finalName = buildUniqueFileName(uploadId + baseName, extension, existingNames);

  const newKey = parent ? `${parentPrefix}/${finalName}` : finalName;

  return relocateFile(normalizedKey, newKey);
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
      targetKey: swapKeyPrefix(sourceKey, sourcePrefix, targetPrefix),
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
export async function moveFile(key: string, targetPrefix: string, options: { existingNames?: Set<string> } = {}) {
  const normalizedKey = normalizeStoredKey(key, "file key");
  const filename = normalizedKey.split("/").pop();
  if (!filename) throw new Error("Invalid file name");

  const safeTargetPrefix = normalizeStoredPrefix(targetPrefix, "target folder");
  if (normalizedKey.split('/').slice(0, -1).join('/') === safeTargetPrefix) {
    return relocateFile(normalizedKey, normalizedKey);
  }
  const existingNames = options.existingNames ?? await listExistingFileNames(safeTargetPrefix, {
    excludeKey: normalizedKey,
  });
  const resolvedName = buildUniqueFileNameForConflict(filename, existingNames);
  const newKey = safeTargetPrefix
    ? `${safeTargetPrefix}/${resolvedName}`
    : resolvedName;

  const media = await relocateFile(normalizedKey, newKey);
  existingNames.add(resolvedName);
  return media;
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
    throw new R2ActionError("無法把資料夾移到自己或自己的子資料夾。");
  }

  const targetFolderPath = safeTargetPrefix
    ? `${safeTargetPrefix}/${folderName}`
    : folderName;
  await assertFolderDestinationAvailable(targetFolderPath);

  const sourcePrefix = buildFolderKey(normalizedKey);
  const targetPrefixKey = buildFolderKey(targetFolderPath);

  const keys = await collectKeys(normalizedKey, { includePrefixObject: true });
  const destinationKeys = keys.map(sourceKey => swapKeyPrefix(sourceKey, sourcePrefix, targetPrefixKey));
  if (getDepth(targetFolderPath) > MAX_FOLDER_DEPTH || destinationKeys.some(targetKey => {
    const folderPath = targetKey.endsWith('/') ? targetKey : targetKey.split('/').slice(0, -1).join('/');
    return getDepth(folderPath) > MAX_FOLDER_DEPTH;
  })) {
    throw new R2ActionError("移動後的子資料夾會超過兩層，請選擇較淺的目標位置。");
  }

  // 目的地已確認是空的，換前綴又是一對一，不會撞名，不必再列一次目的地。
  // 外部程式在這段空檔寫入時，由複製的目的地條件回 409 並回滾。
  await copyObjectsInBatches(keys.map((sourceKey, index) => ({ sourceKey, targetKey: destinationKeys[index] })));

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

  // 把 "trip/..." 換成父層前綴："trip/sub/x.jpg" → "sub/x.jpg"（root）或 "2024/sub/x.jpg"
  const mappedKeys = keys.map(sourceKey => swapKeyPrefix(sourceKey, sourcePrefix, targetPrefixKey));

  // 以目的地既有檔名為基準做衝突改名
  const { existingNamesByFolder, existingKeys } = await listDissolveDestinations(parent, mappedKeys);

  const copyTasks: { sourceKey: string; targetKey: string }[] = [];
  const retainedMarkerKeys = new Set<string>();
  for (const [index, sourceKey] of keys.entries()) {
    const mappedKey = mappedKeys[index];

    if (sourceKey.endsWith("/")) {
      if (!mappedKey) continue;
      // 既有標記只保留，不覆寫或加入回滾。子資料夾也可能映射回原資料夾，
      // 例如 trip/trip/ → trip/，來源清理時必須保留這個目的地。
      retainedMarkerKeys.add(mappedKey);
      if (!existingKeys.has(mappedKey)) copyTasks.push({ sourceKey, targetKey: mappedKey });
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

  await deleteObjects(keys.filter(key => !retainedMarkerKeys.has(key)));
}

// 媒體移入垃圾桶；資料夾仍解包到上一層，不刪除內容。
export async function batchDelete(items: { key: string; isFolder: boolean }[]) {
  const fileKeys = new Set<string>();
  for (const item of items) normalizeStoredKey(item.key, item.isFolder ? 'folder key' : 'file key');
  // 解散資料夾也要列表、複製與刪除，和媒體合計每次最多 10 項，與前端分批一致。
  if (items.length > MAX_TRASH_ITEMS_PER_REQUEST) throw new R2ActionError(`每次最多刪除 ${MAX_TRASH_ITEMS_PER_REQUEST} 個項目，請分批操作`);
  const requestedFiles = new Set(items.filter(item => !item.isFolder).map(item => item.key));
  if (requestedFiles.size) getTrashRetentionDays();

  for (const item of items) {
    if (item.isFolder) {
      await dissolveFolder(item.key);
    } else {
      fileKeys.add(normalizeStoredKey(item.key, "file key"));
    }
  }

  if (fileKeys.size > 0) {
    await trashFiles([...fileKeys]);
  }

  clearUsageCache();
}

// 批次移動多個項目到同一個目標路徑（依序處理以避免並行檔名衝突競態）
export async function batchMove(
  items: { key: string; isFolder: boolean }[],
  targetPrefix: string,
) {
  if (items.length > MAX_MOVE_ITEMS_PER_REQUEST) {
    throw new R2ActionError(`每次最多移動 ${MAX_MOVE_ITEMS_PER_REQUEST} 個項目，請分批操作`);
  }
  const destination = normalizeStoredPrefix(targetPrefix, 'target folder');
  for (const item of items) normalizeStoredKey(item.key, item.isFolder ? 'folder key' : 'file key');
  let existingNames: Set<string> | undefined;
  for (const item of items) {
    if (item.isFolder) {
      await moveFolder(item.key, destination);
    } else {
      existingNames ??= await listExistingFileNames(destination);
      await moveFile(item.key, destination, { existingNames });
    }
  }
  clearUsageCache();
}
