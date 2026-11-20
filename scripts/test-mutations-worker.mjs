import assert from 'node:assert/strict';
import { createIsolatedWorker, testBindings } from './isolated-worker.mjs';

const mf = createIsolatedWorker();
const api = (path, method, body, token = testBindings.ADMIN_ACCESS_TOKEN) => mf.dispatchFetch(`https://album.test${path}`, {
  method,
  headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
try {
  const bucket = await mf.getR2Bucket('ALBUM_BUCKET');
  const contents = async () => Object.fromEntries(await Promise.all(
    (await bucket.list()).objects.map(async object => [object.key, await (await bucket.get(object.key)).text()]),
  ));
  await bucket.put('a.jpg', 'A-original', { httpMetadata: { contentType: 'image/jpeg' } });
  await bucket.put('c.jpg', 'C-unique');

  assert.equal((await api('/api/media', 'PATCH', { action: 'rename', key: 'a.jpg', newName: 'b' }, 'wrong')).status, 401);
  assert.equal((await contents())['a.jpg'], 'A-original');

  // Three renames that touch the same names arrive together. The coordinator runs them one at a time,
  // so whatever the order, each file's content survives exactly once and nothing is overwritten.
  const responses = await Promise.all([
    api('/api/media', 'PATCH', { action: 'rename', key: 'a.jpg', newName: 'b' }),
    api('/api/media', 'PATCH', { action: 'rename', key: 'a.jpg', newName: 'd' }),
    api('/api/media', 'PATCH', { action: 'rename', key: 'c.jpg', newName: 'a' }),
  ]);
  for (const response of responses) assert.ok([200, 404].includes(response.status), `unexpected status ${response.status}`);
  assert.deepEqual(Object.values(await contents()).sort(), ['A-original', 'C-unique']);
  const renamed = Object.entries(await contents()).find(([, value]) => value === 'A-original')[0];
  assert.equal((await bucket.head(renamed)).httpMetadata.contentType, 'image/jpeg', 'a copy must keep the stored Content-Type');

  // Exercise real routing, authentication and the R2 binding, beyond browser route mocks.
  assert.equal((await api('/api/media', 'POST', { action: 'create-folder', name: 'trip' })).status, 200);
  const form = new FormData();
  form.append('files', new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'photo.png', { type: 'image/png' }));
  form.append('path', 'trip');
  const uploadRequest = new Request('https://album.test/api/upload', {
    method: 'POST', headers: { 'x-admin-token': testBindings.ADMIN_ACCESS_TOKEN }, body: form,
  });
  // Node and Miniflare use different FormData classes. Send the encoded multipart bytes.
  const upload = await mf.dispatchFetch(uploadRequest.url, {
    method: 'POST', headers: uploadRequest.headers, body: await uploadRequest.arrayBuffer(),
  });
  const uploadResult = await upload.json();
  assert.equal(upload.status, 201, JSON.stringify(uploadResult));
  const uploaded = uploadResult.media[0].key;
  assert.equal((await bucket.head(uploaded)).httpMetadata.contentType, 'image/png');
  assert.equal((await api('/api/media', 'DELETE', { action: 'batch-delete', items: [{ key: uploaded, isFolder: false }] })).status, 200);
  assert.equal(await bucket.head(uploaded), null);
  const trash = await (await api('/api/trash', 'GET')).json();
  assert.equal(trash.files.length, 1);
  assert.equal((await api('/api/trash', 'POST', { action: 'restore', keys: [trash.files[0].key] })).status, 200);
  assert.ok(await bucket.head(uploaded));
  console.log('Built Worker mutations passed with simulated R2, including concurrent rename, upload and trash restore.');
} finally { await mf.dispose(); }
