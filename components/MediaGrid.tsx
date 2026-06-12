'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { uploadFiles } from '@/lib/upload/client';
import { MAX_TOTAL_SIZE_MB, getSizeLimitByMime } from '@/lib/upload/constants';

import { AdminAccessPanel } from './media/AdminAccessPanel';
import { AdminActionModal } from './media/AdminActionModal';
import { BatchMoveModal } from './media/BatchMoveModal';
import { BreadcrumbNav } from './media/BreadcrumbNav';
import { ConfirmDialog } from './media/ConfirmDialog';
import { ContextMenu, ContextMenuItem } from './media/ContextMenu';
import {
  MAX_ADMIN_TOKEN_LENGTH,
  MAX_FOLDER_DEPTH,
  MAX_FOLDER_NAME_LENGTH
} from './media/constants';
import { DropzoneOverlay } from './media/DropzoneOverlay';
import { EmptyState } from './media/EmptyState';
import { FolderCreator } from './media/FolderCreator';
import { FolderGrid } from './media/FolderGrid';
import { useAdminAuth } from './media/hooks/useAdminAuth';
import { useBucketUsage } from './media/hooks/useBucketUsage';
import { useContextMenu } from './media/hooks/useContextMenu';
import { useDialogs } from './media/hooks/useDialogs';
import { useMediaActions } from './media/hooks/useMediaActions';
import { useMediaData } from './media/hooks/useMediaData';
import { useMediaDragDrop } from './media/hooks/useMediaDragDrop';
import { useMessage } from './media/hooks/useMessage';
import { makeSelectionId, useSelection } from './media/hooks/useSelection';
import { MediaPreviewModal } from './media/MediaPreviewModal';
import { MediaSection } from './media/MediaSection';
import { MediaSkeleton } from './media/MediaSkeleton';
import { MessageToast } from './media/MessageToast';
import { PasswordPromptModal } from './media/PasswordPromptModal';
import { SelectionToolbar } from './media/SelectionToolbar';
import { getDepth, sanitizeName, sanitizePath } from './media/sanitize';
import { MediaFile } from './media/types';
import { UploadForm } from './UploadForm';

type Breadcrumb = { label: string; key: string };

type PreviewState = {
  media: MediaFile | null;
  trigger: HTMLElement | null;
};

