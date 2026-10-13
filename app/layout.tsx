import type { Metadata } from 'next';
import '@fontsource/noto-sans-tc/400.css';
import '@fontsource/noto-sans-tc/500.css';
import '@fontsource/noto-sans-tc/600.css';
import '@fontsource/noto-sans-tc/700.css';
import './globals.css';

// 設定 Metadata，包含 SEO 與爬蟲設定
export const metadata: Metadata = {
  title: '我們這一家',
  description: '我們的家庭相簿，收藏每一趟旅程的回憶。',
  robots: {
    // 請搜尋引擎不要索引；瀏覽仍為公開，robots 不是存取控制。
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      'max-image-preview': 'none',
      'max-snippet': 0,
      'max-video-preview': 0
    }
  }
};

/**
 * RootLayout: 應用程式的根佈局
 * 包含全域樣式與相簿版面
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant" className="bg-surface-950">
      <body className="min-h-screen bg-surface-950 text-surface-100 antialiased">
        {/* 主要內容區域；未預期錯誤由 app/error.tsx 與 app/global-error.tsx 處理。 */}
        <main className="mx-auto max-w-[1440px] px-5 pb-20 pt-8 sm:px-8 sm:pt-12 lg:px-14">
          {children}
        </main>
      </body>
    </html>
  );
}
