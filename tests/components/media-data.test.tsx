import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMediaData } from '@/components/media/hooks/useMediaData';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const listing = (key: string, nextCursor: string | null = null, prefix = '') => Response.json({
  prefix,
  folders: [],
  files: [{ key, url: `/test-media/${key}`, type: 'image' }],
  nextCursor,
});

describe('media listing reconciliation', () => {
  it.each(['http', 'network'] as const)('keeps the next page reachable after a failed %s background refresh', async (failure) => {
    const fetchMock = vi.fn().mockResolvedValueOnce(listing('first.jpg', 'page-2'));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const pushMessage = vi.fn();
    const { result } = renderHook(() => useMediaData({ pushMessage }));
    await waitFor(() => expect(result.current.files.map(file => file.key)).toEqual(['first.jpg']));

    if (failure === 'http') fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    else fetchMock.mockRejectedValueOnce(new TypeError('simulated network failure'));
    await act(async () => { await result.current.loadMedia('', { silent: true }); });

    expect(result.current.hasMore).toBe(true);
    expect(result.current.files.map(file => file.key)).toEqual(['first.jpg']);
    fetchMock.mockResolvedValueOnce(listing('second.jpg'));
    await act(async () => { await result.current.loadMore(); });
    expect(new URL(fetchMock.mock.calls.at(-1)![0], 'http://album.test').searchParams.get('cursor')).toBe('page-2');
    expect(result.current.files.map(file => file.key)).toEqual(['first.jpg', 'second.jpg']);
    expect(result.current.hasMore).toBe(false);
  });

  it('releases foreground loading when a background refresh replaces its pending request', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(listing('first.jpg'));
    vi.stubGlobal('fetch', fetchMock);
    const pushMessage = vi.fn();
    const { result } = renderHook(() => useMediaData({ pushMessage }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    fetchMock.mockImplementationOnce((_input, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    })).mockResolvedValueOnce(listing('updated.jpg'));

    await act(async () => {
      const foregroundRefresh = result.current.loadMedia();
      await result.current.loadMedia('', { silent: true });
      await foregroundRefresh;
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.files.map(file => file.key)).toEqual(['updated.jpg']);
    expect(pushMessage).not.toHaveBeenCalled();
  });

  it('clears the previous folder cursor immediately when navigating to a different folder', async () => {
    let finishNavigation!: (response: Response) => void;
    const fetchMock = vi.fn().mockResolvedValueOnce(listing('first.jpg', 'old-page-2'));
    vi.stubGlobal('fetch', fetchMock);
    const pushMessage = vi.fn();
    const { result } = renderHook(() => useMediaData({ pushMessage }));
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => { finishNavigation = resolve; }));

    act(() => result.current.setCurrentPrefix('trip'));
    expect(result.current.hasMore).toBe(false);
    expect(result.current.files).toEqual([]);
    await act(async () => { finishNavigation(listing('trip/photo.jpg', null, 'trip')); });
    expect(result.current.files.map(file => file.key)).toEqual(['trip/photo.jpg']);
  });
});
