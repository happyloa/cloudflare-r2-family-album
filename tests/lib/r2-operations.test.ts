// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { XMLParser } from 'fast-xml-parser';

const { storage, copyFailures, copyConflicts, copyArrivals, requests, listResponses } = vi.hoisted(() => ({
  storage: new Map<string, number>(),
  copyFailures: new Set<string>(),
  copyConflicts: new Set<string>(),
  copyArrivals: new Map<string, number>(),
  requests: [] as { method: string; key: string; headers: Headers; query: URLSearchParams }[],
  listResponses: [] as Array<() => Response | Promise<Response>>,
}));

vi.mock('aws4fetch', () => ({
  AwsClient: class {
    async fetch(input: string, init: RequestInit = {}) {
      const url = new URL(input);
      const key = decodeURIComponent(url.pathname.split('/').slice(2).join('/'));
      const method = init.method ?? 'GET';
      requests.push({ method, key, headers: new Headers(init.headers), query: url.searchParams });
      if (method === 'GET' && listResponses.length) return listResponses.shift()!();
      if (method === 'HEAD') return new Response(null, { status: storage.has(key) ? 200 : 404 });
      if (method === 'DELETE') { storage.delete(key); return new Response(null, { status: 204 }); }
      if (method === 'POST' && url.searchParams.has('delete')) {
        const body = new XMLParser({ parseTagValue: false, trimValues: false }).parse(String(init.body));
        const objects = [body.Delete.Object].flat();
        for (const object of objects) storage.delete(object.Key);
        return new Response('<DeleteResult/>');
      }
      if (method === 'PUT') {
        const source = new Headers(init.headers).get('x-amz-copy-source');
        if (source) {
          if (copyArrivals.has(key)) {
            storage.set(key, copyArrivals.get(key)!);
            copyArrivals.delete(key);
          }
          if (copyConflicts.has(key) || (new Headers(init.headers).get('cf-copy-destination-if-none-match') === '*' && storage.has(key))) return new Response(null, { status: 412 });
          const sourceKey = decodeURIComponent(source.split('/').slice(2).join('/'));
          if (copyFailures.has(sourceKey)) return new Response('<Error><Code>InternalError</Code></Error>');
          if (!storage.has(sourceKey)) return new Response(null, { status: 404 });
          storage.set(key, storage.get(sourceKey)!);
          return new Response('<CopyObjectResult><ETag>test-etag</ETag></CopyObjectResult>');
        }
        storage.set(key, init.body instanceof Blob ? init.body.size : 0);
        return new Response(null, { status: 200 });
      }
      const prefix = url.searchParams.get('prefix') ?? '';
      const delimiter = url.searchParams.get('delimiter');
      const entries: { key: string; xml: string }[] = [];
      const folders = new Set<string>();
      for (const [storedKey, size] of storage) {
        if (!storedKey.startsWith(prefix)) continue;
        const rest = storedKey.slice(prefix.length);
        if (delimiter && rest.includes('/')) { folders.add(prefix + rest.split('/')[0] + '/'); continue; }
        const xmlKey = storedKey.replace(/&/g, '&amp;').replace(/</g, '&lt;');
        entries.push({ key: storedKey, xml: `<Contents><Key>${xmlKey}</Key><Size>${size}</Size><LastModified>2026-10-01T00:00:00Z</LastModified></Contents>` });
      }
      const cursor = url.searchParams.get('continuation-token') ?? '';
      const all = [...entries, ...[...folders].map(folder => ({ key: folder, xml: `<CommonPrefixes><Prefix>${folder}</Prefix></CommonPrefixes>` }))].sort((a, b) => a.key < b.key ? -1 : 1).filter(entry => entry.key > cursor);
      const page = all.slice(0, Number(url.searchParams.get('max-keys') ?? 1000));
      const more = all.length > page.length;
      return new Response(`<ListBucketResult><IsTruncated>${more}</IsTruncated>${more ? `<NextContinuationToken>${page.at(-1)!.key}</NextContinuationToken>` : ''}${page.map(entry => entry.xml).join('')}</ListBucketResult>`);
    }
  },
}));

import { batchDelete, batchMove, createFolder, listMedia, moveFile, moveFolder, renameFile, renameFolder, uploadFilesToR2 } from '@/lib/r2';
import { listTrash, permanentlyDeleteTrashFile, purgeExpiredTrash, restoreTrashFile, trashFiles } from '@/lib/r2/trash';
import { calculateBucketUsage, clearUsageCache } from '@/lib/r2';
import { DAY_MS, parseTrashKey, TRASH_PREFIX } from '@/lib/trash-policy';

