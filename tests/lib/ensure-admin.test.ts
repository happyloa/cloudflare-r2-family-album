// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('admin password validation', () => {
  beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); vi.stubEnv('ADMIN_ACCESS_TOKEN', 'test-password'); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
  const request = (token: string, ip = '192.0.2.1') => new Request('https://album.test', { headers: { 'x-admin-token': token, 'cf-connecting-ip': ip } });

  it('accepts the password and rejects both same-length and different-length incorrect passwords', async () => {
    const { requireAdmin } = await import('@/lib/ensure-admin');
    expect(await requireAdmin(request('test-password'))).toBeNull();
    expect((await requireAdmin(request('wrong-password')))?.status).toBe(401);
    expect((await requireAdmin(request('short')))?.status).toBe(401);
  });

  it('limits repeated failures and permits validation after the window expires', async () => {
    const { requireAdmin } = await import('@/lib/ensure-admin');
    for (let attempt = 0; attempt < 4; attempt++) expect((await requireAdmin(request('wrong')))?.status).toBe(401);
    expect((await requireAdmin(request('wrong')))?.status).toBe(429);
    expect((await requireAdmin(request('test-password')))?.status).toBe(429);
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    expect(await requireAdmin(request('test-password'))).toBeNull();
  });

  it('resets the failure count after a successful validation', async () => {
    const { requireAdmin } = await import('@/lib/ensure-admin');
    for (let attempt = 0; attempt < 4; attempt++) await requireAdmin(request('wrong'));
    expect(await requireAdmin(request('test-password'))).toBeNull();
    expect(await (await requireAdmin(request('wrong')))?.json()).toEqual({ error: 'Unauthorized', remainingAttempts: 4 });
  });

  it('rejects new sources before checking the password while the tracker is full', async () => {
    const { requireAdmin } = await import('@/lib/ensure-admin');
    for (let index = 0; index < 4096; index++) await requireAdmin(request('wrong', `10.${index >> 8}.${index & 255}.1`));
    expect((await requireAdmin(request('test-password', '203.0.113.9')))?.status).toBe(429);
    // 已記錄的來源照常驗證；過期項目清掉後新來源也能再驗證。
    expect(await requireAdmin(request('test-password', '10.0.0.1'))).toBeNull();
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    expect(await requireAdmin(request('test-password', '203.0.113.9'))).toBeNull();
  });
});
