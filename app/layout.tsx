import type { Metadata } from 'next';
// 將繁中字型隨靜態資產部署，避免 Vinext/Workers 建置時依賴 Google Fonts 網路請求。
import '@fontsource/noto-sans-tc/chinese-traditional-400.css';
import '@fontsource/noto-sans-tc/chinese-traditional-500.css';
import '@fontsource/noto-sans-tc/chinese-traditional-600.css';
import '@fontsource/noto-sans-tc/chinese-traditional-700.css';
import './globals.css';

// 設定 Metadata，包含 SEO 與爬蟲設定
export const metadata: Metadata = {
  title: '我們這一家',
  description: '為家人打造的私密相簿，重溫每一趟旅程的回憶。',
  robots: {
    // 禁止搜尋引擎索引與追蹤，確保隱私
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
 * 包含全域樣式與背景效果
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant" className="bg-surface-950">
      <body className="min-h-screen bg-gradient-to-b from-surface-950 via-surface-950/95 to-surface-900 text-surface-100 antialiased">
        {/* 背景裝飾效果 */}
        <div className="pointer-events-none fixed inset-0 -z-10 select-none overflow-hidden" aria-hidden>
          {/* 主光暈 */}
          <div className="absolute -left-[20%] -top-[30%] h-[60%] w-[60%] rounded-full bg-primary-500/[0.03] blur-[120px]" />
          <div className="absolute -right-[10%] top-[10%] h-[40%] w-[40%] rounded-full bg-primary-600/[0.04] blur-[100px]" />
          <div className="absolute bottom-[10%] left-[30%] h-[35%] w-[35%] rounded-full bg-primary-700/[0.03] blur-[80px]" />
          {/* 細緻光點裝飾 */}
          <div className="absolute right-[20%] top-[40%] h-2 w-2 rounded-full bg-primary-400/20 blur-sm" />
          <div className="absolute left-[15%] top-[60%] h-1.5 w-1.5 rounded-full bg-primary-300/15 blur-sm" />
        </div>
        {/* 主要內容區域；未預期錯誤由 app/error.tsx 與 app/global-error.tsx 處理。 */}
        <main className="mx-auto max-w-7xl px-4 pb-16 pt-10 sm:px-8 lg:px-12">
          {children}
        </main>
      </body>
    </html>
  );
}
