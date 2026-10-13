# Family Album

公開瀏覽、密碼管理的家庭相簿，支援資料夾、預覽、上傳、重新命名、移動與刪除。知道網址的人可以讀取清單與媒體，管理 API 需提供 `x-admin-token`。

使用 React、Vinext、Vite 與 Cloudflare Workers，透過 S3 API 存取 R2。`app/` 與 `next/*` 保留相容 API，專案未安裝 `next`。介面採深色攝影集版面、Tailwind CSS 與思源黑體（Noto Sans TC），字型隨網站部署。

## 開發

使用 `.nvmrc` 的 Node 24.21.0，並準備既有 R2 bucket 的 S3 API 憑證：

```powershell
npm ci
Copy-Item .dev.vars.example .dev.vars
# 將 .dev.vars 中的示範值換成實際設定
npm run dev
```

開發與本機預覽使用 `http://localhost:3000`，都在 Workers runtime 執行。使用正式 R2 憑證時，管理操作會改動正式資料；驗證請使用隔離測試。

## 環境變數

本機設定於 `.dev.vars`，正式環境設定於 Workers Dashboard 的 Variables and Secrets。前六項必填；`R2_SECRET_ACCESS_KEY`、`ADMIN_ACCESS_TOKEN` 使用 Secret，憑證與本機設定檔不得提交。

| 變數 | 用途／預設值 |
| --- | --- |
| `R2_ACCOUNT_ID` | Cloudflare 帳戶 ID |
| `R2_ACCESS_KEY_ID` | R2 S3 API Access Key |
| `R2_SECRET_ACCESS_KEY` | R2 S3 API Secret Key |
| `R2_BUCKET_NAME` | 相簿 bucket |
| `R2_PUBLIC_BASE` | 媒體的公開網址 |
| `ADMIN_ACCESS_TOKEN` | 管理密碼 |
| `ADMIN_RATE_LIMIT_MAX_FAILURES` | 單一 IP 在 5 分鐘內的驗證失敗上限，預設 5 次 |
| `MAX_IMAGE_SIZE_MB` | 圖片單檔上限，預設 10、最高 32 |
| `MAX_VIDEO_SIZE_MB` | 影片單檔上限，預設與最高皆為 32 |

上傳限制由伺服器解析，管理介面透過受保護的 `GET /api/upload` 取得。`NEXT_PUBLIC_MAX_*` 已不使用。

## 指令

| 指令 | 用途 |
| --- | --- |
| `npm run dev` | Vinext／Workers 開發服務 |
| `npm run build` | 建置 Worker |
| `npm run start` | 本機預覽已建置 Worker |
| `npm run typecheck` | Vinext 路由型別與 TypeScript 檢查 |
| `npm run verify` | Worker 型別、相容性、型別、回歸測試與建置 |
| `npm run test:e2e` | 開發模式桌面／手機隔離測試 |
| `npm run test:e2e:worker` | 已建置 Worker 的桌面／手機隔離測試 |
| `npm run deploy:dry-run` | 建置並檢查部署配置、Wrangler 打包，不發佈 |
| `npm run deploy` | 建置並發佈 Worker |

## 驗證與部署

首次測試前安裝 Chromium，再執行：

```powershell
npx playwright install chromium --only-shell
npm run verify
npm run test:e2e
npm run test:e2e:worker
```

測試使用 `127.0.0.1:3100`、固定假憑證與本機媒體，開發模式另產生隔離 Worker 配置。R2 清單、容量與寫入由測試攔截；驗證密碼、上傳限制與未授權 API 走本機服務。R2 回歸測試使用模擬 S3。

GitHub Verify 在推送 `main`、Pull Request 與手動觸發時執行，不負責部署。正式發佈由 Cloudflare Workers Builds 管理，Dashboard 設定為：

- Production branch：`main`
- Root directory、Build command：留空
- Deploy command：`npm run deploy`
- Node：24.21.0

啟用自動部署後，推送 `main` 會發佈 Worker。Verify 與 Workers Builds 各自觸發；如需合併前強制驗證，將 `verify` job 設為 required status check，並禁止直接推送。本機發佈前使用 `npx wrangler login` 登入。`keep_vars: true` 保留 Dashboard 的 runtime variables；本機測試與 dry-run 不能代替正式環境驗證。

專案仍使用 `wrangler.jsonc`，帳號與資源管理優先使用 `cf`。若要統一 CLI，另行以 `cf migrate --dry-run` 開始完整遷移。

## 使用限制

- 每批最多 20 個檔案、共 32 MiB；介面以 MB 標示。支援 JPEG、PNG、WebP、GIF、AVIF、HEIC／HEIF、MP4、WebM、QuickTime，會驗證 MIME type 與檔案 signature。
- 瀏覽器只嘗試壓縮 JPEG，結果較大時保留原檔；其他格式保留原檔及動畫。HEIC／HEIF、QuickTime 的預覽取決於瀏覽器，失敗時可另開檔案。
- 資料夾最多兩層；批次移動／刪除最多 200 項，管理 API 的 JSON body 上限為 256 KiB。
- 刪除確認後可在六秒內復原，離開或重新整理會取消尚未送出的刪除。送到伺服器後無法復原。刪除資料夾會把內容上移一層，檔案才會被刪除。
- 10 GB 容量條只是前端提醒，並非伺服器配額或零費用保證。密碼限速未跨 Worker isolate 共用，R2 批次操作也不是交易，失敗時可能已有部分項目完成。

`package.json` 保留 `postcss`、`satori/fflate` 與 `vendor/dynamic-import-glob` 的安全覆寫，移除前需確認上游修補並通過完整驗證。參考：[braces 漏洞公告](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)、[tinyglobby 遷移指引](https://superchupu.dev/tinyglobby/migration)、[fflate 版本變更](https://github.com/101arrowz/fflate/blob/master/CHANGELOG.md)。
