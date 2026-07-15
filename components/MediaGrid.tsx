'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { AdminActionModal } from './media/AdminActionModal';
import { BreadcrumbNav } from './media/BreadcrumbNav';
import { ConfirmDialog } from './media/ConfirmDialog';
import { ContextMenu, ContextMenuItem } from './media/ContextMenu';
import { MAX_ADMIN_TOKEN_LENGTH, MAX_FOLDER_DEPTH, MAX_FOLDER_NAME_LENGTH } from './media/constants';
import { DropzoneOverlay } from './media/DropzoneOverlay';
import { EmptyState } from './media/EmptyState';
import { FolderGrid } from './media/FolderGrid';
import { useAdminAuth } from './media/hooks/useAdminAuth';
import { useBucketUsage } from './media/hooks/useBucketUsage';
import { useContextMenu } from './media/hooks/useContextMenu';
import { useDialogs } from './media/hooks/useDialogs';
import { useDropUpload } from './media/hooks/useDropUpload';
import { useMediaActions } from './media/hooks/useMediaActions';
import { useMediaData } from './media/hooks/useMediaData';
import { useMediaDragDrop } from './media/hooks/useMediaDragDrop';
import { useMessage } from './media/hooks/useMessage';
import { makeSelectionId, useSelection } from './media/hooks/useSelection';
import { useUndoableDelete } from './media/hooks/useUndoableDelete';
import { MediaPreviewModal } from './media/MediaPreviewModal';
import { MediaSection } from './media/MediaSection';
import { MediaSkeleton } from './media/MediaSkeleton';
import { MessageToast } from './media/MessageToast';
import { MovePickerModal } from './media/MovePickerModal';
import { NewFolderModal } from './media/NewFolderModal';
import { PasswordPromptModal } from './media/PasswordPromptModal';
import { SelectionToolbar } from './media/SelectionToolbar';
import { Toolbar } from './media/Toolbar';
import { UndoToast } from './media/UndoToast';
import { getDepth, sanitizeName } from './media/sanitize';
import { MediaFile } from './media/types';

type Breadcrumb = { label: string; key: string };

type PreviewState = {
  media: MediaFile | null;
  trigger: HTMLElement | null;
};

/**
 * MediaGrid Component: 專案核心元件
 * 整合媒體瀏覽、資料夾導覽、權限驗證、上傳、檔案操作，以及 Drive 風的多選 / 右鍵 / 拖曳上傳。
 * 拖曳上傳、刪除 Undo、頂部工具列分別抽到 useDropUpload / useUndoableDelete / Toolbar。
 */
