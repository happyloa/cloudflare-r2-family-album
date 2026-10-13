'use client';

import { useEffect, useId, useState } from 'react';

import { useFocusTrap } from './hooks/useFocusTrap';
import { UsageBar } from './UsageBar';

/**
 * Toolbar: 頂部精簡工具列（狀態、容量、管理切換、＋ 新增選單）
 */
export function Toolbar({
  isAdmin,
  usageBytes,
  usageLoading,
  usageError,
  uploading,
  canCreateFolder = true,
  onEnableAdmin,
  onExitAdmin,
  onPickUpload,
  onCreateFolder
}: {
  isAdmin: boolean;
  usageBytes: number | null;
  usageLoading: boolean;
  usageError: string;
  uploading: boolean;
  canCreateFolder?: boolean;
  onEnableAdmin: () => void;
  onExitAdmin: () => void;
  onPickUpload: () => void;
  onCreateFolder: () => void;
}) {
  const [ready, setReady] = useState(false);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const menuRef = useFocusTrap<HTMLDivElement>(newMenuOpen);
  const newMenuId = useId();

  // SSR 先停用管理入口，等事件處理器接上後才允許點擊。
  useEffect(() => setReady(true), []);

  useEffect(() => {
    if (!newMenuOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNewMenuOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [newMenuOpen]);

  return (
    <header className="relative z-30 flex flex-wrap items-end justify-between gap-x-6 gap-y-5 border-b border-surface-700/60 pb-6 sm:pb-8">
      <div className="space-y-3">
        <h1 className="text-[30px] font-medium leading-tight tracking-[-0.04em] text-surface-50 sm:text-[44px]">我們這一家</h1>
        <span
          className={`inline-flex items-center gap-2 text-xs ${
            isAdmin
              ? 'text-primary-300'
              : 'text-surface-400'
          }`}
        >
          <span className={`size-1.5 rounded-full ${isAdmin ? 'bg-primary-400' : 'bg-surface-500'}`} aria-hidden />
          {isAdmin ? '管理模式' : '公開瀏覽'}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {isAdmin ? <UsageBar usageBytes={usageBytes} loading={usageLoading} error={usageError} /> : null}

        {isAdmin ? (
          <>
            <div className="relative">
              <button
                type="button"
                onClick={() => setNewMenuOpen((value) => !value)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary-700 px-4 py-2 text-sm font-semibold text-white shadow-md transition-colors hover:bg-primary-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-200 cursor-pointer"
                aria-haspopup="menu"
                aria-expanded={newMenuOpen}
                aria-controls={newMenuOpen ? newMenuId : undefined}
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
                    ref={menuRef}
                    id={newMenuId}
                    role="menu"
                    aria-label="新增項目選單"
                    className="absolute right-0 z-40 mt-2 w-48 overflow-hidden rounded-2xl border border-surface-700/70 bg-surface-900/95 py-1.5 shadow-2xl ring-1 ring-white/5 backdrop-blur-md animate-modal-content-in"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      disabled={uploading}
                      onClick={() => {
                        setNewMenuOpen(false);
                        onPickUpload();
                      }}
                      className="flex w-full cursor-pointer items-center gap-3 px-4 py-2 text-left text-sm font-medium text-surface-100 transition-colors hover:bg-primary-500/15 hover:text-primary-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-primary-300 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-surface-100"
                    >
                      <span className="w-5 text-center text-base leading-none" aria-hidden>⬆️</span>上傳檔案
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={!canCreateFolder}
                      title={!canCreateFolder ? '已達兩層，請回上一層建立資料夾。' : undefined}
                      onClick={() => {
                        setNewMenuOpen(false);
                        onCreateFolder();
                      }}
                      className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm font-medium text-surface-100 transition-colors hover:bg-primary-500/15 hover:text-primary-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-primary-300 cursor-pointer"
                    >
                      <span className="w-5 text-center text-base leading-none" aria-hidden>📁</span>{canCreateFolder ? '建立資料夾' : '已達資料夾層數上限'}
                    </button>
                  </div>
                </>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onExitAdmin}
              className="rounded-xl border border-surface-700 px-3 py-2 text-sm font-semibold text-surface-200 transition-colors hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300 cursor-pointer"
            >
              退出管理
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={!ready}
            onClick={onEnableAdmin}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-surface-700 px-3 py-2 text-xs font-medium text-surface-300 transition-colors hover:border-primary-400/60 hover:text-primary-200 disabled:cursor-wait disabled:opacity-60 sm:text-sm"
          >
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
              <rect x="5" y="10" width="14" height="11" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" strokeLinecap="round" />
            </svg>
            啟用管理模式
          </button>
        )}
      </div>
    </header>
  );
}
