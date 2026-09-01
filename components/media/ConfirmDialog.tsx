'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { useFocusTrap } from './hooks/useFocusTrap';
import { ConfirmRequest } from './hooks/useDialogs';

export function ConfirmDialog({
  request,
  onClose
}: {
  request: ConfirmRequest | null;
  onClose: (value: boolean) => void | Promise<void>;
}) {
  const dialogRef = useFocusTrap<HTMLDivElement>(Boolean(request));
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    setSubmitting(false);
  }, [request]);

  useEffect(() => {
    if (!request) return;
    document.body.classList.add('modal-open');
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [request]);

  const handleCancel = () => {
    if (!submitting) {
      void onClose(false);
    }
  };

  const handleConfirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onClose(true);
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!request) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) {
        event.preventDefault();
        handleCancel();
        return;
      }
      if (event.key === 'Enter' && document.activeElement === confirmButtonRef.current && !submitting) {
        event.preventDefault();
        void handleConfirm();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [request, submitting, onClose]);

  if (!request) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex min-h-screen w-screen items-center justify-center bg-surface-950/90 p-4 backdrop-blur-md animate-modal-backdrop-in"
      onClick={handleCancel}
    >
      <div
        ref={dialogRef}
        className="w-[min(440px,92vw)] space-y-4 overflow-hidden rounded-3xl border border-surface-700/50 bg-surface-900/95 p-6 shadow-2xl animate-modal-content-in"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={submitting}
      >
        <div className="space-y-2">
          <h3 id={titleId} className="text-lg font-semibold text-white">
            {request.title}
          </h3>
          <p id={descriptionId} className="text-sm leading-relaxed text-surface-300">
            {request.message}
          </p>
        </div>
        <div className="flex justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={handleCancel}
            disabled={submitting}
            className="rounded-full border border-surface-700 px-5 py-2 text-sm font-semibold text-surface-200 transition-colors hover:border-surface-500 hover:bg-surface-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            {request.cancelLabel}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={() => void handleConfirm()}
            disabled={submitting}
            className={`flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold text-white shadow-md transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-200 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer ${
              request.danger
                ? 'bg-red-700 ring-1 ring-red-400/40 hover:bg-red-600'
                : 'bg-primary-700 ring-1 ring-primary-400/40 hover:bg-primary-600'
            }`}
          >
            {submitting ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/70 border-t-transparent" aria-hidden />
            ) : null}
            <span>{request.confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
