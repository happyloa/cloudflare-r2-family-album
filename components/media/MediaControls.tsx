'use client';

import type { SortDir, SortKey } from './hooks/useMediaData';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'date', label: '日期' },
  { key: 'name', label: '名稱' },
  { key: 'size', label: '大小' }
];

export function MediaControls({
  filter, filterVisible, onFilterChange, searchEnabled, searchQuery,
  onSearchChange, sortKey, sortDir, onSortKeyChange, onSortDirToggle,
  hasMore, loadingMore
}: {
  filter: 'all' | 'image' | 'video';
  filterVisible: boolean;
  onFilterChange: (value: 'all' | 'image' | 'video') => void;
  searchEnabled: boolean;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  sortKey: SortKey;
  sortDir: SortDir;
  onSortKeyChange: (value: SortKey) => void;
  onSortDirToggle: () => void;
  hasMore: boolean;
  loadingMore: boolean;
}) {
  const filters: { key: 'all' | 'image' | 'video'; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'image', label: '圖片' },
    { key: 'video', label: '影片' }
  ];

  if (!searchEnabled) return null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-3 sm:gap-x-5">
          <label className="order-first flex w-full items-center gap-2 rounded-lg border border-surface-700/70 bg-surface-900 px-3 py-2.5 text-sm text-surface-400 focus-within:border-primary-400/70 sm:order-3 sm:ml-auto sm:w-64">
            <svg className="size-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
              <circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" strokeLinecap="round" />
            </svg>
            <input
              className="min-w-0 w-full bg-transparent text-sm text-surface-100 outline-none placeholder:text-surface-500 focus-visible:outline-none"
              type="search"
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="搜尋資料夾或媒體"
              aria-label="搜尋資料夾與媒體"
            />
          </label>

        {/* 排序控制 */}
        <div className="order-2 flex items-center gap-1 text-xs text-surface-400">
          <span className="sr-only mr-1 sm:not-sr-only">排序</span>
          {SORT_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => onSortKeyChange(key)}
              aria-pressed={sortKey === key}
              className={`cursor-pointer rounded-md px-2 py-2 transition-colors ${
                sortKey === key
                  ? 'bg-surface-800 text-surface-100'
                  : 'text-surface-400 hover:text-surface-100'
              }`}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={onSortDirToggle}
            className="ml-0.5 flex h-7 w-7 items-center justify-center rounded-lg text-surface-300 transition-colors hover:bg-surface-700 hover:text-white cursor-pointer"
            aria-label={sortDir === 'asc' ? '改為遞減' : '改為遞增'}
            title={sortDir === 'asc' ? '遞增' : '遞減'}
          >
            <svg className={`h-4 w-4 transition-transform ${sortDir === 'asc' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </button>
        </div>

        {filterVisible ? (
          <div className="order-1 flex items-center gap-1 text-xs font-medium sm:text-sm">
            {filters.map(({ key, label }) => (
              <button
                key={key}
                className={`cursor-pointer rounded-lg px-2.5 py-2 transition-colors sm:px-3 ${
                  filter === key
                    ? 'bg-primary-500/15 text-primary-200'
                    : 'text-surface-400 hover:bg-surface-900 hover:text-surface-100'
                }`}
                type="button"
                onClick={() => onFilterChange(key)}
                aria-pressed={filter === key}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {hasMore ? <p role="status" className="text-xs text-surface-400">{searchQuery.trim() || filter !== 'all' ? (loadingMore ? '正在搜尋剩餘項目…' : '還有項目尚未載入，搜尋結果會繼續更新。') : '目前依已載入的項目排序，向下捲動可載入更多。'}</p> : null}
    </div>
  );
}
