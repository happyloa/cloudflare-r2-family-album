'use client';

import { useEffect } from 'react';

type GlobalErrorProps = {
  error: Error & { digest?: string };
  retry: () => void;
};

/** 根 layout 發生錯誤時的獨立文件；global CSS 不會在此 fallback 中載入。 */
export default function GlobalError({ error, retry }: GlobalErrorProps) {
  useEffect(() => {
    console.error('Global rendering failed', {
      digest: error.digest ?? 'client-render-error',
    });
  }, [error]);

  return (
    <html lang="zh-Hant">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          background: '#09090b',
          color: '#f4f4f5',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <main
          role="alert"
          aria-labelledby="global-error-title"
          style={{
            boxSizing: 'border-box',
            display: 'grid',
            minHeight: '100vh',
            placeItems: 'center',
            padding: '24px',
          }}
        >
          <section
            style={{
              width: 'min(100%, 480px)',
              border: '1px solid rgba(248, 113, 113, 0.35)',
              borderRadius: '24px',
              background: '#18181b',
              padding: '32px',
              textAlign: 'center',
            }}
          >
            <p aria-hidden style={{ fontSize: '36px', margin: '0 0 12px' }}>⚠️</p>
            <h1 id="global-error-title" style={{ fontSize: '20px', margin: 0 }}>相簿暫時無法開啟</h1>
            <p style={{ color: '#d4d4d8', lineHeight: 1.6, margin: '12px 0 24px' }}>
              請稍後再試，或重新整理頁面。
            </p>
            <button
              type="button"
              onClick={retry}
              style={{
                border: 0,
                borderRadius: '999px',
                background: '#a3e635',
                color: '#18181b',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 700,
                padding: '10px 18px',
              }}
            >
              再試一次
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
