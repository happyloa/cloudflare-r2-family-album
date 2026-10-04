import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const password = 'album-isolated-test-password';
const photo = (key: string, size = 100) => ({ key, size, url: `/test-media/${encodeURIComponent(key)}`, type: key.endsWith('.mp4') ? 'video' : 'image', lastModified: '2026-10-01T00:00:00Z' });

async function fixture(page: Page, paginated = false) {
  const folders = new Set(['2025旅行', '2025旅行/目的地', '2024回憶']);
  const files = new Map(['photo.jpg', 'unsupported.heic', 'video.mp4'].map(key => [key, photo(key)]));
  if (paginated) for (let index = 0; index < 52; index++) files.set(`extra-${index}.jpg`, photo(`extra-${index}.jpg`));
  const mutations: string[] = [];
  let failMove = false;
  await page.route('**/test-media/**', async route => {
    if (/heic/.test(route.request().url())) return route.fulfill({ status: 404 });
    if (/mp4/.test(route.request().url())) return route.fulfill({ contentType: 'video/webm', body: readFileSync('tests/fixtures/clip.webm') });
    return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><defs><linearGradient id="sky" x2="1" y2="1"><stop stop-color="#567a96"/><stop offset="1" stop-color="#edd4bb"/></linearGradient></defs><path fill="url(#sky)" d="M0 0h800v600H0z"/><path fill="#38574d" d="M0 600V410l230-260 240 340 170-250 160 180v180z"/></svg>' });
  });
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
    if (url.pathname === '/api/media' && method === 'GET') {
      const prefix = url.searchParams.get('prefix') ?? '';
      const parent = (key: string) => key.split('/').slice(0, -1).join('/');
      const entries = [
        ...[...folders].filter(key => parent(key) === prefix).map(key => ({ folder: { key, name: key.split('/').at(-1) } })),
        ...[...files.values()].filter(item => parent(item.key) === prefix).map(file => ({ file })),
      ];
      const offset = Number(url.searchParams.get('cursor') ?? 0);
      const limit = Number(url.searchParams.get('limit') ?? 48);
      const slice = entries.slice(offset, offset + limit);
      return json({ prefix, folders: slice.flatMap(item => 'folder' in item ? [item.folder] : []), files: slice.flatMap(item => 'file' in item ? [item.file] : []), nextCursor: offset + limit < entries.length ? String(offset + limit) : null });
    }
    // The real authentication and upload-policy endpoints run against a test-only password.
    if (url.pathname === '/api/upload' && method === 'GET') return route.continue();
    const body = request.headers()['content-type']?.includes('application/json') ? request.postDataJSON() : {};
    if (body.action === 'validate') return route.continue();
    if (request.headers()['x-admin-token'] !== password) return json({ error: '未授權' }, 401);
    if (url.pathname === '/api/media/usage') return json({ totalBytes: [...files.values()].reduce((sum, item) => sum + item.size, 0) });
    if (url.pathname === '/api/upload') {
      mutations.push('upload'); files.set('uploaded.png', photo('uploaded.png'));
      return json({ media: [files.get('uploaded.png')], failures: [] });
    }
    mutations.push(body.action);
    if (body.action === 'create-folder') {
      const key = [body.prefix, body.name].filter(Boolean).join('/'); folders.add(key);
      return json({ folder: { key, name: body.name } });
    }
    if (body.action === 'rename') {
      if (body.isFolder) { folders.delete(body.key); folders.add(body.newName); return json({ folder: { key: body.newName, name: body.newName } }); }
      const extension = body.key.slice(body.key.lastIndexOf('.'));
      const key = body.newName.endsWith(extension) ? body.newName : body.newName + extension;
      files.delete(body.key); files.set(key, photo(key)); return json({ media: files.get(key) });
    }
    if (body.action === 'move' || body.action === 'batch-move') {
      if (failMove) { failMove = false; return json({ error: '目的地已有同名資料夾，請重試。' }, 409); }
      for (const item of body.items ?? [body]) {
        const key = [body.targetPrefix, item.key.split('/').at(-1)].filter(Boolean).join('/');
        if (item.isFolder) { folders.delete(item.key); folders.add(key); }
        else { files.delete(item.key); files.set(key, photo(key)); }
      }
      return json({ ok: true });
    }
    if (body.action === 'batch-delete') {
      for (const item of body.items) { if (item.isFolder) folders.delete(item.key); else files.delete(item.key); }
      return json({ ok: true });
    }
    throw new Error(`Unmocked test API operation: ${method} ${url.pathname}`);
  });
  return { mutations, files, folders, failNextMove: () => { failMove = true; } };
}

