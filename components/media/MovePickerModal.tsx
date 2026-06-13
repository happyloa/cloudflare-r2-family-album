'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { getDepth } from './sanitize';
import { FolderItem, MediaResponse } from './types';

/**
 * MovePickerModal: 以資料夾瀏覽方式選擇移動目的地（取代輸入路徑）
 * 單一移動與批次移動共用。會擋掉「移到自己/子資料夾」與超過層數的目的地。
 */
export function MovePickerModal({
  open,
  items,
  startPrefix,
  maxDepth,
  onCancel,
  onConfirm
}: {
  open: boolean;
  items: { key: string; isFolder: boolean }[];
  startPrefix: string;
  maxDepth: number;
  onCancel: () => void;
  onConfirm: (targetPrefix: string) => void | Promise<void>;
}) {
  const [browsePrefix, setBrowsePrefix] = useState('');
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const movingFolder = items.some((item) => item.isFolder);
  const sourceFolderKeys = useMemo(
    () => items.filter((item) => item.isFolder).map((item) => item.key),
    [items]
  );

  const load = useCallback(async (prefix: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/media?prefix=${encodeURIComponent(prefix)}`);
      if (!res.ok) {
        setFolders([]);
        return;
      }
      const data: MediaResponse = await res.json();
      setFolders(data.folders ?? []);
    } catch {
      setFolders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setBrowsePrefix(startPrefix);
    setSubmitting(false);
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, [open, startPrefix]);

  useEffect(() => {
    if (open) void load(browsePrefix);
  }, [open, browsePrefix, load]);

  const trail = useMemo(() => {
    const parts = browsePrefix.split('/').filter(Boolean);
    return [
      { label: '根目錄', key: '' },
      ...parts.map((part, index, arr) => ({ label: part, key: arr.slice(0, index + 1).join('/') }))
    ];
  }, [browsePrefix]);

  if (!open) return null;

  const isSourceOrDescendant = (folderKey: string) =>
    sourceFolderKeys.some((src) => folderKey === src || folderKey.startsWith(`${src}/`));

  const browseDepth = getDepth(browsePrefix);
  const targetTooDeep = movingFolder ? browseDepth + 1 > maxDepth : browseDepth > maxDepth;
  const targetIsSource = isSourceOrDescendant(browsePrefix);
  const confirmDisabled = submitting || targetTooDeep || targetIsSource;
  const canEnter = (folderKey: string) => !isSourceOrDescendant(folderKey) && getDepth(folderKey) < maxDepth;

  const handleConfirm = async () => {
    if (confirmDisabled) return;
    setSubmitting(true);
    try {
      await onConfirm(browsePrefix);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex min-h-screen w-screen items-center justify-center bg-surface-950/90 p-4 backdrop-blur-md animate-modal-backdrop-in"
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <div
        className="flex w-[min(480px,92vw)] flex-col gap-4 overflow-hidden rounded-3xl border border-surface-700/50 bg-surface-900/95 p-6 shadow-2xl animate-modal-content-in"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary-400">移動到</p>
          <h3 className="text-lg font-semibold text-white">移動 {items.length} 個項目</h3>
          <p className="text-sm text-surface-400">點選資料夾進入，再按「移動到這裡」。</p>
        </div>

        {/* 目的地麵包屑 */}
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-surface-700/50 bg-surface-950/50 px-3 py-2 text-sm">
          {trail.map((crumb, index) => (
            <span key={crumb.key} className="flex items-center">
              {index > 0 ? <span className="mx-1 text-surface-600">/</span> : null}
              <button
                type="button"
                onClick={() => setBrowsePrefix(crumb.key)}
                className="rounded-md px-1.5 py-0.5 font-medium text-surface-200 transition-colors hover:bg-surface-800 hover:text-primary-200 cursor-pointer"
              >
                {index === 0 ? '🏠 根目錄' : crumb.label}
              </button>
            </span>
          ))}
        </div>

        {/* 子資料夾清單 */}
        <div className="max-h-64 min-h-[120px] space-y-1 overflow-y-auto rounded-xl border border-surface-700/50 bg-surface-950/40 p-2">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary-400/40 border-t-primary-400" />
            </div>
          ) : folders.length === 0 ? (
            <p className="py-10 text-center text-sm text-surface-500">此資料夾沒有子資料夾</p>
          ) : (
            folders.map((folder) => {
              const enterable = canEnter(folder.key);
              const isSrc = isSourceOrDescendant(folder.key);
              return (
                <button
                  key={folder.key}
                  type="button"
                  disabled={!enterable}
                  onClick={() => enterable && setBrowsePrefix(folder.key)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-surface-100 transition-colors hover:bg-primary-500/10 hover:text-primary-100 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                >
                  <span className="text-lg leading-none">📂</span>
                  <span className="min-w-0 flex-1 truncate">{folder.name || '未命名'}</span>
                  {isSrc ? (
                    <span className="text-xs text-surface-500">來源</span>
                  ) : !enterable ? (
                    <span className="text-xs text-surface-500">已達層數</span>
                  ) : (
                    <span className="text-surface-500">›</span>
                  )}
                </button>
              );
            })
          )}
        </div>

        <div className="space-y-1">
          <p className="text-xs text-surface-500">
            目的地：<span className="font-semibold text-surface-300">{browsePrefix || '根目錄'}</span>
          </p>
          {targetTooDeep ? <p className="text-sm font-semibold text-red-300">移動後會超過 {maxDepth} 層</p> : null}
          {targetIsSource ? <p className="text-sm font-semibold text-red-300">不能移動到自己或其子資料夾</p> : null}
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-full border border-surface-700 px-5 py-2 text-sm font-semibold text-surface-200 transition-all duration-200 hover:border-surface-500 hover:bg-surface-800 disabled:opacity-50 cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={confirmDisabled}
            className="flex items-center gap-2 rounded-full bg-gradient-to-r from-primary-500 to-primary-600 px-5 py-2 text-sm font-semibold text-surface-950 shadow-glow transition-all duration-200 hover:from-primary-400 hover:to-primary-500 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            {submitting ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-surface-900/70 border-t-transparent" aria-hidden />
            ) : null}
            <span>移動到這裡</span>
          </button>
        </div>
      </div>
    </div>
  );
}
