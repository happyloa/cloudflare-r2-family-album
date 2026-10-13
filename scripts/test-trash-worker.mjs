import assert from 'node:assert/strict';
import { globSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { XMLParser } from 'fast-xml-parser';

const require = createRequire(import.meta.url);
// 使用專案 Wrangler 自己的 Miniflare，避免額外加入一套 runtime 依賴。
const { Miniflare, convertV4MiniflareOptions } = createRequire(require.resolve('wrangler/package.json'))('miniflare');
const root = new URL('../', import.meta.url);
const config = JSON.parse(readFileSync(new URL('dist/server/wrangler.json', root), 'utf8'));
assert.deepEqual(config.triggers.crons, ['0 * * * *']);
const bindings = parseEnv(readFileSync(new URL('tests/fixtures/runtime.env', root), 'utf8'));
const now = Date.now();
const prefix = '.family-album-trash/';
const id = '01234567-1234-4234-8234-012345678901';
const expired = `${prefix}${now - 1}/${now - 15 * 86400000}-${id}/expired.jpg`;
const future = `${prefix}${now + 15 * 86400000}/${now}-${id}/future.jpg`;
const storage = new Set([expired, future, 'ordinary.jpg', `${prefix}unknown.jpg`]);
const requests = [];
const serverDirectory = fileURLToPath(new URL('dist/server/', root));
const modulePaths = ['index.js', ...globSync('**/*.{js,mjs}', { cwd: serverDirectory }).filter(path => path !== 'index.js')];
const mf = new Miniflare(convertV4MiniflareOptions({
  name: 'album-trash-isolated',
  modules: modulePaths.map(path => ({ type: 'ESModule', path: resolve(serverDirectory, path) })),
  modulesRoot: serverDirectory,
  compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags,
  bindings,
  // 所有對外請求只進這個模擬器；即使程式誤用其他 URL，也會立即失敗。
  outboundService: async request => {
    const url = new URL(request.url);
    assert.equal(url.hostname, `${bindings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`);
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
  },
}));
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
