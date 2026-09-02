export const MAX_FILE_COUNT = 20;

// multipart 會由 Worker 解析為 FormData。把單批次上限保留在記憶體上限的明顯安全距離內；
// 需要更大的影片時，應改採具備 resumable 支援的直傳／multipart R2 架構。
export const WORKER_MAX_UPLOAD_SIZE_MB = 32;

export const DEFAULT_MAX_IMAGE_SIZE_MB = 10;
export const DEFAULT_MAX_VIDEO_SIZE_MB = WORKER_MAX_UPLOAD_SIZE_MB;

export const ALLOWED_MEDIA_MIME_TYPES = [
  'image/avif',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/quicktime',
  'video/webm',
] as const;

export type AllowedMediaMime = (typeof ALLOWED_MEDIA_MIME_TYPES)[number];
export type MediaKind = 'image' | 'video';

export type UploadLimits = {
  maxFileCount: number;
  maxTotalSizeMB: number;
  maxImageSizeMB: number;
  maxVideoSizeMB: number;
};

export const DEFAULT_UPLOAD_LIMITS: UploadLimits = {
  maxFileCount: MAX_FILE_COUNT,
  maxTotalSizeMB: WORKER_MAX_UPLOAD_SIZE_MB,
  maxImageSizeMB: DEFAULT_MAX_IMAGE_SIZE_MB,
  maxVideoSizeMB: DEFAULT_MAX_VIDEO_SIZE_MB,
};

export const UPLOAD_INPUT_ACCEPT = ALLOWED_MEDIA_MIME_TYPES.join(',');

export function isAllowedMediaMime(value: string | undefined): value is AllowedMediaMime {
  return Boolean(
    value &&
      (ALLOWED_MEDIA_MIME_TYPES as readonly string[]).includes(value.toLowerCase()),
  );
}

export function getMediaKind(value: AllowedMediaMime): MediaKind {
  return value.startsWith('video/') ? 'video' : 'image';
}

export function getSizeLimitByMime(
  value: string | undefined,
  limits: UploadLimits = DEFAULT_UPLOAD_LIMITS,
) {
  if (!isAllowedMediaMime(value)) return null;
  const limitMB = getMediaKind(value) === 'image'
    ? limits.maxImageSizeMB
    : limits.maxVideoSizeMB;
  return limitMB * 1024 * 1024;
}