export function MediaGrid() {
  const { message, messageTone, pushMessage } = useMessage();
  const { passwordReq, confirmReq, openPassword, confirm, closePassword, closeConfirm } = useDialogs();

  const {
    files,
    folders,
    loading,
    currentPrefix,
    setCurrentPrefix,
    loadMedia,
    removeLocalItems,
    renameLocalItem,
    filter,
    setFilter,
    searchQuery,
    setSearchQuery,
    sortKey,
    setSortKey,
    sortDir,
    setSortDir,
    hasMore,
    loadingMore,
    loadMore,
    filteredFiles,
    filterVisible,
    searchEnabled
  } = useMediaData({ pushMessage });


  const { adminTokenRef, isAdmin, clearAdminSession, requestAdminToken, authorizedFetch } = useAdminAuth({
    pushMessage,
    openPassword
  });
  const usage = useBucketUsage(isAdmin, authorizedFetch);

  const {
    handleCreateFolder,
    adminAction,
    setAdminAction,
    openAdminActionModal,
    handleAdminActionConfirm,
    handleBatchMove,
    commitDeleteOnServer
  } = useMediaActions({
    authorizedFetch,
    requestAdminToken,
    pushMessage,
    loadMedia,
    removeLocalItems,
    renameLocalItem,
    currentPrefix
  });

  const { isDragging, handleItemDragStart, handleItemDragEnd, moveDraggedItemTo } = useMediaDragDrop({
    isAdmin,
    currentPrefix,
    requestAdminToken,
    pushMessage,
    handleAdminActionConfirm
  });

  // 選取項目順序：資料夾在前、檔案在後（供範圍選取）。
  // 用「已篩選的完整清單」而非僅可見清單，避免排序/捲動重設 visibleCount 時誤清選取。
  const orderedIds = useMemo(
    () => [
      ...folders.map((folder) => makeSelectionId(folder.key, true)),
      ...filteredFiles.map((file) => makeSelectionId(file.key, false))
    ],
    [folders, filteredFiles]
  );
  const selection = useSelection(orderedIds);
  const { menu, openMenu, closeMenu } = useContextMenu();

  const { dropActive, dropUploading, dropProgress, internalDragRef, handleDroppedFiles } = useDropUpload({
    currentPrefix,
    adminTokenRef,
    requestAdminToken,
    pushMessage,
    confirm,
    usageBytes: usage.usageBytes,
    refreshUsage: usage.refresh,
    loadMedia
  });

  const { pendingDelete, requestDelete, undoDelete } = useUndoableDelete({
    currentPrefix,
    requestAdminToken,
    confirm,
    pushMessage,
    removeLocalItems,
    commitDeleteOnServer,
    loadMedia,
    onDeleted: selection.clear
  });

  const [preview, setPreview] = useState<PreviewState>({ media: null, trigger: null });
  const [moveItems, setMoveItems] = useState<{ key: string; isFolder: boolean }[] | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  // 切換資料夾時清除選取（僅依路徑變動觸發）
  useEffect(() => {
    selection.clear();
  }, [currentPrefix]);

  const depth = Math.min(getDepth(currentPrefix), MAX_FOLDER_DEPTH);

  const breadcrumbTrail: Breadcrumb[] = useMemo(() => {
    const parts = currentPrefix.split('/').filter(Boolean);
    const nested = parts.map((part, index, arr) => ({ label: part, key: arr.slice(0, index + 1).join('/') }));
    return [{ label: '根目錄', key: '' }, ...nested];
  }, [currentPrefix]);

  const parentPrefix = useMemo(() => {
    if (!currentPrefix) return null;
    const parts = currentPrefix.split('/').filter(Boolean);
    parts.pop();
    return parts.join('/');
  }, [currentPrefix]);

  const handleEnterFolder = (folderKey: string) => {
    if (getDepth(folderKey) > MAX_FOLDER_DEPTH) {
      pushMessage('資料夾層數最多兩層', 'error');
      return;
    }
    pushMessage('', 'info');
    setCurrentPrefix(folderKey);
  };

  const handleBack = () => {
    if (!currentPrefix) return;
    const parts = currentPrefix.split('/').filter(Boolean);
    parts.pop();
    setCurrentPrefix(parts.join('/'));
  };

  const handleClearAdminToken = () => {
    selection.clear();
    clearAdminSession('已退出管理模式');
  };

  // 開啟移動目的地選擇器（單一或批次共用）
  const openMove = async (items: { key: string; isFolder: boolean }[]) => {
    if (items.length === 0) return;
    const allowed = await requestAdminToken('請輸入管理密碼以移動項目');
    if (!allowed) return;
    setMoveItems(items);
  };

  const handleMoveConfirm = async (targetPrefix: string) => {
    const items = moveItems ?? [];
    setMoveItems(null);
    if (items.length === 1) {
      await handleAdminActionConfirm({
        action: 'move',
        key: items[0].key,
        isFolder: items[0].isFolder,
        targetPrefix
      });
    } else if (items.length > 1) {
      selection.clear();
      await handleBatchMove(items, targetPrefix);
    }
  };

  // 右鍵 / 溢位選單：開啟（資料夾進入、檔案預覽）
  const openTarget = (target: { key: string; isFolder: boolean }) => {
    if (target.isFolder) {
      handleEnterFolder(target.key);
      return;
    }
    const file = files.find((item) => item.key === target.key);
    if (file) setPreview({ media: file, trigger: null });
  };

  const contextItems: ContextMenuItem[] = useMemo(() => {
    const target = menu.target;
    if (!target) return [];
    const targetId = makeSelectionId(target.key, target.isFolder);
    const useBatch = selection.selectionMode && selection.isSelected(targetId) && selection.selectedCount > 1;

    if (useBatch) {
      return [
        { label: `移動所選 (${selection.selectedCount})`, icon: '📁', onSelect: () => void openMove(selection.selectedItems) },
        { type: 'separator' },
        {
          label: `刪除所選 (${selection.selectedCount})`,
          icon: '🗑️',
          danger: true,
          onSelect: () => void requestDelete(selection.selectedItems)
        }
      ];
    }

    return [
      { label: target.isFolder ? '開啟資料夾' : '預覽', icon: target.isFolder ? '📂' : '👁️', onSelect: () => openTarget(target) },
      { label: '重新命名', icon: '✏️', onSelect: () => void openAdminActionModal('rename', target.key, target.isFolder) },
      { label: '移動', icon: '📁', onSelect: () => void openMove([{ key: target.key, isFolder: target.isFolder }]) },
      { type: 'separator' },
      { label: '刪除', icon: '🗑️', danger: true, onSelect: () => void requestDelete([{ key: target.key, isFolder: target.isFolder }]) }
    ];
  }, [menu.target, selection.selectionMode, selection.selectedCount, files]);

  // ── 鍵盤快捷鍵：Ctrl/Cmd+A 全選、Esc 清除、Delete 刪除所選 ──
  const anyModalOpen =
    Boolean(preview.media) ||
    Boolean(adminAction) ||
    Boolean(moveItems) ||
    newFolderOpen ||
    Boolean(passwordReq) ||
    Boolean(confirmReq);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (anyModalOpen || !isAdmin) return;

      if ((event.ctrlKey || event.metaKey) && (event.key === 'a' || event.key === 'A')) {
        if (folders.length || filteredFiles.length) {
          event.preventDefault();
          selection.selectAll();
        }
        return;
      }
      if (event.key === 'Escape' && selection.selectionMode) {
        selection.clear();
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selection.selectionMode) {
        event.preventDefault();
        void requestDelete(selection.selectedItems);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [anyModalOpen, isAdmin, selection, folders.length, filteredFiles.length, requestDelete]);

  const hasItems = files.length > 0 || folders.length > 0;
  const filterLabel = filterVisible ? (filter === 'all' ? '全部' : filter === 'image' ? '僅圖片' : '僅影片') : '全部';

  return (
    <section className="relative space-y-6">
      <MessageToast message={message} tone={messageTone} />

      <Toolbar
        isAdmin={isAdmin}
        usageBytes={usage.usageBytes}
        usageLoading={usage.loading}
        usageError={usage.error}
        onEnableAdmin={() => void requestAdminToken('請輸入管理密碼以啟用管理模式')}
        onExitAdmin={handleClearAdminToken}
        onPickUpload={() => uploadInputRef.current?.click()}
        onCreateFolder={() => setNewFolderOpen(true)}
      />

      {/* 隱藏的上傳檔案 input（＋ 新增 → 上傳檔案） */}
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(event) => {
          const list = Array.from(event.target.files ?? []);
          event.target.value = '';
          if (list.length) void handleDroppedFiles(list);
        }}
      />

      <BreadcrumbNav
        breadcrumbTrail={breadcrumbTrail}
        currentPrefix={currentPrefix}
        foldersCount={folders.length}
        filesCount={files.length}
        hasMore={hasMore}
        onBack={handleBack}
        onRefresh={() => loadMedia(currentPrefix)}
        onNavigate={setCurrentPrefix}
        loading={loading}
      />

      {isAdmin && isDragging && parentPrefix !== null ? (
        <div
          className="flex items-center justify-between gap-3 rounded-2xl border-2 border-dashed border-primary-400/60 bg-primary-500/10 px-4 py-3 text-primary-50"
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
          }}
          onDrop={(event) => {
            event.preventDefault();
            void moveDraggedItemTo(parentPrefix);
          }}
          role="button"
          aria-label="將項目放到上一層"
        >
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-lg">⬆️</span>
            <span>放到上一層</span>
          </div>
          <p className="text-xs text-primary-100/80">將拖曳中的項目移動到「{parentPrefix || '根目錄'}」</p>
        </div>
      ) : null}

      {loading ? (
        <MediaSkeleton />
      ) : (
        <>
          {!hasItems && !hasMore && <EmptyState atMaxDepth={depth >= MAX_FOLDER_DEPTH} />}

          <FolderGrid
            folders={folders}
            isAdmin={isAdmin}
            onEnter={handleEnterFolder}
            isRootLevel={currentPrefix === ''}
            isDragging={isAdmin ? isDragging : false}
            onDropItem={(targetKey) => void moveDraggedItemTo(targetKey)}
            onItemDragStart={(folderKey, event) => {
              internalDragRef.current = true;
              handleItemDragStart({ key: folderKey, isFolder: true }, event);
            }}
            onItemDragEnd={() => {
              internalDragRef.current = false;
              handleItemDragEnd();
            }}
            isSelected={selection.isSelected}
            selectionMode={selection.selectionMode}
            onItemClick={selection.handleClick}
            onToggleSelect={selection.toggle}
            onContextMenu={openMenu}
          />

          <MediaSection
            allFilesCount={files.length}
            files={filteredFiles}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={loadMore}
            onSelect={(file, trigger) => setPreview({ media: file, trigger })}
            filterLabel={filterLabel}
            filter={filter}
            filterVisible={filterVisible}
            onFilterChange={(value) => setFilter(value)}
            searchEnabled={searchEnabled}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            sortKey={sortKey}
            sortDir={sortDir}
            onSortKeyChange={setSortKey}
            onSortDirToggle={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
            isAdmin={isAdmin}
            isSelected={selection.isSelected}
            selectionMode={selection.selectionMode}
            onItemClick={selection.handleClick}
            onToggleSelect={selection.toggle}
            onContextMenu={openMenu}
            onDragStart={(file, event) => {
              internalDragRef.current = true;
              handleItemDragStart({ key: file.key, isFolder: false }, event);
            }}
            onDragEnd={() => {
              internalDragRef.current = false;
              handleItemDragEnd();
            }}
          />
          {hasMore && files.length === 0 ? (
            <div className="flex justify-center py-6" aria-live="polite">
              <button type="button" onClick={loadMore} disabled={loadingMore} className="flex items-center gap-2 rounded-full border border-surface-700 bg-surface-800/80 px-4 py-2 text-sm font-semibold text-surface-200 transition-colors hover:border-primary-500/60 hover:bg-primary-500/10 hover:text-primary-100 disabled:cursor-wait disabled:opacity-60">
                {loadingMore ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-400/40 border-t-primary-400" aria-hidden /> : null}
                <span>{loadingMore ? '\u8f09\u5165\u4e2d\u2026' : '\u8f09\u5165\u66f4\u591a'}</span>
              </button>
            </div>
          ) : null}
        </>
      )}

      <AdminActionModal
        key={adminAction ? `${adminAction.action}-${adminAction.target.key}` : 'idle'}
        action={adminAction?.action ?? null}
        target={adminAction?.target ?? null}
        maxNameLength={MAX_FOLDER_NAME_LENGTH}
        sanitizeName={sanitizeName}
        onCancel={() => setAdminAction(null)}
        onConfirm={handleAdminActionConfirm}
      />

      <MediaPreviewModal
        media={preview.media}
        allFiles={filteredFiles}
        onClose={() => setPreview({ media: null, trigger: null })}
        onNavigate={(file) => setPreview((prev) => ({ media: file, trigger: prev.trigger }))}
        triggerElement={preview.trigger}
      />

      <MovePickerModal
        open={Boolean(moveItems)}
        items={moveItems ?? []}
        startPrefix={currentPrefix}
        maxDepth={MAX_FOLDER_DEPTH}
        onCancel={() => setMoveItems(null)}
        onConfirm={handleMoveConfirm}
      />

      <NewFolderModal
        open={newFolderOpen}
        onCancel={() => setNewFolderOpen(false)}
        onConfirm={async (name) => {
          const ok = await handleCreateFolder(name);
          if (ok) setNewFolderOpen(false);
        }}
      />

      <ContextMenu open={menu.open} x={menu.x} y={menu.y} items={contextItems} onClose={closeMenu} />

      <SelectionToolbar
        count={selection.selectedCount}
        onMove={() => void openMove(selection.selectedItems)}
        onDelete={() => void requestDelete(selection.selectedItems)}
        onClear={selection.clear}
      />

      <UndoToast open={Boolean(pendingDelete)} count={pendingDelete?.length ?? 0} onUndo={undoDelete} />

      <DropzoneOverlay
        active={dropActive && isAdmin}
        uploading={dropUploading}
        progress={dropProgress}
        targetLabel={currentPrefix || '根目錄'}
      />

      <PasswordPromptModal request={passwordReq} maxLength={MAX_ADMIN_TOKEN_LENGTH} onClose={closePassword} />
      <ConfirmDialog request={confirmReq} onClose={closeConfirm} />
    </section>
  );
}
