'use client';

export function SelectionToolbar({
  count,
  onMove,
  onDelete,
  onClear
}: {
  count: number;
  onMove: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  if (count <= 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-surface-700/60 bg-surface-900/95 px-3 py-2 shadow-2xl ring-1 ring-white/5 backdrop-blur-md animate-modal-content-in">
        <button
          type="button"
          onClick={onClear}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-surface-300 transition-colors hover:bg-surface-800 hover:text-white cursor-pointer"
          aria-label="清除選取"
          title="清除選取"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <span className="px-1 text-sm font-semibold tabular-nums text-white">已選取 {count} 項</span>
        <div className="mx-1 h-6 w-px bg-surface-700/70" />
        <button
          type="button"
          onClick={onMove}
          className="flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-semibold text-surface-100 transition-colors hover:bg-primary-500/15 hover:text-primary-100 cursor-pointer"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h5l2 2h11v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
          </svg>
          移動
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-semibold text-red-300 transition-colors hover:bg-red-500/15 hover:text-red-200 cursor-pointer"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          刪除
        </button>
      </div>
    </div>
  );
}