async function login(page: Page) {
  await page.getByRole('button', { name: '啟用管理模式' }).click();
  await page.getByLabel('管理密碼', { exact: true }).fill(password);
  await page.getByRole('button', { name: '確認' }).click();
  await expect(page.getByRole('button', { name: '退出管理' })).toBeVisible();
}

async function more(page: Page, name: string) {
  const article = page.locator('article').filter({ has: page.getByRole('button', { name: `預覽媒體 ${name}`, exact: true }) });
  const touch = await page.evaluate(() => matchMedia('(hover:none)').matches);
  if (touch) await article.getByRole('button', { name: '更多操作' }).tap();
  else { await article.hover(); await article.getByRole('button', { name: '更多操作' }).click(); }
  await expect(page.getByRole('menu')).toBeVisible();
}

test('public browsing, folder history, preview, keyboard navigation and responsive layout', async ({ page }, testInfo) => {
  await fixture(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: '預覽媒體 photo.jpg' })).toBeVisible();
  await expect(page.getByRole('button', { name: '更多操作' })).toHaveCount(0);
  await page.getByRole('button', { name: '開啟資料夾 2025旅行', exact: true }).click();
  await expect(page).toHaveURL(/folder=/);
  await expect(page.getByRole('button', { name: '開啟資料夾 目的地' })).toBeVisible();
  await page.goBack();
  await page.getByRole('button', { name: '預覽媒體 photo.jpg' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain('"Noto Sans TC"');
  expect(await page.evaluate(async () => {
    const faces = await document.fonts.load('400 16px "Noto Sans TC"', '我們這一家');
    return faces.length > 0 && faces.every(face => face.status === 'loaded');
  })).toBe(true);
  const fontRequests = await page.evaluate(() => performance.getEntriesByType('resource').filter(item => /\.woff2?/.test(item.name)));
  expect(fontRequests.length).toBeGreaterThan(0);
  expect(fontRequests.every(item => new URL(item.name).origin === new URL(page.url()).origin)).toBe(true);
  await page.screenshot({ path: `.cache/${testInfo.project.name}-album.png`, fullPage: true });
});

