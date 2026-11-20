import { afterEach, expect, it, vi } from 'vitest';
import { prepareUploadFiles, uploadFiles } from '@/lib/upload/client';

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
  await uploadFiles({ files: await prepareUploadFiles([file]), path: '' });
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
  await uploadFiles({ files: await prepareUploadFiles([file]), path: '' });
  expect(close).toHaveBeenCalledOnce(); expect(sentFile().name).toBe('photo.jpg');
});

it('falls back to JPEG when the browser cannot encode WebP and returns PNG instead', async () => {
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 4000, height: 3000, close: vi.fn() }));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback, type) => {
    callback(type === 'image/jpeg' ? new Blob(['small'], { type: 'image/jpeg' }) : new Blob(['png'], { type: 'image/png' }));
  });
  const [prepared] = await prepareUploadFiles([new File(['a large original jpeg'], 'photo.jpg', { type: 'image/jpeg' })]);
  expect(prepared.type).toBe('image/jpeg');
  expect(prepared.name).toBe('photo.jpg');
  expect(await prepared.text()).toBe('small');
});

it('reports the files the server rejected during validation', async () => {
  vi.stubGlobal('XMLHttpRequest', class {
    upload = {}; status = 400; onload?: () => void;
    responseText = '{"error":"無效的檔案","details":[{"name":"a.png","reason":"檔案內容與格式不符"}]}';
    open() {} setRequestHeader() {}
    send() { this.onload?.(); }
  });
  const response = await uploadFiles({ files: [new File(['x'], 'a.png', { type: 'image/png' })], path: '' });
  expect(response.details).toEqual([{ name: 'a.png', error: '檔案內容與格式不符' }]);
});
