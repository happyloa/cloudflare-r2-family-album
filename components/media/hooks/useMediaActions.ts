import { useState } from "react";

import { AdminActionTarget, AdminActionType } from "../AdminActionModal";
import { MAX_FOLDER_DEPTH, MAX_FOLDER_NAME_LENGTH } from "../constants";
import { getDepth, sanitizeName } from "../sanitize";
import { FolderItem, MediaFile, MessageTone } from "../types";

type BatchItem = { key: string; isFolder: boolean };

type ConfirmedRename = {
  key: string;
  name: string;
  url?: string;
};

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
};

// R2 的 List 在寫入後可能有短暫延遲，操作後排程一次背景對帳以校正樂觀更新。
const RECONCILE_DELAY_MS = 1500;

// 依 HTTP 狀態碼給出更明確的失敗訊息；401 通常代表管理 session 已逾時。
function describeActionFailure(status: number, fallback: string) {
  if (status === 401) return "管理模式已逾時，請重新輸入密碼後再試一次。";
  if (status === 429) return "操作過於頻繁，請稍後再試。";
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

function readConfirmedRename(data: unknown, isFolder: boolean): ConfirmedRename | null {
  if (!data || typeof data !== "object") return null;
  const body = data as Record<string, unknown>;

  if (isFolder) {
    const folder = body.folder;
    if (!folder || typeof folder !== "object") return null;
    const value = folder as Record<string, unknown>;
    if (typeof value.key !== "string" || typeof value.name !== "string") return null;
    return { key: value.key, name: value.name };
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

  return {
    key: value.key,
    name: value.key.split("/").pop() ?? value.key,
    url: value.url,
  };
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
}: UseMediaActionsProps) {
  const [adminAction, setAdminAction] = useState<{
    action: AdminActionType;
    target: AdminActionTarget;
  } | null>(null);

  const scheduleReconcile = (prefix = currentPrefix) => {
    window.setTimeout(() => {
      void loadMedia(prefix, { silent: true });
    }, RECONCILE_DELAY_MS);
  };

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
        pushMessage(describeActionFailure(response.status, "建立資料夾失敗"), "error");
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

  // 開啟管理操作確認視窗 (Rename/Move/Delete)
  const openAdminActionModal = async (
    action: AdminActionType,
    key: string,
    isFolder: boolean,
  ) => {
    const promptMap: Record<AdminActionType, string> = {
      rename: "請輸入管理密碼以重新命名",
      move: "請輸入管理密碼以移動項目",
      delete: "請輸入管理密碼以刪除項目",
    };
    const allowed = await requestAdminToken(promptMap[action]);
    if (!allowed) return;

    setAdminAction({ action, target: { key, isFolder } });
  };

  // 確認執行管理操作
  const handleAdminActionConfirm = async (payload: {
    action: AdminActionType;
    key: string;
    isFolder: boolean;
    newName?: string;
    targetPrefix?: string;
  }) => {
    // 重新命名
    if (payload.action === "rename") {
      if (!payload.newName) return;
      try {
        const response = await authorizedFetch("/api/media", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "rename",
            key: payload.key,
            newName: payload.newName,
            isFolder: payload.isFolder,
          }),
        });

        if (!response.ok) {
          pushMessage(describeActionFailure(response.status, "重新命名失敗，請稍後再試"), "error");
          await loadMedia(currentPrefix, { silent: true });
          return;
        }

        // 重新命名會同時改變檔案 key 與公開 URL。維持對話框的 submitting 狀態，
        // 直到用伺服器確認後的清單完整取代本地資料，避免使用者立即預覽/開啟時
        // 仍拿到舊 key 或舊 URL。
        const confirmedRename = readConfirmedRename(
          await response.json().catch(() => null),
          payload.isFolder,
        );
        await loadMedia(currentPrefix, { silent: true });
        setAdminAction(null);

        if (!confirmedRename) {
          pushMessage("重新命名完成，但伺服器回傳資料不完整；已重新整理清單。", "info");
          scheduleReconcile();
          return;
        }

        const adjustedName = confirmedRename.name !== payload.newName;
        pushMessage(
          adjustedName ? `已更新名稱為「${confirmedRename.name}」` : "已更新名稱",
          "success",
        );
        scheduleReconcile();
      } catch {
        pushMessage("重新命名時發生錯誤，請稍後再試。", "error");
        await loadMedia(currentPrefix, { silent: true });
      }
      return;
    }

    // 移動（項目離開目前資料夾，樂觀移除）
    if (payload.action === "move") {
      if (payload.targetPrefix === undefined) return;
      const targetPrefix = normalizePrefix(payload.targetPrefix);
      if (isAlreadyInTargetParent({ key: payload.key, isFolder: payload.isFolder }, targetPrefix)) {
        setAdminAction(null);
        pushMessage(payload.isFolder ? "資料夾已在目標位置，未移動。" : "媒體已在目標資料夾，未移動。", "info");
        return;
      }

      removeLocalItems([{ key: payload.key, isFolder: payload.isFolder }]);
      setAdminAction(null);
      try {
        const response = await authorizedFetch("/api/media", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "move",
            key: payload.key,
            targetPrefix,
            isFolder: payload.isFolder,
          }),
        });

        if (!response.ok) {
          pushMessage(describeActionFailure(response.status, "移動失敗，請稍後再試"), "error");
          await loadMedia(currentPrefix, { silent: true });
          return;
        }

        pushMessage("已移動完成", "success");
        scheduleReconcile();
      } catch {
        pushMessage("移動時發生錯誤，請稍後再試。", "error");
        await loadMedia(currentPrefix, { silent: true });
      }
    }
    // 刪除已改走 MediaGrid 的 Undo 流程（commitDeleteOnServer），此處不再處理
  };

  // 批次移動
  const handleBatchMove = async (items: BatchItem[], targetPrefix: string) => {
    if (items.length === 0) return;
    const normalizedTargetPrefix = normalizePrefix(targetPrefix);
    const movableItems = items.filter(
      (item) => !isAlreadyInTargetParent(item, normalizedTargetPrefix),
    );
    const skippedCount = items.length - movableItems.length;

    if (movableItems.length === 0) {
      pushMessage("所選項目都已在目標資料夾，未移動。", "info");
      return;
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
        pushMessage(describeActionFailure(response.status, "批次移動失敗，請稍後再試"), "error");
        await loadMedia(currentPrefix, { silent: true });
        return;
      }
      pushMessage(
        skippedCount > 0
          ? `已移動 ${movableItems.length} 個項目；略過 ${skippedCount} 個已在目標資料夾的項目。`
          : `已移動 ${movableItems.length} 個項目`,
        skippedCount > 0 ? "info" : "success",
      );
      scheduleReconcile();
    } catch {
      pushMessage("批次移動時發生錯誤，請稍後再試。", "error");
      await loadMedia(currentPrefix, { silent: true });
    }
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
        pushMessage(describeActionFailure(response.status, "刪除失敗，請稍後再試"), "error");
        await loadMedia(currentPrefix, { silent: true });
        return;
      }
      scheduleReconcile();
    } catch {
      pushMessage("刪除時發生錯誤，請稍後再試。", "error");
      await loadMedia(currentPrefix, { silent: true });
    }
  };

  return {
    handleCreateFolder,
    adminAction,
    setAdminAction,
    openAdminActionModal,
    handleAdminActionConfirm,
    handleBatchMove,
    commitDeleteOnServer,
  };
}
