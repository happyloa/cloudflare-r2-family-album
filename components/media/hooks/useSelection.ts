import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * 選取項目的複合識別碼：用 d::/f:: 前綴區分資料夾與檔案，避免 key 字串碰撞。
 */
export type SelectionId = string;

export const makeSelectionId = (key: string, isFolder: boolean): SelectionId =>
  `${isFolder ? 'd' : 'f'}::${key}`;

export const parseSelectionId = (id: SelectionId): { key: string; isFolder: boolean } => {
  const isFolder = id.startsWith('d::');
  return { key: id.slice(3), isFolder };
};

type ClickModifiers = {
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
};

/**
 * useSelection Hook: 仿 Google Drive 的多選邏輯
 * - 點選 checkbox 或 Ctrl/Cmd+點擊：切換單一項目
 * - Shift+點擊：以錨點為起點做範圍選取
 * orderedIds 需依畫面顯示順序（資料夾在前、檔案在後）傳入，供範圍選取使用。
 */
export function useSelection(orderedIds: SelectionId[]) {
  const [selected, setSelected] = useState<Set<SelectionId>>(new Set());
  const anchorRef = useRef<SelectionId | null>(null);

  // 清掉已不存在的項目（例如刪除、移動或切換資料夾後）
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const valid = new Set(orderedIds);
      let changed = false;
      const next = new Set<SelectionId>();
      prev.forEach((id) => {
        if (valid.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [orderedIds]);

  const isSelected = useCallback((id: SelectionId) => selected.has(id), [selected]);

  const clear = useCallback(() => {
    setSelected(new Set());
    anchorRef.current = null;
  }, []);

  const toggle = useCallback((id: SelectionId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    anchorRef.current = id;
  }, []);

  const selectOnly = useCallback((id: SelectionId) => {
    setSelected(new Set([id]));
    anchorRef.current = id;
  }, []);

  const selectAll = useCallback(() => {
    setSelected(new Set(orderedIds));
  }, [orderedIds]);

  // 處理點擊事件（含修飾鍵）
  const handleClick = useCallback(
    (id: SelectionId, modifiers: ClickModifiers = {}) => {
      const { ctrlKey, metaKey, shiftKey } = modifiers;

      if (shiftKey && anchorRef.current) {
        const anchorIndex = orderedIds.indexOf(anchorRef.current);
        const targetIndex = orderedIds.indexOf(id);
        if (anchorIndex !== -1 && targetIndex !== -1) {
          const [start, end] = anchorIndex < targetIndex
            ? [anchorIndex, targetIndex]
            : [targetIndex, anchorIndex];
          const range = orderedIds.slice(start, end + 1);
          setSelected((prev) => {
            const next = new Set(prev);
            range.forEach((rid) => next.add(rid));
            return next;
          });
          return;
        }
      }

      if (ctrlKey || metaKey) {
        toggle(id);
        return;
      }

      selectOnly(id);
    },
    [orderedIds, toggle, selectOnly]
  );

  const selectedItems = useMemo(
    () => [...selected].map(parseSelectionId),
    [selected]
  );

  return {
    selected,
    selectedCount: selected.size,
    selectedItems,
    selectionMode: selected.size > 0,
    isSelected,
    toggle,
    selectOnly,
    selectAll,
    clear,
    handleClick
  };
}
