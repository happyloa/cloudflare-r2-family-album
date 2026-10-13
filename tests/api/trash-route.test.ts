// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { R2ActionError } from '@/lib/r2/core';

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), listTrash: vi.fn(), restoreTrashFile: vi.fn(), permanentlyDeleteTrashFile: vi.fn() }));
vi.mock('@/lib/ensure-admin', () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock('@/lib/r2/trash', () => mocks);
import { GET, POST } from '../../app/api/trash/route';

const key = '.family-album-trash/1793181600000/1791885600000-01234567-1234-4234-8234-012345678901/photo.jpg';
const request = (body: unknown) => new NextRequest('https://album.test/api/trash', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });

describe('trash API boundaries', () => {
  beforeEach(() => { for (const mock of Object.values(mocks)) mock.mockReset(); mocks.requireAdmin.mockResolvedValue(null); });

  it('authenticates before listing or touching storage', async () => {
    mocks.requireAdmin.mockResolvedValue(new Response('{}', { status: 401 }));
    expect((await GET(new NextRequest('https://album.test/api/trash'))).status).toBe(401);
    expect((await POST(request({ action: 'delete', keys: [key] }))).status).toBe(401);
    expect(mocks.listTrash).not.toHaveBeenCalled(); expect(mocks.permanentlyDeleteTrashFile).not.toHaveBeenCalled();
  });

  it('returns uncached pages and passes the cursor to storage', async () => {
    mocks.listTrash.mockResolvedValue({ files: [], nextCursor: 'next', retentionDays: 15 });
    const response = await GET(new NextRequest('https://album.test/api/trash?cursor=first'));
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.listTrash).toHaveBeenCalledWith({ cursor: 'first' });
  });

  it('rejects ordinary media, malformed records, oversized batches and bodies before mutations', async () => {
    for (const keys of [['photo.jpg'], [key.replace('photo.jpg', '../photo.jpg')], Array(11).fill(key)]) {
      expect((await POST(request({ action: 'delete', keys }))).status).toBe(400);
    }
    expect((await POST(request({ action: 'delete', keys: [key], padding: 'x'.repeat(300000) }))).status).toBe(400);
    expect(mocks.permanentlyDeleteTrashFile).not.toHaveBeenCalled();
  });

  it('reports partial failures without discarding successful results and deduplicates keys', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const other = key.replace('photo.jpg', 'other.jpg');
    mocks.restoreTrashFile.mockImplementation(async value => { if (value === other) throw new R2ActionError('原位置已有同名項目', 409); });
    const response = await POST(request({ action: 'restore', keys: [key, key, other] }));
    expect(await response.json()).toEqual({ completedKeys: [key], failures: [{ key: other, error: '原位置已有同名項目' }] });
    expect(mocks.restoreTrashFile).toHaveBeenCalledTimes(2);
  });
});
