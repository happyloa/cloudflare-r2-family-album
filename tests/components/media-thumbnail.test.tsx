import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MediaThumbnail } from '@/components/media/MediaThumbnail';

let intersect: (visible: boolean) => void;
const disconnect = vi.fn();
beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: IntersectionObserverCallback) {
      intersect = visible => callback([{ isIntersecting: visible } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
    }
    observe() {}
    disconnect() { disconnect(); }
  });
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const renderVideo = () => {
  render(<MediaThumbnail media={{ key: 'clip.webm', url: '/clip.webm', type: 'video' }} />);
  return screen.getByLabelText('clip.webm');
};

it('does not request an offscreen video until it approaches the viewport', () => {
  const video = renderVideo();
  expect(video.getAttribute('src')).toBeNull();
  act(() => intersect(false));
  expect(video.getAttribute('src')).toBeNull();
  act(() => intersect(true));
  expect(video.getAttribute('src')).toBe('/clip.webm');
  expect(disconnect).toHaveBeenCalled();
});

it('does not treat cancelled hover playback as a broken video', async () => {
  let rejectPlayback!: (reason: unknown) => void;
  vi.mocked(HTMLMediaElement.prototype.play).mockImplementation(() => new Promise<void>((_resolve, reject) => { rejectPlayback = reject; }));
  const video = renderVideo();
  fireEvent.pointerEnter(video);
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
  fireEvent.pointerLeave(video);
  await act(async () => { rejectPlayback(new DOMException('Playback cancelled', 'AbortError')); });
  expect(screen.getByLabelText('clip.webm')).toBe(video);
  expect(screen.queryByText('無法顯示縮圖，點擊查看檔案')).toBeNull();
});
