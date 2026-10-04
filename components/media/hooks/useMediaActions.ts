import { useState } from "react";
import { MAX_BATCH_ITEMS, MAX_FOLDER_DEPTH, MAX_FOLDER_NAME_LENGTH } from '@/lib/constants';

import { getDepth, sanitizeName } from '@/lib/path';
import { FolderItem, MediaFile, MediaTarget, MessageTone } from "../types";

type BatchItem = MediaTarget;

type UseMediaActionsProps = {
  authorizedFetch: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response>;
  requestAdminToken: (promptMessage?: string) => Promise<boolean>;
  pushMessage: (text: string, tone: MessageTone) => void;
  loadMedia: (prefix?: string, options?: { silent?: boolean }) => Promise<void>;
  removeLocalItems: (items: BatchItem[]) => void;
  upsertLocalItems: (items: { files?: MediaFile[]; folders?: FolderItem[]; prefix?: string }) => void;
  currentPrefix: string;
  refreshUsage: (force?: boolean) => void | Promise<void>;
};

// 依 HTTP 狀態碼給出更明確的失敗訊息；401 通常代表管理 session 已逾時。
async function describeActionFailure(response: Response, fallback: string) {
  if (response.status === 401) return "管理模式已逾時，請重新輸入密碼後再試一次。";
  if (response.status === 429) return "操作過於頻繁，請稍後再試。";
  const body = await response.json().catch(() => null) as { error?: unknown } | null;
  if (typeof body?.error === 'string') return body.error;
  return fallback;
}

function normalizePrefix(prefix: string) {
  return prefix.replace(/^\/+|\/+$/g, "").trim();
}

