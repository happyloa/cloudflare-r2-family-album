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
  expect(screen.getByRole('status').textContent).toContain('simulated network failure');
  expect((screen.getByRole('button', { name: '關閉垃圾桶' }) as HTMLButtonElement).disabled).toBe(false);
});
