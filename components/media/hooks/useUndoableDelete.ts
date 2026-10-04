import { useEffect, useRef, useState } from 'react';
import { MAX_BATCH_ITEMS } from '@/lib/constants';

import { MessageTone } from '../types';

type Item = { key: string; isFolder: boolean };
type PendingDelete = { items: Item[]; prefix: string };

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
  pushMessage: (text: string, tone: MessageTone) => void;
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
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const pendingDeleteRef = useRef<PendingDelete | null>(null);
  const deleteTimerRef = useRef<number | null>(null);
  const requestInFlightRef = useRef(false);
  const mountedRef = useRef(true);

  const startUndoableDelete = (items: Item[]) => {
    removeLocalItems(items);
    onDeleted?.();
    const pending = { items, prefix: currentPrefix };
    pendingDeleteRef.current = pending;
    setPendingDelete(pending);
    deleteTimerRef.current = window.setTimeout(() => {
      deleteTimerRef.current = null;
      const pending = pendingDeleteRef.current;
      pendingDeleteRef.current = null;
      setPendingDelete(null);
      if (pending) void commitDeleteOnServer(pending.items);
    }, UNDO_WINDOW_MS);
  };

  const undoDelete = () => {
    if (deleteTimerRef.current) {
      window.clearTimeout(deleteTimerRef.current);
      deleteTimerRef.current = null;
    }
    const pending = pendingDeleteRef.current;
    if (!pending) return;
    pendingDeleteRef.current = null;
    setPendingDelete(null);
    if (pending?.prefix === currentPrefix) {
      void loadMedia(currentPrefix, { silent: true });
    }
    pushMessage('已復原刪除', 'info');
  };

  const requestDelete = async (items: Item[]) => {
    if (items.length === 0) return;
    if (items.length > MAX_BATCH_ITEMS) {
      pushMessage(`每批最多刪除 ${MAX_BATCH_ITEMS} 個項目，請分批操作。`, 'error');
      return;
    }
    if (pendingDeleteRef.current || requestInFlightRef.current) {
      pushMessage('上一批項目仍可復原，請先復原或等候刪除完成。', 'info');
      return;
    }
    requestInFlightRef.current = true;
    try {
      const allowed = await requestAdminToken('請輸入管理密碼以刪除項目');
      if (!allowed) return;

      // 資料夾採「解包」：內容移到上一層、不會被刪除；只有檔案是真的刪除
      const hasFolder = items.some((item) => item.isFolder);
      const hasFile = items.some((item) => !item.isFolder);
      const message =
        hasFolder && hasFile
          ? '將刪除選取的檔案，並把資料夾解包（內容移到上一層、不會刪除）。可在數秒內復原。'
          : hasFolder
            ? '將移除資料夾，裡面的內容會移到上一層（不會被刪除）。可在數秒內復原。'
            : `確定刪除選取的 ${items.length} 個檔案？可在數秒內復原。`;
      const ok = await confirm({
        title: '刪除項目',
        message,
        confirmLabel: '確定',
        danger: hasFile
      });
      if (!ok || !mountedRef.current) return;

      startUndoableDelete(items);
    } finally {
      requestInFlightRef.current = false;
    }
  };

  // 離開頁面時取消尚未到期的刪除，保留完整的六秒復原時間。
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (deleteTimerRef.current) window.clearTimeout(deleteTimerRef.current);
      pendingDeleteRef.current = null;
    };
  }, []);

  return { pendingDelete, requestDelete, undoDelete };
}