/**
 * MediaGrid Component: 專案核心元件
 * 整合媒體瀏覽、資料夾導覽、權限驗證、上傳、檔案操作，以及 Drive 風的多選 / 右鍵 / 拖曳上傳。
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
    visibleFiles,
    hasMore,
    loadMore,
    filteredFiles,
    filterVisible,
    searchEnabled
  } = useMediaData({ pushMessage });

  const usage = useBucketUsage();

  const {
    adminToken,
    adminTokenRef,
    adminInput,
    isAdmin,
    setAdminInput,
    validateAndApplyToken,
    clearAdminSession,
    requestAdminToken,
    authorizedFetch
  } = useAdminAuth({ pushMessage, openPassword });

  const {
    newFolderName,
    setNewFolderName,
    handleCreateFolder,
    adminAction,
    setAdminAction,
    openAdminActionModal,
    handleAdminActionConfirm,
    handleBatchMove,
    handleBatchDelete
  } = useMediaActions({
    authorizedFetch,
    requestAdminToken,
    pushMessage,
    loadMedia,
    removeLocalItems,
    renameLocalItem,
    currentPrefix
  });

  const { isDraggingMedia, handleMediaDragStart, handleMediaDragEnd, moveDraggedMediaTo } = useMediaDragDrop({
    isAdmin,
    currentPrefix,
    requestAdminToken,
    pushMessage,
    handleAdminActionConfirm
  });

  // 選取項目順序：資料夾在前、可見檔案在後（供範圍選取）
  const orderedIds = useMemo(
    () => [
      ...folders.map((folder) => makeSelectionId(folder.key, true)),
      ...visibleFiles.map((file) => makeSelectionId(file.key, false))
    ],
    [folders, visibleFiles]
  );
  const selection = useSelection(orderedIds);
  const { menu, openMenu, closeMenu } = useContextMenu();

  const [preview, setPreview] = useState<PreviewState>({ media: null, trigger: null });
  const [batchMoveOpen, setBatchMoveOpen] = useState(false);

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

  const handleSaveAdminToken = () => {
    void validateAndApplyToken(adminInput);
  };

  const handleClearAdminToken = () => {
    clearAdminSession('已退出管理模式');
  };

  // ── 拖曳檔案到頁面上傳 ──
  const [dropActive, setDropActive] = useState(false);
  const [dropUploading, setDropUploading] = useState(false);
  const [dropProgress, setDropProgress] = useState(0);
  const dragCounter = useRef(0);
  // 站內媒體/資料夾拖曳期間為 true，避免整頁上傳層誤觸（瀏覽器原生拖圖會帶 Files 型別）
  const internalDragRef = useRef(false);

  const handleDroppedFiles = useCallback(
    async (dropped: File[]) => {
      const selected = dropped.filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/'));
      if (selected.length === 0) {
        pushMessage('沒有可上傳的圖片或影片檔案。', 'error');
        return;
      }
      const within = selected.filter((f) => {
        const limit = getSizeLimitByMime(f.type);
        return typeof limit === 'number' && f.size <= limit;
      });
      const oversized = selected.length - within.length;
      if (within.length === 0) {
        pushMessage('檔案皆超過大小上限，請調整後再上傳。', 'error');
        return;
      }
      const totalSize = within.reduce((sum, f) => sum + f.size, 0);
      if (totalSize > MAX_TOTAL_SIZE_MB * 1024 * 1024) {
        pushMessage(`總容量超過 ${MAX_TOTAL_SIZE_MB}MB，請分批上傳。`, 'error');
        return;
      }

      const allowed = await requestAdminToken('請輸入管理密碼以上傳');
      if (!allowed) return;

      setDropUploading(true);
      setDropProgress(0);
      try {
        const response = await uploadFiles({
          files: within,
          path: currentPrefix,
          adminToken: adminTokenRef.current,
          onProgress: (percent) => setDropProgress(percent ?? 0)
        });
        if (!response.ok) {
          pushMessage('上傳失敗，請稍後再試。', 'error');
        } else {
          pushMessage(
            `已上傳 ${within.length} 個檔案${oversized > 0 ? `（略過 ${oversized} 個過大檔案）` : ''}`,
            'success'
          );
          await loadMedia(currentPrefix, { silent: true });
          void usage.refresh(true);
        }
      } catch {
        pushMessage('上傳時發生錯誤，請稍後再試。', 'error');
      } finally {
        setDropUploading(false);
      }
    },
    [requestAdminToken, currentPrefix, adminTokenRef, pushMessage, loadMedia, usage]
  );

  useEffect(() => {
    // 只接受「從外部拖入的檔案」：必須帶 Files 型別，且非站內拖曳
    const isExternalFileDrag = (event: DragEvent) =>
      !internalDragRef.current && Array.from(event.dataTransfer?.types ?? []).includes('Files');

    const onDragEnter = (event: DragEvent) => {
      if (!isExternalFileDrag(event)) return;
      event.preventDefault();
      dragCounter.current += 1;
      setDropActive(true);
    };
    const onDragOver = (event: DragEvent) => {
      if (!isExternalFileDrag(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const onDragLeave = (event: DragEvent) => {
      if (!isExternalFileDrag(event)) return;
      dragCounter.current -= 1;
      if (dragCounter.current <= 0) {
        dragCounter.current = 0;
        setDropActive(false);
      }
    };
    const onDrop = (event: DragEvent) => {
      dragCounter.current = 0;
      setDropActive(false);
      if (!isExternalFileDrag(event)) return;
      event.preventDefault();
      const list = event.dataTransfer ? Array.from(event.dataTransfer.files) : [];
      if (list.length) void handleDroppedFiles(list);
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [handleDroppedFiles]);

  // ── 右鍵 / 溢位選單內容 ──
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
        { label: `移動所選 (${selection.selectedCount})`, icon: '📁', onSelect: () => setBatchMoveOpen(true) },
        { type: 'separator' },
        {
          label: `刪除所選 (${selection.selectedCount})`,
          icon: '🗑️',
          danger: true,
          onSelect: () => void handleBatchDeleteClick()
        }
      ];
    }

    return [
      { label: target.isFolder ? '開啟資料夾' : '預覽', icon: target.isFolder ? '📂' : '👁️', onSelect: () => openTarget(target) },
      { label: '重新命名', icon: '✏️', onSelect: () => void openAdminActionModal('rename', target.key, target.isFolder) },
      { label: '移動', icon: '📁', onSelect: () => void openAdminActionModal('move', target.key, target.isFolder) },
      { type: 'separator' },
      { label: '刪除', icon: '🗑️', danger: true, onSelect: () => void openAdminActionModal('delete', target.key, target.isFolder) }
    ];
  }, [menu.target, selection.selectionMode, selection.selectedCount, files]);

  // ── 批次操作 ──
  const handleBatchDeleteClick = async () => {
    const items = selection.selectedItems;
    if (items.length === 0) return;
    const ok = await confirm({
      title: '刪除所選項目',
      message: `確定刪除選取的 ${items.length} 個項目？資料夾會連同內容一併刪除，此操作無法復原。`,
      confirmLabel: '刪除',
      danger: true
    });
    if (!ok) return;
    selection.clear();
    await handleBatchDelete(items);
  };

  const handleBatchMoveConfirm = async (targetPrefix: string) => {
    const items = selection.selectedItems;
    setBatchMoveOpen(false);
    selection.clear();
    await handleBatchMove(items, targetPrefix);
  };

  const hasItems = files.length > 0 || folders.length > 0;
  const filterLabel = filterVisible ? (filter === 'all' ? '全部' : filter === 'image' ? '僅圖片' : '僅影片') : '全部';

  return (
    <section className="relative space-y-6">
      <MessageToast message={message} tone={messageTone} />

      {/* 控制面板 */}
      <div className="glass-card rounded-3xl border border-surface-700/50 bg-surface-900/80 p-6 shadow-xl ring-1 ring-white/5 sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-primary-500 shadow-[0_0_8px_rgba(6,182,212,0.5)]" />
              <p className="text-sm font-semibold text-primary-400">R2 即時同步</p>
            </div>
            <h2 className="text-2xl font-bold text-white">媒體控制台</h2>
            <p className="text-sm leading-relaxed text-surface-400">
              快速檢視路徑、啟用安全管理密碼，並在需要時開啟管理模式處理上傳與編輯。管理模式下可框選、右鍵操作，或將檔案直接拖入頁面上傳。
            </p>
          </div>
        </div>

        <div className="mt-6">
          <AdminAccessPanel
            isAdmin={isAdmin}
            adminInput={adminInput}
            maxLength={MAX_ADMIN_TOKEN_LENGTH}
            onValidate={handleSaveAdminToken}
            onClear={handleClearAdminToken}
            onInputChange={setAdminInput}
          />
        </div>

        {isAdmin ? (
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <FolderCreator
              value={newFolderName}
              onChange={(value) => setNewFolderName(sanitizeName(value))}
              onSubmit={handleCreateFolder}
            />
            <UploadForm
              adminToken={adminToken}
              currentPath={currentPrefix}
              onUploaded={() => {
                void loadMedia(currentPrefix, { silent: true });
                void usage.refresh(true);
              }}
              usageBytes={usage.usageBytes}
              usageLoading={usage.loading}
              usageError={usage.error}
              confirm={confirm}
            />
          </div>
        ) : null}
      </div>

      <BreadcrumbNav
        breadcrumbTrail={breadcrumbTrail}
        currentPrefix={currentPrefix}
        maxDepth={MAX_FOLDER_DEPTH}
        foldersCount={folders.length}
        filesCount={files.length}
        onBack={handleBack}
        onRefresh={() => loadMedia(currentPrefix)}
        onNavigate={setCurrentPrefix}
        loading={loading}
        depth={depth}
      />

      {isAdmin && isDraggingMedia && parentPrefix !== null ? (
        <div
          className="flex items-center justify-between gap-3 rounded-2xl border-2 border-dashed border-primary-400/60 bg-primary-500/10 px-4 py-3 text-primary-50"
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
          }}
          onDrop={(event) => {
            event.preventDefault();
            void moveDraggedMediaTo(parentPrefix);
          }}
          role="button"
          aria-label="將媒體放到上一層"
        >
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-lg">⬆️</span>
            <span>放到上一層</span>
          </div>
          <p className="text-xs text-primary-100/80">將拖曳中的媒體移動到「{parentPrefix || '根目錄'}」</p>
        </div>
      ) : null}

      {loading ? (
        <MediaSkeleton />
      ) : (
        <>
          {!hasItems && <EmptyState atMaxDepth={depth >= MAX_FOLDER_DEPTH} />}

          <FolderGrid
            folders={folders}
            isAdmin={isAdmin}
            onEnter={handleEnterFolder}
            canDropMedia={isAdmin ? isDraggingMedia : false}
            onDropMedia={(targetKey) => void moveDraggedMediaTo(targetKey)}
            isSelected={selection.isSelected}
            selectionMode={selection.selectionMode}
            onItemClick={selection.handleClick}
            onToggleSelect={selection.toggle}
            onContextMenu={openMenu}
          />

          <MediaSection
            allFilesCount={files.length}
            files={filteredFiles}
            visibleFiles={visibleFiles}
            hasMore={hasMore}
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
              handleMediaDragStart(file, event);
            }}
            onDragEnd={() => {
              internalDragRef.current = false;
              handleMediaDragEnd();
            }}
          />
        </>
      )}

      <AdminActionModal
        key={adminAction ? `${adminAction.action}-${adminAction.target.key}-${currentPrefix}` : 'idle'}
        action={adminAction?.action ?? null}
        target={adminAction?.target ?? null}
        currentPrefix={currentPrefix}
        maxDepth={MAX_FOLDER_DEPTH}
        maxNameLength={MAX_FOLDER_NAME_LENGTH}
        sanitizeName={sanitizeName}
        sanitizePath={sanitizePath}
        getDepth={getDepth}
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

      <BatchMoveModal
        open={batchMoveOpen}
        count={selection.selectedCount}
        hasFolder={selection.selectedItems.some((item) => item.isFolder)}
        currentPrefix={currentPrefix}
        maxDepth={MAX_FOLDER_DEPTH}
        sanitizePath={sanitizePath}
        getDepth={getDepth}
        onCancel={() => setBatchMoveOpen(false)}
        onConfirm={handleBatchMoveConfirm}
      />

      <ContextMenu open={menu.open} x={menu.x} y={menu.y} items={contextItems} onClose={closeMenu} />

      <SelectionToolbar
        count={selection.selectedCount}
        onMove={() => setBatchMoveOpen(true)}
        onDelete={() => void handleBatchDeleteClick()}
        onClear={selection.clear}
      />

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
