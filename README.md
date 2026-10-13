# Family Album

公開瀏覽、密碼管理的家庭相簿，支援資料夾、媒體預覽、上傳、重新命名、移動與刪除。知道網址的人可以瀏覽清單與媒體；所有管理 API 都驗證 `x-admin-token`。

使用 React 與 Next.js App Router，本機保留 Next.js 開發／建置流程，正式服務由 Vinext、Vite 與 Cloudflare Vite plugin 建置為 Worker，透過 S3 API 存取 R2。介面採 Tailwind CSS 與思源黑體（Noto Sans TC），由 `@fontsource/noto-sans-tc` 隨網站部署 400、500、600、700 字重。

## 本機開發

建議使用 `.nvmrc` 的 Node 24.21.0，CI 與 Workers Builds 使用相同版本。支援 Node 22.22.2+（22 系列）、24.15.0+（24 系列）或 26+。另需 Cloudflare 帳戶、既有 R2 bucket 與其 S3 API Access Key。

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

將範本中的示範值換成實際設定。Next.js 使用 `http://localhost:3000`；Workers 開發環境使用 `http://localhost:3001`：

```powershell
Copy-Item .dev.vars.example .dev.vars
npm run dev:worker
```

兩種開發服務都會使用所設定的 R2 憑證，管理操作可能改動正式相簿。功能驗證請使用下方的隔離測試，不要拿正式資料測試寫入。

## 環境設定

本機設定於 `.env.local`／`.dev.vars`；正式環境設定於 Workers Dashboard 的 Variables and Secrets。`R2_SECRET_ACCESS_KEY`、`ADMIN_ACCESS_TOKEN` 使用 Secret，憑證與本機設定檔不得提交到 Git。

| 變數 | 必要 | 用途／預設值 |
| --- | --- | --- |
| `R2_ACCOUNT_ID` | 是 | Cloudflare 帳戶 ID |
| `R2_ACCESS_KEY_ID` | 是 | R2 S3 API Access Key |
| `R2_SECRET_ACCESS_KEY` | 是 | R2 S3 API Secret Key |
| `R2_BUCKET_NAME` | 是 | 相簿 bucket 名稱 |
| `R2_PUBLIC_BASE` | 是 | 媒體的公開 R2 網址 |
| `ADMIN_ACCESS_TOKEN` | 是 | 管理密碼 |
| `ADMIN_RATE_LIMIT_MAX_FAILURES` | 否 | 單一 IP 在 5 分鐘內的驗證失敗上限，預設 5 次 |
| `MAX_IMAGE_SIZE_MB` | 否 | 圖片單檔上限，預設 10、最高 32 |
| `MAX_VIDEO_SIZE_MB` | 否 | 影片單檔上限，預設與最高皆為 32 |

上傳限制在伺服器解析，Next.js 與 Workers 都適用；管理介面由受保護的 `GET /api/upload` 取得實際值。`NEXT_PUBLIC_MAX_*` 已不使用。

## 使用限制

- 每批最多 20 個檔案、共 32 MiB；介面的 MB 以 1024 × 1024 bytes 計算。支援 JPEG、PNG、WebP、GIF、AVIF、HEIC／HEIF、MP4、WebM、QuickTime，同時驗證 MIME type 與檔案 signature。
- 瀏覽器只嘗試壓縮 JPEG，結果較大時保留原檔；其他格式保留原檔及動畫。HEIC／HEIF、QuickTime 的預覽取決於瀏覽器，失敗時提供提示與另開檔案入口。
- 資料夾最多兩層；批次移動／刪除每次最多 200 項，管理 API 的 JSON body 上限為 256 KiB。
- 刪除確認後有六秒復原時間；離開或重新整理頁面會取消尚未送出的刪除。期限到期才送到伺服器，之後無法復原。刪除資料夾會把內容上移一層，檔案才會被刪除。

10 GB 容量條與超額確認只是前端提醒，並非伺服器配額或零費用保證。驗證失敗的速率限制只存在單一程序／Worker isolate 的記憶體，未跨執行個體共用。R2 批次操作不是交易，失敗時可能已有部分項目完成。

## 指令

| 指令 | 用途 |
| --- | --- |
| `npm run dev` | Next.js 開發服務 |
| `npm run dev:worker` | Workers 開發服務 |
| `npm run typecheck` | 產生 Next 型別並檢查 TypeScript |
| `npm run test` | Vitest watch mode |
| `npm run test:run` | Vitest 回歸測試 |
| `npm run test:e2e` | Next.js 桌面／手機隔離測試 |
| `npm run test:e2e:worker` | 已建置 Worker 的桌面／手機隔離測試 |
| `npm run check:vinext` | Vinext 相容性檢查 |
| `npm run build` | Next.js 建置 |
| `npm run start` | Next.js 正式服務 |
| `npm run build:worker` | Worker 建置 |
| `npm run cf-typegen` | 產生 Worker 型別 |
| `npm run verify` | 型別產生、相容性、型別、測試與兩種建置 |
| `npm run deploy:dry-run` | 建置 Worker，檢查 Vinext 部署配置 |
| `npm run deploy` | 建置並發佈 Worker |

