import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, video[controls], [tabindex]:not([tabindex="-1"])';

function getFocusableElements(container: HTMLElement | null) {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true'
  );
}

/**
 * useFocusTrap: 對話框/選單開啟時把 Tab 鍵鎖在容器內循環、自動把焦點移到第一個可互動元素，
 * 關閉時把焦點還給開啟前原本聚焦的元素。從 MediaPreviewModal 既有、驗證可用的邏輯抽出，
 * 讓所有 modal 套用同一份，不必各自重寫一遍、也不會漏掉某個 modal 忘記做 Tab 循環。
 * 各元件自己的 Escape / Enter 等按鍵語意仍留在各自元件內處理，這個 hook 只負責 focus。
 */
export function useFocusTrap<T extends HTMLElement = HTMLElement>(active: boolean) {
  const containerRef = useRef<T>(null);

  useEffect(() => {
    if (!active) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTimer = window.setTimeout(() => {
      getFocusableElements(containerRef.current)[0]?.focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      const focusable = getFocusableElements(containerRef.current);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (!active || !containerRef.current?.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }

      if (event.shiftKey) {
        if (active === first) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
  }, [active]);

  return containerRef;
}
