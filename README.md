# Family Album

家庭相簿，支援資料夾、媒體預覽、上傳、重新命名、移動與垃圾桶。清單與媒體公開，管理操作需要密碼，管理 API 以 `x-admin-token` 驗證。

使用 React、Vinext、Vite 與 Cloudflare Workers，透過 R2 binding（`ALBUM_BUCKET`）存取 bucket。Vinext 提供 App Router 與 `next/*` 相容 API，專案未安裝 `next`。介面採深色攝影集版面、Tailwind CSS 與隨站部署的思源黑體（Noto Sans TC 變動字型）。

## 開發

使用 `.nvmrc` 的 Node 24.21.0：

```powershell
npm ci
Copy-Item .dev.vars.example .dev.vars
# 將 .dev.vars 中的示範值換成實際設定
npm run dev
```

開發與本機預覽都在 Workers runtime 執行，網址為 `http://localhost:3000`。本機的 `ALBUM_BUCKET` 是模擬 bucket，資料存在 `.wrangler/state`，不會讀寫正式相簿，所以一開始是空的。

## 設定

`wrangler.jsonc` 把 `ALBUM_BUCKET` 綁定到同帳號的 `family-album` bucket，改用其他 bucket 時修改 `bucket_name`。其餘設定在本機放 `.dev.vars`，正式環境放 Workers Dashboard 的 Variables and Secrets；前兩項必填，`ADMIN_ACCESS_TOKEN` 設為 Secret。勿提交密碼或本機設定檔。

| 變數 | 用途／預設值 |
| --- | --- |
| `R2_PUBLIC_BASE` | R2 公開網域或自訂媒體網域 |
| `ADMIN_ACCESS_TOKEN` | 管理密碼 |
| `ADMIN_RATE_LIMIT_MAX_FAILURES` | 單一 IP 在 5 分鐘內的驗證失敗上限，預設 5 次 |
| `MAX_IMAGE_SIZE_MB` | 圖片單檔上限，預設 10、最高 32 |
| `MAX_VIDEO_SIZE_MB` | 影片單檔上限，預設與最高皆為 32 |
| `TRASH_RETENTION_DAYS` | 垃圾桶保留天數，預設 15；可設 1–365，只套用到之後移入的媒體。設定值無效時，刪除媒體與開啟垃圾桶都會失敗 |

上傳限制由伺服器解析，管理介面透過受保護的 `GET /api/upload` 取得；請勿設定 `NEXT_PUBLIC_MAX_*`。

