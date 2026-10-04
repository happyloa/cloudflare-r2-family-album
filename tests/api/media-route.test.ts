// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { R2ActionError } from '@/lib/r2/core';

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), createFolder: vi.fn(), renameFile: vi.fn(), renameFolder: vi.fn(), moveFile: vi.fn(), moveFolder: vi.fn(), batchMove: vi.fn(), batchDelete: vi.fn(), listMedia: vi.fn() }));
vi.mock('@/lib/ensure-admin', () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock('@/lib/r2', async () => ({ ...mocks, R2ActionError: (await import('@/lib/r2/core')).R2ActionError }));
import { GET, POST, PATCH, DELETE } from '../../app/api/media/route';

const request = (method: string, body: unknown) => new NextRequest('https://album.test/api/media', { method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });

describe('media API boundaries', () => {
  beforeEach(() => { for (const mock of Object.values(mocks)) mock.mockReset(); mocks.requireAdmin.mockResolvedValue(null); });

  it('allows public paginated browsing without an admin password', async () => {
    mocks.listMedia.mockResolvedValue({ prefix: '', files: [], folders: [], nextCursor: 'next' });
    const response = await GET(new NextRequest('https://album.test/api/media?limit=48&cursor=first'));
    expect(response.status).toBe(200);
    expect(mocks.requireAdmin).not.toHaveBeenCalled();
    expect(mocks.listMedia).toHaveBeenCalledWith('', { limit: 48, cursor: 'first' });
  });

  it.each([POST, PATCH, DELETE])('requires authentication before every mutation', async handler => {
    mocks.requireAdmin.mockResolvedValue(new Response('{}', { status: 401 }));
    expect((await handler(request('POST', { action: 'validate' }))).status).toBe(401);
    expect(mocks.createFolder).not.toHaveBeenCalled();
    expect(mocks.batchDelete).not.toHaveBeenCalled();
  });

  it('rejects invalid folder names, oversized bodies and oversized batches before storage calls', async () => {
    expect((await POST(request('POST', { action: 'create-folder', name: '..' }))).status).toBe(400);
    expect((await POST(request('POST', { action: 'create-folder', name: 'a'.repeat(300000) }))).status).toBe(400);
    expect((await DELETE(request('DELETE', { action: 'batch-delete', items: Array.from({ length: 201 }, () => ({ key: 'photo.jpg' })) }))).status).toBe(400);
    expect(mocks.createFolder).not.toHaveBeenCalled(); expect(mocks.batchDelete).not.toHaveBeenCalled();
  });

  it('returns actionable destination conflicts and subtree depth errors', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.createFolder.mockRejectedValue(new R2ActionError('目的地已存在', 409));
    const conflict = await POST(request('POST', { action: 'create-folder', name: 'trip' }));
    expect(conflict.status).toBe(409); expect(await conflict.json()).toEqual({ error: '目的地已存在' });
    mocks.moveFolder.mockRejectedValue(new R2ActionError('子資料夾會超過兩層'));
    const invalidMove = await PATCH(request('PATCH', { action: 'move', key: 'trip', isFolder: true, targetPrefix: 'year' }));
    expect(invalidMove.status).toBe(400); expect(await invalidMove.json()).toEqual({ error: '子資料夾會超過兩層' });
  });
});
