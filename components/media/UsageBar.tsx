'use client';

const BUCKET_LIMIT_BYTES = 10 * 1024 * 1024 * 1024; // 10GB

function formatBytes(bytes: number) {
  if (bytes === 0) return '0B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  // base-1000 以貼近多數雲端服務的顯示方式
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1000)), units.length - 1);
  const value = bytes / 1000 ** index;
  return `${value.toFixed(index >= 2 ? 1 : 0)} ${units[index]}`;
}

/**
 * UsageBar: 貯體容量用量列（精簡、常駐於工具列）
 */
export function UsageBar({
  usageBytes,
  loading,
  error
}: {
  usageBytes: number | null;
  loading: boolean;
  error: string;
}) {
  const total = usageBytes ?? 0;
  const overLimit = usageBytes !== null && total > BUCKET_LIMIT_BYTES;
  const percent = Math.min((total / BUCKET_LIMIT_BYTES) * 100, 100);
  const label = usageBytes === null ? (loading ? '讀取中…' : '—') : `${formatBytes(total)} / 10GB`;

  return (
    <div className="flex min-w-[160px] flex-col gap-1" title={error || '貯體已使用容量'}>
      <div className="flex items-center justify-between gap-2 text-xs font-semibold">
        <span className="text-surface-500">容量</span>
        <span className={overLimit ? 'text-red-300' : 'text-surface-300'}>{label}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-800">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            overLimit ? 'bg-gradient-to-r from-red-500 to-accent-500' : 'bg-gradient-to-r from-primary-500 to-accent-500'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
