import { useState } from "react";

import { AdminActionTarget, AdminActionType } from "../AdminActionModal";
import { MAX_FOLDER_DEPTH, MAX_FOLDER_NAME_LENGTH } from "../constants";
import { getDepth, sanitizeName } from "../sanitize";

type BatchItem = { key: string; isFolder: boolean };

type UseMediaActionsProps = {
  authorizedFetch: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response>;
  requestAdminToken: (promptMessage?: string) => Promise<boolean>;
  pushMessage: (text: string, tone: "info" | "success" | "error") => void;
  loadMedia: (prefix?: string, options?: { silent?: boolean }) => Promise<void>;
  removeLocalItems: (items: BatchItem[]) => void;
  renameLocalItem: (key: string, isFolder: boolean, newName: string) => void;
  currentPrefix: string;
};

// R2 的 List 在寫入後可能有短暫延遲，操作後排程一次背景對帳以校正樂觀更新。
const RECONCILE_DELAY_MS = 1500;

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
  renameLocalItem,
  currentPrefix,
}: UseMediaActionsProps) {
  const [newFolderName, setNewFolderName] = useState("");
  const [adminAction, setAdminAction] = useState<{
    action: AdminActionType;
    target: AdminActionTarget;
  } | null>(null);

  const scheduleReconcile = (prefix = currentPrefix) => {
    window.setTimeout(() => {
      void loadMedia(prefix, { silent: true });
    }, RECONCILE_DELAY_MS);
  };

  // 建立新資料夾
  const handleCreateFolder = async () => {
    const allowed = await requestAdminToken("請輸入管理密碼以建立資料夾");
    if (!allowed) return;

    const safeName = sanitizeName(newFolderName);

    if (!safeName) {
      pushMessage("請輸入資料夾名稱", "error");
      return;
    }

    if (safeName.length > MAX_FOLDER_NAME_LENGTH) {
      pushMessage("資料夾名稱最多 30 個字", "error");
      return;
    }

    const nextDepth = getDepth(currentPrefix) + 1;
    if (nextDepth > MAX_FOLDER_DEPTH) {
      pushMessage("資料夾層數最多兩層，無法在此建立新資料夾", "error");
      return;
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
        pushMessage("建立資料夾失敗", "error");
        return;
      }

      setNewFolderName("");
      pushMessage("已建立新資料夾", "success");
      await loadMedia(currentPrefix, { silent: true });
    } catch {
      pushMessage("建立資料夾時發生錯誤，請稍後再試。", "error");
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
      // 樂觀更新顯示名稱
      renameLocalItem(payload.key, payload.isFolder, payload.newName);
      setAdminAction(null);
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
          pushMessage("重新命名失敗，請稍後再試", "error");
          await loadMedia(currentPrefix, { silent: true });
          return;
        }

        pushMessage("已更新名稱", "success");
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
      removeLocalItems([{ key: payload.key, isFolder: payload.isFolder }]);
      setAdminAction(null);
      try {
        const response = await authorizedFetch("/api/media", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "move",
            key: payload.key,
            targetPrefix: payload.targetPrefix,
            isFolder: payload.isFolder,
          }),
        });

        if (!response.ok) {
          pushMessage("移動失敗，請稍後再試", "error");
          await loadMedia(currentPrefix, { silent: true });
          return;
        }

        pushMessage("已移動完成", "success");
        scheduleReconcile();
      } catch {
        pushMessage("移動時發生錯誤，請稍後再試。", "error");
        await loadMedia(currentPrefix, { silent: true });
      }
      return;
    }

    // 刪除（樂觀移除）
    removeLocalItems([{ key: payload.key, isFolder: payload.isFolder }]);
    setAdminAction(null);
    try {
      const response = await authorizedFetch("/api/media", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete",
          key: payload.key,
          isFolder: payload.isFolder,
        }),
      });

      if (!response.ok) {
        pushMessage("刪除失敗，請稍後再試", "error");
        await loadMedia(currentPrefix, { silent: true });
        return;
      }

      pushMessage("已刪除", "success");
      scheduleReconcile();
    } catch {
      pushMessage("刪除時發生錯誤，請稍後再試。", "error");
      await loadMedia(currentPrefix, { silent: true });
    }
  };

  // 批次移動
  const handleBatchMove = async (items: BatchItem[], targetPrefix: string) => {
    if (items.length === 0) return;
    removeLocalItems(items);
    try {
      const response = await authorizedFetch("/api/media", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "batch-move", items, targetPrefix }),
      });
      if (!response.ok) {
        pushMessage("批次移動失敗，請稍後再試", "error");
        await loadMedia(currentPrefix, { silent: true });
        return;
      }
      pushMessage(`已移動 ${items.length} 個項目`, "success");
      scheduleReconcile();
    } catch {
      pushMessage("批次移動時發生錯誤，請稍後再試。", "error");
      await loadMedia(currentPrefix, { silent: true });
    }
  };

  // 批次刪除
  const handleBatchDelete = async (items: BatchItem[]) => {
    if (items.length === 0) return;
    removeLocalItems(items);
    try {
      const response = await authorizedFetch("/api/media", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "batch-delete", items }),
      });
      if (!response.ok) {
        pushMessage("批次刪除失敗，請稍後再試", "error");
        await loadMedia(currentPrefix, { silent: true });
        return;
      }
      pushMessage(`已刪除 ${items.length} 個項目`, "success");
      scheduleReconcile();
    } catch {
      pushMessage("批次刪除時發生錯誤，請稍後再試。", "error");
      await loadMedia(currentPrefix, { silent: true });
    }
  };

  return {
    newFolderName,
    setNewFolderName,
    handleCreateFolder,
    adminAction,
    setAdminAction,
    openAdminActionModal,
    handleAdminActionConfirm,
    handleBatchMove,
    handleBatchDelete,
  };
}