test('sort, filter, video playback and unsupported preview fallback', async ({ page }) => {
  await fixture(page); await page.goto('/');
  await page.getByRole('button', { name: '名稱', exact: true }).click();
  await expect(page.getByRole('button', { name: '名稱', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '改為遞增' }).click();
  await expect(page.locator('article button[aria-label^="預覽媒體"]').first()).toHaveAttribute('aria-label', '預覽媒體 photo.jpg');
  await page.getByRole('button', { name: '影片', exact: true }).click();
  await expect(page.locator('article button[aria-label^="預覽媒體"]')).toHaveCount(1);
  await page.getByRole('button', { name: '全部', exact: true }).click();
  await page.getByRole('button', { name: '預覽媒體 video.mp4' }).click();
  const video = page.getByRole('dialog').locator('video');
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(2);
  await video.evaluate(element => (element as HTMLVideoElement).play());
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(0);
  await video.focus(); await page.keyboard.press('ArrowLeft');
  await expect(video).toBeVisible();
  await page.getByRole('button', { name: '關閉', exact: true }).click();
  await page.getByRole('button', { name: '全部', exact: true }).click();
  await page.getByRole('button', { name: '預覽媒體 unsupported.heic' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('無法載入預覽');
  await expect(page.getByRole('link', { name: '在新分頁開啟' })).toHaveAttribute('target', '_blank');
  await page.getByRole('button', { name: '重新載入', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
});

test('selection, batch move and maximum-depth controls', async ({ page }) => {
  const state = await fixture(page); await page.goto('/'); await login(page);
  for (const name of ['photo.jpg', 'unsupported.heic']) {
    const article = page.locator('article').filter({ has: page.getByText(name, { exact: true }) });
    if (await page.evaluate(() => matchMedia('(hover:none)').matches)) await article.getByRole('button', { name: '選取', exact: true }).tap();
    else { await article.hover(); await article.getByRole('button', { name: '選取', exact: true }).click(); }
  }
  await page.getByRole('button', { name: '移動', exact: true }).click();
  await page.getByRole('button', { name: '2025旅行，進入資料夾' }).click();
  await page.getByRole('button', { name: '目的地，進入資料夾' }).click();
  await page.getByRole('button', { name: '移動到這裡' }).click();
  expect(state.files.has('2025旅行/目的地/photo.jpg')).toBe(true);
  expect(state.files.has('2025旅行/目的地/unsupported.heic')).toBe(true);
  await page.getByRole('button', { name: '開啟資料夾 2025旅行', exact: true }).click();
  await page.getByRole('button', { name: '開啟資料夾 目的地', exact: true }).click();
  await page.getByRole('button', { name: '新增', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: '已達資料夾層數上限' })).toBeDisabled();
  await expect(page.getByRole('menuitem', { name: '上傳檔案' })).toBeEnabled();
});

test('empty state and recovery from a listing error', async ({ page }) => {
  const state = await fixture(page); state.files.clear(); state.folders.clear();
  let failListing = true;
  await page.route('**/api/media?*', route => failListing ? route.fulfill({ status: 500, json: { error: '隔離測試錯誤' } }) : route.fallback());
  await page.goto('/');
  await expect(page.getByText('無法載入目前資料夾', { exact: true })).toBeVisible();
  failListing = false;
  await page.getByRole('button', { name: '再試一次', exact: true }).click();
  await expect(page.getByText('目前沒有媒體或資料夾', { exact: true })).toBeVisible();
});

test('destination pagination retries without discarding loaded folders', async ({ page }) => {
  const state = await fixture(page); await page.goto('/'); await login(page);
  for (let index = 0; index < 110; index++) state.folders.add(`目標${index}`);
  let failed = false;
  await page.route('**/api/media?*', route => {
    const url = new URL(route.request().url());
    if (!failed && url.searchParams.get('limit') === '100' && url.searchParams.has('cursor')) {
      failed = true;
      return route.fulfill({ status: 500, json: { error: '隔離分頁錯誤' } });
    }
    return route.fallback();
  });
  await more(page, 'photo.jpg'); await page.getByRole('menuitem', { name: /移動$/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '載入更多', exact: true }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByRole('button', { name: '2025旅行，進入資料夾', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: '再試一次', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '目標109，進入資料夾', exact: true })).toBeVisible();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
});

test('long filenames and dialogs fit narrow and landscape viewports', async ({ page }, testInfo) => {
  const state = await fixture(page);
  const name = '長檔名'.repeat(60) + '.jpg'; state.files.set(name, photo(name));
  await page.goto('/');
  for (const viewport of [{ width: 320, height: 640 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await page.getByRole('button', { name: `預覽媒體 ${name}`, exact: true }).click();
    const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await dialog.evaluate(element => element.scrollWidth <= window.innerWidth)).toBe(true);
    const title = dialog.locator('[id]').filter({ hasText: name }).first();
    expect((await title.boundingBox())?.height).toBeLessThanOrEqual(44);
    const counter = dialog.getByText(/^\d+ \/ \d+$/);
    expect((await counter.boundingBox())?.height).toBeLessThan(30);
    const previous = await dialog.getByRole('button', { name: '上一個', exact: true }).boundingBox();
    expect(previous).not.toBeNull();
    expect(previous!.y + previous!.height).toBeLessThanOrEqual(viewport.height);
    await page.screenshot({ path: `.cache/${testInfo.project.name}-dialog-${viewport.width}.png` });
    await page.getByRole('button', { name: '關閉', exact: true }).click();
  }
});

test('desktop drag moves media to a folder', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', '手機以觸控多選與移動視窗操作。');
  const state = await fixture(page); await page.goto('/'); await login(page);
  const source = page.locator('article').filter({ has: page.getByRole('button', { name: '預覽媒體 photo.jpg', exact: true }) });
  const target = page.locator('article').filter({ has: page.getByRole('button', { name: '開啟資料夾 2024回憶', exact: true }) });
  await source.dragTo(target);
  await expect.poll(() => state.files.has('2024回憶/photo.jpg')).toBe(true);
});

test('search reveals collapsed folders and finds media on later pages', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('familyAlbum.folderGroups.collapsed', '{"2024":true}'));
  await fixture(page, true);
  await page.goto('/');
  const search = page.getByRole('searchbox', { name: '搜尋資料夾與媒體' });
  await search.fill('2024');
  await expect(page.getByRole('button', { name: '開啟資料夾 2024回憶' })).toBeVisible();
  await search.fill('extra-51');
  await expect(page.getByRole('button', { name: '預覽媒體 extra-51.jpg' })).toBeVisible();
});

test('password management, create, rename, retry failed move and reach the second level', async ({ page }) => {
  const state = await fixture(page);
  await page.goto('/'); await login(page);
  await page.getByRole('button', { name: '新增', exact: false }).click();
  await page.getByRole('menuitem', { name: '建立資料夾' }).click();
  await page.getByLabel('資料夾名稱', { exact: true }).fill('新相簿');
  await page.getByRole('button', { name: '建立', exact: true }).click();
  await expect(page.getByRole('button', { name: '開啟資料夾 新相簿' })).toBeVisible();
  await more(page, 'photo.jpg');
  await page.getByRole('menuitem', { name: '重新命名' }).click();
  await page.getByLabel('新名稱', { exact: true }).fill('renamed');
  await page.getByRole('dialog').getByRole('button', { name: '確認', exact: true }).click();
  await expect(page.getByRole('button', { name: '預覽媒體 renamed.jpg' })).toBeVisible();
  await more(page, 'renamed.jpg'); await page.getByRole('menuitem', { name: /移動$/ }).click();
  await page.getByRole('button', { name: '2025旅行，進入資料夾' }).click();
  await page.getByRole('button', { name: '目的地，進入資料夾' }).click();
  state.failNextMove(); await page.getByRole('button', { name: '移動到這裡' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '移動到這裡' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(state.files.has('2025旅行/目的地/renamed.jpg')).toBe(true);
  await page.getByRole('button', { name: '退出管理' }).click();
  await expect(page.getByRole('button', { name: '啟用管理模式' })).toBeVisible();
});

test('upload and delete undo preserve confirmed results', async ({ page }) => {
  const state = await fixture(page);
  await page.goto('/'); await login(page);
  await page.locator('input[type=file]').setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=', 'base64') });
  await expect(page.getByRole('button', { name: '預覽媒體 uploaded.png' })).toBeVisible();
  await more(page, 'uploaded.png'); await page.getByRole('menuitem', { name: /刪除$/ }).click();
  await page.getByRole('button', { name: '確定', exact: true }).click();
  await page.getByRole('button', { name: '復原', exact: true }).click();
  await expect(page.getByRole('button', { name: '預覽媒體 uploaded.png' })).toBeVisible();
  expect(state.mutations).not.toContain('batch-delete');
  await more(page, 'uploaded.png'); await page.getByRole('menuitem', { name: /刪除$/ }).click();
  await page.getByRole('button', { name: '確定', exact: true }).click();
  await expect.poll(() => state.mutations.includes('batch-delete'), { timeout: 10000 }).toBe(true);
  expect(state.files.has('uploaded.png')).toBe(false);
});
