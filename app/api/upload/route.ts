import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/ensure-admin";
import { uploadFilesToR2 } from "@/lib/r2";
import { createLimitedRequest } from "@/lib/upload/body-limit";
import {
  type ValidatedUploadFile,
  validateMediaFile,
} from "@/lib/upload/media-validation";
import { getUploadLimits } from "@/lib/upload/policy";

const MULTIPART_OVERHEAD_BYTES = 1024 * 1024;
const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

/** GET: 回傳目前 Worker 實際套用的上傳限制，僅供已驗證管理者使用。 */
export async function GET(request: Request) {
  const authError = await requireAdmin(request);
  if (authError) return authError;

  return json({ limits: getUploadLimits() });
}

/**
 * POST: 處理檔案上傳
 * 支援多檔案上傳，會先驗證大小與格式，再寫入 R2
 */
export async function POST(request: Request) {
  try {
    const authError = await requireAdmin(request);
    if (authError) return authError;

    const limits = getUploadLimits();
    const maxTotalSizeBytes = limits.maxTotalSizeMB * 1024 * 1024;
    const maxRequestBytes = maxTotalSizeBytes + MULTIPART_OVERHEAD_BYTES;
    const contentLengthHeader = request.headers.get("content-length");
    const contentLength = contentLengthHeader === null
      ? null
      : Number(contentLengthHeader);

    if (contentLength !== null && (!Number.isFinite(contentLength) || contentLength < 0)) {
      return json({ error: "無效的 Content-Length" }, 400);
    }

    if (contentLength !== null && contentLength > maxRequestBytes) {
      return json(
        {
          error: `總容量超過 ${limits.maxTotalSizeMB}MB，請分批上傳。`,
          limits,
        },
        413,
      );
    }

    // 即使 request 沒有 Content-Length，也在串流讀取時硬性限制 body 大小，避免直接讓
    // FormData parser 吃下接近 Worker 記憶體上限的 payload。
    const limitedRequest = createLimitedRequest(request, maxRequestBytes);
    let formData: FormData;
    try {
      formData = await limitedRequest.request.formData();
    } catch {
      return json(
        {
          error: limitedRequest.didExceedLimit()
            ? `總容量超過 ${limits.maxTotalSizeMB}MB，請分批上傳。`
            : "表單資料格式錯誤",
          limits,
        },
        limitedRequest.didExceedLimit() ? 413 : 400,
      );
    }

    // 支援多檔案上傳，並在此集中取出所有 File 物件
    const files = formData
      .getAll("files")
      .filter((item): item is File => item instanceof File);
    const targetPath =
      typeof formData.get("path") === "string"
        ? (formData.get("path") as string)
        : "";

    if (!files.length) {
      return json({ error: "缺少檔案", limits }, 400);
    }

    const totalFileCount = files.length;
    const totalSizeBytes = files.reduce((sum, file) => sum + file.size, 0);

    // 檢查總檔案數量上限
    if (totalFileCount > limits.maxFileCount) {
      return json(
        {
          error: `檔案數量超過上限 ${limits.maxFileCount} 個，請分批上傳。`,
          limits,
        },
        400,
      );
    }

    // 檢查總容量上限
    if (totalSizeBytes > maxTotalSizeBytes) {
      return json(
        {
          error: `總容量超過 ${limits.maxTotalSizeMB}MB，請分批上傳。`,
          limits,
        },
        400,
      );
    }

    // MIME 和檔案前段 signature 都必須通過，不能只相信瀏覽器送來的 File.type。
    const validations = await Promise.all(
      files.map(async (file) => ({ file, result: await validateMediaFile(file, limits) })),
    );
    const invalidFiles: { name: string; reason: string }[] = [];
    const validFiles: ValidatedUploadFile[] = [];
    for (const { file, result } of validations) {
      if (!result.ok) {
        invalidFiles.push({ name: file.name, reason: result.reason });
        continue;
      }
      validFiles.push({ file, contentType: result.contentType });
    }

    if (invalidFiles.length) {
      return json({ error: "無效的檔案", details: invalidFiles, limits }, 400);
    }

    const uploads = await uploadFilesToR2(validFiles, targetPath);
    const allFailed = uploads.media.length === 0 && uploads.failures.length > 0;
    const partiallySucceeded = uploads.media.length > 0 && uploads.failures.length > 0;

    return json(
      {
        media: uploads.media,
        failures: uploads.failures,
        limits,
        ...(uploads.failures.length > 0
          ? {
              error: allFailed
                ? "沒有檔案成功上傳，請重試。"
                : "部分檔案上傳失敗，已保留成功項目。",
            }
          : {}),
      },
      allFailed ? 502 : partiallySucceeded ? 207 : 201,
    );
  } catch (error) {
    console.error("Upload failed", error);
    return json({ error: "上傳失敗，請稍後再試。" }, 500);
  }
}
