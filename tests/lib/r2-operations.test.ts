// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { XMLParser } from 'fast-xml-parser';

const { storage, copyFailures, copyConflicts, copyArrivals, requests } = vi.hoisted(() => ({
  storage: new Map<string, number>(),
  copyFailures: new Set<string>(),
  copyConflicts: new Set<string>(),
  copyArrivals: new Map<string, number>(),
  requests: [] as { method: string; key: string; headers: Headers }[],
}));

vi.mock('aws4fetch', () => ({
  AwsClient: class {
    async fetch(input: string, init: RequestInit = {}) {
      const url = new URL(input);
      const key = decodeURIComponent(url.pathname.split('/').slice(2).join('/'));
      const method = init.method ?? 'GET';
      requests.push({ method, key, headers: new Headers(init.headers) });
      if (method === 'HEAD') return new Response(null, { status: storage.has(key) ? 200 : 404 });
      if (method === 'DELETE') { storage.delete(key); return new Response(null, { status: 204 }); }
      if (method === 'POST' && url.searchParams.has('delete')) {
        const body = new XMLParser().parse(String(init.body));
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
    storage.clear(); copyFailures.clear(); copyConflicts.clear(); copyArrivals.clear(); requests.length = 0; clearUsageCache();
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

  it('dissolves a folder while preserving its photos and resolving name conflicts', async () => {
    storage.set('photo.jpg', 1); storage.set('trip/', 0); storage.set('trip/photo.jpg', 2);
    storage.set('trip/child/video.mp4', 3);
    await batchDelete([{ key: 'trip', isFolder: true }]);
    expect(Object.fromEntries(storage)).toEqual({ 'photo.jpg': 1, 'photo (2).jpg': 2, 'child/video.mp4': 3 });
    await batchDelete([{ key: 'photo (2).jpg', isFolder: false }]);
    expect(storage.has('photo (2).jpg')).toBe(false);
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
    await expect(run()).rejects.toMatchObject({ status: 409 });
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
    await expect(renameFolder('trip', 'renamed')).rejects.toThrow();
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
    await expect(batchDelete([{ key: 'trip', isFolder: true }])).rejects.toThrow();
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
    await expect(trashFiles(['photo.jpg'])).rejects.toThrow();
    expect(storage.get('photo.jpg')).toBe(123);
    expect(requests.some(request => request.method === 'POST')).toBe(false);
    await expect(createFolder('', TRASH_PREFIX.slice(0, -1))).rejects.toThrow();
    await expect(batchMove([{ key: 'photo.jpg', isFolder: false }], TRASH_PREFIX)).rejects.toThrow();
    const calls = requests.length;
    await expect(trashFiles(['invalid\u0000.jpg'])).rejects.toThrow();
    expect(requests).toHaveLength(calls);
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
