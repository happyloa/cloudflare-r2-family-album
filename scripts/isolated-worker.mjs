import { globSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const require = createRequire(import.meta.url);
const { Miniflare, convertV4MiniflareOptions } = createRequire(require.resolve('wrangler/package.json'))('miniflare');
const root = new URL('../', import.meta.url);
export const workerConfig = JSON.parse(readFileSync(new URL('dist/server/wrangler.json', root), 'utf8'));
export const testBindings = parseEnv(readFileSync(new URL('tests/fixtures/runtime.env', root), 'utf8'));

export function createIsolatedWorker() {
  const serverDirectory = fileURLToPath(new URL('dist/server/', root));
  const modulePaths = ['index.js', ...globSync('**/*.{js,mjs}', { cwd: serverDirectory }).filter(path => path !== 'index.js')];
  return new Miniflare(convertV4MiniflareOptions({
    name: 'album-storage-isolated',
    modules: modulePaths.map(path => ({ type: 'ESModule', path: resolve(serverDirectory, path) })),
    modulesRoot: serverDirectory,
    compatibilityDate: workerConfig.compatibility_date,
    compatibilityFlags: workerConfig.compatibility_flags,
    bindings: testBindings,
    // In-memory simulated R2, separate from any real bucket.
    r2Buckets: Object.fromEntries(workerConfig.r2_buckets.map(bucket => [bucket.binding, 'album-isolated'])),
    durableObjects: Object.fromEntries(workerConfig.durable_objects.bindings.map(binding => [
      binding.name, { className: binding.class_name, useSQLite: true },
    ])),
    // R2 goes through the binding, so no request may leave the isolated Worker.
    outboundService: async request => {
      throw new Error(`Unexpected outbound URL in isolated Worker: ${request.url}`);
    },
  }));
}