## 驗證

`.github/workflows/verify.yml` 在推送 `main`、針對 `main` 的 Pull Request 與手動觸發時執行 `npm ci`、`npm audit`、`npm run verify` 及兩種 runtime 的 Playwright 測試，不負責部署。

首次執行瀏覽器測試前安裝 Chromium；Worker 測試需先建置：

```powershell
npx playwright install chromium --only-shell
npm run test:e2e
npm run build:worker
npm run test:e2e:worker
```

測試使用 `127.0.0.1:3100`、`tests/fixtures/runtime.env` 的假憑證與本機合成媒體。R2 清單、容量和寫入請求由測試攔截；管理驗證、上傳限制與未授權 API 會走本機服務。Next.js 的測試環境變數及 Wrangler 的明確 `--env-file` 覆寫開發設定，避免載入正式 R2 憑證。R2 回歸測試使用模擬 S3。

## 部署

正式環境使用 Cloudflare Workers Builds，Dashboard 預期設定為：

- Production branch：`main`
- Root directory：留空
- Build command：留空
- Deploy command：`npm run deploy`

這些設定由 Dashboard 管理；啟用自動部署後，推送 `main` 會發佈 `family-album` Worker。GitHub Verify 與 Workers Builds 各自觸發，Verify 通過不代表正式部署已驗證。若要讓合併前必須通過驗證，將 Verify 的 `verify` job 設為 `main` 的 required status check，並禁止直接推送。

本機手動發佈前以 `npx wrangler login` 登入，再執行：

```powershell
npm run deploy
```

部署前可先檢查配置與打包：

```powershell
npm run deploy:dry-run
npx wrangler deploy --config dist/server/wrangler.json --dry-run
```

第一個指令檢查 Vinext 配置，第二個檢查 Wrangler 打包；都不發佈，也不能代替正式環境驗證。`wrangler.jsonc` 的 `keep_vars: true` 保留 Dashboard 的 runtime variables。

專案仍用 Vinext／Wrangler；Cloudflare 帳號及資源管理優先使用官方 `cf` CLI。建議後續另行遷移至 `cloudflare.config.ts`，先執行 `cf migrate --dry-run`，再完成配置、依賴、scripts、CI 與部署驗證。

## 依賴安全

`react`、`react-dom` 與 `react-server-dom-webpack` 支援 Vinext／App Router；`next` 仍供 Next.js 指令與型別使用。`@vitejs/plugin-react`、`@vitejs/plugin-rsc` 是 Vinext 所需的 plugin，`@testing-library/dom` 是測試工具的 peer dependency。

保留以下安全覆寫，升級後仍需檢查上游是否已修補，再決定移除：

- `postcss` 統一到直接宣告的版本；Next.js 的 `sharp` 固定為 `0.35.5`。
- `satori` 的 `fflate` 使用 `0.7.5`，修復 ZIP64 解析漏洞並保留 0.7 系列 API；0.8 系列的同步解壓縮參數不同。
- `fast-glob` 使用 `vendor/dynamic-import-glob`，以 `tinyglobby` 提供 `vite-plugin-dynamic-import` 所需的同步搜尋介面，避開含漏洞的 `braces`；測試涵蓋副檔名選項、資料夾 index 及動態 `require()` 的建置與執行。

參考：[braces 漏洞公告](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)、[tinyglobby 遷移指引](https://superchupu.dev/tinyglobby/migration)、[fflate 版本變更](https://github.com/101arrowz/fflate/blob/master/CHANGELOG.md)。

## API

| 方法 | 路徑 | 用途 | 驗證 |
| --- | --- | --- | --- |
| GET | `/api/media?prefix=&limit=&cursor=` | 媒體清單；`limit` 可選 1–200，`nextCursor` 供續頁使用 | 公開 |
| POST | `/api/media` | 建立資料夾、驗證管理密碼 | `x-admin-token` |
| PATCH | `/api/media` | 重新命名、移動、批次移動 | `x-admin-token` |
| DELETE | `/api/media` | 批次刪除檔案、解開資料夾並將內容上移一層 | `x-admin-token` |
| GET | `/api/media/usage` | bucket 使用量 | `x-admin-token` |
| GET | `/api/upload` | 伺服器上傳限制 | `x-admin-token` |
| POST | `/api/upload` | 上傳；全成功 `201`、部分成功 `207`、全數寫入失敗 `502` | `x-admin-token` |
