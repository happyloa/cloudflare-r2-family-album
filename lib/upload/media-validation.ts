import {
  type AllowedMediaMime,
  getSizeLimitByMime,
  isAllowedMediaMime,
  type UploadLimits,
} from './constants';

export type ValidatedUploadFile = {
  file: File;
  contentType: AllowedMediaMime;
};

type ValidationResult =
  | { ok: true; contentType: AllowedMediaMime }
  | { ok: false; reason: string };

const SIGNATURE_BYTES = 64;

function startsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

function readAscii(bytes: Uint8Array, start: number, length: number) {
  if (bytes.length < start + length) return '';
  return String.fromCharCode(...bytes.slice(start, start + length));
}

/**
 * 只辨識本專案允許的常見可預覽格式。這不是防毒掃描，
 * 但能避免只靠 File.type 接受 SVG 或任意偽裝內容。
 */
export function detectMediaMime(bytes: Uint8Array): AllowedMediaMime | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }
  if (readAscii(bytes, 0, 6) === 'GIF87a' || readAscii(bytes, 0, 6) === 'GIF89a') {
    return 'image/gif';
  }
  if (readAscii(bytes, 0, 4) === 'RIFF' && readAscii(bytes, 8, 4) === 'WEBP') {
    return 'image/webp';
  }
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return 'video/webm';

  if (readAscii(bytes, 4, 4) !== 'ftyp') return null;
  const majorBrand = readAscii(bytes, 8, 4).toLowerCase();
  if (majorBrand === 'avif' || majorBrand === 'avis') return 'image/avif';
  if (['heic', 'heix', 'hevc', 'hevx'].includes(majorBrand)) return 'image/heic';
  if (['heif', 'mif1', 'msf1'].includes(majorBrand)) return 'image/heif';
  if (majorBrand === 'qt  ') return 'video/quicktime';
  return 'video/mp4';
}

export async function validateMediaFile(
  file: File,
  limits: UploadLimits,
): Promise<ValidationResult> {
  const declaredType = file.type.toLowerCase();
  if (!isAllowedMediaMime(declaredType)) {
    return { ok: false, reason: '僅接受 JPEG、PNG、WebP、GIF、AVIF、HEIC、MP4、WebM 或 MOV 檔案' };
  }

  const sizeLimit = getSizeLimitByMime(declaredType, limits);
  if (sizeLimit === null || file.size > sizeLimit) {
    const readableLimit = `${Math.round((sizeLimit ?? 0) / 1024 / 1024)} MB`;
    return { ok: false, reason: `檔案大小上限 ${readableLimit}` };
  }

  let signature: Uint8Array;
  try {
    signature = new Uint8Array(
      await file.slice(0, SIGNATURE_BYTES).arrayBuffer(),
    );
  } catch {
    return { ok: false, reason: '無法讀取檔案內容' };
  }
  const detectedType = detectMediaMime(signature);
  if (!detectedType) {
    return { ok: false, reason: '無法辨識檔案格式' };
  }
  const compatibleHeifType =
    (detectedType === 'image/heic' && declaredType === 'image/heif') ||
    (detectedType === 'image/heif' && declaredType === 'image/heic');
  if (detectedType !== declaredType && !compatibleHeifType) {
    return { ok: false, reason: '檔案內容與宣告格式不一致' };
  }

  return { ok: true, contentType: detectedType };
}
