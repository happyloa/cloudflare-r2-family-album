'use client';

/**
 * 上傳相關的前端共用邏輯
 * 同時供「上傳表單」與「拖曳到頁面上傳」使用，避免重複實作壓縮與 XHR 流程。
 */

// 針對圖片使用 canvas 降解析度後輸出 WebP，降低檔案大小
export async function compressImage(
  file: File,
): Promise<{ file: File; warning?: string }> {
  try {
    // imageOrientation: 'from-image' 確保套用 EXIF 旋轉，避免手機照片被轉向
    const image = await createImageBitmap(file, {
      imageOrientation: 'from-image',
    });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return { file };

    const maxWidth = 1920;
    const maxHeight = 1920;
    const ratio = Math.min(1, maxWidth / image.width, maxHeight / image.height);
    const targetWidth = Math.round(image.width * ratio);
    const targetHeight = Math.round(image.height * ratio);

    canvas.width = targetWidth;
    canvas.height = targetHeight;
    context.drawImage(image, 0, 0, targetWidth, targetHeight);

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((result) => resolve(result), 'image/webp', 0.82),
    );

    if (!blob) return { file };

    const compressedName = file.name.replace(/\.[^.]+$/, '.webp');
    return { file: new File([blob], compressedName, { type: 'image/webp' }) };
  } catch {
    return { file, warning: '圖片壓縮失敗，已改用原始檔案。' };
  }
}

// 根據媒體型態決定處理方式：圖片壓縮，影片維持原始品質
export async function compressMedia(
  file: File,
): Promise<{ file: File; warning?: string }> {
  if (file.type.startsWith('image/')) return compressImage(file);
  return { file };
}

type UploadOptions = {
  files: File[];
  path: string;
  adminToken?: string;
  onProgress?: (percent: number | null) => void;
};

/**
 * 壓縮並上傳一批檔案到 /api/upload
 * onProgress 會回報 0~100；無法計算進度時回報 null。
 */
export async function uploadFiles({
  files,
  path,
  adminToken,
  onProgress,
}: UploadOptions): Promise<Response> {
  const safePath = path.trim().replace(/^\/+|\/+$/g, '');

  const compressed: File[] = [];
  for (const file of files) {
    const result = await compressMedia(file);
    compressed.push(result.file);
  }

  const formData = new FormData();
  compressed.forEach((mediaFile) => formData.append('files', mediaFile));
  formData.append('path', safePath);

  return new Promise<Response>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', '/api/upload');

    if (adminToken) {
      request.setRequestHeader('x-admin-token', adminToken);
    }

    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) {
        onProgress?.(null);
        return;
      }
      onProgress?.(Math.round((event.loaded / event.total) * 100));
    };

    request.onload = () => {
      resolve(
        new Response(request.response, {
          status: request.status,
          statusText: request.statusText,
        }),
      );
    };

    request.onerror = () => reject(new Error('上傳時發生錯誤'));
    request.onabort = () => reject(new Error('上傳已被中止'));

    request.send(formData);
  });
}
