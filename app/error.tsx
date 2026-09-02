'use client';

import { useEffect } from 'react';

type RouteErrorProps = {
  error: Error & { digest?: string };
  retry: () => void;
};

/** Next App Router 的頁面層錯誤邊界；不把原始錯誤文字顯示給訪客。 */
export default function RouteError({ error, retry }: RouteErrorProps) {
  useEffect(() => {
    console.error('Route rendering failed', {
      digest: error.digest ?? 'client-render-error',
    });
  }, [error]);

  return (
    <section
      role="alert"
      aria-labelledby="route-error-title"
      className="mx-auto flex min-h-[420px] max-w-xl items-center justify-center py-10"
    >
      <div className="w-full space-y-5 rounded-3xl border border-red-500/30 bg-surface-900/90 p-8 text-center shadow-2xl">
        <div className="text-4xl" aria-hidden>⚠️</div>
        <div className="space-y-2">
          <h1 id="route-error-title" className="text-xl font-bold text-white">暫時無法顯示相簿</h1>
          <p className="text-sm leading-6 text-surface-300">
            請稍後再試；若問題持續發生，請重新整理頁面。
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={retry}
            className="rounded-full bg-primary-400 px-4 py-2 text-sm font-semibold text-surface-950 transition-colors hover:bg-primary-300"
          >
            再試一次
          </button>
          <a
            href="/"
            className="rounded-full border border-surface-600 px-4 py-2 text-sm font-semibold text-surface-100 transition-colors hover:border-surface-400 hover:bg-surface-800"
          >
            回到首頁
          </a>
        </div>
      </div>
    </section>
  );
}
