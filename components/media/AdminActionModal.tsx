'use client';

import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';

export type AdminActionType = 'rename' | 'move' | 'delete';

export type AdminActionTarget = {
  key: string;
  isFolder: boolean;
};

type AdminActionModalProps = {
  action: AdminActionType | null;
  target: AdminActionTarget | null;
  maxNameLength: number;
  sanitizeName: (value: string) => string;
  onCancel: () => void;
  onConfirm: (payload: {
    action: AdminActionType;
    key: string;
    isFolder: boolean;
    newName?: string;
  }) => void | Promise<void>;
};

/**
 * AdminActionModal: 重新命名對話框
 * （移動改用 MovePickerModal、刪除改用 Undo 流程，故此處只處理重新命名）
 */
export function AdminActionModal({
  action,
  target,
  maxNameLength,
  sanitizeName,
  onCancel,
  onConfirm
}: AdminActionModalProps) {
  const isRename = action === 'rename' && Boolean(target);

  const currentName = useMemo(() => {
    if (!target) return '';
    return target.key.split('/').pop() ?? target.key;
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

  useEffect(() => {
    setInputValue(baseName);
    setIsSubmitting(false);
  }, [baseName]);

  // Body scroll lock + Esc 關閉
  useEffect(() => {
    if (!isRename) return;
    document.body.classList.add('modal-open');
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.classList.remove('modal-open');
      document.removeEventListener('keydown', handleKey);
    };
  }, [isRename, onCancel]);

  const { errorMessage, helperMessage, sanitizedName } = useMemo(() => {
    if (!target) return { errorMessage: '', helperMessage: '', sanitizedName: '' };
    const sanitized = sanitizeName(inputValue.trim());
    if (!sanitized) {
      return { errorMessage: '名稱不能為空', helperMessage: '', sanitizedName: sanitized };
    }
    if (target.isFolder && sanitized.length > maxNameLength) {
      return { errorMessage: `資料夾名稱最多 ${maxNameLength} 個字`, helperMessage: '', sanitizedName: sanitized };
    }
    if (sanitized === baseName) {
      return { errorMessage: '名稱未變更', helperMessage: '', sanitizedName: sanitized };
    }
    return { errorMessage: '', helperMessage: '套用後名稱會自動移除特殊字元', sanitizedName: sanitized };
  }, [target, inputValue, sanitizeName, maxNameLength, baseName]);

  if (!isRename || !target) return null;

  const finalName = sanitizedName ? `${sanitizedName}${extension}` : '';
  const confirmDisabled = Boolean(errorMessage) || isSubmitting;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (confirmDisabled) return;
    setIsSubmitting(true);
    try {
      await onConfirm({ action: 'rename', key: target.key, isFolder: target.isFolder, newName: finalName });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex min-h-screen w-screen items-center justify-center bg-surface-950/90 p-4 backdrop-blur-md animate-modal-backdrop-in"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-[min(560px,92vw)] overflow-hidden rounded-3xl border border-surface-700/50 bg-surface-900/95 shadow-2xl animate-modal-content-in"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-surface-800 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary-400">管理操作</p>
          <h3 className="mt-2 text-lg font-semibold text-white">重新命名</h3>
          <p className="mt-1 text-sm text-surface-400">對象：{currentName || target.key}</p>
        </div>

        <form className="space-y-4 px-5 py-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label className="text-sm font-medium text-surface-200" htmlFor="rename-input">
              新名稱
            </label>
            <input
              id="rename-input"
              autoFocus
              className="w-full rounded-2xl border border-surface-700 bg-surface-900/80 px-4 py-3 text-sm text-surface-100 outline-none transition-all duration-200 focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/30"
              inputMode="text"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              placeholder="輸入新的檔案或資料夾名稱（支援表情符號）"
            />
            {finalName ? <p className="text-xs text-surface-500">完成後名稱：{finalName}</p> : null}
          </div>

          <ul className="space-y-1 rounded-2xl border border-surface-700/50 bg-surface-950/40 px-4 py-3 text-xs text-surface-500">
            <li>會自動移除特殊字元：&lt;&gt;:&quot;/\\|?*</li>
            {target.isFolder ? <li>資料夾名稱最多 {maxNameLength} 個字</li> : null}
          </ul>

          {errorMessage ? <p className="text-sm text-red-300">{errorMessage}</p> : null}
          {!errorMessage && helperMessage ? <p className="text-sm text-primary-300">{helperMessage}</p> : null}

          {isSubmitting ? (
            <div className="flex items-center gap-2 rounded-2xl border border-primary-500/40 bg-primary-500/10 px-4 py-3 text-sm text-primary-200">
              <span
                className="h-4 w-4 animate-spin rounded-full border-2 border-primary-300/70 border-t-transparent"
                aria-hidden="true"
              />
              <span>正在處理中，若內容較多可能需要數秒...</span>
            </div>
          ) : null}

          <div className="flex flex-col gap-3 border-t border-surface-800 pt-4 sm:flex-row sm:justify-end">
            <button
              className="rounded-full border border-surface-700 px-5 py-2 text-sm font-semibold text-surface-200 transition-all duration-200 hover:border-surface-500 hover:bg-surface-800 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              取消
            </button>
            <button
              className="rounded-full bg-gradient-to-r from-primary-500 to-accent-500 px-5 py-2 text-sm font-semibold text-surface-950 shadow-glow transition-all duration-200 hover:from-primary-400 hover:to-accent-400 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
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
