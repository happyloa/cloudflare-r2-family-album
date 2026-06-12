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

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const handleScroll = () => onClose();

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
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
