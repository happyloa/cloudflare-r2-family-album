import assert from 'node:assert/strict';
import { XMLParser } from 'fast-xml-parser';
import { createIsolatedWorker, workerConfig as config } from './isolated-worker.mjs';

assert.deepEqual(config.triggers.crons, ['0 * * * *']);
const now = Date.now();
const prefix = '.family-album-trash/';
const id = '01234567-1234-4234-8234-012345678901';
const expired = `${prefix}${now - 1}/${now - 15 * 86400000}-${id}/expired.jpg`;
const future = `${prefix}${now + 15 * 86400000}/${now}-${id}/future.jpg`;
const storage = new Set([expired, future, 'ordinary.jpg', `${prefix}unknown.jpg`]);
const requests = [];
const mf = createIsolatedWorker(async request => {
  const url = new URL(request.url);
  requests.push(request.method);
  if (request.method === 'GET') {
    assert.equal(url.searchParams.get('prefix'), prefix);
    return new Response(`<ListBucketResult><IsTruncated>false</IsTruncated>${[...storage].filter(key => key.startsWith(prefix)).sort().map(key => `<Contents><Key>${key}</Key><Size>1</Size></Contents>`).join('')}</ListBucketResult>`);
  }
  assert.equal(request.method, 'POST'); assert.ok(url.searchParams.has('delete'));
  const objects = new XMLParser().parse(await request.text()).Delete.Object;
  for (const object of [objects].flat()) {
    assert.equal(object.Key, expired);
    storage.delete(object.Key);
  }
  return new Response('<DeleteResult/>');
});
try {
  const worker = await mf.getWorker();
  const result = await worker.scheduled({ cron: '0 * * * *', scheduledTime: now });
  assert.equal(result.outcome, 'ok');
  assert.equal(storage.has(expired), false);
  assert.equal(storage.has(future), true);
  assert.equal(storage.has('ordinary.jpg'), true);
  assert.equal(storage.has(`${prefix}unknown.jpg`), true);
  assert.deepEqual(requests, ['GET', 'POST']);
  console.log('Built Worker scheduled cleanup passed with isolated S3 storage.');
} finally { await mf.dispose(); }