describe('R2 operations with isolated S3 storage', () => {
  beforeEach(() => {
    storage.clear(); copyFailures.clear(); copyConflicts.clear(); copyArrivals.clear(); requests.length = 0; listResponses.length = 0; clearUsageCache();
    vi.stubEnv('TRASH_RETENTION_DAYS', '15');
    for (const key of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME']) vi.stubEnv(key, 'test');
    vi.stubEnv('R2_PUBLIC_BASE', 'https://media.test');
  });

  it('creates, lists, renames and moves folders and media without losing contents', async () => {
    await createFolder('', 'trip');
    storage.set('trip/photo.jpg', 123);
    expect((await listMedia('')).folders).toEqual([{ key: 'trip', name: 'trip' }]);
    await renameFolder('trip', 'journey');
    await renameFile('journey/photo.jpg', 'memory');
    await batchMove([{ key: 'journey/memory.jpg', isFolder: false }], 'family/holiday');
    expect([...storage.keys()]).toEqual(['journey/', 'family/holiday/memory.jpg']);
    await moveFolder('journey', 'year');
    expect(storage.has('year/journey/')).toBe(true);
  });

  it('keeps dollar signs in folder names literal when renaming, moving and dissolving', async () => {
    storage.set('trip/photo.jpg', 1);
    expect(await renameFolder('trip', 'A$$B')).toEqual({ key: 'A$$B', name: 'A$$B' });
    expect(Object.fromEntries(storage)).toEqual({ 'A$$B/photo.jpg': 1 });
    await renameFolder('A$$B', '$&');
    expect(Object.fromEntries(storage)).toEqual({ '$&/photo.jpg': 1 });
    storage.set("$'/", 0);
    await moveFolder('$&', "$'");
    expect(Object.fromEntries(storage)).toEqual({ "$'/": 0, "$'/$&/photo.jpg": 1 });
    await batchDelete([{ key: "$'/$&", isFolder: true }]);
    expect(Object.fromEntries(storage)).toEqual({ "$'/": 0, "$'/photo.jpg": 1 });
  });

  it('refuses a folder key whose listing prefix differs instead of writing truncated names', async () => {
    storage.set('a/photo.jpg', 1); storage.set('t/', 0);
    await expect(renameFolder('a/ / /', 'b')).rejects.toThrow('Listed key is outside the source folder');
    await expect(moveFolder('a/ / /', 't')).rejects.toThrow('Invalid folder');
    expect(Object.fromEntries(storage)).toEqual({ 'a/photo.jpg': 1, 't/': 0 });
  });

  it('dissolves a folder while preserving its photos and resolving name conflicts', async () => {
    storage.set('photo.jpg', 1); storage.set('trip/', 0); storage.set('trip/photo.jpg', 2);
    storage.set('trip/child/video.mp4', 3);
    await batchDelete([{ key: 'trip', isFolder: true }]);
    expect(Object.fromEntries(storage)).toEqual({ 'photo.jpg': 1, 'photo (2).jpg': 2, 'child/video.mp4': 3 });
    await batchDelete([{ key: 'photo (2).jpg', isFolder: false }]);
    expect(storage.has('photo (2).jpg')).toBe(false);
  });

  it('dissolves a root folder by listing only its destinations instead of the whole bucket', async () => {
    for (let index = 0; index < 1100; index++) storage.set(`other/${index}.jpg`, 1);
    storage.set(`${TRASH_PREFIX}old/photo.jpg`, 1);
    storage.set('photo.jpg', 2); storage.set('child/', 0); storage.set('child/a.jpg', 3);
    storage.set('trip/', 0); storage.set('trip/photo.jpg', 4); storage.set('trip/child/a.jpg', 5); storage.set('trip/new/b.jpg', 6);
    await batchDelete([{ key: 'trip', isFolder: true }]);
    expect(storage.get('photo (2).jpg')).toBe(4);
    expect(storage.get('child/a (2).jpg')).toBe(5);
    expect(storage.get('new/b.jpg')).toBe(6);
    expect(storage.get(`${TRASH_PREFIX}old/photo.jpg`)).toBe(1);
    expect([...storage.keys()].some(key => key.startsWith('trip/'))).toBe(false);
    const lists = requests.filter(request => request.method === 'GET').map(request => [request.query.get('prefix'), request.query.get('delimiter')]);
    expect(lists).toEqual([['trip/', null], ['', '/'], ['child/', '/']]);
  });

  it('restores an empty child marker that maps onto an implicit dissolved folder', async () => {
    storage.set('trip/trip/', 0); storage.set('trip/a.jpg', 1);
    await batchDelete([{ key: 'trip', isFolder: true }]);
    expect(Object.fromEntries(storage)).toEqual({ 'trip/': 0, 'a.jpg': 1 });
  });

  it('limits each delete request to ten items including folders before touching storage', async () => {
    const folders = Array.from({ length: 11 }, (_, index) => ({ key: `folder-${index}`, isFolder: true }));
    folders.forEach(folder => storage.set(`${folder.key}/`, 0));
    await expect(batchDelete(folders)).rejects.toMatchObject({ status: 400, message: '每次最多刪除 10 個項目，請分批操作' });
    expect(requests).toHaveLength(0);
    expect(storage.size).toBe(11);
    await batchDelete(folders.slice(0, 10));
    expect([...storage.keys()]).toEqual(['folder-10/']);
    expect(requests.filter(request => request.method === 'GET')).toHaveLength(10);
  });

  it('checks a folder destination with one single-key listing and does not list it again', async () => {
    storage.set('year/', 0); storage.set('trip/a.jpg', 1); storage.set('trip/b.jpg', 2);
    await moveFolder('trip', 'year');
    expect(Object.fromEntries(storage)).toEqual({ 'year/': 0, 'year/trip/a.jpg': 1, 'year/trip/b.jpg': 2 });
    const destinationLists = requests.filter(request => request.method === 'GET' && request.query.get('prefix') === 'year/trip/');
    expect(destinationLists.map(request => request.query.get('max-keys'))).toEqual(['1']);

    requests.length = 0;
    for (let index = 0; index < 1500; index++) storage.set(`year/other/${index}.jpg`, 1);
    storage.set('other/a.jpg', 1);
    await expect(moveFolder('other', 'year')).rejects.toMatchObject({ status: 409 });
    expect(requests.filter(request => request.method === 'GET')).toHaveLength(1);
    expect(requests.some(request => request.method === 'PUT')).toBe(false);
  });

  it('keeps numeric-looking and space-padded keys and cursors exactly as stored', async () => {
    for (const key of ['007', '0x1A', '1e3', '2024.10', ' spaced.jpg ']) storage.set(key, 1);
    const listing = await listMedia('');
    expect(listing.files.map(file => file.key)).toEqual([' spaced.jpg ', '007', '0x1A', '1e3', '2024.10']);
    expect(listing.files[1].url).toBe('https://media.test/007');
    const page = await listMedia('', { limit: 2 });
    expect(page.nextCursor).toBe('007');
    expect((await listMedia('', { cursor: page.nextCursor!, limit: 1 })).files.map(file => file.key)).toEqual(['0x1A']);
    await renameFile('007', '008');
    await batchDelete([{ key: '1e3', isFolder: false }]);
    expect([...storage.keys()].filter(key => !key.startsWith(TRASH_PREFIX)).sort()).toEqual([' spaced.jpg ', '008', '0x1A', '2024.10']);
    expect((await listTrash()).files.map(file => file.originalKey)).toEqual(['1e3']);
  });

  it('checks direct filenames without scanning unrelated nested media', async () => {
    storage.set('photo.jpg', 1);
    for (let index = 0; index < 1100; index++) storage.set(`nested/${index}.jpg`, 2);
    await renameFile('photo.jpg', 'renamed');
    expect(storage.get('renamed.jpg')).toBe(1);
    expect(storage.get('nested/1099.jpg')).toBe(2);
    expect(requests.filter(request => request.method === 'GET')).toHaveLength(2);
  });

  it('shares one paginated usage scan across concurrent and forced refreshes', async () => {
    for (let index = 0; index < 1001; index++) storage.set(`photo-${index}.jpg`, 2);
    const usage = await Promise.all([calculateBucketUsage(), calculateBucketUsage(true), calculateBucketUsage()]);
    expect(usage).toEqual(Array.from({ length: 3 }, () => ({ totalBytes: 2002 })));
    expect(requests.filter(request => request.method === 'GET')).toHaveLength(2);
  });

  it('retries a failed usage scan without retaining a rejected shared request', async () => {
    storage.set('photo.jpg', 2);
    listResponses.push(() => new Response('', { status: 503 }));
    await expect(calculateBucketUsage()).rejects.toThrow();
    expect(await calculateBucketUsage()).toEqual({ totalBytes: 2 });
    expect(requests).toHaveLength(2);
  });

  it('does not put an older scan back in the cache after a write invalidates it', async () => {
    let release!: (response: Response) => void;
    const delayed = new Promise<Response>(resolve => { release = resolve; });
    listResponses.push(() => delayed);
    const older = calculateBucketUsage();
    clearUsageCache();
    storage.set('photo.jpg', 2);
    expect(await calculateBucketUsage()).toEqual({ totalBytes: 2 });
    release(new Response('<ListBucketResult><IsTruncated>false</IsTruncated><Contents><Key>photo.jpg</Key><Size>1</Size></Contents></ListBucketResult>'));
    expect(await older).toEqual({ totalBytes: 1 });
    expect(await calculateBucketUsage()).toEqual({ totalBytes: 2 });
    expect(requests).toHaveLength(2);
  });

  it('shares the destination listing across a bounded batch and resolves duplicate names', async () => {
    const items = Array.from({ length: 10 }, (_, index) => ({ key: `source-${index}/photo.jpg`, isFolder: false }));
    items.forEach((item, index) => storage.set(item.key, index + 1));
    await batchMove(items, 'destination');
    expect(storage.size).toBe(10);
    expect(storage.get('destination/photo.jpg')).toBe(1);
    expect(storage.get('destination/photo (10).jpg')).toBe(10);
    expect(requests.filter(request => request.method === 'GET' && request.key === '').length).toBe(11);
    expect(requests.length).toBe(31);
    const calls = requests.length;
    await expect(batchMove([...items, { key: 'extra.jpg', isFolder: false }], 'destination')).rejects.toMatchObject({ status: 400 });
    expect(requests).toHaveLength(calls);
  });

  it('keeps the upload id when renaming so the media keeps its upload time and list position', async () => {
    const id = '1700000000000-0f8fad5b-d9cb-469f-a165-70867728950e-';
    storage.set(`trip/${id}IMG_0001.jpg`, 1);
    await renameFile(`trip/${id}IMG_0001.jpg`, '海邊');
    expect([...storage.keys()]).toEqual([`trip/${id}海邊.jpg`]);
  });

  it('reports a vanished source with a message that does not point to the trash', async () => {
    await expect(renameFile('gone.jpg', 'renamed')).rejects.toMatchObject({ status: 404, message: '項目已不存在，請重新整理後再試' });
    expect(requests.some(request => request.method === 'DELETE')).toBe(false);
  });

  it('keeps the source when a copy returns an error inside HTTP 200', async () => {
    storage.set('original.jpg', 123); copyFailures.add('original.jpg');
    await expect(renameFile('original.jpg', 'renamed')).rejects.toThrow();
    expect(storage.get('original.jpg')).toBe(123);
    expect(requests.some(request => request.method === 'DELETE')).toBe(false);
  });

  it.each([
    { action: 'rename', sourceKey: 'original.jpg', targetKey: 'renamed.jpg', run: () => renameFile('original.jpg', 'renamed') },
    { action: 'move', sourceKey: 'original.jpg', targetKey: 'trip/original.jpg', run: () => moveFile('original.jpg', 'trip') },
  ])('preserves both files when a concurrent $action claims the destination', async ({ sourceKey, targetKey, run }) => {
    storage.set(sourceKey, 123);
    copyArrivals.set(targetKey, 999);
    await expect(run()).rejects.toMatchObject({ status: 409, message: '目的地已有同名項目，請重新整理後再試' });
    expect(Object.fromEntries(storage)).toEqual({ [sourceKey]: 123, [targetKey]: 999 });
    expect(requests.find(request => request.method === 'PUT')?.headers.get('cf-copy-destination-if-none-match')).toBe('*');
    expect(requests.some(request => request.method === 'DELETE' || request.method === 'POST')).toBe(false);
  });

  it('rejects moving a nested subtree beyond the maximum depth before copying anything', async () => {
    storage.set('trip/', 0); storage.set('trip/child/photo.jpg', 123);
    await expect(moveFolder('trip', 'year')).rejects.toThrow(/層/);
    expect(storage.has('trip/child/photo.jpg')).toBe(true);
    expect(requests.some(request => request.method === 'PUT')).toBe(false);
  });

  it('rolls back completed folder copies when another copy fails', async () => {
    storage.set('trip/a.jpg', 1); storage.set('trip/b.jpg', 2); copyFailures.add('trip/b.jpg');
    await expect(renameFolder('trip', 'renamed')).rejects.toThrow('R2 did not confirm the object copy');
    expect(Object.fromEntries(storage)).toEqual({ 'trip/a.jpg': 1, 'trip/b.jpg': 2 });
  });

  it.each([
    { action: 'rename', targetPrefix: 'renamed', run: () => renameFolder('trip', 'renamed') },
    { action: 'move', targetPrefix: 'year/trip', run: () => moveFolder('trip', 'year') },
  ])('rolls back only owned copies when a concurrent folder $action claims a destination', async ({ targetPrefix, run }) => {
    storage.set('trip/a.jpg', 1); storage.set('trip/b.jpg', 2);
    copyArrivals.set(`${targetPrefix}/b.jpg`, 999);
    await expect(run()).rejects.toMatchObject({ status: 409 });
    expect(Object.fromEntries(storage)).toEqual({ 'trip/a.jpg': 1, 'trip/b.jpg': 2, [`${targetPrefix}/b.jpg`]: 999 });
    expect(requests.filter(request => request.method === 'PUT').every(request => request.headers.get('cf-copy-destination-if-none-match') === '*')).toBe(true);
  });

  it('preserves existing directory markers when a dissolve copy fails and rolls back', async () => {
    storage.set('child/', 99); storage.set('trip/', 0); storage.set('trip/child/', 0);
    storage.set('trip/child/a.jpg', 1); storage.set('trip/child/b.jpg', 2);
    const originalStorage = Object.fromEntries(storage);
    copyFailures.add('trip/child/b.jpg');
    await expect(batchDelete([{ key: 'trip', isFolder: true }])).rejects.toThrow('R2 did not confirm the object copy');
    expect(Object.fromEntries(storage)).toEqual(originalStorage);
    expect(requests.some(request => request.method === 'PUT' && request.key === 'child/')).toBe(false);
  });

  it('keeps the existing parent marker when dissolving its child folder', async () => {
    storage.set('year/', 99); storage.set('year/trip/', 0); storage.set('year/trip/photo.jpg', 1);
    await batchDelete([{ key: 'year/trip', isFolder: true }]);
    expect(Object.fromEntries(storage)).toEqual({ 'year/': 99, 'year/photo.jpg': 1 });
    expect(requests.some(request => request.method === 'PUT' && request.key === 'year/')).toBe(false);
  });

  it('preserves an empty child folder that maps onto the source marker during dissolve', async () => {
    storage.set('trip/', 0); storage.set('trip/trip/', 0);
    await batchDelete([{ key: 'trip', isFolder: true }]);
    expect(Object.fromEntries(storage)).toEqual({ 'trip/': 0 });
    expect(requests.some(request => request.method === 'PUT')).toBe(false);
  });

  it('preserves an implicit parent when dissolving its only empty child', async () => {
    storage.set('year/trip/', 0);
    await batchDelete([{ key: 'year/trip', isFolder: true }]);
    expect(Object.fromEntries(storage)).toEqual({ 'year/': 0 });
  });

  it('uses distinct keys for simultaneous same-name uploads and reports actual file metadata', async () => {
    const file = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' });
    const upload = () => uploadFilesToR2([{ file, contentType: 'image/jpeg' }]);
    const [first, second] = await Promise.all([upload(), upload()]);
    expect(first.media[0].key).not.toBe(second.media[0].key);
    expect(first.media[0]).toMatchObject({ size: 5, lastModified: expect.any(String) });
    expect(storage.size).toBe(2);
  });

  it('starts retention when media enters trash and hides it from public browsing while counting its bytes', async () => {
    const now = Date.UTC(2026, 9, 13, 10);
    storage.set('trip/old.jpg', 123);
    await trashFiles(['trip/old.jpg'], now);
    const key = [...storage.keys()][0];
    expect(parseTrashKey(key)).toEqual({ originalKey: 'trip/old.jpg', trashedAt: now, expiresAt: now + 15 * DAY_MS });
    expect((await listTrash()).files[0]).toMatchObject({ originalKey: 'trip/old.jpg', trashedAt: new Date(now).toISOString() });
    expect((await listMedia()).folders).toEqual([]);
    await expect(listMedia(TRASH_PREFIX)).rejects.toMatchObject({ status: 403 });
    expect(await calculateBucketUsage(true)).toEqual({ totalBytes: 123 });
  });

  it('applies custom retention only to new entries and refuses invalid configuration before copying', async () => {
    const now = Date.UTC(2026, 9, 13);
    storage.set('first.jpg', 1); await trashFiles(['first.jpg'], now);
    vi.stubEnv('TRASH_RETENTION_DAYS', '3');
    storage.set('second.jpg', 2); await trashFiles(['second.jpg'], now);
    expect((await listTrash()).files.map(file => Date.parse(file.expiresAt) - now).sort((a, b) => a - b)).toEqual([3 * DAY_MS, 15 * DAY_MS]);
    vi.stubEnv('TRASH_RETENTION_DAYS', '1.5');
    storage.set('third.jpg', 3);
    const calls = requests.length;
    await expect(trashFiles(['third.jpg'], now)).rejects.toThrow('TRASH_RETENTION_DAYS');
    expect(requests).toHaveLength(calls); expect(storage.has('third.jpg')).toBe(true);
  });

  it('keeps media when moving to trash fails and rejects access through ordinary album mutations', async () => {
    storage.set('photo.jpg', 123); copyFailures.add('photo.jpg');
    await expect(trashFiles(['photo.jpg'])).rejects.toThrow('R2 did not confirm the object copy');
    expect(storage.get('photo.jpg')).toBe(123);
    expect(requests.some(request => request.method === 'POST')).toBe(false);
    // 清掉模擬的複製失敗，下面的拒絕才確定來自保留路徑檢查。
    copyFailures.clear();
    const calls = requests.length;
    await expect(createFolder('', TRASH_PREFIX.slice(0, -1))).rejects.toMatchObject({ status: 400, message: '此名稱保留給垃圾桶使用' });
    await expect(batchMove([{ key: 'photo.jpg', isFolder: false }], TRASH_PREFIX)).rejects.toMatchObject({ status: 400, message: '垃圾桶路徑不能用於一般相簿操作' });
    await expect(trashFiles(['invalid\u0000.jpg'])).rejects.toMatchObject({ status: 400, message: '無效的媒體路徑，無法移入垃圾桶' });
    expect(requests).toHaveLength(calls);
    expect(storage.get('photo.jpg')).toBe(123);
  });

  it('restores Unicode media to its original path and refuses to overwrite existing media', async () => {
    const now = Date.UTC(2026, 9, 13);
    const original = '旅行/記憶&照片.jpg';
    storage.set(original, 321); await trashFiles([original], now);
    const key = [...storage.keys()][0];
    storage.set(original, 999);
    await expect(restoreTrashFile(key, now)).rejects.toMatchObject({ status: 409 });
    expect(storage.get(original)).toBe(999); expect(storage.get(key)).toBe(321);
    storage.delete(original);
    const media = await restoreTrashFile(key, now);
    expect(media.key).toBe(original); expect(storage.get(original)).toBe(321); expect(storage.has(key)).toBe(false);
    expect(requests.find(request => request.method === 'PUT' && request.key === original)?.headers.get('cf-copy-destination-if-none-match')).toBe('*');
  });

  it('preserves the trash copy when a concurrent restore claims the original name', async () => {
    const now = Date.UTC(2026, 9, 13);
    storage.set('photo.jpg', 123); await trashFiles(['photo.jpg'], now);
    const key = [...storage.keys()][0]; copyConflicts.add('photo.jpg');
    await expect(restoreTrashFile(key, now)).rejects.toMatchObject({ status: 409 });
    expect(storage.get(key)).toBe(123);
    await expect(restoreTrashFile(key, now + 15 * DAY_MS)).rejects.toMatchObject({ status: 410 });
  });

  it('purges only due valid trash entries, follows pagination and stops before future entries', async () => {
    const now = Date.UTC(2026, 9, 13);
    for (let index = 0; index < 150; index++) storage.set(`old-${index}.jpg`, 1);
    await trashFiles([...storage.keys()], now - 15 * DAY_MS);
    storage.set('future.jpg', 2); await trashFiles(['future.jpg'], now);
    storage.set('ordinary.jpg', 3); storage.set(`${TRASH_PREFIX}unknown-object.jpg`, 4);
    requests.length = 0;
    expect(await purgeExpiredTrash(now)).toBe(150);
    expect(storage.has('ordinary.jpg')).toBe(true);
    expect(storage.has(`${TRASH_PREFIX}unknown-object.jpg`)).toBe(true);
    expect((await listTrash()).files.map(file => file.originalKey)).toEqual(['future.jpg']);
    expect(requests.filter(request => request.method === 'GET').length).toBe(3);
    await expect(permanentlyDeleteTrashFile('ordinary.jpg')).rejects.toThrow();
  });
});
