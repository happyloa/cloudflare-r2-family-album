import { useCallback, useEffect, useState } from 'react';

type AuthorizedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/**
 * useBucketUsage Hook: 取得並快取 R2 貯體已使用容量
 * 抽離成共用 hook，讓上傳表單與拖曳上傳都能在上傳後同步刷新用量。
 */
export function useBucketUsage(enabled: boolean, authorizedFetch: AuthorizedFetch) {
  const [usageBytes, setUsageBytes] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async (force = false) => {
    if (!enabled) return;

    setLoading(true);
    try {
      setError('');
      const response = await authorizedFetch(`/api/media/usage${force ? '?force=true' : ''}`);
      if (!response.ok) throw new Error('Failed to fetch usage');
      const data = await response.json();
      const parsed = Number(data?.totalBytes);
      setUsageBytes(Number.isFinite(parsed) ? parsed : 0);
    } catch (err) {
      console.error('Failed to load bucket usage', err);
      setUsageBytes(null);
      setError('無法取得目前容量，請稍後再試。');
    } finally {
      setLoading(false);
    }
  }, [authorizedFetch, enabled]);

  useEffect(() => {
    if (!enabled) {
      setUsageBytes(null);
      setError('');
      setLoading(false);
      return;
    }

    void refresh();
  }, [enabled, refresh]);

  return { usageBytes, loading, error, refresh };
}
