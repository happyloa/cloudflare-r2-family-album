# Family Album

私密家庭相簿，使用 Next.js App Router、Cloudflare Workers 與既有的 Cloudflare R2 bucket。

## 需求

- Node.js 22
- Cloudflare 帳戶，以及可存取既有 R2 bucket 的 S3 API Access Key

## 本機開發

```powershell
npm install
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
| `R2_PUBLIC_BASE` | 是 | R2 公開檔案 URL |
| `ADMIN_ACCESS_TOKEN` | 是 | 管理員 API 驗證 token |
| `ADMIN_RATE_LIMIT_MAX_FAILURES` | 否 | 管理員驗證失敗上限 |
| `MAX_IMAGE_SIZE_MB` | 否 | 圖片上傳大小上限 |
| `MAX_VIDEO_SIZE_MB` | 否 | 影片上傳大小上限 |

## 指令

| 指令 | 用途 |
| --- | --- |
| `npm run dev` | 啟動 Next.js 開發環境 |
| `npm run dev:worker` | 啟動 Workers runtime 開發環境 |
| `npm run typecheck` | TypeScript 檢查 |
| `npm run check:vinext` | Vinext 相容性檢查 |
| `npm run build` | 建置 Next.js |
| `npm run build:worker` | 建置 Workers 產物 |
| `npm run cf-typegen` | 產生 Worker 型別 |
| `npm run deploy:dry-run` | 驗證部署設定 |
| `npm run deploy` | 建置並發佈 Worker |

## 部署

正式環境由 Cloudflare Workers Builds 管理：推送到 `main` 時，會執行 `npm run deploy` 發佈 `family-album` Worker。

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
| DELETE | `/api/media` | 刪除媒體或資料夾（支援批次） | `x-admin-token` |
| GET | `/api/media/usage` | 取得 bucket 使用量 | `x-admin-token` |
| POST | `/api/upload` | 上傳圖片或影片 | `x-admin-token` |
