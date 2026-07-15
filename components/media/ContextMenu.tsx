'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export type ContextMenuItem =
  | {
      type?: 'item';
      label: string;
      icon?: string;
      danger?: boolean;
      disabled?: boolean;
      onSelect: () => void;
    }
  | { type: 'separator' };

export function ContextMenu({
  open,
  x,
  y,
  items,
  onClose
}: {
  open: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  // 開啟時先以游標位置定位，再根據實際尺寸夾擠回視窗內
  useLayoutEffect(() => {
    if (!open) return;
    const el = ref.current;
    if (!el) return;
    const { offsetWidth: w, offsetHeight: h } = el;
    const margin = 8;
    const nextX = Math.min(x, window.innerWidth - w - margin);
    const nextY = Math.min(y, window.innerHeight - h - margin);
    setPos({ x: Math.max(margin, nextX), y: Math.max(margin, nextY) });
  }, [open, x, y]);

  // 開啟時把 focus 移入選單、補上方向鍵在項目間移動；關閉時把焦點還給觸發前的元素，
  // 讓鍵盤使用者不必再 Tab 過整個頁面才能到達剛開出來的選單。
  useEffect(() => {
    if (!open) return;

    const getMenuItems = () =>
      Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []).filter(
        (item) => !item.disabled
      );

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTimer = window.setTimeout(() => {
      getMenuItems()[0]?.focus();
    }, 0);

    const handlePointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;

      const items = getMenuItems();
      if (items.length === 0) return;
      event.preventDefault();
      const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      const nextIndex = currentIndex === -1 ? 0 : (currentIndex + delta + items.length) % items.length;
      items[nextIndex]?.focus();
    };
    const handleScroll = () => onClose();

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-[60] min-w-[200px] overflow-hidden rounded-2xl border border-surface-700/70 bg-surface-900/95 py-1.5 shadow-2xl ring-1 ring-white/5 backdrop-blur-md animate-modal-content-in"
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item, index) => {
        if ('type' in item && item.type === 'separator') {
          return <div key={`sep-${index}`} className="my-1 h-px bg-surface-700/60" />;
        }
        const entry = item as Extract<ContextMenuItem, { label: string }>;
        return (
          <button
            key={entry.label}
            role="menuitem"
            type="button"
            disabled={entry.disabled}
            className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              entry.danger
                ? 'text-red-300 hover:bg-red-500/15'
                : 'text-surface-100 hover:bg-primary-500/15 hover:text-primary-100'
            }`}
            onClick={() => {
              onClose();
              entry.onSelect();
            }}
          >
            {entry.icon ? <span className="w-5 text-center text-base leading-none">{entry.icon}</span> : null}
            <span>{entry.label}</span>
          </button>
        );
      })}
    </div>
  );
}
