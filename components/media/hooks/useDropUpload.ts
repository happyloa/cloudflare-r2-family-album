import { useCallback, useEffect, useRef, useState } from 'react';

import { uploadFiles } from '@/lib/upload/client';
import { MAX_TOTAL_SIZE_MB, getSizeLimitByMime } from '@/lib/upload/constants';

const BUCKET_LIMIT_BYTES = 10 * 1024 * 1024 * 1024; // 10GB

type ConfirmFn = (opts: {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}) => Promise<boolean>;

type UseDropUploadProps = {
  currentPrefix: string;
  adminTokenRef: { current: string };
  requestAdminToken: (promptMessage?: string) => Promise<boolean>;
  pushMessage: (text: string, tone: 'info' | 'success' | 'error') => void;
  confirm: ConfirmFn;
  usageBytes: number | null;
  refreshUsage: (force?: boolean) => void | Promise<void>;
  loadMedia: (prefix?: string, options?: { silent?: boolean }) => Promise<void>;
};

/**
 * useDropUpload Hook: 把檔案拖到頁面任意處即上傳，並提供整頁上傳覆蓋層所需狀態。
 * - internalDragRef：站內媒體/資料夾拖曳期間設為 true，避免誤判為外部拖檔
 * - handleDroppedFiles：也供「＋ 新增 → 上傳檔案」的隱藏 input 重用
 */
export function useDropUpload({
  currentPrefix,
  adminTokenRef,
  requestAdminToken,
  pushMessage,
  confirm,
  usageBytes,
  refreshUsage,
  loadMedia
}: UseDropUploadProps) {
  const [dropActive, setDropActive] = useState(false);
  const [dropUploading, setDropUploading] = useState(false);
  const [dropProgress, setDropProgress] = useState(0);
  const dragCounter = useRef(0);
  const internalDragRef = useRef(false);

  const handleDroppedFiles = useCallback(
    async (dropped: File[]) => {
      const selected = dropped.filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/'));
      if (selected.length === 0) {
        pushMessage('沒有可上傳的圖片或影片檔案。', 'error');
        return;
      }
      const within = selected.filter((f) => {
        const limit = getSizeLimitByMime(f.type);
        return typeof limit === 'number' && f.size <= limit;
      });
      const oversized = selected.length - within.length;
      if (within.length === 0) {
        pushMessage('檔案皆超過大小上限，請調整後再上傳。', 'error');
        return;
      }
      const totalSize = within.reduce((sum, f) => sum + f.size, 0);
      if (totalSize > MAX_TOTAL_SIZE_MB * 1024 * 1024) {
        pushMessage(`總容量超過 ${MAX_TOTAL_SIZE_MB}MB，請分批上傳。`, 'error');
        return;
      }

      const overLimit = usageBytes !== null && usageBytes > BUCKET_LIMIT_BYTES;
      if (overLimit) {
        const ok = await confirm({
          title: '容量已超過上限',
          message: '目前貯體容量已超過 10GB，確定仍要上傳嗎？',
          confirmLabel: '仍要上傳',
          danger: true
        });
        if (!ok) return;
      }

      const allowed = await requestAdminToken('請輸入管理密碼以上傳');
      if (!allowed) return;

      setDropUploading(true);
      setDropProgress(0);
      try {
        const response = await uploadFiles({
          files: within,
          path: currentPrefix,
          adminToken: adminTokenRef.current,
          onProgress: (percent) => setDropProgress(percent ?? 0)
        });
        if (!response.ok) {
          pushMessage('上傳失敗，請稍後再試。', 'error');
        } else {
          pushMessage(
            `已上傳 ${within.length} 個檔案${oversized > 0 ? `（略過 ${oversized} 個過大檔案）` : ''}`,
            'success'
          );
          await loadMedia(currentPrefix, { silent: true });
          void refreshUsage(true);
        }
      } catch {
        pushMessage('上傳時發生錯誤，請稍後再試。', 'error');
      } finally {
        setDropUploading(false);
      }
    },
    [currentPrefix, adminTokenRef, requestAdminToken, pushMessage, confirm, usageBytes, refreshUsage, loadMedia]
  );

  useEffect(() => {
    // 只接受「從外部拖入的檔案」：必須帶 Files 型別，且非站內拖曳
    const isExternalFileDrag = (event: DragEvent) =>
      !internalDragRef.current && Array.from(event.dataTransfer?.types ?? []).includes('Files');

    const onDragEnter = (event: DragEvent) => {
      if (!isExternalFileDrag(event)) return;
      event.preventDefault();
      dragCounter.current += 1;
      setDropActive(true);
    };
    const onDragOver = (event: DragEvent) => {
      if (!isExternalFileDrag(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const onDragLeave = (event: DragEvent) => {
      if (!isExternalFileDrag(event)) return;
      dragCounter.current -= 1;
      if (dragCounter.current <= 0) {
        dragCounter.current = 0;
        setDropActive(false);
      }
    };
    const onDrop = (event: DragEvent) => {
      dragCounter.current = 0;
      setDropActive(false);
      if (!isExternalFileDrag(event)) return;
      event.preventDefault();
      const list = event.dataTransfer ? Array.from(event.dataTransfer.files) : [];
      if (list.length) void handleDroppedFiles(list);
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [handleDroppedFiles]);

  return { dropActive, dropUploading, dropProgress, internalDragRef, handleDroppedFiles };
}
