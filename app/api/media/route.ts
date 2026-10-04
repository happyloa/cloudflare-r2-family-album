import { NextRequest, NextResponse } from "next/server";

import { MAX_BATCH_ITEMS, MAX_FOLDER_DEPTH, MAX_FOLDER_NAME_LENGTH } from "@/lib/constants";
import { requireAdmin } from "@/lib/ensure-admin";
import { getDepth, hasPeriodOnlyPathSegment, isPeriodOnlyPathSegment, sanitizeName } from "@/lib/path";
import { createLimitedRequest } from "@/lib/upload/body-limit";
import {
  batchDelete,
  batchMove,
  createFolder,
  listMedia,
  moveFile,
  moveFolder,
  renameFile,
  renameFolder,
  R2ActionError,
} from "@/lib/r2";

type BatchItem = { key: string; isFolder?: boolean };
type JsonObject = Record<string, unknown>;

function invalidRequestBody() {
  return NextResponse.json({ error: "請求內容格式錯誤" }, { status: 400 });
}

async function parseJsonObject(
  request: NextRequest,
): Promise<JsonObject | null> {
  try {
    const limited = createLimitedRequest(request, 256 * 1024);
    const body: unknown = await limited.request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return null;
    }

    return body as JsonObject;
  } catch {
    return null;
  }
}

function parseOptionalString(value: unknown): string | null {
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value : null;
}

function parseOptionalBoolean(value: unknown): boolean | null {
  if (value === undefined || value === null) return false;
  return typeof value === "boolean" ? value : null;
}

// 解析並驗證批次操作的項目陣列
function parseBatchItems(value: unknown): BatchItem[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_BATCH_ITEMS) return null;
  const items: BatchItem[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return null;
    const key = (raw as { key?: unknown }).key;
    if (typeof key !== "string" || !key || key.length > 1024 || hasPeriodOnlyPathSegment(key)) return null;
    const isFolder = (raw as { isFolder?: unknown }).isFolder;
    if (isFolder !== undefined && typeof isFolder !== "boolean") return null;
    items.push({ key, isFolder });
  }
  return items;
}

// 驗證建立資料夾請求
export function validateCreateFolder(prefix: string, name: string | undefined) {
  if (!name || !sanitizeName(name) || isPeriodOnlyPathSegment(sanitizeName(name))) return "請輸入有效的資料夾名稱";
  if (hasPeriodOnlyPathSegment(prefix)) return "資料夾路徑無效";

  if (name.length > MAX_FOLDER_NAME_LENGTH) {
    return `資料夾名稱最多 ${MAX_FOLDER_NAME_LENGTH} 個字`;
  }

  if (getDepth(prefix) + 1 > MAX_FOLDER_DEPTH) {
    return "資料夾層數最多兩層，無法在此建立新資料夾";
  }

  return null;
}

// 驗證重新命名資料夾請求
export function validateRenameFolder(
  isFolder: boolean | undefined,
  newName: string,
) {
  if (!sanitizeName(newName) || isPeriodOnlyPathSegment(sanitizeName(newName))) return "請輸入有效的名稱";
  if (newName.length > 255) return "檔案名稱最多 255 個字元";
  if (!isFolder) return null;

  if (newName.length > MAX_FOLDER_NAME_LENGTH) {
    return `資料夾名稱最多 ${MAX_FOLDER_NAME_LENGTH} 個字`;
  }

  return null;
}

// 驗證移動項目請求 (包含深度檢查)
export function validateMoveTarget(
  targetPrefix: string,
  isFolder: boolean | undefined,
) {
  if (hasPeriodOnlyPathSegment(targetPrefix)) return "目標路徑無效";
  const targetDepth = getDepth(targetPrefix);

  if (targetDepth > MAX_FOLDER_DEPTH) {
    return "資料夾層數最多兩層，請選擇較淺的目標路徑";
  }

  if (isFolder && targetDepth + 1 > MAX_FOLDER_DEPTH) {
    return "移動後會超過資料夾層數上限（2 層）";
  }

  return null;
}

/**
 * GET: 取得媒體列表
 */
export async function GET(request: NextRequest) {
  try {
    const prefix = request.nextUrl.searchParams.get("prefix") || "";
    const limitParam = request.nextUrl.searchParams.get("limit");
    const cursor = request.nextUrl.searchParams.get("cursor") || undefined;

    if (cursor && (cursor.length > 2048 || /[\u0000-\u001f]/.test(cursor))) {
      return NextResponse.json(
        { error: "Invalid media cursor", code: "INVALID_CURSOR" },
        { status: 400 },
      );
    }

    const limit = limitParam === null ? undefined : Number(limitParam);
    if (
      limitParam !== null &&
      (!/^\d+$/.test(limitParam) || !Number.isInteger(limit ?? Number.NaN) || (limit ?? 0) < 1 || (limit ?? 201) > 200)
    ) {
      return NextResponse.json(
        { error: "The page size must be between 1 and 200", code: "INVALID_LIMIT" },
        { status: 400 },
      );
    }

    const media = await listMedia(prefix, { cursor, limit });
    return NextResponse.json(media);
  } catch (error) {
    console.error("Failed to list media", error);
    return NextResponse.json({ error: "無法載入媒體列表" }, { status: 500 });
  }
}

