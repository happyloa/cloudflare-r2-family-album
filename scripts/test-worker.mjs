import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const result = spawnSync(process.execPath, [require.resolve('@playwright/test/cli'), 'test', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, ALBUM_E2E_RUNTIME: 'worker' },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
