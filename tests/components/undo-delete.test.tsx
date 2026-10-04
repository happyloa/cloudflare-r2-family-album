import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUndoableDelete } from '@/components/media/hooks/useUndoableDelete';

describe('delete undo window', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { cleanup(); vi.useRealTimers(); });
  const create = () => {
    const props = { currentPrefix: '', requestAdminToken: vi.fn().mockResolvedValue(true), confirm: vi.fn().mockResolvedValue(true), pushMessage: vi.fn(), removeLocalItems: vi.fn(), commitDeleteOnServer: vi.fn().mockResolvedValue(undefined), loadMedia: vi.fn().mockResolvedValue(undefined) };
    return { ...renderHook(() => useUndoableDelete(props)), props };
  };
  const item = { key: 'photo.jpg', isFolder: false };

  it('restores an item without deleting anything on the server', async () => {
    const { result, props } = create();
    await act(async () => { await result.current.requestDelete([item]); });
    act(() => { vi.advanceTimersByTime(5000); result.current.undoDelete(); vi.advanceTimersByTime(10000); });
    expect(props.commitDeleteOnServer).not.toHaveBeenCalled();
    expect(props.loadMedia).toHaveBeenCalledWith('', { silent: true });
  });

  it('a second request cannot shorten the first six-second undo window', async () => {
    const { result, props } = create();
    await act(async () => { await result.current.requestDelete([item]); });
    await act(async () => { await result.current.requestDelete([{ key: 'second.jpg', isFolder: false }]); });
    expect(props.commitDeleteOnServer).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(6000));
    expect(props.commitDeleteOnServer).toHaveBeenCalledExactlyOnceWith([item]);
  });

  it('leaving the page during the undo window does not accelerate deletion', async () => {
    const { result, props, unmount } = create();
    await act(async () => { await result.current.requestDelete([item]); });
    unmount(); vi.advanceTimersByTime(10000);
    expect(props.commitDeleteOnServer).not.toHaveBeenCalled();
  });
});
