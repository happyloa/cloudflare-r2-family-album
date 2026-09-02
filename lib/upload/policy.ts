import {
  DEFAULT_UPLOAD_LIMITS,
  type UploadLimits,
  WORKER_MAX_UPLOAD_SIZE_MB,
} from './constants';

type UploadEnvironment = Record<string, string | undefined>;

const processEnv = typeof process === 'undefined' ? undefined : process.env;

function readLimit(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), WORKER_MAX_UPLOAD_SIZE_MB);
}

/**
 * 上傳限制只在 server 端解析；client 會從受保護的 API 讀取這個結果，
 * 避免 Cloudflare runtime variable 與已建置的 client bundle 不一致。
 */
export function getUploadLimits(
  env: UploadEnvironment = processEnv ?? {},
): UploadLimits {
  return {
    ...DEFAULT_UPLOAD_LIMITS,
    maxImageSizeMB: readLimit(
      env.MAX_IMAGE_SIZE_MB,
      DEFAULT_UPLOAD_LIMITS.maxImageSizeMB,
    ),
    maxVideoSizeMB: readLimit(
      env.MAX_VIDEO_SIZE_MB,
      DEFAULT_UPLOAD_LIMITS.maxVideoSizeMB,
    ),
  };
}
