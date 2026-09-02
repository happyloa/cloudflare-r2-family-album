// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requireAdmin, uploadFilesToR2 } = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  uploadFilesToR2: vi.fn(),
}));

vi.mock('@/lib/ensure-admin', () => ({ requireAdmin }));
vi.mock('@/lib/r2', () => ({ uploadFilesToR2 }));

import { GET, POST } from '../../app/api/upload/route';

const pngSignature = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function createUploadRequest() {
  const formData = new FormData();
  formData.append(
    'files',
    new Blob([pngSignature], { type: 'image/png' }),
    'photo.png',
  );
  formData.append('path', 'family');
  return new Request('https://example.test/api/upload', {
    method: 'POST',
    body: formData,
  });
}

describe('/api/upload', () => {
  beforeEach(() => {
    requireAdmin.mockResolvedValue(null);
    uploadFilesToR2.mockReset();
  });

  it('exposes the server-authoritative limits only after admin authentication', async () => {
    const response = await GET(new Request('https://example.test/api/upload'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      limits: {
        maxFileCount: 20,
        maxTotalSizeMB: 32,
        maxImageSizeMB: 10,
        maxVideoSizeMB: 32,
      },
    });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('returns confirmed successes when another file in the batch fails', async () => {
    uploadFilesToR2.mockResolvedValue({
      media: [{ key: 'family/photo.png', url: 'https://cdn.test/family/photo.png', type: 'image' }],
      failures: [{ name: 'second.png', error: '儲存檔案時失敗，請重試。' }],
    });

    const response = await POST(createUploadRequest());

    expect(response.status).toBe(207);
    await expect(response.json()).resolves.toMatchObject({
      media: [{ key: 'family/photo.png' }],
      failures: [{ name: 'second.png' }],
      error: '部分檔案上傳失敗，已保留成功項目。',
    });
  });
});
