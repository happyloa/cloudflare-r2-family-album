'use client';

import { type DragEvent, type MouseEvent, useEffect, useMemo, useState } from 'react';

import { ContextTarget } from './hooks/useContextMenu';
import { useLongPress } from './hooks/useLongPress';
import { makeSelectionId, SelectionId } from './hooks/useSelection';
import { FolderItem } from './types';

type ItemModifiers = { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean };

// 記住各年份分組的收合狀態（跨重新整理/導覽）
const GROUP_STORAGE_KEY = 'familyAlbum.folderGroups.collapsed';

export function FolderGrid({
  folders,
  isAdmin,
  onEnter,
  isRootLevel = true,
  isDragging,
  onDropItem,
  onItemDragStart,
  onItemDragEnd,
  isSelected,
  selectionMode,
  onItemClick,
  onToggleSelect,
  onContextMenu
}: {
  folders: FolderItem[];
  isAdmin: boolean;
  onEnter: (key: string) => void;
  isRootLevel?: boolean;
  isDragging?: boolean;
  onDropItem?: (folderKey: string) => void;
  onItemDragStart?: (folderKey: string, event: DragEvent<HTMLElement>) => void;
  onItemDragEnd?: () => void;
  isSelected: (id: SelectionId) => boolean;
  selectionMode: boolean;
  onItemClick: (id: SelectionId, modifiers: ItemModifiers) => void;
  onToggleSelect: (id: SelectionId) => void;
  onContextMenu: (event: { clientX: number; clientY: number; preventDefault: () => void }, target: ContextTarget) => void;
}) {
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      return JSON.parse(window.localStorage.getItem(GROUP_STORAGE_KEY) ?? '{}') ?? {};
    } catch {
      return {};
    }
  });
  const longPress = useLongPress((id) => onToggleSelect(id));

  // 收合狀態變動時寫回 localStorage
  useEffect(() => {
    try {
      window.localStorage.setItem(GROUP_STORAGE_KEY, JSON.stringify(collapsedGroups));
    } catch {
      /* 忽略（無痕模式等情況） */
    }
  }, [collapsedGroups]);

  // 依名稱開頭的 4 位數年份分組（無年份者歸「其他」），年份新到舊排序
  const { groupedFolders, sortedYears } = useMemo(() => {
    const groups: Record<string, FolderItem[]> = {};
    folders.forEach((folder) => {
      const match = folder.name?.match(/^(\d{4})/);
      const year = match ? match[1] : '其他';
      (groups[year] ??= []).push(folder);
    });
    const years = Object.keys(groups).sort((a, b) => {
      if (a === '其他') return 1;
      if (b === '其他') return -1;
      return b.localeCompare(a);
    });
    return { groupedFolders: groups, sortedYears: years };
  }, [folders]);

  if (!folders.length) return null;

  // 預設只展開第一組（最新年份），其餘收合
  const isGroupExpanded = (year: string, _index: number) =>
    collapsedGroups[year] !== undefined ? !collapsedGroups[year] : true;
  const toggleGroup = (year: string, index: number) =>
    setCollapsedGroups((prev) => ({ ...prev, [year]: isGroupExpanded(year, index) }));

  // 全部展開 / 全部收合
  const allExpanded = sortedYears.every((year, index) => isGroupExpanded(year, index));
  const toggleAll = () => {
    const next: Record<string, boolean> = {};
    sortedYears.forEach((year) => {
      next[year] = allExpanded; // 目前全展開 → 全收合（true）；否則全展開（false）
    });
    setCollapsedGroups(next);
  };

  const handleDrop = (event: DragEvent<HTMLElement>, folderKey: string) => {
    if (!isDragging) return;
    event.preventDefault();
    event.stopPropagation();
    setDropTarget(null);
    onDropItem?.(folderKey);
  };

  const handleCardClick = (folder: FolderItem, event: MouseEvent<HTMLElement>) => {
    if (longPress.consumeClick()) return;
    const id = makeSelectionId(folder.key, true);
    if (isAdmin && (event.shiftKey || event.ctrlKey || event.metaKey)) {
      onItemClick(id, { shiftKey: event.shiftKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey });
      return;
    }
    if (isAdmin && selectionMode) {
      onToggleSelect(id);
      return;
    }
    onEnter(folder.key);
  };

  const renderCard = (folder: FolderItem) => {
    const id = makeSelectionId(folder.key, true);
    const selected = isAdmin && isSelected(id);
    const isDropping = dropTarget === folder.key;

    return (
      <article
        key={folder.key}
        className={`group relative flex min-w-0 cursor-pointer items-center gap-3 rounded-2xl border bg-surface-800/40 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-800/70 ${
          selected
            ? 'border-primary-500 ring-2 ring-primary-500/60'
            : isDropping
              ? 'border-primary-400 ring-2 ring-primary-400/60'
              : 'border-surface-700/60 hover:border-primary-500/40'
        }`}
        role="button"
        tabIndex={0}
        draggable={isAdmin}
        onClick={(event) => handleCardClick(folder, event)}
        onContextMenu={(event) => {
          if (!isAdmin) return;
          onContextMenu(event, { key: folder.key, isFolder: true });
        }}
        onTouchStart={isAdmin ? () => longPress.start(id) : undefined}
        onTouchMove={longPress.cancel}
        onTouchEnd={longPress.cancel}
        onTouchCancel={longPress.cancel}
        onDragStart={(event) => {
          if (!isAdmin) return;
          event.stopPropagation();
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', folder.key);
          onItemDragStart?.(folder.key, event);
        }}
        onDragEnd={() => onItemDragEnd?.()}
        onDragOver={(event) => {
          if (!isDragging) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          if (dropTarget !== folder.key) setDropTarget(folder.key);
        }}
        onDragLeave={() => {
          if (dropTarget === folder.key) setDropTarget(null);
        }}
        onDrop={(event) => handleDrop(event, folder.key)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (isAdmin && selectionMode) onToggleSelect(id);
            else onEnter(folder.key);
          }
        }}
        aria-label={isDragging ? `將項目移動到 ${folder.name} 資料夾` : folder.name || '資料夾'}
      >
        {isAdmin ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleSelect(id);
            }}
            className={`absolute left-2.5 top-2.5 z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all duration-150 cursor-pointer ${
              selected
                ? 'border-primary-400 bg-primary-500 text-surface-950'
                : `border-white/70 bg-surface-900/60 text-transparent ${selectionMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`
            }`}
            aria-label={selected ? '取消選取' : '選取'}
            aria-pressed={selected}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </button>
        ) : null}

        <div className="flex size-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary-500/15 text-2xl ring-1 ring-primary-500/20">
          📁
        </div>
        <h4 className="min-w-0 flex-1 break-words text-base font-semibold text-surface-50">{folder.name || '未命名'}</h4>

        {isAdmin ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onContextMenu(event, { key: folder.key, isFolder: true });
            }}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-surface-300 opacity-0 transition-all duration-150 hover:bg-surface-900/70 hover:text-white group-hover:opacity-100 cursor-pointer"
            aria-label="更多操作"
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="5" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="12" cy="19" r="1.6" />
            </svg>
          </button>
        ) : null}
      </article>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-xl font-bold text-surface-50">資料夾</h3>
          <span className="rounded-full bg-primary-500/10 px-3 py-1 text-xs font-semibold text-primary-300 ring-1 ring-primary-500/20">
            {folders.length} 個
          </span>
        </div>
        {isRootLevel && sortedYears.length > 1 ? (
          <button
            type="button"
            onClick={toggleAll}
            className="rounded-lg border border-surface-700 px-3 py-1.5 text-xs font-semibold text-surface-300 transition-colors hover:border-primary-500/50 hover:text-primary-100 cursor-pointer"
          >
            {allExpanded ? '全部收合' : '全部展開'}
          </button>
        ) : null}
      </div>

      {!isRootLevel ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{folders.map(renderCard)}</div>
      ) : (
        <div className="space-y-4">
          {sortedYears.map((year, index) => {
            const groupFolders = groupedFolders[year];
            const expanded = isGroupExpanded(year, index);
            return (
              <div key={year} className="space-y-3">
                <button
                  type="button"
                  onClick={() => toggleGroup(year, index)}
                  className="flex w-full items-center justify-between rounded-xl bg-surface-800/40 px-4 py-3 text-left transition-colors hover:bg-surface-800/70 focus:outline-none focus:ring-2 focus:ring-primary-500/40 cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <h4 className="text-base font-bold text-surface-50">{year === '其他' ? '其他未分類' : `${year} 年`}</h4>
                    <span className="rounded-full bg-surface-700/50 px-2 py-0.5 text-xs text-surface-300">{groupFolders.length}</span>
                  </div>
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full bg-surface-700/40 text-surface-300 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </span>
                </button>
                {expanded ? (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{groupFolders.map(renderCard)}</div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
