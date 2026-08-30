const DEFAULT_MAX_IMAGE_SIZE_MB = 10;
// API 上傳會經過 Worker；預留 multipart 與執行期記憶體空間，不能貼近 100 MB 平台上限。
const WORKER_MAX_UPLOAD_SIZE_MB = 80;
const DEFAULT_MAX_VIDEO_SIZE_MB = WORKER_MAX_UPLOAD_SIZE_MB;

const envMaxImageSizeMb = Number(
  process.env.MAX_IMAGE_SIZE_MB ?? process.env.NEXT_PUBLIC_MAX_IMAGE_SIZE_MB,
);
const envMaxVideoSizeMb = Number(
  process.env.MAX_VIDEO_SIZE_MB ?? process.env.NEXT_PUBLIC_MAX_VIDEO_SIZE_MB,
);

export const MAX_IMAGE_SIZE_MB =
  Number.isFinite(envMaxImageSizeMb) && envMaxImageSizeMb > 0
    ? Math.min(envMaxImageSizeMb, WORKER_MAX_UPLOAD_SIZE_MB)
    : DEFAULT_MAX_IMAGE_SIZE_MB;
export const MAX_VIDEO_SIZE_MB =
  Number.isFinite(envMaxVideoSizeMb) && envMaxVideoSizeMb > 0
    ? Math.min(envMaxVideoSizeMb, WORKER_MAX_UPLOAD_SIZE_MB)
    : DEFAULT_MAX_VIDEO_SIZE_MB;

export const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;
export const MAX_VIDEO_SIZE_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024;

export function getSizeLimitByMime(type: string | undefined) {
  if (!type) return null;
  if (type.startsWith("image/")) return MAX_IMAGE_SIZE_BYTES;
  if (type.startsWith("video/")) return MAX_VIDEO_SIZE_BYTES;
  return null;
}

export const MAX_TOTAL_SIZE_MB = WORKER_MAX_UPLOAD_SIZE_MB;
export const MAX_FILE_COUNT = 20;
