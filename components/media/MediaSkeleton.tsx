'use client';

const folderPlaceholders = Array.from({ length: 3 });
const mediaPlaceholders = Array.from({ length: 8 });

/**
 * MediaSkeleton: 媒體載入中骨架畫面
 * 使用 shimmer 動畫效果提供更真實的載入體驗
 */
export function MediaSkeleton() {
  return (
    <div className="space-y-6" aria-label="媒體載入中骨架畫面">
      {/* 資料夾區塊骨架 */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="skeleton-shimmer h-6 w-24 rounded" />
          <div className="skeleton-shimmer h-5 w-28 rounded-full bg-primary-700/20" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {folderPlaceholders.map((_, index) => (
            <div
              key={`folder-skeleton-${index}`}
              className="flex flex-col gap-3 rounded-2xl border border-surface-700/50 bg-surface-800/50 p-4 shadow-lg"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="flex items-center gap-3">
                <div className="skeleton-shimmer h-12 w-12 rounded-xl" />
                <div className="w-full space-y-2">
                  <div className="skeleton-shimmer h-4 w-28 rounded" />
                  <div className="skeleton-shimmer h-3 w-36 rounded opacity-70" />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="skeleton-shimmer h-6 w-16 rounded-full" />
                <div className="skeleton-shimmer h-6 w-16 rounded-full bg-red-800/20" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 媒體區塊骨架 */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="skeleton-shimmer h-6 w-24 rounded" />
          <div className="skeleton-shimmer h-5 w-28 rounded-full bg-primary-700/20" />
          <div className="skeleton-shimmer ml-auto h-8 w-24 rounded-lg" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {mediaPlaceholders.map((_, index) => (
            <div
              key={`media-skeleton-${index}`}
              className="flex flex-col overflow-hidden rounded-2xl border border-surface-700/50 bg-surface-800/50 shadow-lg"
              style={{ animationDelay: `${(index + 3) * 80}ms` }}
            >
              <div className="skeleton-shimmer aspect-[4/3] w-full" />
              <div className="flex flex-col gap-3 p-4">
                <div className="space-y-2">
                  <div className="skeleton-shimmer h-4 w-3/4 rounded" />
                  <div className="skeleton-shimmer h-3 w-1/2 rounded opacity-70" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <div className="skeleton-shimmer h-6 w-16 rounded-full" />
                  <div className="skeleton-shimmer h-6 w-16 rounded-full bg-red-800/20" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 分頁骨架 */}
      <div className="flex items-center justify-center gap-2">
        <div className="skeleton-shimmer h-8 w-8 rounded-full" />
        <div className="skeleton-shimmer h-8 w-8 rounded-full" />
        <div className="skeleton-shimmer h-8 w-8 rounded-full" />
        <div className="skeleton-shimmer h-8 w-8 rounded-full" />
      </div>

      <style jsx>{`
        .skeleton-shimmer {
          background: linear-gradient(
            90deg,
            rgba(30, 41, 59, 0.8) 25%,
            rgba(51, 65, 85, 0.6) 50%,
            rgba(30, 41, 59, 0.8) 75%
          );
          background-size: 200% 100%;
          animation: shimmer 1.5s ease-in-out infinite;
        }
        @keyframes shimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }
      `}</style>
    </div>
  );
}