/**
 * POST: 處理資料夾建立與權限驗證
 */
export async function POST(request: NextRequest) {
  try {
    const authError = await requireAdmin(request);
    if (authError) return authError;

    const body = await parseJsonObject(request);
    if (!body) return invalidRequestBody();

    if (body?.action === "validate") {
      return NextResponse.json({ ok: true });
    }

    if (body?.action !== "create-folder") {
      return NextResponse.json({ error: "未知的請求" }, { status: 400 });
    }

    const prefix = parseOptionalString(body.prefix);
    if (prefix === null || typeof body.name !== "string") {
      return invalidRequestBody();
    }

    const validationError = validateCreateFolder(prefix, body.name);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const folder = await createFolder(prefix, body.name);
    return NextResponse.json({ folder });
  } catch (error) {
    console.error("Failed to create folder", error);
    if (error instanceof R2ActionError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "建立資料夾失敗" }, { status: 500 });
  }
}

/**
 * PATCH: 處理重新命名與移動
 */
export async function PATCH(request: NextRequest) {
  try {
    const authError = await requireAdmin(request);
    if (authError) return authError;

    const body = await parseJsonObject(request);
    if (!body) return invalidRequestBody();

    // 批次移動：將多個項目移動到同一個目標路徑
    if (body?.action === "batch-move") {
      const items = parseBatchItems(body.items);
      if (!items) {
        return NextResponse.json({ error: `請選擇 1 到 ${MAX_BATCH_ITEMS} 個有效項目。` }, { status: 400 });
      }
      if (!("targetPrefix" in body)) {
        return NextResponse.json({ error: "缺少目標路徑" }, { status: 400 });
      }
      const targetPrefix = parseOptionalString(body.targetPrefix);
      if (targetPrefix === null) return invalidRequestBody();

      const hasFolder = items.some((item) => item.isFolder);
      const moveError = validateMoveTarget(targetPrefix, hasFolder);
      if (moveError) {
        return NextResponse.json({ error: moveError }, { status: 400 });
      }

      await batchMove(
        items.map((item) => ({ key: item.key, isFolder: Boolean(item.isFolder) })),
        targetPrefix,
      );
      return NextResponse.json({ ok: true });
    }

    if (body?.action !== "rename" && body?.action !== "move") {
      return NextResponse.json({ error: "未知的請求" }, { status: 400 });
    }

    if (!body.key) {
      return NextResponse.json({ error: "缺少必要參數" }, { status: 400 });
    }
    if (typeof body.key !== "string") return invalidRequestBody();

    const isFolder = parseOptionalBoolean(body.isFolder);
    if (isFolder === null) return invalidRequestBody();

    if (body.action === "rename") {
      if (!body.newName) {
        return NextResponse.json({ error: "缺少必要參數" }, { status: 400 });
      }
      if (typeof body.newName !== "string") return invalidRequestBody();

      const renameError = validateRenameFolder(isFolder, body.newName);
      if (renameError) {
        return NextResponse.json({ error: renameError }, { status: 400 });
      }

      if (isFolder) {
        const folder = await renameFolder(body.key, body.newName);
        return NextResponse.json({ folder });
      }

      const media = await renameFile(body.key, body.newName);
      return NextResponse.json({ media });
    }

    if (!("targetPrefix" in body)) {
      return NextResponse.json({ error: "缺少目標路徑" }, { status: 400 });
    }
    const targetPrefix = parseOptionalString(body.targetPrefix);
    if (targetPrefix === null) return invalidRequestBody();

    const moveError = validateMoveTarget(
      targetPrefix,
      isFolder,
    );
    if (moveError) {
      return NextResponse.json({ error: moveError }, { status: 400 });
    }

    if (isFolder) {
      const folder = await moveFolder(body.key, targetPrefix);
      return NextResponse.json({ folder });
    }

    const media = await moveFile(body.key, targetPrefix);
    return NextResponse.json({ media });
  } catch (error) {
    console.error("Failed to rename item", error);
    if (error instanceof R2ActionError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "操作失敗，請重新整理清單後確認結果。" }, { status: 500 });
  }
}

/**
 * DELETE: 刪除檔案或資料夾
 */
export async function DELETE(request: NextRequest) {
  try {
    const authError = await requireAdmin(request);
    if (authError) return authError;

    const body = await parseJsonObject(request);
    if (!body) return invalidRequestBody();

    // 批次刪除：一次刪除多個檔案與資料夾
    if (body?.action === "batch-delete") {
      const items = parseBatchItems(body.items);
      if (!items) {
        return NextResponse.json({ error: `請選擇 1 到 ${MAX_BATCH_ITEMS} 個有效項目。` }, { status: 400 });
      }

      await batchDelete(
        items.map((item) => ({ key: item.key, isFolder: Boolean(item.isFolder) })),
      );
      return NextResponse.json({});
    }

    return NextResponse.json({ error: "未知的請求" }, { status: 400 });
  } catch (error) {
    console.error("Failed to delete item", error);
    return NextResponse.json({ error: "刪除失敗" }, { status: 500 });
  }
}
