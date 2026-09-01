import { Suspense } from 'react';

import { MediaGrid } from '@/components/MediaGrid';

type HomeProps = {
  searchParams: Promise<{ folder?: string | string[] }>;
};

/**
 * Home Page: 專案首頁
 * 包含標題區塊與主要的媒體網格 (MediaGrid)
 */
export default async function Home({ searchParams }: HomeProps) {
  const { folder } = await searchParams;
  const initialPrefix = typeof folder === 'string' ? folder : '';

  return (
    <section className="space-y-8" aria-label="家庭相簿首頁">
      {/* 媒體列表區塊：使用 Suspense 處理載入狀態 */}
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-4">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary-500/30 border-t-primary-400" />
              <p className="text-sm font-medium text-surface-400">載入媒體中...</p>
            </div>
          </div>
        }
      >
        <MediaGrid initialPrefix={initialPrefix} />
      </Suspense>
    </section>
  );
}
