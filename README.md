# Family Album

家庭相簿，支援資料夾、媒體預覽、上傳、重新命名、移動與垃圾桶。清單與媒體公開，管理操作需要密碼，管理 API 以 `x-admin-token` 驗證。

使用 React、Vinext、Vite 與 Cloudflare Workers，透過 S3 API 存取 R2。Vinext 提供 App Router 與 `next/*` 相容 API，專案未安裝 `next`。介面採深色攝影集版面、Tailwind CSS 與隨站部署的思源黑體（Noto Sans TC）。

## 開發

使用 `.nvmrc` 的 Node 24.21.0，並準備既有 R2 bucket 的 S3 API 憑證：

```powershell
npm ci
Copy-Item .dev.vars.example .dev.vars
# 將 .dev.vars 中的示範值換成實際設定
npm run dev
```

開發與本機預覽均在 Workers runtime 執行，網址為 `http://localhost:3000`。使用正式 R2 憑證會連到正式 bucket，管理操作會改動正式資料；測試請使用下方的隔離驗證流程。

## 環境變數

本機使用 `.dev.vars`，正式環境使用 Workers Dashboard 的 Variables and Secrets。前六項必填；`R2_SECRET_ACCESS_KEY`、`ADMIN_ACCESS_TOKEN` 設為 Secret。勿提交憑證或本機設定檔。

| 變數 | 用途／預設值 |
| --- | --- |
| `R2_ACCOUNT_ID` | Cloudflare 帳戶 ID |
| `R2_ACCESS_KEY_ID` | R2 S3 API Access Key |
| `R2_SECRET_ACCESS_KEY` | R2 S3 API Secret Key |
| `R2_BUCKET_NAME` | 相簿 bucket |
| `R2_PUBLIC_BASE` | R2 公開網域或自訂媒體網域，不能使用 S3 API 端點 |
| `ADMIN_ACCESS_TOKEN` | 管理密碼 |
| `ADMIN_RATE_LIMIT_MAX_FAILURES` | 單一 IP 在 5 分鐘內的驗證失敗上限，預設 5 次 |
| `MAX_IMAGE_SIZE_MB` | 圖片單檔上限，預設 10、最高 32 |
| `MAX_VIDEO_SIZE_MB` | 影片單檔上限，預設與最高皆為 32 |
| `TRASH_RETENTION_DAYS` | 垃圾桶保留天數，預設 15；可設 1–365，只套用到之後移入的媒體 |

上傳限制由伺服器解析，管理介面透過受保護的 `GET /api/upload` 取得；請勿設定 `NEXT_PUBLIC_MAX_*`。

## 指令

| 指令 | 用途 |
| --- | --- |
| `npm run dev` | Vinext／Workers 開發服務 |
| `npm run build` | 建置 Worker |
| `npm run start` | 讀取 `.dev.vars`，本機預覽已建置 Worker |
| `npm run typecheck` | Vinext 路由型別與 TypeScript 檢查 |
| `npm run verify` | Worker 型別、相容性、型別、回歸測試、建置與隔離儲存整合測試 |
| `npm run test:e2e` | 開發模式桌面／手機隔離測試 |
| `npm run test:e2e:worker` | 已建置 Worker 的桌面／手機隔離測試 |
| `npm run deploy:dry-run` | 建置並檢查部署配置、Wrangler 打包，不發佈 |
| `npm run deploy` | 建置並發佈 Worker |

## 驗證與部署

首次測試前安裝 Chromium，再執行：

```powershell
npx playwright install chromium --only-shell
npm audit
npm run verify
npm run test:e2e
npm run test:e2e:worker
```

E2E 使用 `127.0.0.1:3100`、固定假憑證與本機媒體；開發模式另產生隔離 Worker 配置。R2 清單、容量與寫入由測試攔截，密碼、上傳限制與未授權 API 則走本機服務。`verify` 另以已建置 Worker、真正的簽署客戶端與模擬 S3，檢查交錯改名、上傳、垃圾桶還原與排程清理，不改動正式物件。

