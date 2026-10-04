// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { XMLParser } from 'fast-xml-parser';

const { storage, copyFailures, requests } = vi.hoisted(() => ({
  storage: new Map<string, number>(),
  copyFailures: new Set<string>(),
  requests: [] as { method: string; key: string }[],
}));

vi.mock('aws4fetch', () => ({
  AwsClient: class {
    async fetch(input: string, init: RequestInit = {}) {
      const url = new URL(input);
      const key = decodeURIComponent(url.pathname.split('/').slice(2).join('/'));
      const method = init.method ?? 'GET';
      requests.push({ method, key });
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
      const entries: string[] = [];
      const folders = new Set<string>();
      for (const [storedKey, size] of storage) {
        if (!storedKey.startsWith(prefix)) continue;
        const rest = storedKey.slice(prefix.length);
        if (delimiter && rest.includes('/')) { folders.add(prefix + rest.split('/')[0] + '/'); continue; }
        entries.push(`<Contents><Key>${storedKey}</Key><Size>${size}</Size><LastModified>2026-10-01T00:00:00Z</LastModified></Contents>`);
      }
      return new Response(`<ListBucketResult><IsTruncated>false</IsTruncated>${[...folders].map(folder => `<CommonPrefixes><Prefix>${folder}</Prefix></CommonPrefixes>`).join('')}${entries.join('')}</ListBucketResult>`);
    }
  },
}));

import { batchDelete, batchMove, createFolder, listMedia, moveFolder, renameFile, renameFolder, uploadFilesToR2 } from '@/lib/r2';

describe('R2 operations with isolated S3 storage', () => {
  beforeEach(() => {
    storage.clear(); copyFailures.clear(); requests.length = 0;
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

  it('uses distinct keys for simultaneous same-name uploads and reports actual file metadata', async () => {
    const file = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' });
    const upload = () => uploadFilesToR2([{ file, contentType: 'image/jpeg' }]);
    const [first, second] = await Promise.all([upload(), upload()]);
    expect(first.media[0].key).not.toBe(second.media[0].key);
    expect(first.media[0]).toMatchObject({ size: 5, lastModified: expect.any(String) });
    expect(storage.size).toBe(2);
  });
});
