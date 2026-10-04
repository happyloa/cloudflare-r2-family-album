'use client';

import type { FormEvent } from 'react';
import { useEffect, useId, useMemo, useState } from 'react';
import { getMediaName } from '@/lib/media-name';
import { sanitizeName, isPeriodOnlyPathSegment } from '@/lib/path';
import { MAX_FOLDER_NAME_LENGTH } from '@/lib/constants';
import type { MediaTarget } from './types';

import { useFocusTrap } from './hooks/useFocusTrap';

type RenameModalProps = {
  target: MediaTarget | null;
  onCancel: () => void;
  onConfirm: (newName: string) => Promise<boolean>;
};

export function RenameModal({
  target,
  onCancel,
  onConfirm
}: RenameModalProps) {
  const isRename = Boolean(target);
  const formRef = useFocusTrap<HTMLFormElement>(isRename, {
    onEscape: () => { if (!isSubmitting) onCancel(); }
  });

  const currentName = useMemo(() => {
    if (!target) return '';
    return target.isFolder ? target.key.split('/').pop() ?? target.key : getMediaName(target.key);
  }, [target]);

  const { baseName, extension } = useMemo(() => {
    if (!target) return { baseName: '', extension: '' };
    const extensionIndex = target.isFolder ? -1 : currentName.lastIndexOf('.');
    if (extensionIndex > -1) {
      return { baseName: currentName.slice(0, extensionIndex), extension: currentName.slice(extensionIndex) };
    }
    return { baseName: currentName, extension: '' };
  }, [currentName, target]);

  const [inputValue, setInputValue] = useState(baseName);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const inputId = useId();
  const rulesId = useId();
  const resultId = useId();
  const errorId = useId();
  const helperId = useId();

  useEffect(() => {
    setInputValue(baseName);
    setIsSubmitting(false);
  }, [baseName]);

  const { errorMessage, helperMessage, sanitizedName } = useMemo(() => {
    if (!target) return { errorMessage: '', helperMessage: '', sanitizedName: '' };
    const sanitized = sanitizeName(inputValue.trim());
    if (!sanitized) {
      return { errorMessage: '名稱不能為空', helperMessage: '', sanitizedName: sanitized };
    }
    if (target.isFolder && sanitized.length > MAX_FOLDER_NAME_LENGTH) {
      return { errorMessage: `資料夾名稱最多 ${MAX_FOLDER_NAME_LENGTH} 個字`, helperMessage: '', sanitizedName: sanitized };
    }
    if (isPeriodOnlyPathSegment(sanitized) || (!target.isFolder && sanitized.length + extension.length > 255)) {
      return { errorMessage: '請輸入有效的名稱，檔案名稱最多 255 個字元。', helperMessage: '', sanitizedName: sanitized };
    }
    if (sanitized === baseName) {
      return { errorMessage: '名稱未變更', helperMessage: '', sanitizedName: sanitized };
    }
    return { errorMessage: '', helperMessage: '套用後名稱會自動移除特殊字元', sanitizedName: sanitized };
  }, [target, inputValue, baseName, extension]);

  if (!isRename || !target) return null;

  const finalName = sanitizedName ? `${sanitizedName}${extension}` : '';
  const confirmDisabled = Boolean(errorMessage) || isSubmitting;
  const inputDescription = [
    rulesId,
    finalName ? resultId : '',
    errorMessage ? errorId : helperMessage ? helperId : ''
  ]
    .filter(Boolean)
    .join(' ');

  const handleCancel = () => {
    if (!isSubmitting) onCancel();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (confirmDisabled) return;
    setIsSubmitting(true);
    try {
      await onConfirm(finalName);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex min-h-screen w-screen items-center justify-center bg-surface-950/90 p-4 backdrop-blur-md animate-modal-backdrop-in"
      onClick={handleCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-busy={isSubmitting}
    >
      <div
        className="max-h-[calc(100dvh-2rem)] w-[min(560px,92vw)] overflow-y-auto rounded-3xl border border-surface-700/50 bg-surface-900/95 shadow-2xl animate-modal-content-in"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-surface-800 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary-400">管理操作</p>
          <h3 id={titleId} className="mt-2 text-lg font-semibold text-white">
            重新命名
          </h3>
          <p id={descriptionId} className="mt-1 break-all text-sm text-surface-400">
            對象：{currentName || target.key}
          </p>
        </div>

        <form ref={formRef} className="space-y-4 px-5 py-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label className="text-sm font-medium text-surface-200" htmlFor={inputId}>
              新名稱
            </label>
            <input
              id={inputId}
              name="newName"
              className="w-full rounded-2xl border border-surface-700 bg-surface-900/80 px-4 py-3 text-sm text-surface-100 outline-none transition-colors focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/30 disabled:cursor-not-allowed disabled:opacity-60"
              inputMode="text"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              autoFocus
              disabled={isSubmitting}
              aria-invalid={Boolean(errorMessage)}
              aria-describedby={inputDescription}
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              placeholder="輸入新的檔案或資料夾名稱（支援表情符號）"
            />
            {finalName ? (
              <p id={resultId} className="break-all text-xs text-surface-500">
                完成後名稱：{finalName}
              </p>
            ) : null}
          </div>

          <ul id={rulesId} className="space-y-1 rounded-2xl border border-surface-700/50 bg-surface-950/40 px-4 py-3 text-xs text-surface-500">
            <li>會自動移除特殊字元：&lt;&gt;:&quot;/\\|?*</li>
            {target.isFolder ? <li>資料夾名稱最多 {MAX_FOLDER_NAME_LENGTH} 個字</li> : null}
          </ul>

          {errorMessage ? (
            <p id={errorId} role="alert" className="text-sm text-red-300">
              {errorMessage}
            </p>
          ) : null}
          {!errorMessage && helperMessage ? (
            <p id={helperId} className="text-sm text-primary-300">
              {helperMessage}
            </p>
          ) : null}

          {isSubmitting ? (
            <div role="status" aria-live="polite" className="flex items-center gap-2 rounded-2xl border border-primary-500/40 bg-primary-500/10 px-4 py-3 text-sm text-primary-200">
              <span
                className="h-4 w-4 animate-spin rounded-full border-2 border-primary-300/70 border-t-transparent"
                aria-hidden="true"
              />
              <span>正在處理中，若內容較多可能需要數秒...</span>
            </div>
          ) : null}

          <div className="flex flex-col gap-3 border-t border-surface-800 pt-4 sm:flex-row sm:justify-end">
            <button
              className="rounded-full border border-surface-700 px-5 py-2 text-sm font-semibold text-surface-200 transition-colors hover:border-surface-500 hover:bg-surface-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              type="button"
              onClick={handleCancel}
              disabled={isSubmitting}
            >
              取消
            </button>
            <button
              className="rounded-full bg-primary-700 px-5 py-2 text-sm font-semibold text-white shadow-md transition-colors hover:bg-primary-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-200 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              type="submit"
              disabled={confirmDisabled}
            >
              <span className="flex items-center justify-center gap-2">
                {isSubmitting ? (
                  <span
                    className="h-4 w-4 animate-spin rounded-full border-2 border-primary-100/70 border-t-transparent"
                    aria-hidden="true"
                  />
                ) : null}
                <span>確認</span>
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
