'use client';

const folderPlaceholders = Array.from({ length: 3 });
const mediaPlaceholders = Array.from({ length: 6 });

/**
 * Matches FolderGrid and MediaSection while album data is loading.
 * The visual placeholders are decorative; assistive technology receives one status.
 */
export function MediaSkeleton({ isRootLevel = true }: { isRootLevel?: boolean }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-6">
      <span className="sr-only">正在載入相簿內容</span>

      <div aria-hidden="true" className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="skeleton-shimmer h-9 w-32 rounded-lg" />
          <div className="skeleton-shimmer h-9 w-36 rounded-lg" />
          <div className="skeleton-shimmer h-10 w-full rounded-lg sm:ml-auto sm:w-64" />
        </div>
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="skeleton-shimmer h-5 w-20 rounded-md" />
            <div className="skeleton-shimmer h-4 w-10 rounded-md" />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3">
            {folderPlaceholders.map((_, index) => (
              <div
                key={'folder-skeleton-' + index}
                className="min-w-0 space-y-2"
              >
                {isRootLevel ? <div className="skeleton-shimmer h-6 w-20 rounded-md" /> : null}
                <div className="flex items-center gap-3 rounded-lg bg-surface-900/50 px-3 py-3">
                  <div className="skeleton-shimmer size-6 flex-none rounded-md" />
                  <div className={'skeleton-shimmer h-5 rounded-md ' + (index % 2 === 0 ? 'w-3/5' : 'w-4/5')} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="skeleton-shimmer h-5 w-24 rounded-md" />
              <div className="skeleton-shimmer h-4 w-16 rounded-md" />
            </div>
          </div>

          <div className="album-gallery album-gallery-featured">
            {mediaPlaceholders.map((_, index) => (
              <div
                key={'media-skeleton-' + index}
                className="flex min-w-0 flex-col overflow-hidden rounded-lg"
              >
                <div className="media-frame relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-surface-900">
                  <div className="skeleton-shimmer h-full w-full" />
                </div>
                <div className="flex shrink-0 flex-col gap-1 px-1 py-3">
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
