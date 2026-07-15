'use client';

import { FormEvent, useEffect, useState } from 'react';

import { MAX_FOLDER_NAME_LENGTH } from './constants';
import { useFocusTrap } from './hooks/useFocusTrap';
import { sanitizeName } from './sanitize';

export function NewFolderModal({
  open,
  onCancel,
  onConfirm
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: (name: string) => void | Promise<void>;
}) {
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const formRef = useFocusTrap<HTMLFormElement>(open);

  useEffect(() => {
    if (!open) return;
    setValue('');
    setSubmitting(false);
    document.body.classList.add('modal-open');
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.classList.remove('modal-open');
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, onCancel]);

  if (!open) return null;

  const sanitized = sanitizeName(value);
  const tooLong = sanitized.length > MAX_FOLDER_NAME_LENGTH;
  const error = tooLong ? `資料夾名稱最多 ${MAX_FOLDER_NAME_LENGTH} 個字` : '';
  const disabled = !sanitized || Boolean(error) || submitting;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled) return;
    setSubmitting(true);
    try {
      await onConfirm(sanitized);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex min-h-screen w-screen items-center justify-center bg-surface-950/90 p-4 backdrop-blur-md animate-modal-backdrop-in"
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <form
        ref={formRef}
        className="w-[min(440px,92vw)] space-y-4 overflow-hidden rounded-3xl border border-surface-700/50 bg-surface-900/95 p-6 shadow-2xl animate-modal-content-in"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary-400">建立資料夾</p>
          <h3 className="text-lg font-semibold text-white">新資料夾</h3>
          <p className="text-sm text-surface-400">會建立在目前位置，最多兩層、名稱最多 {MAX_FOLDER_NAME_LENGTH} 個字。</p>
        </div>
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="輸入資料夾名稱（例如：taiwan-trip）"
          className="w-full rounded-xl border border-surface-700 bg-surface-950/80 px-4 py-3 text-sm text-surface-100 outline-none transition-all duration-200 focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/30"
        />
        {error ? <p className="text-sm font-semibold text-red-300">{error}</p> : null}
        <div className="flex justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-full border border-surface-700 px-5 py-2 text-sm font-semibold text-surface-200 transition-all duration-200 hover:border-surface-500 hover:bg-surface-800 disabled:opacity-50 cursor-pointer"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={disabled}
            className="flex items-center gap-2 rounded-full bg-gradient-to-r from-primary-500 to-primary-600 px-5 py-2 text-sm font-semibold text-surface-950 shadow-glow transition-all duration-200 hover:from-primary-400 hover:to-primary-500 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            {submitting ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-surface-900/70 border-t-transparent" aria-hidden />
            ) : null}
            <span>建立</span>
          </button>
        </div>
      </form>
    </div>
  );
}
