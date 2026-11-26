import assert from 'node:assert/strict';
import { createIsolatedWorker, workerConfig as config } from './isolated-worker.mjs';

assert.deepEqual(config.triggers.crons, ['0 * * * *']);
const now = Date.now();
const prefix = '.family-album-trash/';
const id = '01234567-1234-4234-8234-012345678901';
const expired = `${prefix}${now - 1}/${now - 15 * 86400000}-${id}/expired.jpg`;
const future = `${prefix}${now + 15 * 86400000}/${now}-${id}/future.jpg`;
const mf = createIsolatedWorker();
try {
  const bucket = await mf.getR2Bucket('ALBUM_BUCKET');
  for (const key of [expired, future, 'ordinary.jpg', `${prefix}unknown.jpg`]) await bucket.put(key, 'x');
  const worker = await mf.getWorker();
  const result = await worker.scheduled({ cron: '0 * * * *', scheduledTime: now });
  assert.equal(result.outcome, 'ok');
  const byName = (a, b) => a.localeCompare(b);
  const remaining = (await bucket.list()).objects.map(object => object.key).sort(byName);
  assert.deepEqual(remaining, [future, `${prefix}unknown.jpg`, 'ordinary.jpg'].sort(byName));
  console.log('Built Worker scheduled cleanup passed with simulated R2.');
} finally { await mf.dispose(); }