從 S3 API 版本升級時，部署後確認相簿正常，再到 Dashboard 刪除 `R2_ACCOUNT_ID`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`、`R2_BUCKET_NAME`，並撤銷對應的 R2 API Token。部署當下已開啟頁面的分頁游標會失效一次，重新整理即可。

## 指令

| 指令 | 用途 |
| --- | --- |
| `npm run dev` | Vinext／Workers 開發服務 |
| `npm run build` | 建置 Worker |
| `npm run start` | 讀取 `.dev.vars`，本機預覽已建置 Worker |
| `npm run typecheck` | Worker 型別、Vinext 路由型別與 TypeScript 檢查 |
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

所有測試都用模擬 R2 與固定假密碼，不碰正式物件。E2E 使用 `127.0.0.1:3100`，R2 清單、容量與寫入由測試攔截，密碼、上傳限制與未授權 API 走本機服務。`verify` 另以已建置 Worker 與 Miniflare 的記憶體 R2 檢查同時改名、上傳、垃圾桶還原與排程清理。兩種 E2E 的結果分別放在 `.cache/playwright-results/dev` 與 `worker`；CI 失敗時上傳為 `playwright-traces-*` artifact，保留 5 天。

`ALBUM_MUTATIONS` Durable Object 讓管理寫入與垃圾桶清理依序執行，避免較慢的請求刪掉其他請求剛移入的檔案；公開瀏覽不排隊。從其他程式或 Dashboard 直接改動 R2 不受這層保護。

依賴更新後若 npm 阻擋必要安裝腳本，先用 `npm install-scripts ls` 檢查，再核准對應版本。`allowScripts` 只核准建置所需的 `esbuild` 與 `workerd` 版本。

GitHub Verify 在推送 `main`、以 `main` 為目標的 Pull Request 與手動觸發時執行，不負責部署。正式發佈由 Cloudflare Workers Builds 管理，Dashboard 設定：

- Production branch：`main`
- Root directory、Build command：留空
- Deploy command：`npm run deploy`
- Node：24.21.0

推送 `main` 會同時觸發 Verify 與部署，兩者互不等待。要在合併前強制驗證，把 `verify` job 設為 required status check 並禁止直接推送。本機發佈前先 `npx wrangler login`；`keep_vars: true` 保留 Dashboard 的變數。本機測試與 dry-run 不代表正式環境驗證通過。

## 垃圾桶

管理模式右下角的垃圾桶可預覽、還原或永久刪除媒體。保留期從移入時起算；還原回原位置，遇到同名項目會拒絕覆寫。永久刪除需確認，完成後無法復原。

垃圾桶使用同一個 bucket 的保留路徑 `.family-album-trash/`，一般相簿 API 不會顯示或接受此路徑，`/api/trash` 需管理驗證。公開媒體網址與快取不提供存取控制。保留中的媒體仍計入容量與 R2 操作用量。

`worker.ts` 每小時（`0 * * * *`）清理到期項目，每次最多讀 5 頁、每頁 100 筆，積壓或失敗時留待下次。分支預覽版本不套用正式排程。

## 使用限制

- 每批最多 20 個檔案、共 32 MiB，以壓縮後的大小計算；介面以 MB 標示。支援 JPEG、PNG、WebP、GIF、AVIF、HEIC／HEIF、MP4、WebM、QuickTime，會驗證 MIME type 與檔案 signature。
- 瀏覽器只嘗試壓縮 JPEG：長邊縮到 1920px 並轉成 WebP（不支援 WebP 編碼的瀏覽器改用 JPEG），結果較大時保留原檔。壓縮後的檔案不保留 EXIF，也不另存原圖。其他格式保留原檔及動畫，拍攝位置等中繼資料會跟著公開。HEIC／HEIF、QuickTime 的預覽取決於瀏覽器，失敗時可另開檔案。
- 資料夾最多兩層；介面每次最多選取 200 項，移動與刪除分批送出，每次請求最多移動 10 項，或刪除 10 項（媒體與資料夾合計）。管理 API 的 JSON body 上限為 256 KiB。
- R2 binding 沒有伺服器端複製，改名與移動會讀出再寫入，每個檔案多一次讀取操作。Workers Free 每次請求最多呼叫 binding 1,000 次，一個資料夾超過約 490 個檔案時，改名或移動可能失敗；失敗後重新整理，確認已完成的部分。
- 刪除確認後立即送出。媒體移入垃圾桶，保留期內可還原；刪除資料夾會把內容上移一層，資料夾本身無法還原。
- 10 GB 容量條只是前端提醒，並非伺服器配額或零費用保證。批次操作不是交易，失敗時可能已有部分項目完成。
- 密碼限速的計數存在 `ALBUM_MUTATIONS` 的記憶體，重新啟動或部署後歸零。同時追蹤的來源超過 4096 個時，新來源要等舊紀錄到期才能驗證。
- Workers Free 每日有 10 萬次請求額度，首頁與公開清單都會計入；用完後整站（含管理功能）要到 00:00 UTC（台灣 08:00）才恢復。

## 依賴維護

`package.json` 保留兩項覆寫：`postcss` 統一版本，`satori/fflate` 固定為已修補的 `fflate@0.7.5`。Satori 仍用 fflate 0.7 API 解壓 WOFF 字型，直接升到 0.8 會壞。移除覆寫前，需確認上游修補並通過 `npm audit` 與完整驗證。

參考：[fflate 版本變更](https://github.com/101arrowz/fflate/blob/master/CHANGELOG.md)。