function getParentPrefix(key: string) {
  const parts = normalizePrefix(key).split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

function isAlreadyInTargetParent(item: BatchItem, targetPrefix: string) {
  return getParentPrefix(item.key) === normalizePrefix(targetPrefix);
}

function readConfirmedRename(data: unknown, isFolder: boolean): string | null {
  if (!data || typeof data !== "object") return null;
  const body = data as Record<string, unknown>;

  if (isFolder) {
    const folder = body.folder;
    if (!folder || typeof folder !== "object") return null;
    const value = folder as Record<string, unknown>;
    if (typeof value.key !== "string" || typeof value.name !== "string") return null;
    return value.name;
  }

  const media = body.media;
  if (!media || typeof media !== "object") return null;
  const value = media as Record<string, unknown>;
  if (
    typeof value.key !== "string" ||
    typeof value.url !== "string" ||
    (value.type !== "image" && value.type !== "video")
  ) {
    return null;
  }

  return value.key.split("/").pop() ?? value.key;
}

/**
 * useMediaActions Hook: 媒體與資料夾操作邏輯
 * 採樂觀更新：先即時調整本地清單，再於背景與伺服器對帳，操作失敗時自動還原。
 */
export function useMediaActions({
  authorizedFetch,
  requestAdminToken,
  pushMessage,
  loadMedia,
  removeLocalItems,
  upsertLocalItems,
  currentPrefix,
  refreshUsage,
}: UseMediaActionsProps) {
  const [renameTarget, setRenameTarget] = useState<MediaTarget | null>(null);
  const refreshListing = () => void loadMedia(currentPrefix, { silent: true });

  // 建立新資料夾（回傳是否成功，供對話框決定是否關閉）
  const handleCreateFolder = async (name: string): Promise<boolean> => {
    const allowed = await requestAdminToken("請輸入管理密碼以建立資料夾");
    if (!allowed) return false;

    const safeName = sanitizeName(name);

    if (!safeName) {
      pushMessage("請輸入資料夾名稱", "error");
      return false;
    }

    if (safeName.length > MAX_FOLDER_NAME_LENGTH) {
      pushMessage("資料夾名稱最多 30 個字", "error");
      return false;
    }

    const nextDepth = getDepth(currentPrefix) + 1;
    if (nextDepth > MAX_FOLDER_DEPTH) {
      pushMessage("資料夾層數最多兩層，無法在此建立新資料夾", "error");
      return false;
    }

    try {
      const response = await authorizedFetch("/api/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create-folder",
          name: safeName,
          prefix: currentPrefix,
        }),
      });

      if (!response.ok) {
        pushMessage(await describeActionFailure(response, "建立資料夾失敗"), "error");
        return false;
      }

      pushMessage("已建立新資料夾", "success");
      const data = (await response.json().catch(() => null)) as { folder?: FolderItem } | null;
      await loadMedia(currentPrefix, { silent: true });
      if (data?.folder && typeof data.folder.key === 'string' && typeof data.folder.name === 'string') {
        upsertLocalItems({ folders: [data.folder], prefix: currentPrefix });
      }
      return true;
    } catch {
      pushMessage("建立資料夾時發生錯誤，請稍後再試。", "error");
      return false;
    }
  };

  const openRename = async (target: MediaTarget) => {
    if (await requestAdminToken("請輸入管理密碼以重新命名")) setRenameTarget(target);
  };

  const handleRename = async (newName: string): Promise<boolean> => {
    if (!renameTarget || !newName) return false;
    try {
      const response = await authorizedFetch("/api/media", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rename", ...renameTarget, newName }),
      });
      if (!response.ok) {
        pushMessage(await describeActionFailure(response, "重新命名失敗，請稍後再試"), "error");
        await loadMedia(currentPrefix, { silent: true });
        return false;
      }

      const confirmedRename = readConfirmedRename(await response.json().catch(() => null), renameTarget.isFolder);
      // 更新 key 與 URL 後才關閉對話框，避免立即預覽時仍拿到舊網址。
      await loadMedia(currentPrefix, { silent: true });
      setRenameTarget(null);
      if (!confirmedRename) {
        pushMessage("重新命名完成，但伺服器回傳資料不完整；已重新整理清單。", "info");
      } else {
        pushMessage(confirmedRename !== newName ? `已更新名稱為「${confirmedRename}」` : "已更新名稱", "success");
      }
      return true;
    } catch {
      pushMessage("重新命名時發生錯誤，請稍後再試。", "error");
      await loadMedia(currentPrefix, { silent: true });
      return false;
    }
  };

  // 單筆、批次與拖曳共用同一個移動流程。
  const handleMove = async (items: BatchItem[], targetPrefix: string): Promise<boolean> => {
    if (items.length === 0) return false;
    if (items.length > MAX_BATCH_ITEMS) {
      pushMessage(`每批最多移動 ${MAX_BATCH_ITEMS} 個項目，請分批操作。`, 'error');
      return false;
    }
    const normalizedTargetPrefix = normalizePrefix(targetPrefix);
    const movableItems = items.filter(
      (item) => !isAlreadyInTargetParent(item, normalizedTargetPrefix),
    );
    const skippedCount = items.length - movableItems.length;

    if (movableItems.length === 0) {
      pushMessage("所選項目都已在目標資料夾，未移動。", "info");
      return true;
    }

    // 只移除真的會離開目前資料夾的項目；同資料夾 no-op 必須留在畫面上。
    removeLocalItems(movableItems);
    try {
      const response = await authorizedFetch("/api/media", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "batch-move",
          items: movableItems,
          targetPrefix: normalizedTargetPrefix,
        }),
      });
      if (!response.ok) {
        pushMessage(await describeActionFailure(response, "批次移動失敗，請稍後再試"), "error");
        await loadMedia(currentPrefix, { silent: true });
        return false;
      }
      pushMessage(
        skippedCount > 0
          ? `已移動 ${movableItems.length} 個項目；略過 ${skippedCount} 個已在目標資料夾的項目。`
          : `已移動 ${movableItems.length} 個項目`,
        skippedCount > 0 ? "info" : "success",
      );
      refreshListing();
      return true;
    } catch {
      pushMessage("批次移動時發生錯誤，請稍後再試。", "error");
      await loadMedia(currentPrefix, { silent: true });
    }
    return false;
  };

  // 把刪除送到伺服器（樂觀移除與 Undo 由呼叫端負責，這裡不再動本地清單或顯示成功訊息）
  const commitDeleteOnServer = async (items: BatchItem[]) => {
    if (items.length === 0) return;
    try {
      const response = await authorizedFetch("/api/media", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "batch-delete", items }),
      });
      if (!response.ok) {
        pushMessage(await describeActionFailure(response, "刪除失敗，請稍後再試"), "error");
        await loadMedia(currentPrefix, { silent: true });
        return;
      }
      void refreshUsage(true);
      refreshListing();
    } catch {
      pushMessage("刪除時發生錯誤，請稍後再試。", "error");
      await loadMedia(currentPrefix, { silent: true });
    }
  };

  return {
    handleCreateFolder,
    renameTarget,
    setRenameTarget,
    openRename,
    handleRename,
    handleMove,
    commitDeleteOnServer,
  };
}
