'use client';

import { type DragEvent, type MouseEvent, useState } from 'react';

import { ContextTarget } from './hooks/useContextMenu';
import { useLongPress } from './hooks/useLongPress';
import { makeSelectionId, SelectionId } from './hooks/useSelection';
import { FolderItem } from './types';

type ItemModifiers = { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean };

export function FolderGrid({
  folders,
  isAdmin,
  onEnter,
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
  const longPress = useLongPress((id) => onToggleSelect(id));

  if (!folders.length) return null;

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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h3 className="text-xl font-bold text-white">資料夾</h3>
        <span className="rounded-full bg-primary-500/10 px-3 py-1 text-xs font-semibold text-primary-300 ring-1 ring-primary-500/20">
          {folders.length} 個
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {folders.map((folder) => {
          const id = makeSelectionId(folder.key, true);
          const selected = isAdmin && isSelected(id);
          const isDropping = dropTarget === folder.key;

          return (
            <article
              key={folder.key}
              className={`group relative flex min-w-0 cursor-pointer items-center gap-3 rounded-2xl border bg-surface-800/50 p-4 shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-800/80 ${
                selected
                  ? 'border-primary-500 ring-2 ring-primary-500/60'
                  : isDropping
                    ? 'border-primary-400 ring-2 ring-primary-400/60'
                    : 'border-surface-700/50 hover:border-primary-500/40'
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
              {/* 選取核取方塊 */}
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

              <div className="flex size-12 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500/20 to-primary-600/10 text-2xl ring-1 ring-primary-500/20">
                📂
              </div>
              <h4 className="min-w-0 flex-1 truncate text-base font-semibold text-white">{folder.name || '未命名'}</h4>

              {/* 溢位選單 ⋮ */}
              {isAdmin ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onContextMenu(event, { key: folder.key, isFolder: true });
                  }}
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-surface-900/0 text-surface-300 opacity-0 transition-all duration-150 hover:bg-surface-900/70 hover:text-white group-hover:opacity-100 cursor-pointer"
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
        })}
      </div>
    </div>
  );
}
