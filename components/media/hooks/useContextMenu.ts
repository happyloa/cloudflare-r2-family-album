import { useCallback, useState } from 'react';

export type ContextTarget = { key: string; isFolder: boolean };

type ContextMenuState = {
  open: boolean;
  x: number;
  y: number;
  target: ContextTarget | null;
};

const CLOSED: ContextMenuState = { open: false, x: 0, y: 0, target: null };

/**
 * useContextMenu Hook: 管理右鍵選單的開啟位置與目標項目
 */
export function useContextMenu() {
  const [state, setState] = useState<ContextMenuState>(CLOSED);

  const openMenu = useCallback(
    (event: { clientX: number; clientY: number; preventDefault: () => void }, target: ContextTarget) => {
      event.preventDefault();
      setState({ open: true, x: event.clientX, y: event.clientY, target });
    },
    []
  );

  const closeMenu = useCallback(() => setState(CLOSED), []);

  return { menu: state, openMenu, closeMenu };
}
