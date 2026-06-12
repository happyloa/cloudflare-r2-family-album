import { useCallback, useRef } from 'react';

/**
 * useLongPress Hook: 觸控長按偵測（用於手機進入多選模式）
 * - start(id)：touchstart 時呼叫，按住超過 delay 即觸發 onLongPress
 * - cancel：touchmove / touchend / touchcancel 時呼叫，取消計時（捲動或短按不觸發）
 * - consumeClick()：長按觸發後回傳 true 一次，用來吞掉緊接而來的 click
 */
export function useLongPress(onLongPress: (id: string) => void, delay = 450) {
  const timer = useRef<number | null>(null);
  const firedRef = useRef(false);

  const start = useCallback(
    (id: string) => {
      firedRef.current = false;
      timer.current = window.setTimeout(() => {
        firedRef.current = true;
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          navigator.vibrate(10);
        }
        onLongPress(id);
      }, delay);
    },
    [onLongPress, delay]
  );

  const cancel = useCallback(() => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const consumeClick = useCallback(() => {
    if (firedRef.current) {
      firedRef.current = false;
      return true;
    }
    return false;
  }, []);

  return { start, cancel, consumeClick };
}
