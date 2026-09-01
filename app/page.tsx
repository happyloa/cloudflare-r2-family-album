import { Suspense } from 'react';

import { MediaGrid } from '@/components/MediaGrid';
import { MediaSkeleton } from '@/components/media/MediaSkeleton';

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
      <Suspense fallback={<MediaSkeleton isRootLevel={initialPrefix === ''} />}>
        <MediaGrid initialPrefix={initialPrefix} />
      </Suspense>
    </section>
  );
}
