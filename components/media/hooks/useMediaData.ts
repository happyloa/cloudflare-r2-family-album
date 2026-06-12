import { useCallback, useEffect, useMemo, useState } from 'react';

import { FolderItem, MediaFile, MediaResponse } from '../types';

type FilterOption = 'all' | 'image' | 'video';
export type SortKey = 'name' | 'date' | 'size';
export type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 24;

type UseMediaDataProps = {
  pushMessage: (text: string, tone: 'info' | 'success' | 'error') => void;
};

/**
 * useMediaData Hook: 媒體資料管理
 * 包含：API 資料載入、過濾、搜尋、排序、無限捲動分批渲染，以及樂觀更新用的本地 mutators。
 */
export function useMediaData({ pushMessage }: UseMediaDataProps) {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPrefix, setCurrentPrefix] = useState('');
  const [filter, setFilter] = useState<FilterOption>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // 載入媒體列表。silent=true 時不顯示骨架，用於樂觀更新後的背景對帳。
  const loadMedia = useCallback(
    async (prefix = currentPrefix, options: { silent?: boolean } = {}) => {
      if (!options.silent) setLoading(true);
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = controller ? window.setTimeout(() => controller.abort(), 10000) : null;

      try {
        const response = await fetch(`/api/media?prefix=${encodeURIComponent(prefix)}`, {
          signal: controller?.signal
        });

        if (!response.ok) {
          const content = response.status === 429 ? '請稍後再試，系統暫時忙碌。' : '無法載入媒體，請稍後再試。';
          pushMessage(content, 'error');
          return;
        }

        const data: MediaResponse = await response.json();
        setFiles(data.files);
        setFolders(data.folders);
        setCurrentPrefix(data.prefix);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          if (!options.silent) pushMessage('載入逾時，請再次嘗試或檢查網路。', 'error');
        } else if (!options.silent) {
          pushMessage('載入媒體時發生錯誤，請稍後再試。', 'error');
        }
      } finally {
        if (timeoutId) {
          window.clearTimeout(timeoutId);
        }
        if (!options.silent) setLoading(false);
      }
    },
    [currentPrefix, pushMessage]
  );

  // 當路徑改變時重新載入（僅依 currentPrefix 觸發，避免 loadMedia 變動造成重複載入）
  useEffect(() => {
    void loadMedia(currentPrefix);
  }, [currentPrefix]);

  // ── 樂觀更新用的本地 mutators ──
  // 從目前清單移除指定項目（移動/刪除後立即反映，再背景對帳）
  const removeLocalItems = useCallback((items: { key: string; isFolder: boolean }[]) => {
    const fileKeys = new Set(items.filter((i) => !i.isFolder).map((i) => i.key));
    const folderKeys = new Set(items.filter((i) => i.isFolder).map((i) => i.key));
    if (fileKeys.size) setFiles((prev) => prev.filter((f) => !fileKeys.has(f.key)));
    if (folderKeys.size) setFolders((prev) => prev.filter((f) => !folderKeys.has(f.key)));
  }, []);

  // 樂觀重新命名（顯示名稱會立即更新，最終結果以背景對帳為準）
  const renameLocalItem = useCallback(
    (key: string, isFolder: boolean, newName: string) => {
      if (isFolder) {
        setFolders((prev) =>
          prev.map((f) => (f.key === key ? { ...f, name: newName } : f))
        );
      } else {
        setFiles((prev) =>
          prev.map((f) => {
            if (f.key !== key) return f;
            const parent = key.split('/').slice(0, -1).join('/');
            const nextKey = parent ? `${parent}/${newName}` : newName;
            return { ...f, key: nextKey };
          })
        );
      }
    },
    []
  );

  const hasImages = useMemo(() => files.some((file) => file.type === 'image'), [files]);
  const hasVideos = useMemo(() => files.some((file) => file.type === 'video'), [files]);
  const filterVisible = hasImages && hasVideos;
  const searchEnabled = files.length > 0;
  const normalizedQuery = searchQuery.trim().toLowerCase();

  // 若目前過濾選項隱藏，自動重設為 "all"
  useEffect(() => {
    if (!filterVisible && filter !== 'all') {
      setFilter('all');
    }
  }, [filterVisible, filter]);

  // 若搜尋功能停用，清空搜尋字串
  useEffect(() => {
    if (!searchEnabled && searchQuery) {
      setSearchQuery('');
    }
  }, [searchEnabled, searchQuery]);

  const fileName = (file: MediaFile) => file.key.split('/').pop() ?? '';

  // 計算過濾與搜尋後的檔案列表
  const filteredFiles = useMemo(() => {
    const byType = filterVisible && filter !== 'all' ? files.filter((file) => file.type === filter) : files;
    if (!searchEnabled || !normalizedQuery) return byType;
    return byType.filter((file) => fileName(file).toLowerCase().includes(normalizedQuery));
  }, [files, filter, filterVisible, searchEnabled, normalizedQuery]);

  // 套用排序
  const sortedFiles = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const sorted = [...filteredFiles].sort((a, b) => {
      if (sortKey === 'size') {
        return ((a.size ?? 0) - (b.size ?? 0)) * dir;
      }
      if (sortKey === 'date') {
        const ta = a.lastModified ? Date.parse(a.lastModified) : 0;
        const tb = b.lastModified ? Date.parse(b.lastModified) : 0;
        return (ta - tb) * dir;
      }
      return fileName(a).localeCompare(fileName(b), 'zh-Hant', { numeric: true }) * dir;
    });
    return sorted;
  }, [filteredFiles, sortKey, sortDir]);

  // 資料夾排序（依名稱，沿用 sortDir 方向；非名稱排序時固定遞增）
  const sortedFolders = useMemo(() => {
    const dir = sortKey === 'name' && sortDir === 'desc' ? -1 : 1;
    return [...folders].sort(
      (a, b) => (a.name || '').localeCompare(b.name || '', 'zh-Hant', { numeric: true }) * dir
    );
  }, [folders, sortKey, sortDir]);

  // 無限捲動：只渲染前 visibleCount 筆
  const visibleFiles = useMemo(
    () => sortedFiles.slice(0, visibleCount),
    [sortedFiles, visibleCount]
  );
  const hasMore = visibleCount < sortedFiles.length;
  const loadMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, sortedFiles.length));
  }, [sortedFiles.length]);

  // 當路徑、過濾、搜尋或排序改變時，重設可見數量回第一批
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [currentPrefix, filter, normalizedQuery, sortKey, sortDir]);

  return {
    files,
    folders: sortedFolders,
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
    filteredFiles: sortedFiles,
    filterVisible,
    searchEnabled
  };
}
