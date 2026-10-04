import { useEffect, useRef, type RefObject } from 'react';

type DialogOptions = {
  onEscape?: () => void;
  initialFocus?: RefObject<HTMLElement | null>;
  returnFocus?: HTMLElement | null;
};

// 多個對話框重疊時，只有最上層處理鍵盤，全部關閉後才解鎖頁面捲動。
const dialogStack: symbol[] = [];

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, video[controls], [tabindex]:not([tabindex="-1"])';

function getFocusableElements(container: HTMLElement | null) {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true'
  );
}

/** 共用對話框的焦點、Escape 與頁面捲動處理。 */
export function useFocusTrap<T extends HTMLElement = HTMLElement>(active: boolean, options: DialogOptions = {}) {
  const containerRef = useRef<T>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!active) return;

    const id = Symbol();
    dialogStack.push(id);
    document.body.classList.add('modal-open');
    const previouslyFocused = optionsRef.current.returnFocus ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const focusTimer = window.setTimeout(() => {
      if (dialogStack.at(-1) !== id) return;
      const initial = optionsRef.current.initialFocus?.current ?? getFocusableElements(containerRef.current)[0];
      initial?.focus({ preventScroll: true });
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (dialogStack.at(-1) !== id) return;
      if (event.key === 'Escape' && optionsRef.current.onEscape) {
        event.preventDefault();
        optionsRef.current.onEscape();
        return;
      }
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
      const wasTop = dialogStack.at(-1) === id;
      dialogStack.splice(dialogStack.indexOf(id), 1);
      if (dialogStack.length === 0) document.body.classList.remove('modal-open');
      if (wasTop && previouslyFocused?.isConnected) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [active]);

  return containerRef;
}
