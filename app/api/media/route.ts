import { NextRequest, NextResponse } from "next/server";

import { MAX_FOLDER_DEPTH, MAX_FOLDER_NAME_LENGTH } from "@/lib/constants";
import { requireAdmin } from "@/lib/ensure-admin";
import { getDepth } from "@/lib/path";
import {
  batchDelete,
  batchMove,
  createFolder,
  listMedia,
  moveFile,
  moveFolder,
  renameFile,
  renameFolder,
} from "@/lib/r2";

type BatchItem = { key: string; isFolder?: boolean };

// 解析並驗證批次操作的項目陣列
function parseBatchItems(value: unknown): BatchItem[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const items: BatchItem[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return null;
    const key = (raw as { key?: unknown }).key;
    if (typeof key !== "string" || !key) return null;
    items.push({ key, isFolder: Boolean((raw as { isFolder?: unknown }).isFolder) });
  }
  return items;
}

// 設定 Edge Runtime 以相容 Cloudflare Pages 部署
export const runtime = "edge";

// 驗證建立資料夾請求
export function validateCreateFolder(prefix: string, name: string | undefined) {
  if (!name) return "資料夾名稱不可為空";

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

    const body = await request.json();

    if (body?.action === "validate") {
      return NextResponse.json({ ok: true });
    }

    if (body?.action !== "create-folder") {
      return NextResponse.json({ error: "未知的請求" }, { status: 400 });
    }

    const validationError = validateCreateFolder(body.prefix || "", body.name);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const folder = await createFolder(body.prefix || "", body.name);
    return NextResponse.json({ folder });
  } catch (error) {
    console.error("Failed to create folder", error);
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

    const body = await request.json();

    // 批次移動：將多個項目移動到同一個目標路徑
    if (body?.action === "batch-move") {
      const items = parseBatchItems(body.items);
      if (!items) {
        return NextResponse.json({ error: "缺少要移動的項目" }, { status: 400 });
      }
      if (!("targetPrefix" in body)) {
        return NextResponse.json({ error: "缺少目標路徑" }, { status: 400 });
      }

      const hasFolder = items.some((item) => item.isFolder);
      const moveError = validateMoveTarget(body.targetPrefix || "", hasFolder);
      if (moveError) {
        return NextResponse.json({ error: moveError }, { status: 400 });
      }

      await batchMove(
        items.map((item) => ({ key: item.key, isFolder: Boolean(item.isFolder) })),
        body.targetPrefix || "",
      );
      return NextResponse.json({ ok: true });
    }

    if (body?.action !== "rename" && body?.action !== "move") {
      return NextResponse.json({ error: "未知的請求" }, { status: 400 });
    }

    if (!body.key) {
      return NextResponse.json({ error: "缺少必要參數" }, { status: 400 });
    }

    if (body.action === "rename") {
      if (!body.newName) {
        return NextResponse.json({ error: "缺少必要參數" }, { status: 400 });
      }

      const renameError = validateRenameFolder(body.isFolder, body.newName);
      if (renameError) {
        return NextResponse.json({ error: renameError }, { status: 400 });
      }

      if (body.isFolder) {
        const folder = await renameFolder(body.key, body.newName);
        return NextResponse.json({ folder });
      }

      const media = await renameFile(body.key, body.newName);
      return NextResponse.json({ media });
    }

    if (!("targetPrefix" in body)) {
      return NextResponse.json({ error: "缺少目標路徑" }, { status: 400 });
    }

    const moveError = validateMoveTarget(
      body.targetPrefix || "",
      body.isFolder,
    );
    if (moveError) {
      return NextResponse.json({ error: moveError }, { status: 400 });
    }

    if (body.isFolder) {
      const folder = await moveFolder(body.key, body.targetPrefix || "");
      return NextResponse.json({ folder });
    }

    const media = await moveFile(body.key, body.targetPrefix || "");
    return NextResponse.json({ media });
  } catch (error) {
    console.error("Failed to rename item", error);
    return NextResponse.json({ error: "重新命名失敗" }, { status: 500 });
  }
}

/**
 * DELETE: 刪除檔案或資料夾
 */
export async function DELETE(request: NextRequest) {
  try {
    const authError = await requireAdmin(request);
    if (authError) return authError;

    const body = await request.json();

    // 批次刪除：一次刪除多個檔案與資料夾
    if (body?.action === "batch-delete") {
      const items = parseBatchItems(body.items);
      if (!items) {
        return NextResponse.json({ error: "缺少要刪除的項目" }, { status: 400 });
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
