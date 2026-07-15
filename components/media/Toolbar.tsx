'use client';

import { useEffect, useState } from 'react';

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
  onEnableAdmin,
  onExitAdmin,
  onPickUpload,
  onCreateFolder
}: {
  isAdmin: boolean;
  usageBytes: number | null;
  usageLoading: boolean;
  usageError: string;
  onEnableAdmin: () => void;
  onExitAdmin: () => void;
  onPickUpload: () => void;
  onCreateFolder: () => void;
}) {
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const menuRef = useFocusTrap<HTMLDivElement>(newMenuOpen);

  useEffect(() => {
    if (!newMenuOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNewMenuOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [newMenuOpen]);

  return (
    // relative z-30 讓「＋ 新增」下拉選單能浮在麵包屑之上（glass-card 的 backdrop-filter 會建立堆疊脈絡）
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
        {isAdmin ? <UsageBar usageBytes={usageBytes} loading={usageLoading} error={usageError} /> : null}

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
                    ref={menuRef}
                    role="menu"
                    className="absolute right-0 z-40 mt-2 w-48 overflow-hidden rounded-2xl border border-surface-700/70 bg-surface-900/95 py-1.5 shadow-2xl ring-1 ring-white/5 backdrop-blur-md animate-modal-content-in"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setNewMenuOpen(false);
                        onPickUpload();
                      }}
                      className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm font-medium text-surface-100 transition-colors hover:bg-primary-500/15 hover:text-primary-100 cursor-pointer"
                    >
                      <span className="w-5 text-center text-base leading-none">⬆️</span>上傳檔案
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setNewMenuOpen(false);
                        onCreateFolder();
                      }}
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
              onClick={onExitAdmin}
              className="rounded-xl border border-surface-700 px-3 py-2 text-sm font-semibold text-surface-200 transition-all duration-200 hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-200 cursor-pointer"
            >
              退出管理
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onEnableAdmin}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-primary-500 to-primary-600 px-4 py-2 text-sm font-semibold text-surface-950 shadow-glow transition-all duration-200 hover:from-primary-400 hover:to-primary-500 cursor-pointer"
          >
            🔓 啟用管理模式
          </button>
        )}
      </div>
    </div>
  );
}
