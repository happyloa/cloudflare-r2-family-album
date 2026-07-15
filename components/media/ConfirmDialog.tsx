'use client';

import { useEffect, useRef } from 'react';

import { useFocusTrap } from './hooks/useFocusTrap';
import { ConfirmRequest } from './hooks/useDialogs';

export function ConfirmDialog({
  request,
  onClose
}: {
  request: ConfirmRequest | null;
  onClose: (value: boolean) => void;
}) {
  const dialogRef = useFocusTrap<HTMLDivElement>(Boolean(request));
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!request) return;
    document.body.classList.add('modal-open');
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose(false);
        return;
      }
      if (event.key === 'Enter' && document.activeElement === confirmButtonRef.current) {
        event.preventDefault();
        onClose(true);
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.classList.remove('modal-open');
      document.removeEventListener('keydown', handleKey);
    };
  }, [request, onClose]);

  if (!request) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex min-h-screen w-screen items-center justify-center bg-surface-950/90 p-4 backdrop-blur-md animate-modal-backdrop-in"
      role="dialog"
      aria-modal="true"
      onClick={() => onClose(false)}
    >
      <div
        ref={dialogRef}
        className="w-[min(440px,92vw)] space-y-4 overflow-hidden rounded-3xl border border-surface-700/50 bg-surface-900/95 p-6 shadow-2xl animate-modal-content-in"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-white">{request.title}</h3>
          <p className="text-sm leading-relaxed text-surface-300">{request.message}</p>
        </div>
        <div className="flex justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={() => onClose(false)}
            className="rounded-full border border-surface-700 px-5 py-2 text-sm font-semibold text-surface-200 transition-all duration-200 hover:border-surface-500 hover:bg-surface-800 cursor-pointer"
          >
            {request.cancelLabel}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={() => onClose(true)}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition-all duration-200 cursor-pointer ${
              request.danger
                ? 'bg-red-500 text-white shadow-lg ring-1 ring-red-400/40 hover:bg-red-400'
                : 'bg-gradient-to-r from-primary-500 to-primary-600 text-surface-950 shadow-glow hover:from-primary-400 hover:to-primary-500'
            }`}
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
