import { afterEach, expect, it, vi } from 'vitest';
import { uploadFiles } from '@/lib/upload/client';

afterEach(() => vi.unstubAllGlobals());

function captureUpload(status = 201) {
  let body!: FormData;
  vi.stubGlobal('XMLHttpRequest', class {
    upload = {};
    status = status;
    responseText = '{"media":[],"failures":[]}';
    onload?: () => void;
    open() {} setRequestHeader() {}
    send(value: FormData) { body = value; this.onload?.(); }
  });
  return () => body.getAll('files')[0] as File;
}

it('preserves animated formats instead of converting their first frame into a still image', async () => {
  const sentFile = captureUpload();
  const decode = vi.fn(); vi.stubGlobal('createImageBitmap', decode);
  const file = new File(['GIF89a-animated-test'], 'animation.gif', { type: 'image/gif' });
  await uploadFiles({ files: [file], path: '' });
  expect(decode).not.toHaveBeenCalled();
  expect(sentFile().type).toBe('image/gif'); expect(sentFile().size).toBe(file.size);
});

it('invalidates management mode when the upload endpoint rejects the current password', async () => {
  captureUpload(401); const onUnauthorized = vi.fn();
  const response = await uploadFiles({ files: [new File(['test'], 'photo.png', { type: 'image/png' })], path: '', onUnauthorized });
  expect(response.ok).toBe(false); expect(onUnauthorized).toHaveBeenCalledOnce();
});

it('releases decoded JPEG memory when compression cannot obtain a canvas context', async () => {
  const sentFile = captureUpload(); const close = vi.fn();
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 1920, height: 1080, close }));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const file = new File(['test'], 'photo.jpg', { type: 'image/jpeg' });
  await uploadFiles({ files: [file], path: '' });
  expect(close).toHaveBeenCalledOnce(); expect(sentFile().name).toBe('photo.jpg');
});
