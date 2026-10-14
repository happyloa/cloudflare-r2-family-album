// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), purgeExpiredTrash: vi.fn() }));
vi.mock('vinext/server/fetch-handler', () => ({ default: { fetch: mocks.fetch } }));
vi.mock('@/lib/r2/trash', () => ({ purgeExpiredTrash: mocks.purgeExpiredTrash }));
import worker from '../../worker';

beforeEach(() => { mocks.purgeExpiredTrash.mockReset(); vi.spyOn(console, 'log').mockImplementation(() => {}); });
it('keeps the Vinext fetch handler and awaits scheduled cleanup', async () => {
  expect(worker.fetch).toBe(mocks.fetch);
  mocks.purgeExpiredTrash.mockResolvedValue(7);
  await worker.scheduled();
  expect(mocks.purgeExpiredTrash).toHaveBeenCalledOnce();
  expect(console.log).toHaveBeenCalledWith(JSON.stringify({ event: 'trash_cleanup', deleted: 7 }));
});
it('reports cleanup failures to the scheduler instead of marking them successful', async () => {
  mocks.purgeExpiredTrash.mockRejectedValue(new Error('simulated S3 failure'));
  await expect(worker.scheduled()).rejects.toThrow('simulated S3 failure');
});
