import { defineConfig, devices } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { unstable_readConfig } from 'wrangler';

const workerRuntime = process.env.ALBUM_E2E_RUNTIME === 'worker';
const runtimeEnvPath = fileURLToPath(new URL('./tests/fixtures/runtime.env', import.meta.url));
const testEnv = parseEnv(readFileSync(runtimeEnvPath, 'utf8'));
const devConfigPath = fileURLToPath(new URL('./.cache/e2e-worker/wrangler.json', import.meta.url));

if (!workerRuntime) {
  const source = unstable_readConfig({ config: './wrangler.jsonc' }, { preserveOriginalMain: true });
  mkdirSync(dirname(devConfigPath), { recursive: true });
  // Keep the production runtime settings, with only local assets and fake R2 credentials.
  const devConfig = JSON.stringify({
    name: 'album-e2e',
    main: source.main,
    compatibility_date: source.compatibility_date,
    compatibility_flags: source.compatibility_flags,
    assets: source.assets,
    vars: testEnv,
  });
  // Playwright also loads this file in its workers; unchanged writes would restart Vite.
  if (!existsSync(devConfigPath) || readFileSync(devConfigPath, 'utf8') !== devConfig) {
    writeFileSync(devConfigPath, devConfig);
  }
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  // Vite compiles routes on demand; keep development tests below the local compiler's capacity.
  workers: workerRuntime ? undefined : 2,
  timeout: 45000,
  outputDir: '.cache/playwright-results',
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:3100', trace: 'retain-on-failure', reducedMotion: 'reduce' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: workerRuntime
      ? `wrangler dev --config dist/server/wrangler.json --local --ip 127.0.0.1 --port 3100 --env-file "${runtimeEnvPath}"`
      : 'npm run dev -- --host 127.0.0.1 --port 3100 --strictPort',
    // This invalid page size compiles the API without making an R2 request.
    url: 'http://127.0.0.1:3100/api/media?limit=0',
    reuseExistingServer: false,
    env: {
      ...testEnv,
      CLOUDFLARE_INCLUDE_PROCESS_ENV: 'false',
      CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'true',
      CLOUDFLARE_VITE_FORCE_LOCAL: 'true',
      ...(!workerRuntime ? { CLOUDFLARE_VITE_WRANGLER_CONFIG_PATH: devConfigPath } : {}),
    },
    timeout: 120000,
  },
});
