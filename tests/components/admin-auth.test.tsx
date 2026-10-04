import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAdminAuth } from '@/components/media/hooks/useAdminAuth';

describe('admin authentication', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('uses the current token even when an action retained the fetch function before login', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useAdminAuth({ pushMessage: vi.fn(), openPassword: vi.fn() }));
    const retainedFetch = result.current.authorizedFetch;
    await act(async () => { await result.current.validateAndApplyToken('correct'); });
    await retainedFetch('/api/media', { method: 'DELETE' });
    expect(new Headers(fetchMock.mock.calls[1][1].headers).get('x-admin-token')).toBe('correct');
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 401 }));
    await act(async () => { await retainedFetch('/api/media'); });
    expect(result.current.isAdmin).toBe(false);
  });

  it('reports a server failure without blaming the password', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })));
    const pushMessage = vi.fn();
    const { result } = renderHook(() => useAdminAuth({ pushMessage, openPassword: vi.fn() }));
    await act(async () => { expect(await result.current.validateAndApplyToken('password')).toBe(false); });
    expect(pushMessage.mock.calls.at(-1)?.[0]).toMatch(/服務|伺服器/);
  });

  it('cannot revive a session when logout happens during validation', async () => {
    let resolve!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(done => { resolve = done; })));
    const { result } = renderHook(() => useAdminAuth({ pushMessage: vi.fn(), openPassword: vi.fn() }));
    let pending!: Promise<boolean>;
    act(() => { pending = result.current.validateAndApplyToken('password'); });
    act(() => result.current.clearAdminSession());
    await act(async () => { resolve(new Response('{}')); expect(await pending).toBe(false); });
    expect(result.current.isAdmin).toBe(false);
  });
});
