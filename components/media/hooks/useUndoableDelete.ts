import { useEffect, useRef, useState } from 'react';

type Item = { key: string; isFolder: boolean };

type ConfirmFn = (opts: {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}) => Promise<boolean>;

type UseUndoableDeleteProps = {
  currentPrefix: string;
  requestAdminToken: (promptMessage?: string) => Promise<boolean>;
  confirm: ConfirmFn;
  pushMessage: (text: string, tone: 'info' | 'success' | 'error') => void;
  removeLocalItems: (items: Item[]) => void;
  commitDeleteOnServer: (items: Item[]) => Promise<void>;
  loadMedia: (prefix?: string, options?: { silent?: boolean }) => Promise<void>;
  onDeleted?: () => void;
};

// 刪除後可在數秒內復原；逾時才真正寫入伺服器
const UNDO_WINDOW_MS = 6000;

/**
 * useUndoableDelete Hook: 仿 Google Drive 的「刪除＋復原」
 * 先樂觀移除並排程，視窗內可復原；含資料夾的刪除因不可逆會先確認。
 */
export function useUndoableDelete({
  currentPrefix,
  requestAdminToken,
  confirm,
  pushMessage,
  removeLocalItems,
  commitDeleteOnServer,
  loadMedia,
  onDeleted
}: UseUndoableDeleteProps) {
  const [pendingDelete, setPendingDelete] = useState<Item[] | null>(null);
  const pendingDeleteRef = useRef<Item[] | null>(null);
  const deleteTimerRef = useRef<number | null>(null);

  // 把尚在 Undo 視窗的刪除確實送出（換資料夾或卸載時無法跨資料夾復原）
  const flushPendingDelete = () => {
    if (deleteTimerRef.current) {
      window.clearTimeout(deleteTimerRef.current);
      deleteTimerRef.current = null;
    }
    const pending = pendingDeleteRef.current;
    pendingDeleteRef.current = null;
    setPendingDelete(null);
    if (pending && pending.length) void commitDeleteOnServer(pending);
  };
  const flushRef = useRef(flushPendingDelete);
  flushRef.current = flushPendingDelete;

  const startUndoableDelete = (items: Item[]) => {
    flushPendingDelete(); // 先送出上一批，避免堆疊
    removeLocalItems(items);
    onDeleted?.();
    pendingDeleteRef.current = items;
    setPendingDelete(items);
    deleteTimerRef.current = window.setTimeout(() => {
      deleteTimerRef.current = null;
      const pending = pendingDeleteRef.current;
      pendingDeleteRef.current = null;
      setPendingDelete(null);
      if (pending) void commitDeleteOnServer(pending);
    }, UNDO_WINDOW_MS);
  };

  const undoDelete = () => {
    if (deleteTimerRef.current) {
      window.clearTimeout(deleteTimerRef.current);
      deleteTimerRef.current = null;
    }
    pendingDeleteRef.current = null;
    setPendingDelete(null);
    void loadMedia(currentPrefix, { silent: true });
    pushMessage('已復原刪除', 'info');
  };

  const requestDelete = async (items: Item[]) => {
    if (items.length === 0) return;
    const allowed = await requestAdminToken('請輸入管理密碼以刪除項目');
    if (!allowed) return;
    if (items.some((item) => item.isFolder)) {
      const ok = await confirm({
        title: '刪除項目',
        message: `確定刪除選取的 ${items.length} 個項目？資料夾會連同內容一併刪除（可在數秒內復原）。`,
        confirmLabel: '刪除',
        danger: true
      });
      if (!ok) return;
    }
    startUndoableDelete(items);
  };

  // 換資料夾或卸載時，把待刪除確實送出
  useEffect(() => {
    return () => flushRef.current();
  }, [currentPrefix]);

  return { pendingDelete, requestDelete, undoDelete };
}
