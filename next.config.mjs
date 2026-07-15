/** @type {import('next').NextConfig} */
const customBase = process.env.R2_PUBLIC_BASE;
const isProd = process.env.NODE_ENV === "production";

const customUrl = (() => {
  if (!customBase) return null;

  try {
    return new URL(customBase);
  } catch (_error) {
    // If parsing fails, skip adding a custom pattern.
    return null;
  }
})();

const customPattern = (() => {
  if (!customUrl) return null;

  const basePath = customUrl.pathname;
  const pathname = basePath.endsWith("/") ? `${basePath}**` : `${basePath}/**`;

  return {
    protocol: customUrl.protocol.replace(":", ""),
    hostname: customUrl.hostname,
    pathname,
  };
})();
// next/image 的 remotePatterns 允許清單以外的來源就不該出現在 CSP 的 img-src / media-src，
// 兩者共用同一個 R2 公開網域，找不到時才退回較寬鬆的 https: 當保險。
const r2Origin = customUrl ? `${customUrl.protocol}//${customUrl.host}` : null;

// 注意：public/_headers 是給 Cloudflare 靜態資產的備援（避免 headers() 在某些情境下沒生效），
// 內容需要跟下面這份手動保持同步；但那個檔案是純靜態的，沒辦法讀 R2_PUBLIC_BASE，
// img-src/media-src 只能固定用 https:（等同這裡 r2Origin 找不到時的保險值）。
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "form-action 'self'",
  // unsafe-eval 僅開發環境需要（Turbopack/HMR），正式環境拿掉以縮小 XSS 攻擊面。
  isProd ? "script-src 'self' 'unsafe-inline'" : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "connect-src 'self' https:",
  `img-src 'self' data: blob: ${r2Origin ?? "https:"}`,
  `media-src 'self' data: blob: ${r2Origin ?? "https:"}`,
].join("; ");

// 只允許實際會用到的 R2 公開網域，避免 next/image 的優化端點被當成開放圖片代理。
const remotePatterns = customPattern ? [customPattern] : [];

const nextConfig = {
  images: {
    remotePatterns,
    // 不啟用 Cloudflare Images，直接使用既有 R2 公開原檔。
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy,
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "no-referrer",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow, noarchive, nosnippet, noimageindex",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
