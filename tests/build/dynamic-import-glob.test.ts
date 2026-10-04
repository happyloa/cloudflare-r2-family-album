// @vitest-environment node

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { build } from 'vite';
import commonjs from 'vite-plugin-commonjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const dynamicImportRequire = createRequire(require.resolve('vite-plugin-dynamic-import'));
const glob = dynamicImportRequire('fast-glob') as {
  sync: (patterns: string[], options: { cwd: string }) => string[];
};

describe('dynamic import glob compatibility', () => {
  let fixture: string;

  beforeEach(() => {
    fixture = mkdtempSync(join(tmpdir(), 'album-dynamic-import-'));
    mkdirSync(join(fixture, 'modules', 'nested'), { recursive: true });
    writeFileSync(join(fixture, 'modules', 'one.js'), 'export const value = "one";');
    writeFileSync(join(fixture, 'modules', 'two.ts'), 'export const value = "two";');
    writeFileSync(join(fixture, 'modules', 'nested', 'index.js'), 'export const value = "nested";');
    writeFileSync(join(fixture, 'modules', '.hidden.js'), 'export const value = "hidden";');
  });

  afterEach(() => {
    rmSync(fixture, { recursive: true, force: true });
  });

  it('matches extension alternatives and nested index files relative to the importer', () => {
    expect(glob.sync(['./modules/*.{js,ts}', './modules/*/index.{js,ts}'], {
      cwd: fixture,
    }).sort()).toEqual([
      'modules/nested/index.js',
      'modules/one.js',
      'modules/two.ts',
    ]);
    expect(glob.sync(['./modules/nested'], { cwd: fixture })).toEqual([]);
  });

  it('builds and executes CommonJS dynamic require with the installed plugin', async () => {
    const entry = join(fixture, 'entry.js');
    writeFileSync(entry, 'module.exports = (name) => require(`./modules/${name}`).value;');

    await build({
      configFile: false,
      root: fixture,
      logLevel: 'silent',
      plugins: [commonjs()],
      build: {
        outDir: join(fixture, 'out'),
        lib: { entry, formats: ['cjs'], fileName: () => 'entry.cjs' },
      },
    });

    const load = require(join(fixture, 'out', 'entry.cjs')) as (name: string) => string;
    expect(load('one')).toBe('one');
    expect(load('two')).toBe('two');
    expect(load('nested')).toBe('nested');
    expect(() => load('missing')).toThrow();
  });
});
