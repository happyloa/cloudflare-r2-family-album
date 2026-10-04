import { defineConfig, devices } from '@playwright/test';
const workerRuntime = process.env.ALBUM_E2E_RUNTIME === 'worker';

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
      ? 'wrangler dev --config dist/server/wrangler.json --local --ip 127.0.0.1 --port 3100 --var ADMIN_ACCESS_TOKEN:album-isolated-test-password'
      : 'npm run dev -- --hostname 127.0.0.1 --port 3100',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: false,
    env: { ADMIN_ACCESS_TOKEN: 'album-isolated-test-password' },
    timeout: 120000,
  },
});
