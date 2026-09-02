# Family Album

家庭相簿管理介面，使用 Next.js App Router、Cloudflare Workers 與既有的 Cloudflare R2 bucket。

## 目前存取模型

- 媒體清單與 `R2_PUBLIC_BASE` 的檔案 URL 目前是公開讀取。
- 建立、移動、刪除、上傳與使用量查詢需要 `x-admin-token`。
- 因此這不是端對端私密相簿；若相片必須只供特定使用者存取，需先決定登入／授權模型並停止使用公開 R2 URL。

## 需求

- Node.js 22.12+（CI 與 Workers Builds 使用 `.nvmrc` 的 Node 22）
- Cloudflare 帳戶，以及可存取既有 R2 bucket 的 S3 API Access Key

## 本機開發

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

模擬 Workers runtime：

```powershell
Copy-Item .dev.vars.example .dev.vars
npm run dev:worker
```

## Runtime variables

在 Cloudflare Workers Dashboard 的 Variables and Secrets 設定下列值；`R2_SECRET_ACCESS_KEY` 與 `ADMIN_ACCESS_TOKEN` 請使用 Secret，且不要提交到 Git：

| 變數 | 必要 | 用途 |
| --- | --- | --- |
| `R2_ACCOUNT_ID` | 是 | Cloudflare 帳戶 ID |
| `R2_ACCESS_KEY_ID` | 是 | R2 S3 API Access Key |
| `R2_SECRET_ACCESS_KEY` | 是 | R2 S3 API Secret Key |
| `R2_BUCKET_NAME` | 是 | 相簿使用的 bucket 名稱 |
| `R2_PUBLIC_BASE` | 是 | 公開讀取媒體的 R2 網址 |
| `ADMIN_ACCESS_TOKEN` | 是 | 管理員 API 驗證 token |
| `ADMIN_RATE_LIMIT_MAX_FAILURES` | 否 | 單一 IP 在 5 分鐘內可容許的管理員驗證失敗次數（預設 5） |
| `MAX_IMAGE_SIZE_MB` | 否 | 圖片單檔上限（預設 10 MB、最高 32 MB） |
| `MAX_VIDEO_SIZE_MB` | 否 | 影片單檔上限（預設與最高 32 MB） |

上傳限制只在 Worker runtime 解析；管理介面會向受保護的 `GET /api/upload` 取得實際值，因此不要設定 `NEXT_PUBLIC_MAX_*`。每批最多 20 個檔案、總容量最高 32 MB。支援 JPEG、PNG、WebP、GIF、AVIF、HEIC／HEIF、MP4、WebM 與 QuickTime；伺服器會同時驗證宣告的 MIME type 與檔案 signature。

## 指令

| 指令 | 用途 |
| --- | --- |
| `npm run dev` | 啟動 Next.js 開發環境 |
| `npm run dev:worker` | 啟動 Workers runtime 開發環境 |
| `npm run typecheck` | 產生 Next 型別並執行 TypeScript 檢查 |
| `npm run test` | 以 Vitest watch mode 執行測試 |
| `npm run test:run` | 執行一次 Vitest 回歸測試 |
| `npm run check:vinext` | Vinext 相容性檢查 |
| `npm run build` | 建置 Next.js |
| `npm run build:worker` | 建置 Workers 產物 |
| `npm run cf-typegen` | 產生 Worker 型別 |
| `npm run verify` | 依序執行型別產生、相容性檢查、型別檢查、測試與兩種建置 |
| `npm run deploy:dry-run` | 驗證部署設定 |
| `npm run deploy` | 建置並發佈 Worker |

## 驗證與部署

`.github/workflows/verify.yml` 會在針對 `main` 的 Pull Request 與手動觸發時執行 `npm ci` 與 `npm run verify`；它不含部署權限，也不會發佈 Worker。

正式環境由 Cloudflare Workers Builds 管理：推送到 `main` 時，會執行 `npm run deploy` 發佈 `family-album` Worker。若要確保部署前一定先通過 Verify，請在 GitHub 對 `main` 設定 branch protection，將 `Verify / verify` 設為 required status check，並禁止直接推送。

Workers Builds 設定：

- Production branch：`main`
- Root directory：留空
- Build command：留空
- Deploy command：`npm run deploy`

需要從本機手動發佈時，先以 `npx wrangler login` 登入，再執行：

```powershell
npm run deploy
```

`wrangler.jsonc` 啟用 `keep_vars: true`，會保留 Dashboard 中既有的 runtime variables。

## API

| 方法 | 路徑 | 用途 | 驗證 |
| --- | --- | --- | --- |
| GET | `/api/media?prefix=` | 取得相簿媒體清單 | 公開 |
| POST | `/api/media` | 建立資料夾或驗證管理員 token | `x-admin-token` |
| PATCH | `/api/media` | 重新命名、移動或批次移動 | `x-admin-token` |
| DELETE | `/api/media` | 刪除媒體；刪除資料夾時會將內容上移一層、移除資料夾標記（支援批次） | `x-admin-token` |
| GET | `/api/media/usage` | 取得 bucket 使用量 | `x-admin-token` |
| GET | `/api/upload` | 取得 Worker 實際套用的上傳限制 | `x-admin-token` |
| POST | `/api/upload` | 上傳圖片或影片；完整成功為 `201`、部分成功為 `207`、全數寫入失敗為 `502` | `x-admin-token` |
