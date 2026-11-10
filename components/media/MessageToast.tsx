'use client';

import { MessageTone } from './types';

const toneStyles: Record<MessageTone, string> = {
  info: 'border-primary-500/40 bg-surface-950/90 text-primary-50 shadow-lg shadow-primary-500/10',
  success: 'border-green-500/50 bg-green-950/70 text-green-50 shadow-lg shadow-green-500/20',
  error: 'border-red-500/50 bg-red-950/70 text-red-50 shadow-lg shadow-red-500/20'
};

export function MessageToast({ message, tone }: { message: string; tone: MessageTone }) {
  if (!message) return null;

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[80] flex flex-col gap-3 sm:right-6 sm:top-6">
      <div
        className={`w-72 rounded-2xl border px-4 py-3 text-sm font-semibold backdrop-blur-sm animate-toast-slide-in ${toneStyles[tone]}`}
        role="status"
        aria-live="assertive"
      >
        <span className="block text-xs uppercase tracking-[0.12em] text-surface-400">即時提醒</span>
        <span className="block text-base leading-relaxed text-white">{message}</span>
      </div>
    </div>
  );
}
