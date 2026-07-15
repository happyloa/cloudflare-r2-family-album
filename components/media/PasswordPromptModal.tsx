'use client';

import { FormEvent, useEffect, useState } from 'react';

import { useFocusTrap } from './hooks/useFocusTrap';
import { PasswordRequest } from './hooks/useDialogs';

export function PasswordPromptModal({
  request,
  maxLength,
  onClose
}: {
  request: PasswordRequest | null;
  maxLength: number;
  onClose: (value: boolean) => void;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const formRef = useFocusTrap<HTMLFormElement>(Boolean(request));

  useEffect(() => {
    if (!request) return;
    setValue('');
    setError('');
    setSubmitting(false);
    document.body.classList.add('modal-open');
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [request]);

  useEffect(() => {
    if (!request) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [request, onClose]);

  if (!request) return null;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const ok = await request.onSubmit(trimmed);
      if (ok) {
        onClose(true);
      } else {
        setError('管理密碼不正確，請再試一次。');
        setSubmitting(false);
        formRef.current?.querySelector<HTMLInputElement>('input[type="password"]')?.select();
      }
    } catch {
      setError('驗證時發生錯誤，請稍後再試。');
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex min-h-screen w-screen items-center justify-center bg-surface-950/90 p-4 backdrop-blur-md animate-modal-backdrop-in"
      role="dialog"
      aria-modal="true"
      onClick={() => onClose(false)}
    >
      <form
        ref={formRef}
        className="w-[min(420px,92vw)] space-y-4 overflow-hidden rounded-3xl border border-surface-700/50 bg-surface-900/95 p-6 shadow-2xl animate-modal-content-in"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary-400">安全管理</p>
          <h3 className="text-lg font-semibold text-white">{request.title}</h3>
          <p className="text-sm text-surface-400">{request.message}</p>
        </div>
        <input
          type="password"
          maxLength={maxLength}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (error) setError('');
          }}
          placeholder="輸入管理密碼"
          className="w-full rounded-xl border border-surface-700 bg-surface-950/80 px-4 py-3 text-sm text-surface-100 outline-none transition-all duration-200 focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/30"
        />
        {error ? <p className="text-sm font-semibold text-red-300">{error}</p> : null}
        <div className="flex justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={() => onClose(false)}
            disabled={submitting}
            className="rounded-full border border-surface-700 px-5 py-2 text-sm font-semibold text-surface-200 transition-all duration-200 hover:border-surface-500 hover:bg-surface-800 disabled:opacity-50 cursor-pointer"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={submitting || !value.trim()}
            className="flex items-center gap-2 rounded-full bg-gradient-to-r from-primary-500 to-primary-600 px-5 py-2 text-sm font-semibold text-surface-950 shadow-glow transition-all duration-200 hover:from-primary-400 hover:to-primary-500 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            {submitting ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-surface-900/70 border-t-transparent" aria-hidden />
            ) : null}
            <span>確認</span>
          </button>
        </div>
      </form>
    </div>
  );
}
