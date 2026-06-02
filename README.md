# Family Album

一個以 Next.js App Router 打造的家庭相簿，專注於直接管理 Cloudflare R2 的媒體。介面提供路徑導覽、圖片與影片預覽、上傳與管理工具，並以管理密碼保護寫入操作。

## 特色

- **雙層目錄與命名規範**：資料夾深度上限為 2 層、名稱最長 30 字。
- **管理密碼與節流**：寫入 API 需帶入 `ADMIN_ACCESS_TOKEN`，密碼錯誤會依 IP 進行速率限制（預設 5 次 / 5 分鐘）。
- **媒體瀏覽體驗**：麵包屑導覽、資料夾格線、分頁（每頁 12 筆）、快速搜尋與圖片 / 影片篩選器。
- **上傳與檔案管理**：支援多檔案上傳、拖放移動、重新命名與刪除；前端自動處理圖片壓縮並套用時間戳記檔名。
- **Session 安全性**：管理模式僅存於 sessionStorage，15 分鐘未操作會自動失效。
- **Cloudflare Pages 友善**：所有 API 以 Edge Runtime 實作，可直接部署到 Pages。

## 專案結構

```
app/           # Next.js App Router 頁面與 API Routes
  api/         # 後端邏輯，運行於 Edge Runtime
components/    # 前端 React 元件
  media/       # 媒體瀏覽相關元件
    hooks/     # useMediaData, useAdminAuth, useMediaActions, useMediaDragDrop, useMessage
lib/           # 共用函式庫
  r2.ts        # Cloudflare R2 操作封裝 (aws4fetch)
  ensure-admin.ts  # 管理員身分驗證與 IP 速率限制邏輯
  upload/      # 上傳相關常數定義

```

## 需求與相依

- Node.js 20+ 與 npm
- Next.js 16、React 19、TypeScript、Tailwind CSS 4
- Cloudflare R2（含 Access Key / Secret Key）

## 開發環境設定

1. 安裝套件：
   ```bash
   npm install
   ```
2. 複製並填寫環境變數：
   ```bash
   cp .env.example .env.local
   ```
3. 本機啟動：
   ```bash
   npm run dev
   ```
4. 其他腳本：
   - `npm run build`：產生生產環境建置成果

## 環境變數

| 變數                                                  | 必填 | 說明                                   |
| ----------------------------------------------------- | ---- | -------------------------------------- |
| `R2_ACCOUNT_ID`                                       | ✅   | Cloudflare 帳戶 ID                     |
| `R2_ACCESS_KEY_ID`                                    | ✅   | R2 Access Key                          |
| `R2_SECRET_ACCESS_KEY`                                | ✅   | R2 Secret Key                          |
| `R2_BUCKET_NAME`                                      | ✅   | 儲存媒體的 bucket 名稱                 |
| `R2_PUBLIC_BASE`                                      | ✅   | 公開讀取的基底 URL                     |
| `ADMIN_ACCESS_TOKEN`                                  | ✅   | 管理密碼（最長 15 字）                 |
| `ADMIN_RATE_LIMIT_MAX_FAILURES`                       | ⬜️   | 密碼錯誤嘗試次數（預設 5 次 / 5 分鐘） |
| `MAX_IMAGE_SIZE_MB` / `NEXT_PUBLIC_MAX_IMAGE_SIZE_MB` | ⬜️   | 圖片單檔上限（預設 10MB）              |
| `MAX_VIDEO_SIZE_MB` / `NEXT_PUBLIC_MAX_VIDEO_SIZE_MB` | ⬜️   | 影片單檔上限（預設 150MB）             |

## API 速查

| 方法   | 路徑                 | 用途                               | 認證            |
| ------ | -------------------- | ---------------------------------- | --------------- |
| GET    | `/api/media?prefix=` | 取得指定 prefix 的資料夾與媒體清單 | 不需            |
| POST   | `/api/media`         | 建立資料夾或驗證管理密碼           | `x-admin-token` |
| PATCH  | `/api/media`         | 重新命名或移動                     | `x-admin-token` |
| DELETE | `/api/media`         | 刪除檔案或資料夾                   | `x-admin-token` |
| GET    | `/api/media/usage`   | 取得儲存貯體 (Bucket) 已使用容量   | 不需            |
| POST   | `/api/upload`        | 上傳圖片 / 影片                    | `x-admin-token` |

## 部署建議（Cloudflare Pages）

1. 在 Pages 專案設定中新增上述環境變數
2. `next.config.mjs` 已配置 Edge Runtime，無需額外調整
3. 若使用自訂網域，確認 `R2_PUBLIC_BASE` 與實際公開位址一致
