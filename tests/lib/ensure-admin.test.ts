// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('admin password validation', () => {
  beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); vi.stubEnv('ADMIN_ACCESS_TOKEN', 'test-password'); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
  const request = (token: string) => new Request('https://album.test', { headers: { 'x-admin-token': token, 'cf-connecting-ip': '192.0.2.1' } });

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
});
