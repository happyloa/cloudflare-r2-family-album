import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/ensure-admin';
import { createLimitedRequest } from '@/lib/upload/body-limit';
import { MAX_TRASH_ITEMS_PER_REQUEST } from '@/lib/constants';
import { R2ActionError } from '@/lib/r2';
import { listTrash, permanentlyDeleteTrashFile, restoreTrashFile } from '@/lib/r2/trash';
import { parseTrashKey } from '@/lib/trash-policy';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request: NextRequest) {
  const authError = await requireAdmin(request);
  if (authError) { authError.headers.set('Cache-Control', 'no-store'); return authError; }
  const cursor = request.nextUrl.searchParams.get('cursor') || undefined;
  if (cursor && (cursor.length > 2048 || /[\u0000-\u001f]/.test(cursor))) return json({ error: '無效的垃圾桶游標' }, 400);
  try {
    return json(await listTrash({ cursor }));
  } catch (error) {
    console.error('Failed to list trash', error);
    return json({ error: '無法載入垃圾桶，請稍後再試' }, 500);
  }
}

export async function POST(request: Request) {
  const authError = await requireAdmin(request);
  if (authError) { authError.headers.set('Cache-Control', 'no-store'); return authError; }
  let body: unknown;
  try { body = await createLimitedRequest(request, 256 * 1024).request.json(); }
  catch { return json({ error: '請求內容格式錯誤' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: '請求內容格式錯誤' }, 400);
  const { action, keys } = body as { action?: unknown; keys?: unknown };
  if ((action !== 'restore' && action !== 'delete') || !Array.isArray(keys) || !keys.length || keys.length > MAX_TRASH_ITEMS_PER_REQUEST ||
      keys.some(key => typeof key !== 'string' || new TextEncoder().encode(key).length > 1024 || !parseTrashKey(key))) {
    return json({ error: `每次請提供 1 到 ${MAX_TRASH_ITEMS_PER_REQUEST} 個有效的垃圾桶項目` }, 400);
  }
  const completedKeys: string[] = [];
  const failures: { key: string; error: string }[] = [];
  const uniqueKeys = [...new Set(keys as string[])];
  // 限制同時處理的串流，批次部分失敗時保留逐項結果供介面重試。
  for (let offset = 0; offset < uniqueKeys.length; offset += 4) {
    await Promise.all(uniqueKeys.slice(offset, offset + 4).map(async key => {
      try {
        if (action === 'restore') await restoreTrashFile(key);
        else await permanentlyDeleteTrashFile(key);
        completedKeys.push(key);
      } catch (error) {
        console.error('Failed trash operation', { action, error });
        failures.push({ key, error: error instanceof R2ActionError ? error.message : '操作失敗，請重新整理清單後確認結果' });
      }
    }));
  }
  return json({ completedKeys, failures });
}
