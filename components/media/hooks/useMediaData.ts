import { useCallback, useEffect, useMemo, useState } from 'react';

import { ITEMS_PER_PAGE } from '../constants';
import { FolderItem, MediaFile, MediaResponse } from '../types';

type FilterOption = 'all' | 'image' | 'video';

type UseMediaDataProps = {
  pushMessage: (text: string, tone: 'info' | 'success' | 'error') => void;
};

/**
 * useMediaData Hook: 媒體資料管理
 * 包含：API 資料載入、過濾 (Filter)、搜尋 (Search) 與分頁 (Pagination)
 */
export function useMediaData({ pushMessage }: UseMediaDataProps) {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPrefix, setCurrentPrefix] = useState('');
  const [filter, setFilter] = useState<FilterOption>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // 載入媒體列表
  const loadMedia = useCallback(
    async (prefix = currentPrefix) => {
      setLoading(true);
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
        setCurrentPage(1);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          pushMessage('載入逾時，請再次嘗試或檢查網路。', 'error');
        } else {
          pushMessage('載入媒體時發生錯誤，請稍後再試。', 'error');
        }
      } finally {
        if (timeoutId) {
          window.clearTimeout(timeoutId);
        }
        setLoading(false);
      }
    },
    [currentPrefix, pushMessage]
  );

  // 當路徑改變時重新載入
  useEffect(() => {
    void loadMedia(currentPrefix);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPrefix]);

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

  // 計算過濾與搜尋後的檔案列表
  const filteredFiles = useMemo(() => {
    const byType = filterVisible && filter !== 'all' ? files.filter((file) => file.type === filter) : files;

    if (!searchEnabled || !normalizedQuery) return byType;

    return byType.filter((file) => {
      const title = file.key.split('/').pop()?.toLowerCase() ?? '';
      return title.includes(normalizedQuery);
    });
  }, [files, filter, filterVisible, searchEnabled, normalizedQuery]);

  // 計算分頁後的檔案列表
  const totalPages = Math.max(1, Math.ceil(filteredFiles.length / ITEMS_PER_PAGE));
  const paginatedFiles = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredFiles.slice(start, start + ITEMS_PER_PAGE);
  }, [currentPage, filteredFiles]);

  // 確保當前頁碼不超過總頁數
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  // 當過濾或搜尋改變時，重設回第一頁
  useEffect(() => {
    setCurrentPage(1);
  }, [filter, normalizedQuery]);

  return {
    files,
    folders,
    loading,
    currentPrefix,
    setCurrentPrefix,
    loadMedia,
    filter,
    setFilter,
    searchQuery,
    setSearchQuery,
    currentPage,
    setCurrentPage,
    totalPages,
    paginatedFiles,
    filteredFiles,
    filterVisible,
    searchEnabled
  };
}
