import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchUploadLimits, uploadFiles } from '@/lib/upload/client';
import {
  getSizeLimitByMime,
  isAllowedMediaMime,
  type UploadLimits,
} from '@/lib/upload/constants';

import { BUCKET_LIMIT_BYTES } from '../constants';
import { MediaFile, MessageTone } from '../types';

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
  pushMessage: (text: string, tone: MessageTone) => void;
  confirm: ConfirmFn;
  usageBytes: number | null;
  refreshUsage: (force?: boolean) => void | Promise<void>;
  loadMedia: (prefix?: string, options?: { silent?: boolean }) => Promise<void>;
  upsertLocalItems: (items: { files?: MediaFile[]; prefix?: string }) => void;
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
  loadMedia,
  upsertLocalItems
}: UseDropUploadProps) {
  const [dropActive, setDropActive] = useState(false);
  const [dropUploading, setDropUploading] = useState(false);
  const [dropProgress, setDropProgress] = useState(0);
  const dragCounter = useRef(0);
  const internalDragRef = useRef(false);
  const uploadInFlightRef = useRef(false);

  const handleDroppedFiles = useCallback(
    async (dropped: File[]) => {
      if (uploadInFlightRef.current) {
        pushMessage('正在處理上傳，請稍候。', 'info');
        return;
      }

      const selected = dropped.filter((file) => isAllowedMediaMime(file.type));
      const unsupported = dropped.length - selected.length;
      if (selected.length === 0) {
        pushMessage('僅接受 JPEG、PNG、WebP、GIF、AVIF、HEIC、MP4、WebM 或 MOV 檔案。', 'error');
        return;
      }

      uploadInFlightRef.current = true;
      try {
        const allowed = await requestAdminToken('請輸入管理密碼以上傳');
        if (!allowed) return;

        let limits: UploadLimits;
        try {
          limits = await fetchUploadLimits(adminTokenRef.current);
        } catch {
          pushMessage('無法取得目前上傳限制，請稍後再試。', 'error');
          return;
        }

        const within = selected.filter((file) => {
          const limit = getSizeLimitByMime(file.type, limits);
          return typeof limit === 'number' && file.size <= limit;
        });
        const oversized = selected.length - within.length;
        if (within.length === 0) {
          pushMessage('檔案皆超過目前大小上限，請調整後再上傳。', 'error');
          return;
        }
        if (within.length > limits.maxFileCount) {
          pushMessage(`檔案數量超過上限 ${limits.maxFileCount} 個，請分批上傳。`, 'error');
          return;
        }

        const totalSize = within.reduce((sum, file) => sum + file.size, 0);
        if (totalSize > limits.maxTotalSizeMB * 1024 * 1024) {
          pushMessage(`總容量超過 ${limits.maxTotalSizeMB}MB，請分批上傳。`, 'error');
          return;
        }

        const overLimit = usageBytes !== null && usageBytes + totalSize > BUCKET_LIMIT_BYTES;
        if (overLimit) {
          const ok = await confirm({
            title: '上傳後將超過容量上限',
            message: '目前已使用容量加上這批檔案後將超過 10GB，確定仍要上傳嗎？',
            confirmLabel: '仍要上傳',
            danger: true
          });
          if (!ok) return;
        }

        setDropUploading(true);
        setDropProgress(0);
        const uploadPrefix = currentPrefix;
        const response = await uploadFiles({
          files: within,
          path: uploadPrefix,
          adminToken: adminTokenRef.current,
          onProgress: (percent) => setDropProgress(percent ?? 0)
        });

        // API 會回傳實際寫入成功的 media。不要以送出的檔案數量當作成功數，
        // 否則未來 API 支援部分成功時，使用者會看到不正確的成功提示。
        const uploadedCount = response.media.length;
        const remainingCount = Math.max(0, within.length - uploadedCount);
        const skippedParts = [
          oversized > 0 ? `略過 ${oversized} 個過大檔案` : '',
          unsupported > 0 ? `略過 ${unsupported} 個不支援檔案` : ''
        ].filter(Boolean);
        const skippedSuffix = skippedParts.length > 0 ? `（${skippedParts.join('；')}）` : '';

        // 成功回應或有明確成功子集時，都要立即重抓清單與容量。後者能讓 UI
        // 在部分失敗時仍反映已成功寫入的檔案；沒有成功結果的錯誤回應則不假設有副作用。
        if (response.ok || uploadedCount > 0) {
          await loadMedia(uploadPrefix, { silent: true });
          upsertLocalItems({ files: response.media, prefix: uploadPrefix });
          // 容量統計可能比清單更新慢；觸發刷新即可，不讓上傳覆蓋層為此持續卡住。
          void refreshUsage(true);
        }

        if (!response.ok) {
          if (uploadedCount > 0) {
            const incompleteSuffix = remainingCount > 0 ? `，另有 ${remainingCount} 個未完成` : '';
            pushMessage(
              `已上傳 ${uploadedCount} 個檔案${incompleteSuffix}；伺服器回傳失敗狀態，已重新整理清單與容量。${skippedSuffix}`,
              'error'
            );
            return;
          }

          pushMessage(
            response.error ? `上傳失敗：${response.error}` : '上傳失敗，請稍後再試。',
            'error'
          );
          return;
        }

        if (!response.hasMediaResult) {
          pushMessage('伺服器未回報上傳結果，已重新整理清單與容量，請確認檔案是否出現。', 'info');
          return;
        }

        if (uploadedCount === 0) {
          pushMessage('伺服器未確認任何檔案已上傳，已重新整理清單與容量。', 'error');
          return;
        }

        if (remainingCount > 0) {
          const failedNames = response.failures.slice(0, 2).map((failure) => failure.name).join('、');
          const failedSuffix = failedNames ? `（${failedNames}${response.failures.length > 2 ? ' 等' : ''}）` : '';
          pushMessage(
            `已上傳 ${uploadedCount} 個檔案，另有 ${remainingCount} 個未完成${failedSuffix}；已重新整理清單與容量。${skippedSuffix}`,
            'info'
          );
          return;
        }

        pushMessage(`已上傳 ${uploadedCount} 個檔案${skippedSuffix}`, 'success');
      } catch {
        pushMessage('上傳時發生錯誤，請稍後再試。', 'error');
      } finally {
        uploadInFlightRef.current = false;
        setDropUploading(false);
      }
    },
    [currentPrefix, adminTokenRef, requestAdminToken, pushMessage, confirm, usageBytes, refreshUsage, loadMedia, upsertLocalItems]
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
