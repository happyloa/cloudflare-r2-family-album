# Family Album

部署在 Cloudflare Workers 的私密家庭相簿。Next.js App Router 負責網頁與 API，媒體檔保留在既有的 Cloudflare R2 bucket。

## 功能

- 資料夾與年份分組、多選、拖曳上傳／移動、搜尋、排序與媒體預覽。
- 寫入操作以 `ADMIN_ACCESS_TOKEN` 保護，並對失敗嘗試節流。
- 圖片與影片直接從 R2 公開網域讀取；Noto Sans TC 由 Workers Static Assets 自託管。

## 需求

- Node.js 22 以上與 npm
- Cloudflare 帳戶、既有 R2 bucket 與 S3 相容 API Access Key

## 本機開發

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

若要以 Workers runtime 開發：

```powershell
Copy-Item .dev.vars.example .dev.vars
npm run dev:worker
```

`dev:worker` 預設使用 <http://localhost:3001>。

## 環境變數

| 變數 | 必填 | 用途 |
| --- | --- | --- |
| `R2_ACCOUNT_ID` | 是 | Cloudflare 帳戶 ID |
| `R2_ACCESS_KEY_ID` | 是 | R2 S3 相容 API Access Key |
| `R2_SECRET_ACCESS_KEY` | 是 | R2 S3 相容 API Secret Key |
| `R2_BUCKET_NAME` | 是 | 既有媒體 bucket 名稱 |
| `R2_PUBLIC_BASE` | 是 | R2 公開讀取 URL |
| `ADMIN_ACCESS_TOKEN` | 是 | 管理密碼 |
| `ADMIN_RATE_LIMIT_MAX_FAILURES` | 否 | 密碼錯誤上限（預設 5 次／5 分鐘） |
| `MAX_IMAGE_SIZE_MB` | 否 | 圖片單檔上限（預設 10 MB，最高 80 MB） |
| `MAX_VIDEO_SIZE_MB` | 否 | 影片單檔上限（預設／最高 80 MB） |

需要調低前端上傳預檢時，同步設定 `NEXT_PUBLIC_MAX_IMAGE_SIZE_MB` 或 `NEXT_PUBLIC_MAX_VIDEO_SIZE_MB`。Worker 端單檔與整批上傳最多 80 MB。

## 指令

| 指令 | 用途 |
| --- | --- |
| `npm run dev` | Next.js 本機開發 |
| `npm run dev:worker` | Workers runtime 本機開發 |
| `npm run typecheck` | TypeScript 檢查 |
| `npm run check:vinext` | Vinext 相容性檢查 |
| `npm run build` | Next.js 生產建置 |
| `npm run build:worker` | Workers 生產建置 |
| `npm run cf-typegen` | 產生 Worker 型別 |
| `npm run deploy:dry-run` | 驗證 Workers 部署設定 |
| `npm run deploy` | 發佈 Cloudflare Worker |

## 部署

1. 使用 `npx wrangler login` 登入，再以 `npx wrangler whoami` 確認帳戶。
2. 在 Worker Dashboard 設定上述 R2 與管理員 runtime variables／secrets。
3. 執行：

   ```powershell
   npm run deploy
   ```

`wrangler.jsonc` 是 Worker 部署設定來源，並啟用 `keep_vars: true` 以保留 Dashboard 中的 runtime variables。

## GitHub Actions

Workflow 位於 `.github/workflows/worker.yml`：

- Pull request 到 `main`：執行 Vinext 相容性、型別與 Workers build 檢查。
- Push 到 `main`：當 `CLOUDFLARE_WORKERS_DEPLOY=true` 時部署正式 Worker。
- GitHub Actions 的 **Run workflow**：可在 `main` 手動重新部署，不需新 commit。

首次啟用自動部署：

1. 在 GitHub repository 建立 `production` Environment。
2. 在該 Environment 新增 `CLOUDFLARE_API_TOKEN` secret，使用僅限此帳戶、具 Workers 編輯權限的 Cloudflare API Token。
3. 在 repository 的 Actions Variables 新增 `CLOUDFLARE_WORKERS_DEPLOY=true`。

`R2_*` 與 `ADMIN_ACCESS_TOKEN` 只保存在 Worker Dashboard。`CLOUDFLARE_API_TOKEN` 只保存在 GitHub Environment secret，絕不可設定成 Worker runtime variable。

## API

| 方法 | 路徑 | 用途 | 認證 |
| --- | --- | --- | --- |
| GET | `/api/media?prefix=` | 取得資料夾與媒體清單 | 不需 |
| POST | `/api/media` | 建立資料夾／驗證管理密碼 | `x-admin-token` |
| PATCH | `/api/media` | 重新命名、移動、批次移動 | `x-admin-token` |
| DELETE | `/api/media` | 刪除與批次刪除 | `x-admin-token` |
| GET | `/api/media/usage` | 取得 bucket 已使用容量 | `x-admin-token` |
| POST | `/api/upload` | 上傳圖片／影片 | `x-admin-token` |
