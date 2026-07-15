import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { FolderItem, MediaFile, MediaResponse } from '../types';

type FilterOption = 'all' | 'image' | 'video';
export type SortKey = 'name' | 'date' | 'size';
export type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 48;

function mergeItemsByKey<T extends { key: string }>(current: T[], incoming: T[]) {
  const seen = new Set(current.map((item) => item.key));
  const merged = [...current];

  for (const item of incoming) {
    if (!seen.has(item.key)) {
      seen.add(item.key);
      merged.push(item);
    }
  }

  return merged;
}
function getFolderFromUrl() {
  if (typeof window === 'undefined') return '';
  return new URL(window.location.href).searchParams.get('folder') ?? '';
}

function syncFolderInUrl(prefix: string) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (prefix) url.searchParams.set('folder', prefix); else url.searchParams.delete('folder');
  window.history.pushState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

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
  const [currentPrefix, setCurrentPrefixState] = useState(getFolderFromUrl);
  const setCurrentPrefix = useCallback((prefix: string) => {
    if (prefix === currentPrefix) return;
    syncFolderInUrl(prefix);
    setCurrentPrefixState(prefix);
  }, [currentPrefix]);
  const [filter, setFilter] = useState<FilterOption>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  // 隨時反映最新的 currentPrefix，供非同步的 loadMedia 判斷回應是否已經過期
  // （例如改名/移動/刪除後排程的背景對帳，若使用者在等待期間切換了資料夾，就不該套用）。
  const currentPrefixRef = useRef(currentPrefix);
  currentPrefixRef.current = currentPrefix;
  const loadedPrefixRef = useRef<string | null>(null);
  const nextCursorRef = useRef<string | null>(null);
  const requestSequenceRef = useRef(0);
  const requestControllerRef = useRef<AbortController | null>(null);
  const loadingRef = useRef(false);
  const loadingMoreRef = useRef(false);

  // 載入媒體列表。silent=true 時不顯示骨架，用於樂觀更新後的背景對帳。
  const loadMedia = useCallback(
    async (prefix = currentPrefixRef.current, options: { silent?: boolean } = {}) => {
      const requestSequence = requestSequenceRef.current + 1;
      requestSequenceRef.current = requestSequence;
      requestControllerRef.current?.abort();
      loadingMoreRef.current = false;
      nextCursorRef.current = null;
      loadedPrefixRef.current = prefix;
      setLoadingMore(false);
      setNextCursor(null);
      loadingRef.current = true;
      if (!options.silent) setLoading(true);

      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      requestControllerRef.current = controller;
      const timeoutId = controller ? window.setTimeout(() => controller.abort(), 10000) : null;

      try {
        const params = new URLSearchParams({
          prefix,
          limit: String(PAGE_SIZE)
        });
        const response = await fetch(`/api/media?${params.toString()}`, {
          signal: controller?.signal
        });

        if (
          requestSequence !== requestSequenceRef.current ||
          prefix !== currentPrefixRef.current
        ) {
          return;
        }
        if (!response.ok) {
          const content = response.status === 429 ? '請稍後再試，系統暫時忙碌。' : '無法載入媒體，請稍後再試。';
          pushMessage(content, 'error');
          return;
        }

        const data: MediaResponse = await response.json();
        // 使用者可能已經切換到別的資料夾，過期的回應（尤其是背景對帳）不套用，
        // 避免畫面被拉回已經離開的舊資料夾。
        if (requestSequence !== requestSequenceRef.current || prefix !== currentPrefixRef.current) return;
        const resolvedPrefix = data.prefix;
        const nextPageCursor = data.nextCursor ?? null;
        setFiles(mergeItemsByKey([], data.files));
        setFolders(mergeItemsByKey([], data.folders));
        nextCursorRef.current = nextPageCursor;
        setNextCursor(nextPageCursor);
        loadedPrefixRef.current = resolvedPrefix;
        currentPrefixRef.current = resolvedPrefix;
        setCurrentPrefix(resolvedPrefix);
      } catch (error) {
        if (
          requestSequence !== requestSequenceRef.current ||
          prefix !== currentPrefixRef.current
        ) return;
        if (error instanceof DOMException && error.name === 'AbortError') {
          if (!options.silent) pushMessage('載入逾時，請再次嘗試或檢查網路。', 'error');
        } else if (!options.silent) {
          pushMessage('載入媒體時發生錯誤，請稍後再試。', 'error');
        }
      } finally {
        if (timeoutId) {
          window.clearTimeout(timeoutId);
        }
        if (
          requestSequence !== requestSequenceRef.current ||
          prefix !== currentPrefixRef.current
        ) return;
        if (requestControllerRef.current === controller) {
          requestControllerRef.current = null;
        }
        loadingRef.current = false;
        if (!options.silent) setLoading(false);
      }
    },
    [pushMessage]
  );

  // A prefix change always restarts from the first server page.
  useEffect(() => {
    const handlePopState = () => {
      setCurrentPrefixState(getFolderFromUrl());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
  useEffect(() => {
    void loadMedia(currentPrefix);
  }, [currentPrefix, loadMedia]);

  useEffect(() => {
    return () => {
      requestSequenceRef.current += 1;
      requestControllerRef.current?.abort();
      requestControllerRef.current = null;
    };
  }, []);

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

  // Filters and sorting apply to every file loaded from the server so far.
  const visibleFiles = sortedFiles;
  const hasMore = nextCursor !== null;
  const loadMore = useCallback(async () => {
    const cursor = nextCursorRef.current;
    const prefix = loadedPrefixRef.current;

    if (
      cursor === null ||
      prefix === null ||
      prefix !== currentPrefixRef.current ||
      loadingRef.current ||
      loadingMoreRef.current
    ) {
      return;
    }

    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    requestControllerRef.current = controller;
    loadingMoreRef.current = true;
    setLoadingMore(true);

    const timeoutId = controller ? window.setTimeout(() => controller.abort(), 10000) : null;
    const params = new URLSearchParams({
      prefix,
      limit: String(PAGE_SIZE),
      cursor
    });

    try {
      const response = await fetch(`/api/media?${params.toString()}`, {
        signal: controller?.signal
      });

      if (
        requestSequence !== requestSequenceRef.current ||
        prefix !== currentPrefixRef.current
      ) {
        return;
      }

      if (!response.ok) {
        const content = response.status === 429
          ? '請稍後再試，系統暫時忙碌。'
          : '無法載入更多媒體，請稍後再試。';
        pushMessage(content, 'error');
        return;
      }

      const data: MediaResponse = await response.json();
      if (requestSequence !== requestSequenceRef.current || prefix !== currentPrefixRef.current) return;
      const nextPageCursor = data.nextCursor ?? null;
      setFiles((current) => mergeItemsByKey(current, data.files));
      setFolders((current) => mergeItemsByKey(current, data.folders));
      nextCursorRef.current = nextPageCursor;
      setNextCursor(nextPageCursor);
    } catch (error) {
      if (
        requestSequence !== requestSequenceRef.current ||
        prefix !== currentPrefixRef.current
      ) return;
      if ((error as { name?: string }).name !== 'AbortError') {
        pushMessage('載入更多媒體時發生錯誤，請稍後再試。', 'error');
      }
    } finally {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      if (
        requestSequence !== requestSequenceRef.current ||
        prefix !== currentPrefixRef.current
      ) return;
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
      }
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [pushMessage]);

  // Server cursor pagination appends each loaded page to the local listing.

  return {
    files,
    folders: sortedFolders,
    loading,
    loadingMore,
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
