'use client';

import { FormEvent, useEffect, useState } from 'react';

export function BatchMoveModal({
  open,
  count,
  hasFolder,
  currentPrefix,
  maxDepth,
  sanitizePath,
  getDepth,
  onCancel,
  onConfirm
}: {
  open: boolean;
  count: number;
  hasFolder: boolean;
  currentPrefix: string;
  maxDepth: number;
  sanitizePath: (value: string) => string;
  getDepth: (path: string) => number;
  onCancel: () => void;
  onConfirm: (targetPrefix: string) => void | Promise<void>;
}) {
  const [value, setValue] = useState(currentPrefix);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(currentPrefix);
      setSubmitting(false);
      document.body.classList.add('modal-open');
    }
    return () => document.body.classList.remove('modal-open');
  }, [open, currentPrefix]);

  if (!open) return null;

  const trimmed = value.trim();
  const sanitized = sanitizePath(trimmed);
  const depth = getDepth(sanitized);

  let error = '';
  if (depth > maxDepth) error = `路徑深度最多 ${maxDepth} 層`;
  else if (hasFolder && depth + 1 > maxDepth) error = `移動後會超過 ${maxDepth} 層`;
  else if (trimmed && sanitized === currentPrefix) error = '目標路徑與目前位置相同';

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (error || submitting) return;
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
        className="w-[min(460px,92vw)] space-y-4 overflow-hidden rounded-3xl border border-surface-700/50 bg-surface-900/95 p-6 shadow-2xl animate-modal-content-in"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary-400">批次移動</p>
          <h3 className="text-lg font-semibold text-white">移動 {count} 個項目</h3>
          <p className="text-sm text-surface-400">輸入目標資料夾路徑，留空表示移動到根目錄。</p>
        </div>
        <input
          autoFocus
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="例如 albums/2024"
          className="w-full rounded-xl border border-surface-700 bg-surface-950/80 px-4 py-3 text-sm text-surface-100 outline-none transition-all duration-200 focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/30"
        />
        <p className="text-xs text-surface-500">整理後路徑：{sanitized || '根目錄'}</p>
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
            disabled={Boolean(error) || submitting}
            className="flex items-center gap-2 rounded-full bg-gradient-to-r from-primary-500 to-primary-600 px-5 py-2 text-sm font-semibold text-surface-950 shadow-glow transition-all duration-200 hover:from-primary-400 hover:to-primary-500 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            {submitting ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-surface-900/70 border-t-transparent" aria-hidden />
            ) : null}
            <span>移動</span>
          </button>
        </div>
      </form>
    </div>
  );
}
