import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const cliArgs = process.argv.slice(2);
const hasPort = cliArgs.some(arg => arg === '--port' || arg.startsWith('--port='));
const wranglerPackagePath = require.resolve('wrangler/package.json');
const wranglerCli = fileURLToPath(new URL(require(wranglerPackagePath).bin.wrangler, pathToFileURL(wranglerPackagePath)));
const result = spawnSync(process.execPath, [
  wranglerCli, 'dev',
  '--config', fileURLToPath(new URL('../dist/server/wrangler.json', import.meta.url)),
  '--env-file', fileURLToPath(new URL('../.dev.vars', import.meta.url)),
  '--local', '--ip', '127.0.0.1',
  ...(!hasPort ? ['--port', '3000'] : []), ...cliArgs,
], { stdio: 'inherit', env: process.env });

if (result.error) throw result.error;
process.exit(result.status ?? 1);
