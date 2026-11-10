import assert from 'node:assert/strict';
import { XMLParser } from 'fast-xml-parser';
import { createIsolatedWorker, testBindings } from './isolated-worker.mjs';

const storage = new Map([['a.jpg', 'A-original'], ['c.jpg', 'C-unique']]);
const xml = new XMLParser();
let releaseDelete;
let copiedSource;
const deleteGate = new Promise(resolve => { releaseDelete = resolve; });
const copyReady = new Promise(resolve => { copiedSource = resolve; });
let delayed = false;
const mf = createIsolatedWorker(async request => {
  const url = new URL(request.url);
  const key = decodeURIComponent(url.pathname.split('/').slice(2).join('/'));
  if (request.method === 'GET') {
    const prefix = url.searchParams.get('prefix') ?? '';
    const contents = [...storage.keys()].filter(key => key.startsWith(prefix))
      .map(key => `<Contents><Key>${key}</Key><Size>1</Size></Contents>`).join('');
    return new Response(`<ListBucketResult><IsTruncated>false</IsTruncated>${contents}</ListBucketResult>`);
  }
  if (request.method === 'HEAD') return new Response(null, { status: storage.has(key) ? 200 : 404 });
  if (request.method === 'PUT') {
    const copySource = request.headers.get('x-amz-copy-source');
    if (!copySource) {
      storage.set(key, await request.text());
      return new Response(null, { status: 200 });
    }
    const source = decodeURIComponent(copySource.split('/').slice(2).join('/'));
    assert.equal(request.headers.get('cf-copy-destination-if-none-match'), '*');
    if (storage.has(key)) return new Response(null, { status: 412 });
    if (!storage.has(source)) return new Response(null, { status: 404 });
    storage.set(key, storage.get(source));
    if (key === 'b.jpg') copiedSource();
    return new Response('<CopyObjectResult><ETag>isolated-etag</ETag></CopyObjectResult>');
  }
  if (request.method === 'DELETE') {
    if (key === 'a.jpg' && !delayed) { delayed = true; await deleteGate; }
    storage.delete(key);
    return new Response(null, { status: 204 });
  }
  assert.equal(request.method, 'POST');
  assert.ok(url.searchParams.has('delete'));
  for (const object of [xml.parse(await request.text()).Delete.Object].flat()) storage.delete(object.Key);
  return new Response('<DeleteResult/>');
});

const api = (path, method, body, token = testBindings.ADMIN_ACCESS_TOKEN) => mf.dispatchFetch(`https://album.test${path}`, {
  method,
  headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
try {
  assert.equal((await api('/api/media', 'PATCH', { action: 'rename', key: 'a.jpg', newName: 'b' }, 'wrong')).status, 401);
  assert.equal(storage.get('a.jpg'), 'A-original');
  const first = api('/api/media', 'PATCH', { action: 'rename', key: 'a.jpg', newName: 'b' });
  await copyReady;
  const second = api('/api/media', 'PATCH', { action: 'rename', key: 'a.jpg', newName: 'd' });
  const third = api('/api/media', 'PATCH', { action: 'rename', key: 'c.jpg', newName: 'a' });
  // Reads remain available while a write is blocked on S3.
  assert.equal((await api('/api/trash', 'GET')).status, 200);
  releaseDelete();
  const responses = await Promise.all([first, second, third]);
  assert.equal(responses[0].status, 200);
  assert.equal(responses[2].status, 200);
  // The two queued renames open separate connections and can reach the coordinator in either order.
  // Both orders must run after the first rename finishes and keep the new content exactly once.
  if (responses[1].status === 404) assert.equal(storage.get('a.jpg'), 'C-unique');
  else {
    assert.equal(responses[1].status, 200);
    assert.equal(storage.get('d.jpg'), 'C-unique', 'a queued rename must not copy the file the first rename was moving');
  }
  assert.equal(storage.get('b.jpg'), 'A-original');
  assert.equal(storage.size, 2);

  // Exercise real routing, authentication, signing and mock S3, beyond browser route mocks.
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
  assert.ok(storage.has(uploaded));
  assert.equal((await api('/api/media', 'DELETE', { action: 'batch-delete', items: [{ key: uploaded, isFolder: false }] })).status, 200);
  const trash = await (await api('/api/trash', 'GET')).json();
  assert.equal(trash.files.length, 1);
  assert.equal((await api('/api/trash', 'POST', { action: 'restore', keys: [trash.files[0].key] })).status, 200);
  assert.ok(storage.has(uploaded));
  console.log('Built Worker mutations passed with isolated S3, including concurrent rename, upload and trash restore.');
} finally { releaseDelete(); await mf.dispose(); }
