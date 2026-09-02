import { describe, expect, it } from 'vitest';

import {
  DEFAULT_UPLOAD_LIMITS,
  getSizeLimitByMime,
  isAllowedMediaMime,
  WORKER_MAX_UPLOAD_SIZE_MB,
} from '@/lib/upload/constants';
import { detectMediaMime, validateMediaFile } from '@/lib/upload/media-validation';
import { getUploadLimits } from '@/lib/upload/policy';

const pngSignature = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

describe('upload policy', () => {
  it('uses server runtime limits while keeping them within the Worker upload ceiling', () => {
    expect(
      getUploadLimits({
        MAX_IMAGE_SIZE_MB: '20',
        MAX_VIDEO_SIZE_MB: '999',
      }),
    ).toEqual({
      ...DEFAULT_UPLOAD_LIMITS,
      maxImageSizeMB: 20,
      maxVideoSizeMB: WORKER_MAX_UPLOAD_SIZE_MB,
    });
  });

  it('falls back to safe defaults for malformed runtime values', () => {
    expect(
      getUploadLimits({ MAX_IMAGE_SIZE_MB: '0', MAX_VIDEO_SIZE_MB: 'NaN' }),
    ).toEqual(DEFAULT_UPLOAD_LIMITS);
  });

  it('accepts only the explicit previewable media allowlist', () => {
    expect(isAllowedMediaMime('image/jpeg')).toBe(true);
    expect(isAllowedMediaMime('image/heic')).toBe(true);
    expect(isAllowedMediaMime('video/quicktime')).toBe(true);
    expect(isAllowedMediaMime('image/svg+xml')).toBe(false);
    expect(isAllowedMediaMime('application/octet-stream')).toBe(false);
  });

  it('derives the correct size cap from the actual media category', () => {
    const limits = getUploadLimits({
      MAX_IMAGE_SIZE_MB: '8',
      MAX_VIDEO_SIZE_MB: '24',
    });
    expect(getSizeLimitByMime('image/jpeg', limits)).toBe(8 * 1024 * 1024);
    expect(getSizeLimitByMime('video/mp4', limits)).toBe(24 * 1024 * 1024);
    expect(getSizeLimitByMime('image/svg+xml', limits)).toBeNull();
  });

  it('detects permitted formats from file signatures instead of MIME alone', () => {
    expect(detectMediaMime(pngSignature)).toBe('image/png');
    expect(
      detectMediaMime(
        new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]),
      ),
    ).toBe('image/heic');
    expect(detectMediaMime(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]))).toBe('video/webm');
    expect(detectMediaMime(new TextEncoder().encode('<svg></svg>'))).toBeNull();
  });

  it('rejects an SVG payload that pretends to be a PNG', async () => {
    const disguisedFile = {
      name: 'not-a-photo.png',
      type: 'image/png',
      size: 14,
      slice: () => new Blob(['<svg></svg>']),
    } as File;

    await expect(
      validateMediaFile(disguisedFile, DEFAULT_UPLOAD_LIMITS),
    ).resolves.toEqual({ ok: false, reason: '無法辨識檔案格式' });
  });
});
