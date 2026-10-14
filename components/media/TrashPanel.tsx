'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { TrashMedia } from '@/lib/r2/trash';
import { MAX_BATCH_ITEMS, MAX_TRASH_ITEMS_PER_REQUEST } from '@/lib/constants';
import { getMediaName } from '@/lib/media-name';
import { useFocusTrap } from './hooks/useFocusTrap';
import { MediaThumbnail } from './MediaThumbnail';
import { MediaPreviewModal } from './MediaPreviewModal';

type Confirm = (options: { title?: string; message: string; confirmLabel?: string; danger?: boolean }) => Promise<boolean>;
type ListingResponse = { error?: string; files: TrashMedia[]; nextCursor: string | null; retentionDays: number };
type ActionResponse = { error?: string; completedKeys: string[]; failures: { key: string; error: string }[] };

export function TrashPanel({ open, revision, authorizedFetch, onClose, onChanged, confirm }: {
  open: boolean;
  revision: number;
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  onClose: () => void;
  onChanged: () => void;
  confirm: Confirm;
}) {
  const [files, setFiles] = useState<TrashMedia[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState<string | null>(null);
  const [retentionDays, setRetentionDays] = useState(15);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [now, setNow] = useState(Date.now());
  const [preview, setPreview] = useState<{ media: TrashMedia; trigger: HTMLElement } | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const panelRef = useFocusTrap<HTMLDivElement>(open, { onEscape: () => { if (!working) onClose(); } });
  const titleId = useId();
  const descriptionId = useId();
  const orderedFiles = useMemo(() => [...files].sort((a, b) => b.trashedAt.localeCompare(a.trashedAt)), [files]);

  const load = useCallback(async (nextCursor?: string) => {
    requestRef.current?.abort();
    const request = new AbortController();
    requestRef.current = request;
    setLoading(true);
    setLoadError('');
    try {
      const response = await authorizedFetch(`/api/trash${nextCursor ? `?cursor=${encodeURIComponent(nextCursor)}` : ''}`, { signal: request.signal });
      const data = await response.json() as ListingResponse;
      if (!response.ok) throw new Error(data.error || '無法載入垃圾桶');
      if (!Array.isArray(data.files)) throw new Error('垃圾桶回應格式錯誤');
      if (request.signal.aborted) return;
      setFiles(previous => [...new Map((nextCursor ? [...previous, ...data.files] : data.files).map((file: TrashMedia) => [file.key, file])).values()] as TrashMedia[]);
      setCursor(data.nextCursor ?? null);
      setRetentionDays(data.retentionDays);
      setNow(Date.now());
    } catch (error) {
      if (!request.signal.aborted) setLoadError(error instanceof Error ? error.message : '無法載入垃圾桶');
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }, [authorizedFetch]);

  useEffect(() => {
    if (!open) { requestRef.current?.abort(); setPreview(null); return; }
    void load();
    return () => requestRef.current?.abort();
  }, [open, revision, load]);
  useEffect(() => {
    if (!open) return;
    setSelected(new Set()); setActionMessage('');
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [open]);
  useEffect(() => {
    const visible = new Set(files.map(file => file.key));
    setSelected(previous => new Set([...previous].filter(key => visible.has(key))));
  }, [files]);

  const actOnSelection = async (action: 'restore' | 'delete') => {
    if (!selected.size || working) return;
    const keys = [...selected];
    if (action === 'delete' && !await confirm({ title: '永久刪除', message: `永久刪除 ${keys.length} 個媒體？這個操作無法復原。`, confirmLabel: '永久刪除', danger: true })) return;
    setWorking(true); setActionMessage('');
    try {
      const completedKeys: string[] = [];
      const failures: ActionResponse['failures'] = [];
      for (let offset = 0; offset < keys.length; offset += MAX_TRASH_ITEMS_PER_REQUEST) {
        const response = await authorizedFetch('/api/trash', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, keys: keys.slice(offset, offset + MAX_TRASH_ITEMS_PER_REQUEST) }) });
        const data = await response.json() as ActionResponse;
        if (!response.ok || !Array.isArray(data.completedKeys) || !Array.isArray(data.failures)) throw new Error(data.error || '操作失敗，請重新整理後確認結果');
        completedKeys.push(...data.completedKeys); failures.push(...data.failures);
      }
      const message = failures.length ? `${completedKeys.length} 個完成，${failures.length} 個未完成：${failures[0].error}` : `已${action === 'restore' ? '還原' : '永久刪除'} ${completedKeys.length} 個媒體`;
      setActionMessage(message);
      onChanged();
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : '操作失敗，請稍後再試');
      // 連線中斷也可能已有項目完成，重新讀取而不假設整批失敗。
      void load();
    } finally { setWorking(false); }
  };

  if (!open) return null;
  const allSelected = selected.size === Math.min(files.length, MAX_BATCH_ITEMS) && selected.size > 0;
  const date = (value: string) => new Date(value).toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-surface-950/90 p-3 backdrop-blur-sm sm:p-6" onClick={() => { if (!working) onClose(); }}>
        <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} aria-busy={loading || working}
          className="flex max-h-[calc(100dvh-2rem)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-surface-700 bg-surface-950 shadow-2xl" onClick={event => event.stopPropagation()}>
          <header className="flex shrink-0 items-start justify-between gap-4 border-b border-surface-700/60 p-5 sm:p-6">
            <div className="min-w-0 space-y-2">
              <h2 id={titleId} className="text-2xl font-medium text-surface-50">垃圾桶</h2>
              <p id={descriptionId} className="text-sm text-surface-400">新移入的媒體保留 {retentionDays} 天，到期後由每小時排程清理。</p>
            </div>
            <button type="button" disabled={working} onClick={onClose} className="shrink-0 cursor-pointer rounded-lg border border-surface-700 px-3 py-2 text-sm text-surface-200 disabled:cursor-not-allowed disabled:opacity-50" aria-label="關閉垃圾桶">關閉</button>
          </header>
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-surface-700/50 px-5 py-3 text-sm sm:px-6">
            <button type="button" disabled={loading || working || !files.length} onClick={() => setSelected(allSelected ? new Set() : new Set(orderedFiles.slice(0, MAX_BATCH_ITEMS).map(file => file.key)))} className="cursor-pointer rounded-lg px-3 py-2 text-surface-300 hover:bg-surface-900 disabled:cursor-not-allowed disabled:opacity-40">{allSelected ? '取消全選' : files.length > MAX_BATCH_ITEMS ? `選取前 ${MAX_BATCH_ITEMS} 項` : '全選'}</button>
            <span className="mr-auto text-xs text-surface-400" aria-live="polite">已選取 {selected.size} 項</span>
            <button type="button" disabled={!selected.size || loading || working} onClick={() => void actOnSelection('restore')} className="cursor-pointer rounded-lg bg-primary-700 px-3 py-2 text-primary-50 disabled:cursor-not-allowed disabled:opacity-40">還原</button>
            <button type="button" disabled={!selected.size || loading || working} onClick={() => void actOnSelection('delete')} className="cursor-pointer rounded-lg border border-red-400/30 px-3 py-2 text-red-200 disabled:cursor-not-allowed disabled:opacity-40">永久刪除</button>
            <button type="button" disabled={loading || working} onClick={() => { setActionMessage(''); void load(); }} className="cursor-pointer rounded-lg px-3 py-2 text-surface-300 disabled:cursor-not-allowed disabled:opacity-40" aria-label="重新整理垃圾桶">重新整理</button>
          </div>
          <div className="min-h-0 space-y-5 overflow-y-auto overscroll-contain p-5 sm:p-6">
            {actionMessage ? <p role="status" className="break-words rounded-lg bg-surface-900 p-3 text-sm text-surface-200">{actionMessage}</p> : null}
            {loadError ? <p role="alert" className="rounded-lg border border-red-400/30 p-3 text-sm text-red-200">{loadError}，請重新整理後重試。</p> : null}
            {loading && !files.length ? <p role="status" className="py-16 text-center text-sm text-surface-400">正在載入垃圾桶…</p> : !files.length && !loadError && !cursor ? <p className="py-16 text-center text-sm text-surface-400">垃圾桶是空的</p> : null}
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {orderedFiles.map(file => {
                const expired = Date.parse(file.expiresAt) <= now;
                return (
                  <article key={file.key} className="min-w-0 rounded-lg border border-surface-700/50 bg-surface-900/40 p-2">
                    <button type="button" onClick={event => setPreview({ media: file, trigger: event.currentTarget })} className="block w-full cursor-pointer rounded-lg" aria-label={`預覽垃圾桶媒體 ${getMediaName(file.originalKey)}`}><MediaThumbnail media={file} /></button>
                    <div className="space-y-2 px-1 py-3">
                      <label className="flex min-w-0 cursor-pointer items-center gap-2 text-sm text-surface-100 has-[:disabled]:cursor-not-allowed">
                        <input type="checkbox" checked={selected.has(file.key)} disabled={working || (!selected.has(file.key) && selected.size >= MAX_BATCH_ITEMS)} onChange={event => setSelected(previous => { const next = new Set(previous); if (event.target.checked) next.add(file.key); else next.delete(file.key); return next; })} aria-label={`選取垃圾桶媒體 ${getMediaName(file.originalKey)}`} className="size-4 shrink-0 cursor-pointer accent-primary-400 disabled:cursor-not-allowed" />
                        <span className="truncate" title={file.originalKey}>{getMediaName(file.originalKey)}</span>
                      </label>
                      <p className="break-all text-xs text-surface-400">原位置：{file.originalKey}</p>
                      <p className="text-xs text-surface-400">移入：{date(file.trashedAt)}</p>
                      <p className={`text-xs ${expired ? 'text-red-300' : 'text-primary-300'}`}>{expired ? '已到期，等待清理' : `到期：${date(file.expiresAt)}`}</p>
                    </div>
                  </article>
                );
              })}
            </div>
            {cursor ? <button type="button" onClick={() => void load(cursor)} disabled={loading || working} className="mx-auto block cursor-pointer rounded-lg border border-surface-700 px-4 py-2 text-sm text-surface-200 disabled:cursor-wait disabled:opacity-50">{loading ? '載入中…' : '載入更多垃圾桶媒體'}</button> : null}
            {files.length ? <p className="text-center text-xs text-surface-400">{cursor ? '已載入' : '共'} {files.length} 個媒體。同名項目不會被覆寫；到期後無法還原。</p> : null}
          </div>
        </div>
      </div>
      <MediaPreviewModal zIndex={80} media={preview?.media ?? null} allFiles={orderedFiles} onClose={() => setPreview(null)} onNavigate={media => setPreview(previous => previous ? { ...previous, media: media as TrashMedia } : null)} triggerElement={preview?.trigger ?? null} />
    </>
  );
}
