'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { uploadFiles } from '@/lib/upload/client';
import { MAX_TOTAL_SIZE_MB, getSizeLimitByMime } from '@/lib/upload/constants';

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
import { useMediaActions } from './media/hooks/useMediaActions';
import { useMediaData } from './media/hooks/useMediaData';
import { useMediaDragDrop } from './media/hooks/useMediaDragDrop';
import { useMessage } from './media/hooks/useMessage';
import { makeSelectionId, useSelection } from './media/hooks/useSelection';
import { MediaPreviewModal } from './media/MediaPreviewModal';
import { MediaSection } from './media/MediaSection';
import { MediaSkeleton } from './media/MediaSkeleton';
import { MessageToast } from './media/MessageToast';
import { MovePickerModal } from './media/MovePickerModal';
import { NewFolderModal } from './media/NewFolderModal';
import { UndoToast } from './media/UndoToast';
import { PasswordPromptModal } from './media/PasswordPromptModal';
import { SelectionToolbar } from './media/SelectionToolbar';
import { getDepth, sanitizeName, sanitizePath } from './media/sanitize';
import { MediaFile } from './media/types';
import { UsageBar } from './media/UsageBar';

type Breadcrumb = { label: string; key: string };

const BUCKET_LIMIT_BYTES = 10 * 1024 * 1024 * 1024; // 10GB

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
    adminTokenRef,
    isAdmin,
    clearAdminSession,
    requestAdminToken,
    authorizedFetch
  } = useAdminAuth({ pushMessage, openPassword });

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
  const [moveItems, setMoveItems] = useState<{ key: string; isFolder: boolean }[] | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  // 刪除的 Undo 視窗：先樂觀移除並排程，數秒內可復原
  const UNDO_WINDOW_MS = 6000;
  const [pendingDelete, setPendingDelete] = useState<{ key: string; isFolder: boolean }[] | null>(null);
  const pendingDeleteRef = useRef<{ key: string; isFolder: boolean }[] | null>(null);
  const deleteTimerRef = useRef<number | null>(null);

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

  const handleEnableAdmin = () => {
    void requestAdminToken('請輸入管理密碼以啟用管理模式');
  };

  const handleClearAdminToken = () => {
    selection.clear();
    clearAdminSession('已退出管理模式');
  };

  // ＋ 新增選單：上傳檔案（觸發隱藏 input）/ 建立資料夾
  const handlePickUpload = () => {
    setNewMenuOpen(false);
    uploadInputRef.current?.click();
  };
  const handleCreateFolderMenu = () => {
    setNewMenuOpen(false);
    setNewFolderOpen(true);
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

      const overLimit = usage.usageBytes !== null && usage.usageBytes > BUCKET_LIMIT_BYTES;
      if (overLimit) {
        const ok = await confirm({
          title: '容量已超過上限',
          message: '目前貯體容量已超過 10GB，確定仍要上傳嗎？',
          confirmLabel: '仍要上傳',
          danger: true
        });
        if (!ok) return;
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
    [requestAdminToken, currentPrefix, adminTokenRef, pushMessage, loadMedia, usage, confirm]
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

  // ── 刪除（含 Undo 視窗）──
  // 把尚在 Undo 視窗的刪除確實送出（換資料夾或卸載時無法跨資料夾復原）
  const flushPendingDelete = () => {
    if (deleteTimerRef.current) {
      window.clearTimeout(deleteTimerRef.current);
      deleteTimerRef.current = null;
    }
    const pending = pendingDeleteRef.current;
    pendingDeleteRef.current = null;
    setPendingDelete(null);
    if (pending && pending.length) void commitDeleteOnServer(pending);
  };
  const flushRef = useRef(flushPendingDelete);
  flushRef.current = flushPendingDelete;

  const startUndoableDelete = (items: { key: string; isFolder: boolean }[]) => {
    flushPendingDelete(); // 先送出上一批，避免堆疊
    removeLocalItems(items);
    selection.clear();
    pendingDeleteRef.current = items;
    setPendingDelete(items);
    deleteTimerRef.current = window.setTimeout(() => {
      deleteTimerRef.current = null;
      const pending = pendingDeleteRef.current;
      pendingDeleteRef.current = null;
      setPendingDelete(null);
      if (pending) void commitDeleteOnServer(pending);
    }, UNDO_WINDOW_MS);
  };

  const undoDelete = () => {
    if (deleteTimerRef.current) {
      window.clearTimeout(deleteTimerRef.current);
      deleteTimerRef.current = null;
    }
    pendingDeleteRef.current = null;
    setPendingDelete(null);
    void loadMedia(currentPrefix, { silent: true });
    pushMessage('已復原刪除', 'info');
  };

  const requestDelete = async (items: { key: string; isFolder: boolean }[]) => {
    if (items.length === 0) return;
    const allowed = await requestAdminToken('請輸入管理密碼以刪除項目');
    if (!allowed) return;
    // 含資料夾的刪除較具破壞性，先確認
    if (items.some((item) => item.isFolder)) {
      const ok = await confirm({
        title: '刪除項目',
        message: `確定刪除選取的 ${items.length} 個項目？資料夾會連同內容一併刪除（可在數秒內復原）。`,
        confirmLabel: '刪除',
        danger: true
      });
      if (!ok) return;
    }
    startUndoableDelete(items);
  };

  // 換資料夾或卸載時，把待刪除確實送出
  useEffect(() => {
    return () => flushRef.current();
  }, [currentPrefix]);

  // ── 鍵盤快捷鍵：Ctrl/Cmd+A 全選、Esc 清除、Delete 刪除所選 ──
  const anyModalOpen =
    Boolean(preview.media) ||
    Boolean(adminAction) ||
    Boolean(moveItems) ||
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
        if (folders.length || visibleFiles.length) {
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
  }, [anyModalOpen, isAdmin, selection, folders.length, visibleFiles.length]);

  const hasItems = files.length > 0 || folders.length > 0;
  const filterLabel = filterVisible ? (filter === 'all' ? '全部' : filter === 'image' ? '僅圖片' : '僅影片') : '全部';

  return (
    <section className="relative space-y-6">
      <MessageToast message={message} tone={messageTone} />

      {/* 工具列（relative z-30 讓「＋ 新增」下拉選單能浮在麵包屑之上） */}
      <div className="glass-card relative z-30 flex flex-col gap-4 rounded-3xl border border-surface-700/50 bg-surface-900/80 p-4 shadow-xl ring-1 ring-white/5 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-center gap-2.5">
          <div className="h-2 w-2 rounded-full bg-primary-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
          <h2 className="text-lg font-bold text-white">媒體控制台</h2>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${
              isAdmin
                ? 'bg-primary-500/15 text-primary-200 ring-primary-500/40'
                : 'bg-surface-800 text-surface-300 ring-surface-600'
            }`}
          >
            {isAdmin ? '管理模式' : '唯讀'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <UsageBar usageBytes={usage.usageBytes} loading={usage.loading} error={usage.error} />

          {isAdmin ? (
            <>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setNewMenuOpen((value) => !value)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-primary-500 to-primary-600 px-4 py-2 text-sm font-semibold text-surface-950 shadow-glow transition-all duration-200 hover:from-primary-400 hover:to-primary-500 cursor-pointer"
                  aria-haspopup="menu"
                  aria-expanded={newMenuOpen}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
                  </svg>
                  新增
                </button>
                {newMenuOpen ? (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setNewMenuOpen(false)} aria-hidden />
                    <div
                      role="menu"
                      className="absolute right-0 z-40 mt-2 w-48 overflow-hidden rounded-2xl border border-surface-700/70 bg-surface-900/95 py-1.5 shadow-2xl ring-1 ring-white/5 backdrop-blur-md animate-modal-content-in"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={handlePickUpload}
                        className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm font-medium text-surface-100 transition-colors hover:bg-primary-500/15 hover:text-primary-100 cursor-pointer"
                      >
                        <span className="w-5 text-center text-base leading-none">⬆️</span>上傳檔案
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={handleCreateFolderMenu}
                        className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm font-medium text-surface-100 transition-colors hover:bg-primary-500/15 hover:text-primary-100 cursor-pointer"
                      >
                        <span className="w-5 text-center text-base leading-none">📁</span>建立資料夾
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
              <button
                type="button"
                onClick={handleClearAdminToken}
                className="rounded-xl border border-surface-700 px-3 py-2 text-sm font-semibold text-surface-200 transition-all duration-200 hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-200 cursor-pointer"
              >
                退出管理
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleEnableAdmin}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-primary-500 to-primary-600 px-4 py-2 text-sm font-semibold text-surface-950 shadow-glow transition-all duration-200 hover:from-primary-400 hover:to-primary-500 cursor-pointer"
            >
              🔓 啟用管理模式
            </button>
          )}
        </div>
      </div>

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
          {!hasItems && <EmptyState atMaxDepth={depth >= MAX_FOLDER_DEPTH} />}

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
              handleItemDragStart({ key: file.key, isFolder: false }, event);
            }}
            onDragEnd={() => {
              internalDragRef.current = false;
              handleItemDragEnd();
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
