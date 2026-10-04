'use client';

type EmptyStateProps = {
  atMaxDepth?: boolean;
};

export function EmptyState({ atMaxDepth = false }: EmptyStateProps) {
  const title = atMaxDepth ? '目前沒有媒體' : '目前沒有媒體或資料夾';
  const description = atMaxDepth ? '管理模式下可上傳檔案。' : '管理模式下可建立資料夾或上傳檔案。';

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-surface-700 bg-surface-800/50 p-8 text-center text-surface-200 shadow-xl ring-1 ring-white/5">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-primary-500/10 blur-xl" aria-hidden />
        <div className="relative flex h-28 w-28 items-center justify-center rounded-2xl border border-dashed border-primary-500/40 bg-surface-900/80 text-4xl">
          📸
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-lg font-semibold text-white">{title}</p>
        <p className="text-sm text-surface-400">{description}</p>
      </div>
    </div>
  );
}
