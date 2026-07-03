import { NextResponse } from "next/server";

// ── 設定常數 ──

const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 分鐘
const RATE_LIMIT_WINDOW_SECONDS = Math.ceil(RATE_LIMIT_WINDOW_MS / 1000);
const RATE_LIMIT_KEY_PREFIX = "admin-failure";

const DEFAULT_MAX_FAILURES = 5;
const processEnv = typeof process !== "undefined" ? process.env : undefined;

function readPositiveInt(name: string, fallback: number) {
  const raw = processEnv?.[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return parsed;
}

const MAX_FAILURES = readPositiveInt(
  "ADMIN_RATE_LIMIT_MAX_FAILURES",
  DEFAULT_MAX_FAILURES,
);

// ── 記憶體速率限制 ──

type MemoryEntry = { count: number; expiresAt: number };
const store = new Map<string, MemoryEntry>();

function getCount(key: string): number {
  const entry = store.get(key);
  if (!entry) return 0;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return 0;
  }
  return entry.count;
}

function increment(key: string): number {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || now > entry.expiresAt) {
    store.set(key, {
      count: 1,
      expiresAt: now + RATE_LIMIT_WINDOW_SECONDS * 1000,
    });
    return 1;
  }
  const next = entry.count + 1;
  store.set(key, { count: next, expiresAt: entry.expiresAt });
  return next;
}

// ── 常數時間字串比對 ──

// 逐字元 XOR 累加，比較時間不隨字串長度或不匹配位置變化，避免透過回應時間差猜測密碼。
function timingSafeEqual(a: string, b: string): boolean {
  const bufA = new TextEncoder().encode(a);
  const bufB = new TextEncoder().encode(b);
  const length = Math.max(bufA.length, bufB.length);
  let diff = bufA.length ^ bufB.length;

  for (let i = 0; i < length; i += 1) {
    diff |= (bufA[i] ?? 0) ^ (bufB[i] ?? 0);
  }

  return diff === 0;
}

// ── 取得客戶端 IP ──

function getClientIp(request: Request): string {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp;
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "unknown";
  return "unknown";
}

// ── 主要匯出 ──

/**
 * 執行管理員認證流程（速率限制檢查 + 密碼驗證）
 * 回傳 NextResponse 表示認證失敗，null 表示通過
 */
export async function requireAdmin(
  request: Request,
): Promise<NextResponse | null> {
  const ip = getClientIp(request);
  const key = `${RATE_LIMIT_KEY_PREFIX}:${ip}`;
  const retryMinutes = Math.ceil(RATE_LIMIT_WINDOW_MS / 60000);

  // 速率限制檢查
  if (getCount(key) >= MAX_FAILURES) {
    return NextResponse.json(
      {
        error: `因密碼輸入不正確，請於 ${retryMinutes} 分鐘後再試。`,
        retryAfterMinutes: retryMinutes,
      },
      { status: 429 },
    );
  }

  // 密碼驗證
  const adminToken = process.env.ADMIN_ACCESS_TOKEN;
  if (!adminToken) {
    console.error("Missing ADMIN_ACCESS_TOKEN");
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  const providedToken = request.headers.get("x-admin-token");
  if (!providedToken || !timingSafeEqual(providedToken, adminToken)) {
    const failures = increment(key);
    if (failures >= MAX_FAILURES) {
      return NextResponse.json(
        {
          error: `因密碼輸入不正確，請於 ${retryMinutes} 分鐘後再試。`,
          retryAfterMinutes: retryMinutes,
        },
        { status: 429 },
      );
    }
    const remainingAttempts = Math.max(MAX_FAILURES - failures, 0);
    return NextResponse.json(
      { error: "Unauthorized", remainingAttempts },
      { status: 401 },
    );
  }

  // 驗證成功，重設計數
  store.delete(key);
  return null;
}
