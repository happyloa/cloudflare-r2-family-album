import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { TrashPanel } from '@/components/media/TrashPanel';
import type { TrashMedia } from '@/lib/r2/trash';

afterEach(cleanup);

it.each([
  { action: 'restore', label: '還原', failedChunk: 2 },
  { action: 'delete', label: '永久刪除', failedChunk: 1 },
] as const)('refreshes all storage views when $action has partial or uncertain results', async ({ action, label, failedChunk }) => {
  const files = new Map<string, TrashMedia>(Array.from({ length: 13 }, (_, index) => {
    const key = `trash/${index}.jpg`;
    return [key, {
      key, originalKey: `photo-${index}.jpg`, url: `/test-media/${index}.jpg`, type: 'image',
      trashedAt: '2026-10-18T00:00:00Z', expiresAt: '2026-11-02T00:00:00Z',
    }];
  }));
  let chunks = 0;
  const authorizedFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method !== 'POST') return Response.json({ files: [...files.values()], nextCursor: null, retentionDays: 15 });
    const body = JSON.parse(String(init.body)) as { action: string; keys: string[] };
    expect(body.action).toBe(action);
    chunks += 1;
    // A dropped response can hide a completed server mutation even in the first chunk.
    if (chunks < failedChunk || failedChunk === 1) body.keys.forEach(key => files.delete(key));
    if (chunks === failedChunk) throw new TypeError('simulated network failure');
    return Response.json({ completedKeys: body.keys, failures: [] });
  });
  const onChanged = vi.fn();
  const confirm = vi.fn().mockResolvedValue(true);
  function Album() {
    const [revision, setRevision] = useState(0);
    return <TrashPanel open revision={revision} authorizedFetch={authorizedFetch} onClose={vi.fn()} confirm={confirm}
      onChanged={() => { onChanged(); setRevision(value => value + 1); }} />;
  }
  render(<Album />);
  await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(13));
  fireEvent.click(screen.getByRole('button', { name: '全選' }));
  fireEvent.click(screen.getByRole('button', { name: label }));

  await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
  await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(3));
  expect(chunks).toBe(failedChunk);
  // 連線例外的英文原文不給使用者看，改用說明可能已部分完成的中文訊息。
  expect(screen.getByRole('status').textContent).toBe('連線中斷，部分項目可能已完成，請重新整理後確認結果');
  expect(screen.getByRole('status').textContent).not.toContain('simulated network failure');
  expect((screen.getByRole('button', { name: '關閉垃圾桶' }) as HTMLButtonElement).disabled).toBe(false);
});

const trashed: TrashMedia = {
  key: 'trash/0.jpg', originalKey: 'photo.jpg', url: '/test-media/0.jpg', type: 'image',
  trashedAt: '2026-10-18T00:00:00Z', expiresAt: '2026-11-02T00:00:00Z',
};
const htmlErrorPage = () => new Response('<!DOCTYPE html><html><body>Worker threw exception</body></html>', { status: 502, headers: { 'Content-Type': 'text/html' } });

it('shows a Chinese message instead of a JSON parse error when the listing is an HTML error page', async () => {
  const authorizedFetch = vi.fn(async () => htmlErrorPage());
  render(<TrashPanel open revision={0} authorizedFetch={authorizedFetch} onClose={vi.fn()} onChanged={vi.fn()} confirm={vi.fn()} />);
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toBe('無法載入垃圾桶，請重新整理後重試。');
  expect(alert.textContent).not.toMatch(/JSON|Unexpected|DOCTYPE/);
});

it('keeps the server message for JSON errors and hides parse errors from HTML action responses', async () => {
  const listing = () => Response.json({ files: [trashed], nextCursor: null, retentionDays: 15 });
  const actions = [
    () => Response.json({ error: '每次請提供 1 到 10 個有效的垃圾桶項目' }, { status: 400 }),
    htmlErrorPage,
  ];
  const authorizedFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => init?.method === 'POST' ? actions.shift()!() : listing());
  const onChanged = vi.fn();
  render(<TrashPanel open revision={0} authorizedFetch={authorizedFetch} onClose={vi.fn()} onChanged={onChanged} confirm={vi.fn()} />);
  fireEvent.click(await screen.findByRole('checkbox', { name: '選取垃圾桶媒體 photo.jpg' }));

  fireEvent.click(screen.getByRole('button', { name: '還原' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('每次請提供 1 到 10 個有效的垃圾桶項目'));

  fireEvent.click(screen.getByRole('button', { name: '還原' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('操作失敗，請重新整理後確認結果'));
  expect(onChanged).toHaveBeenCalledTimes(2);
});
