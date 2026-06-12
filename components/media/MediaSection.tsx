'use client';

import { type DragEvent, type MouseEvent, useEffect, useRef } from 'react';

import { ContextTarget } from './hooks/useContextMenu';
import { makeSelectionId, SelectionId } from './hooks/useSelection';
import type { SortDir, SortKey } from './hooks/useMediaData';
import { MediaThumbnail } from './MediaThumbnail';
import { MediaFile } from './types';

type ItemModifiers = { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean };

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'date', label: '日期' },
  { key: 'name', label: '名稱' },
  { key: 'size', label: '大小' }
];

export function MediaSection({
  allFilesCount,
  files,
  visibleFiles,
  hasMore,
  onLoadMore,
  onSelect,
  filterLabel,
  filter,
  filterVisible,
  onFilterChange,
  searchEnabled,
  searchQuery,
  onSearchChange,
  sortKey,
  sortDir,
  onSortKeyChange,
  onSortDirToggle,
  isAdmin,
  isSelected,
  selectionMode,
  onItemClick,
  onToggleSelect,
  onContextMenu,
  onDragStart,
  onDragEnd
}: {
  allFilesCount: number;
  files: MediaFile[];
  visibleFiles: MediaFile[];
  hasMore: boolean;
  onLoadMore: () => void;
  onSelect: (file: MediaFile, trigger: HTMLElement) => void;
  filterLabel: string;
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
  isAdmin: boolean;
  isSelected: (id: SelectionId) => boolean;
  selectionMode: boolean;
  onItemClick: (id: SelectionId, modifiers: ItemModifiers) => void;
  onToggleSelect: (id: SelectionId) => void;
  onContextMenu: (event: { clientX: number; clientY: number; preventDefault: () => void }, target: ContextTarget) => void;
  onDragStart?: (file: MediaFile, event: DragEvent<HTMLElement>) => void;
  onDragEnd?: () => void;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  // 無限捲動：sentinel 進入視窗時載入下一批
  useEffect(() => {
    if (!hasMore) return;
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore();
      },
      { rootMargin: '600px 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, onLoadMore, visibleFiles.length]);

  if (!allFilesCount) return null;

  const filters: { key: 'all' | 'image' | 'video'; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'image', label: '圖片' },
    { key: 'video', label: '影片' }
  ];

  const formatTimestamp = (value: string) => {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      const year = parsed.getFullYear();
      const month = String(parsed.getMonth() + 1).padStart(2, '0');
      const day = String(parsed.getDate()).padStart(2, '0');
      const hours = String(parsed.getHours()).padStart(2, '0');
      const minutes = String(parsed.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${day} ${hours}:${minutes}`;
    }
    return value.replace('T', ' ').replace(/Z$/, '');
  };

  const handleCardClick = (item: MediaFile, event: MouseEvent<HTMLElement>) => {
    const id = makeSelectionId(item.key, false);
    if (isAdmin && (event.shiftKey || event.ctrlKey || event.metaKey)) {
      onItemClick(id, { shiftKey: event.shiftKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey });
      return;
    }
    if (isAdmin && selectionMode) {
      onToggleSelect(id);
      return;
    }
    onSelect(item, event.currentTarget);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-xl font-bold text-white">媒體檔案</h3>
          <span className="rounded-full bg-primary-500/10 px-3 py-1 text-xs font-semibold text-primary-300 ring-1 ring-primary-500/20">
            {filterLabel}（共 {files.length}）
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {searchEnabled ? (
            <label className="flex items-center gap-2 rounded-xl border border-surface-700/50 bg-surface-800/50 px-3 py-2 text-xs font-semibold text-surface-200">
              <span className="text-surface-500">搜尋</span>
              <input
                className="w-40 rounded-lg border border-surface-700 bg-surface-900/80 px-3 py-2 text-xs font-medium text-white shadow-inner outline-none transition-all duration-200 focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/30"
                type="search"
                value={searchQuery}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="輸入標題關鍵字"
                aria-label="搜尋媒體標題"
              />
            </label>
          ) : null}

          {/* 排序控制 */}
          <div className="flex items-center gap-1 rounded-xl border border-surface-700/50 bg-surface-800/50 px-2 py-1.5 text-xs font-semibold text-surface-200">
            <span className="px-1 text-surface-500">排序</span>
            {SORT_OPTIONS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => onSortKeyChange(key)}
                className={`rounded-lg px-2.5 py-1 transition-all duration-200 cursor-pointer ${
                  sortKey === key
                    ? 'bg-primary-500/15 text-primary-100 ring-1 ring-primary-500/40'
                    : 'text-surface-200 hover:text-primary-100'
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
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-surface-700/50 bg-surface-800/50 px-3 py-2 text-xs font-semibold text-surface-200">
              {filters.map(({ key, label }) => (
                <button
                  key={key}
                  className={`rounded-lg border px-3 py-1.5 transition-all duration-200 cursor-pointer ${
                    filter === key
                      ? 'border-primary-500/50 bg-primary-500/15 text-primary-100 shadow-glow'
                      : 'border-surface-700 bg-surface-800 text-surface-100 hover:border-primary-500/40 hover:text-primary-100'
                  }`}
                  type="button"
                  onClick={() => onFilterChange(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {files.length === 0 && (
        <div className="rounded-2xl border border-surface-700/50 bg-surface-800/50 px-4 py-3 text-sm text-surface-100">
          {searchQuery.trim()
            ? `沒有找到包含「${searchQuery.trim()}」的媒體，請換個關鍵字或清除搜尋。`
            : filterVisible && filter !== 'all'
              ? '這個分類目前沒有媒體，請切換其他類型或回到全部。'
              : '目前沒有符合條件的媒體。'}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visibleFiles.map((item) => {
          const id = makeSelectionId(item.key, false);
          const selected = isAdmin && isSelected(id);
          return (
            <article
              key={item.key}
              className={`group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border bg-surface-800/50 shadow-lg transition-all duration-200 hover:-translate-y-1 hover:shadow-xl active:scale-[0.98] ${
                selected
                  ? 'border-primary-500 ring-2 ring-primary-500/60'
                  : 'border-surface-700/50 hover:border-primary-500/40'
              }`}
              onClick={(event) => handleCardClick(item, event)}
              onContextMenu={(event) => {
                if (!isAdmin) return;
                onContextMenu(event, { key: item.key, isFolder: false });
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  if (isAdmin && selectionMode) onToggleSelect(id);
                  else onSelect(item, event.currentTarget);
                }
              }}
              draggable={isAdmin}
              onDragStart={(event) => {
                if (!isAdmin) return;
                event.stopPropagation();
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', item.key);
                onDragStart?.(item, event);
              }}
              onDragEnd={() => onDragEnd?.()}
              role="button"
              tabIndex={0}
              aria-label={`${item.key.split('/').pop()} 預覽`}
            >
              {/* 選取核取方塊（管理模式，hover 或已選取時顯示） */}
              {isAdmin ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleSelect(id);
                  }}
                  className={`absolute left-3 top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all duration-150 cursor-pointer ${
                    selected
                      ? 'border-primary-400 bg-primary-500 text-surface-950'
                      : 'border-white/70 bg-surface-900/60 text-transparent opacity-0 group-hover:opacity-100'
                  }`}
                  aria-label={selected ? '取消選取' : '選取'}
                  aria-pressed={selected}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </button>
              ) : null}

              {/* 溢位選單 ⋮（管理模式） */}
              {isAdmin ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onContextMenu(event, { key: item.key, isFolder: false });
                  }}
                  className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-surface-900/70 text-surface-200 opacity-0 ring-1 ring-white/10 backdrop-blur-sm transition-all duration-150 hover:bg-surface-900 hover:text-white group-hover:opacity-100 cursor-pointer"
                  aria-label="更多操作"
                >
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="5" r="1.6" />
                    <circle cx="12" cy="12" r="1.6" />
                    <circle cx="12" cy="19" r="1.6" />
                  </svg>
                </button>
              ) : null}

              <MediaThumbnail media={item} />
              <div className="flex flex-col gap-1 p-4 text-sm text-surface-100">
                <p className="truncate text-sm font-semibold text-white" title={item.key}>
                  {item.key.split('/').pop()}
                </p>
                {item.lastModified ? (
                  <p className="text-xs text-surface-500">更新：{formatTimestamp(item.lastModified)}</p>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      {/* 無限捲動 sentinel */}
      {hasMore ? (
        <div ref={sentinelRef} className="flex items-center justify-center py-6" aria-hidden>
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary-400/40 border-t-primary-400" />
        </div>
      ) : files.length > 0 ? (
        <p className="py-4 text-center text-xs text-surface-600">已顯示全部 {files.length} 個媒體</p>
      ) : null}
    </div>
  );
}
