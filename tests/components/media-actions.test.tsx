import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useMediaActions } from '@/components/media/hooks/useMediaActions';

afterEach(cleanup);
const setup = () => {
  const props = {
    authorizedFetch: vi.fn().mockResolvedValue(new Response('{}')),
    requestAdminToken: vi.fn().mockResolvedValue(true), confirm: vi.fn().mockResolvedValue(true),
    pushMessage: vi.fn(), loadMedia: vi.fn().mockResolvedValue(undefined),
    removeLocalItems: vi.fn(), upsertLocalItems: vi.fn(), currentPrefix: 'trip',
    refreshUsage: vi.fn(), onTrashChanged: vi.fn(),
  };
  return { props, ...renderHook(() => useMediaActions(props)) };
};
const items = Array.from({ length: 23 }, (_, index) => ({ key: `trip/${index}.jpg`, isFolder: false }));
it('moves a large selection in bounded requests while keeping same-parent items in place', async () => {
  const { props, result } = setup();
  const moved = await result.current.handleMove([...items, { key: 'destination/stays.jpg', isFolder: false }], 'destination');
  expect(moved).toBe(true);
  expect(props.authorizedFetch.mock.calls.map(([, init]) => JSON.parse(init.body).items.length)).toEqual([10, 10, 3]);
  expect(props.removeLocalItems).toHaveBeenCalledExactlyOnceWith(items);
  expect(props.loadMedia).toHaveBeenCalledOnce();
});
it('stops moving after a failed chunk and reports only confirmed earlier progress', async () => {
  const { props, result } = setup();
  props.authorizedFetch.mockResolvedValueOnce(new Response('{}')).mockResolvedValueOnce(new Response(JSON.stringify({ error: 'destination conflict' }), { status: 409 }));
  expect(await result.current.handleMove(items, 'destination')).toBe(false);
  expect(props.authorizedFetch).toHaveBeenCalledTimes(2);
  expect(props.pushMessage).toHaveBeenCalledWith('先前已移動 10 個項目。destination conflict', 'error');
  expect(props.loadMedia).toHaveBeenCalledWith('trip', { silent: true });
});
it('moves a larger selection to trash in bounded requests as soon as it is confirmed', async () => {
  const { props, result } = setup();
  await result.current.handleDelete(items);
  expect(props.confirm.mock.calls[0][0].message).toContain('將 23 個媒體移入垃圾桶');
  expect(props.removeLocalItems).toHaveBeenCalledExactlyOnceWith(items);
  expect(props.authorizedFetch.mock.calls.map(([, init]) => JSON.parse(init.body).items.length)).toEqual([10, 10, 3]);
  expect(props.pushMessage).toHaveBeenCalledWith('已將 23 個媒體移入垃圾桶', 'success');
  expect(props.onTrashChanged).toHaveBeenCalledOnce();
  expect(props.refreshUsage).toHaveBeenCalledExactlyOnceWith(true);
});
it.each([
  { step: 'the password prompt', decline: 'requestAdminToken' as const },
  { step: 'the confirmation', decline: 'confirm' as const },
])('leaves the album untouched when $step is declined', async ({ decline }) => {
  const { props, result } = setup();
  props[decline].mockResolvedValue(false);
  await result.current.handleDelete(items);
  expect(props.removeLocalItems).not.toHaveBeenCalled();
  expect(props.authorizedFetch).not.toHaveBeenCalled();
});
it('warns that a removed folder cannot be restored from the trash', async () => {
  const { props, result } = setup();
  await result.current.handleDelete([{ key: 'trip/day-1', isFolder: true }]);
  expect(props.confirm.mock.calls[0][0].message).toContain('資料夾移除後無法還原');
  expect(props.pushMessage).toHaveBeenCalledWith('已移除資料夾，內容已移到上一層', 'success');
});
it('stops after a failed chunk and reloads confirmed storage state after partial progress', async () => {
  const { props, result } = setup();
  props.authorizedFetch.mockResolvedValueOnce(new Response('{}')).mockResolvedValueOnce(new Response(JSON.stringify({ error: 'simulated failure' }), { status: 500 }));
  await result.current.handleDelete(items);
  expect(props.authorizedFetch).toHaveBeenCalledTimes(2);
  expect(props.pushMessage).toHaveBeenCalledWith('simulated failure', 'error');
  expect(props.loadMedia).toHaveBeenCalledWith('trip', { silent: true });
  expect(props.onTrashChanged).toHaveBeenCalledOnce();
});
