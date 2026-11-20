// 共用的路徑處理純函式（client 與 server 共用，避免重複實作）

// Stored object keys keep their inner characters; only normalize the boundary.
export const normalizePath = (path: string) => path.replace(/^\/+|\/+$/g, '').trim();

// 清理單一名稱片段：移除不合法字元與控制字元（例如貼上的 tab），並去除前後空白
export const sanitizeName = (value: string) =>
  value.replace(/[<>:"/\\|?*\u0000-\u001f\u007f]+/g, "").trim();
// R2 object keys are not filesystem paths, but URL parsers commonly normalize
// standalone "." and ".." segments. Keep this check separate from
// `sanitizeName`: callers that operate on an already-stored key must be able to
// decide whether to reject it safely instead of silently rewriting the key.
export const isPeriodOnlyPathSegment = (value: string) => {
  const normalized = value.trim();
  return normalized === "." || normalized === "..";
};

export const hasPeriodOnlyPathSegment = (path: string) =>
  path.split("/").some(isPeriodOnlyPathSegment);


// 清理完整路徑：逐段清理後重新組合
export const sanitizePath = (value: string) =>
  value
    .split("/")
    // 瀏覽既有資料夾時不移除控制字元，名稱含 tab 的舊資料夾仍進得去。
    .map((segment) => segment.replace(/[<>:"/\\|?*]+/g, "").trim())
    .filter(Boolean)
    .join("/");

// 計算路徑深度
export const getDepth = (path: string) =>
  path ? path.split("/").filter(Boolean).length : 0;
