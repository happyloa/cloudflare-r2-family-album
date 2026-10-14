import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useMediaActions } from '@/components/media/hooks/useMediaActions';

afterEach(cleanup);
const setup = () => {
  const props = {
    authorizedFetch: vi.fn().mockResolvedValue(new Response('{}')),
    requestAdminToken: vi.fn(), pushMessage: vi.fn(), loadMedia: vi.fn().mockResolvedValue(undefined),
    removeLocalItems: vi.fn(), upsertLocalItems: vi.fn(), currentPrefix: 'trip',
    refreshUsage: vi.fn(), onTrashChanged: vi.fn(),
  };
  return { props, ...renderHook(() => useMediaActions(props)) };
};
const items = Array.from({ length: 23 }, (_, index) => ({ key: `trip/${index}.jpg`, isFolder: false }));
it('moves a larger selection to trash in bounded requests and refreshes once it completes', async () => {
  const { props, result } = setup();
  await result.current.commitDeleteOnServer(items);
  expect(props.authorizedFetch.mock.calls.map(([, init]) => JSON.parse(init.body).items.length)).toEqual([10, 10, 3]);
  expect(props.onTrashChanged).toHaveBeenCalledOnce();
  expect(props.refreshUsage).toHaveBeenCalledExactlyOnceWith(true);
});
it('stops after a failed chunk and reloads confirmed storage state after partial progress', async () => {
  const { props, result } = setup();
  props.authorizedFetch.mockResolvedValueOnce(new Response('{}')).mockResolvedValueOnce(new Response(JSON.stringify({ error: 'simulated failure' }), { status: 500 }));
  await result.current.commitDeleteOnServer(items);
  expect(props.authorizedFetch).toHaveBeenCalledTimes(2);
  expect(props.loadMedia).toHaveBeenCalledWith('trip', { silent: true });
  expect(props.onTrashChanged).toHaveBeenCalledOnce();
});
