'use client';

const folderPlaceholders = Array.from({ length: 4 });
const mediaPlaceholders = Array.from({ length: 8 });

/**
 * Matches FolderGrid and MediaSection while album data is loading.
 * The visual placeholders are decorative; assistive technology receives one status.
 */
export function MediaSkeleton({ isRootLevel = true }: { isRootLevel?: boolean }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-6">
      <span className="sr-only">正在載入相簿內容</span>

      <div aria-hidden="true" className="space-y-6">
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="skeleton-shimmer h-7 w-20 rounded-md" />
            <div className="skeleton-shimmer h-6 w-12 rounded-full bg-primary-500/10 ring-1 ring-primary-500/20" />
          </div>

          {isRootLevel ? (
            <div className="flex items-center justify-between rounded-xl bg-surface-800/40 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="skeleton-shimmer h-5 w-20 rounded-md" />
                <div className="skeleton-shimmer h-5 w-7 rounded-full bg-surface-700/50" />
              </div>
              <div className="skeleton-shimmer h-7 w-7 rounded-full bg-surface-700/40" />
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {folderPlaceholders.map((_, index) => (
              <div
                key={'folder-skeleton-' + index}
                className="flex min-w-0 items-center gap-3 rounded-2xl border border-surface-700/60 bg-surface-800/40 p-4"
              >
                <div className="skeleton-shimmer size-11 flex-none rounded-xl bg-primary-500/10 ring-1 ring-primary-500/20" />
                <div className="min-w-0 flex-1">
                  <div className={'skeleton-shimmer h-5 rounded-md ' + (index % 2 === 0 ? 'w-3/5' : 'w-4/5')} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="skeleton-shimmer h-7 w-24 rounded-md" />
              <div className="skeleton-shimmer h-6 w-20 rounded-full bg-primary-500/10 ring-1 ring-primary-500/20" />
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="skeleton-shimmer h-9 w-32 rounded-xl" />
              <div className="skeleton-shimmer h-9 w-28 rounded-xl" />
              <div className="skeleton-shimmer h-9 w-24 rounded-xl" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {mediaPlaceholders.map((_, index) => (
              <div
                key={'media-skeleton-' + index}
                className="overflow-hidden rounded-2xl border border-surface-700/50 bg-surface-800/50 shadow-lg"
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-surface-900">
                  <div className="skeleton-shimmer h-full w-full" />
                  <div className="absolute bottom-3 right-3 rounded-lg bg-surface-900/80 px-2 py-1 ring-1 ring-surface-700">
                    <div className="skeleton-shimmer h-3 w-8 rounded" />
                  </div>
                </div>
                <div className="flex flex-col gap-1 p-4">
                  <div className={'skeleton-shimmer h-4 rounded ' + (index % 3 === 0 ? 'w-3/4' : 'w-4/5')} />
                  <div className="skeleton-shimmer h-3 w-1/2 rounded" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
