import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/ensure-admin";
import { uploadFilesToR2 } from "@/lib/r2";
import {
  MAX_FILE_COUNT,
  MAX_IMAGE_SIZE_BYTES,
  MAX_TOTAL_SIZE_MB,
  getSizeLimitByMime,
} from "@/lib/upload/constants";

/**
 * POST: 處理檔案上傳
 * 支援多檔案上傳，會先驗證大小與格式，再寫入 R2
 */
export async function POST(request: Request) {
  try {
    const authError = await requireAdmin(request);
    if (authError) return authError;

    const formData = await request.formData();
    // 支援多檔案上傳，並在此集中取出所有 File 物件
    const files = formData
      .getAll("files")
      .filter((item): item is File => item instanceof File);
    const targetPath =
      typeof formData.get("path") === "string"
        ? (formData.get("path") as string)
        : "";

    if (!files.length) {
      return NextResponse.json({ error: "缺少檔案" }, { status: 400 });
    }

    const totalFileCount = files.length;
    const totalSizeBytes = files.reduce((sum, file) => sum + file.size, 0);
    const maxTotalSizeBytes = MAX_TOTAL_SIZE_MB * 1024 * 1024;

    // 檢查總檔案數量上限
    if (totalFileCount > MAX_FILE_COUNT) {
      return NextResponse.json(
        {
          error: `檔案數量超過上限 ${MAX_FILE_COUNT} 個，請分批上傳。`,
          limits: {
            maxFileCount: MAX_FILE_COUNT,
            maxTotalSizeMB: MAX_TOTAL_SIZE_MB,
          },
        },
        { status: 400 },
      );
    }

    // 檢查總容量上限
    if (totalSizeBytes > maxTotalSizeBytes) {
      return NextResponse.json(
        {
          error: `總容量超過 ${MAX_TOTAL_SIZE_MB}MB，請分批上傳。`,
          limits: {
            maxFileCount: MAX_FILE_COUNT,
            maxTotalSizeMB: MAX_TOTAL_SIZE_MB,
          },
        },
        { status: 400 },
      );
    }

    // 驗證每個檔案的大小與格式
    const invalidFiles = files
      .map((file) => {
        const sizeLimit = getSizeLimitByMime(file.type);
        if (!sizeLimit) {
          return { name: file.name, reason: "僅接受圖片或影片檔案" };
        }

        if (typeof file.size === "number" && file.size > sizeLimit) {
          const readableLimit = `${Math.round(sizeLimit / 1024 / 1024)} MB`;
          const typeLabel =
            sizeLimit === MAX_IMAGE_SIZE_BYTES ? "圖片" : "影片";
          return {
            name: file.name,
            reason: `${typeLabel}檔案大小上限 ${readableLimit}`,
          };
        }

        return null;
      })
      .filter((item): item is { name: string; reason: string } =>
        Boolean(item),
      );

    if (invalidFiles.length) {
      return NextResponse.json(
        { error: "無效的檔案", details: invalidFiles },
        { status: 400 },
      );
    }

    // 批次上傳至 R2（同批次同名檔案會自動加編號，避免互相覆蓋）
    const uploads = await uploadFilesToR2(files, targetPath);
    return NextResponse.json({ media: uploads });
  } catch (error) {
    console.error("Upload failed", error);
    return NextResponse.json(
      { error: "上傳失敗，請稍後再試。" },
      { status: 500 },
    );
  }
}