`ALBUM_MUTATIONS` Durable Object 讓同一相簿的管理寫入與垃圾桶清理依序執行，避免較慢的請求刪掉其他請求剛移入的檔案。公開瀏覽不排入寫入佇列。首次部署會依 `wrangler.jsonc` 新增 SQLite-backed Durable Object namespace，不更動 R2 bucket 或既有物件；此資源有自己的用量計算。直接從其他程式或 Dashboard 改動 R2 不受此協調保護，批次操作仍不是交易。

依賴更新後若 npm 阻擋必要安裝腳本，先用 `npm install-scripts ls` 檢查，再核准對應版本。`package.json` 的 `allowScripts` 僅核准建置所需的 `esbuild` 與 `workerd` 版本。

GitHub Verify 在推送 `main`、Pull Request 與手動觸發時執行，不負責部署。正式發佈由 Cloudflare Workers Builds 管理，Dashboard 設定為：

- Production branch：`main`
- Root directory、Build command：留空
- Deploy command：`npm run deploy`
- Node：24.21.0

啟用自動部署後，推送 `main` 會發佈 Worker，與 Verify 各自觸發。如需合併前強制驗證，將 `verify` job 設為 required status check，並禁止直接推送。本機發佈前使用 `npx wrangler login` 登入；`keep_vars: true` 保留 Dashboard 的 runtime variables。本機測試與 dry-run 不代表正式環境驗證通過。

專案使用 `wrangler.jsonc`，開發、建置與部署維持 Vinext／Wrangler；帳號與資源管理優先使用 `cf`。建議另行以 `cf migrate --dry-run` 開始完整遷移，統一 CLI。

## 垃圾桶

管理模式右下角的垃圾桶可預覽、還原或永久刪除媒體。保留期從移入時起算；還原回原位置，遇到同名項目會拒絕覆寫。永久刪除需確認，完成後無法復原。批次請求每次最多 10 項，避免觸及 Workers Free 的外部請求限制。

`worker.ts` 每小時清理到期項目，每次最多讀 5 頁、每頁 100 筆；積壓或失敗時留待後續清理。正式部署套用 `wrangler.jsonc` 的 `0 * * * *` 排程，分支版本預覽不會套用正式排程。

垃圾桶使用同一個 bucket 的保留路徑 `.family-album-trash/`，一般相簿 API 不會顯示或接受此路徑；`/api/trash` 需管理驗證。公開媒體網址與快取不提供存取控制。保留媒體仍計入容量，複製及列表仍計入 R2 操作用量。

## 使用限制

- 每批最多 20 個檔案、共 32 MiB；介面以 MB 標示。支援 JPEG、PNG、WebP、GIF、AVIF、HEIC／HEIF、MP4、WebM、QuickTime，會驗證 MIME type 與檔案 signature。
- 瀏覽器只嘗試壓縮 JPEG，結果較大時保留原檔；其他格式保留原檔及動畫。HEIC／HEIF、QuickTime 的預覽取決於瀏覽器，失敗時可另開檔案。
- 資料夾最多兩層；介面每次最多選取 200 項，移動與刪除會分批送出，每次請求最多移動 10 項或把 10 個媒體移入垃圾桶。管理 API 的 JSON body 上限為 256 KiB。大型資料夾仍可能超過外部請求限制，失敗後應重新整理確認已完成的部分。
- 刪除確認後可在六秒內取消，離開或重新整理會取消尚未送出的操作。媒體送到伺服器後移入垃圾桶，保留期內可還原；刪除資料夾仍會把內容上移一層，不把內容移入垃圾桶。
- 10 GB 容量條只是前端提醒，並非伺服器配額或零費用保證。密碼限速未跨 Worker isolate 共用，R2 批次操作也不是交易，失敗時可能已有部分項目完成。

## 依賴維護

`package.json` 保留安全覆寫：`postcss` 統一版本，`vendor/dynamic-import-glob` 以 tinyglobby 提供既有 glob 介面，`satori/fflate` 固定為已修補的 `fflate@0.7.5`。目前依賴的 Satori 仍使用 fflate 0.7 API 解壓 WOFF 字型，直接升至 0.8 會破壞相容性。移除覆寫前，需確認上游修補並通過相容性測試、`npm audit` 與完整驗證。

參考：[braces 漏洞公告](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)、[tinyglobby 遷移指引](https://superchupu.dev/tinyglobby/migration)、[fflate 版本變更](https://github.com/101arrowz/fflate/blob/master/CHANGELOG.md)。
