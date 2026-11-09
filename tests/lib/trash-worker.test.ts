// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), purgeExpiredTrash: vi.fn() }));
vi.mock('vinext/server/fetch-handler', () => ({ default: { fetch: mocks.fetch } }));
vi.mock('@/lib/r2/trash', () => ({ purgeExpiredTrash: mocks.purgeExpiredTrash }));
import worker, { AlbumMutations } from '../../worker';

const ctx = {} as ExecutionContext;
const controller = {} as ScheduledController;
const coordinator = { fetch: vi.fn(), cleanup: vi.fn() };
const getByName = vi.fn(() => coordinator);
const env = { ALBUM_MUTATIONS: { getByName } } as unknown as Parameters<typeof worker.fetch>[1];

beforeEach(() => {
  mocks.fetch.mockReset(); mocks.purgeExpiredTrash.mockReset();
  coordinator.fetch.mockReset(); coordinator.cleanup.mockReset(); getByName.mockClear();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

it('keeps public browsing outside the mutation queue and coordinates all writes', async () => {
  const browsing = new Request('https://album.test/api/media');
  await worker.fetch(browsing, env, ctx);
  expect(mocks.fetch).toHaveBeenCalledWith(browsing, env, ctx);
  expect(getByName).not.toHaveBeenCalled();
  for (const [path, method] of [['/api/media', 'PATCH'], ['/api/upload', 'POST'], ['/api/trash', 'DELETE'], ['/api/%6dedia/', 'PATCH'], ['/api/media/usage?force=true', 'GET'], ['/api/upload', 'GET'], ['/api/trash', 'GET']]) {
    const request = new Request(`https://album.test${path}`, { method });
    await worker.fetch(request, env, ctx);
    expect(coordinator.fetch).toHaveBeenLastCalledWith(request);
  }
  expect(getByName).toHaveBeenLastCalledWith('album');
});

it('awaits coordinated cleanup and reports failures to the scheduler', async () => {
  coordinator.cleanup.mockResolvedValueOnce(7).mockRejectedValueOnce(new Error('simulated S3 failure'));
  await worker.scheduled(controller, env);
  expect(console.log).toHaveBeenCalledWith(JSON.stringify({ event: 'trash_cleanup', deleted: 7 }));
  await expect(worker.scheduled(controller, env)).rejects.toThrow('simulated S3 failure');
});

it('serializes mutations and scheduled cleanup, releases failures and lets reads proceed', async () => {
  const object = new AlbumMutations({} as DurableObjectState, env);
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const events: string[] = [];
  mocks.fetch.mockImplementation(async (request: Request) => {
    events.push(request.method);
    if (request.method === 'PATCH') { await blocked; throw new Error('copy failed'); }
    return new Response('ok');
  });
  mocks.purgeExpiredTrash.mockImplementation(async () => { events.push('cleanup'); return 1; });
  const first = object.fetch(new Request('https://album.test/api/media', { method: 'PATCH' }));
  const failed = expect(first).rejects.toThrow('copy failed');
  const second = object.fetch(new Request('https://album.test/api/trash', { method: 'DELETE' }));
  const cleanup = object.cleanup();
  await object.fetch(new Request('https://album.test/api/trash'));
  expect(events).toEqual(['GET', 'PATCH']);
  release();
  await failed; await second; await cleanup;
  expect(events).toEqual(['GET', 'PATCH', 'DELETE', 'cleanup']);
});
