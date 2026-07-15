'use client';

type Breadcrumb = { label: string; key: string };

export function BreadcrumbNav({
  breadcrumbTrail,
  currentPrefix,
  foldersCount,
  filesCount,
  hasMore,
  onBack,
  onRefresh,
  onNavigate,
  loading
}: {
  breadcrumbTrail: Breadcrumb[];
  currentPrefix: string;
  foldersCount: number;
  filesCount: number;
  hasMore: boolean;
  onBack: () => void;
  onRefresh: () => void;
  onNavigate: (key: string) => void;
  loading: boolean;
}) {
  const canGoBack = currentPrefix !== '';

  return (
    <nav
      aria-label="路徑導覽"
      className="glass-card rounded-2xl border border-surface-700/50 bg-surface-900/70 px-4 py-3 text-sm text-surface-100 shadow-lg ring-1 ring-white/5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* 左側：麵包屑路徑 */}
        <div className="flex items-center gap-3 overflow-x-auto">
          {/* 返回按鈕 - 整合到麵包屑前面 */}
          {canGoBack ? <button
              className="flex-shrink-0 rounded-lg border border-surface-600 bg-surface-800/80 p-2 text-surface-300 transition-all duration-200 hover:border-primary-500/50 hover:bg-surface-700 hover:text-primary-200 cursor-pointer"
              onClick={onBack}
              type="button"
              aria-label="返回上一層"
              title="返回上一層"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button> : null}

          {/* 麵包屑路徑 */}
          <ol className="flex items-center gap-1 text-sm" aria-label="Breadcrumb">
            {breadcrumbTrail.map((crumb, index) => {
              const isLast = index === breadcrumbTrail.length - 1;
              const isFirst = index === 0;

              return (
                <li key={crumb.key} className="flex items-center">
                  {index > 0 && (
                    <span aria-hidden className="mx-1.5 text-surface-500">/</span>
                  )}
                  <button
                    className={`rounded-md px-2 py-1 transition-all duration-150 cursor-pointer ${isLast
                      ? 'font-semibold text-primary-300'
                      : 'text-surface-400 hover:text-primary-300 hover:bg-surface-800/50'
                      }`}
                    onClick={() => onNavigate(crumb.key)}
                    type="button"
                    disabled={isLast}
                    aria-current={isLast ? 'page' : undefined}
                    title={crumb.label || '根目錄'}
                  >
                    {isFirst ? '🏠' : crumb.label}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>

        {/* 右側：統計與重整 */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {/* 統計資訊 */}
          {hasMore ? <span className="rounded-full bg-primary-500/10 px-2 py-0.5 text-xs font-semibold text-primary-300 ring-1 ring-primary-500/20">{'\u5df2\u8f09\u5165'}</span> : null}
          <span className="text-xs text-surface-400">
            <span className="text-surface-300">{foldersCount}</span> 資料夾
            <span className="mx-1.5 text-surface-600">·</span>
            <span className="text-surface-300">{filesCount}</span> 檔案
          </span>

          {/* 重整按鈕 */}
          <button
            className="rounded-lg border border-surface-600 bg-surface-800/80 p-2 text-surface-300 transition-all duration-200 hover:border-primary-500/50 hover:bg-surface-700 hover:text-primary-200 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onRefresh}
            disabled={loading}
            type="button"
            aria-label="重新整理"
            title="重新整理"
          >
            <svg
              className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>
    </nav>
  );
}
