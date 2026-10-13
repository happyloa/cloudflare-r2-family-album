import { defineConfig, devices } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const workerRuntime = process.env.ALBUM_E2E_RUNTIME === 'worker';
const runtimeEnvPath = fileURLToPath(new URL('./tests/fixtures/runtime.env', import.meta.url));
const testEnv = parseEnv(readFileSync(runtimeEnvPath, 'utf8'));

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
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
      : 'npm run dev -- --hostname 127.0.0.1 --port 3100',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: false,
    env: {
      ...testEnv,
      CLOUDFLARE_INCLUDE_PROCESS_ENV: 'false',
      CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'true',
    },
    timeout: 120000,
  },
});
