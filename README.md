# Family Album

家庭相簿管理介面，使用 Next.js App Router 與 React。Next.js 提供本機開發與建置流程；正式部署透過 Vinext、Vite 與 Cloudflare Vite plugin 建置為 Cloudflare Worker，以 S3 API 存取既有 R2 bucket。

介面使用 Tailwind CSS 與系統字型，不下載額外中文字型。

## 目前存取模型

- 媒體清單與 `R2_PUBLIC_BASE` 的檔案 URL 目前是公開讀取。
- 建立資料夾、重新命名、移動、刪除、上傳，以及使用量與上傳限制查詢需要 `x-admin-token`。
- 目前採用「公開瀏覽、密碼管理」。知道網址的人可以瀏覽相簿與媒體。

## 需求

- Node.js 22 系列至少 22.22.2、24 系列至少 24.15.0，或 26+（CI 使用 `.nvmrc` 的 Node 24.21.0；Workers Builds 建議使用相同版本）
- Cloudflare 帳戶，以及可存取既有 R2 bucket 的 S3 API Access Key

本機建議使用 Node 24.21.0 LTS。Node 24.12.0 低於 jsdom 及其依賴要求的版本，安裝時會出現 `EBADENGINE`；請先更新 Node，再安裝套件。

## 本機開發

複製環境變數範本後，將其中的示範值換成實際設定，再啟動服務。

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

Next.js 預設使用 `http://localhost:3000`，Workers 開發服務使用 `http://localhost:3001`。兩者都會使用所設定的 R2 S3 憑證；連到正式 bucket 時，管理操作會改動正式資料。驗證功能請使用下方的隔離測試。

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

上傳限制只在伺服器端解析，適用於 Next.js 與 Workers；管理介面會向受保護的 `GET /api/upload` 取得實際值，因此不要設定 `NEXT_PUBLIC_MAX_*`。每批最多 20 個檔案、總容量最高 32 MiB（介面標示為 MB）。支援 JPEG、PNG、WebP、GIF、AVIF、HEIC／HEIF、MP4、WebM 與 QuickTime；伺服器會同時驗證宣告的 MIME type 與檔案 signature。

瀏覽器上傳時只會嘗試壓縮 JPEG，轉換結果較大時保留原檔；其他圖片格式保留原檔，避免動畫被轉成靜態圖片。HEIC／HEIF 與 QuickTime 能否直接預覽取決於瀏覽器，載入失敗時會提供提示與另開檔案的入口。

資料夾最多兩層。批次移動或刪除每次最多 200 個項目，管理 API 的 JSON body 上限為 256 KiB。刪除確認後有六秒復原時間；期限內離開或重新整理頁面會取消尚未送出的刪除。期限到期後才送到伺服器，之後無法復原。刪除資料夾會把內容移到上一層；檔案才會被刪除。

介面的 10 GB 容量條與超額確認是前端提醒，並非伺服器硬性配額，也不保證 Cloudflare 帳單為零。

管理員驗證失敗的速率限制儲存在單一伺服器程序或 Worker isolate 的記憶體，未跨執行個體共用。R2 的批次移動與刪除也不是交易，遇到部分失敗時可能已有部分項目完成。

## 指令

| 指令 | 用途 |
| --- | --- |
| `npm run dev` | 啟動 Next.js 開發環境 |
| `npm run dev:worker` | 啟動 Workers runtime 開發環境 |
| `npm run typecheck` | 產生 Next 型別並執行 TypeScript 檢查 |
| `npm run test` | 以 Vitest watch mode 執行測試 |
| `npm run test:run` | 執行一次 Vitest 回歸測試 |
| `npm run test:e2e` | 以隔離資料驗證 Next.js 的桌面與手機操作 |
| `npm run test:e2e:worker` | 以隔離資料驗證已建置 Worker 的桌面與手機操作 |
| `npm run check:vinext` | Vinext 相容性檢查 |
| `npm run build` | 建置 Next.js |
| `npm run start` | 啟動已建置的 Next.js 正式服務 |
| `npm run build:worker` | 建置 Workers 產物 |
| `npm run cf-typegen` | 產生 Worker 型別 |
| `npm run verify` | 依序執行型別產生、相容性檢查、型別檢查、測試與兩種建置 |
| `npm run deploy:dry-run` | 建置 Worker 並檢查 Vinext 部署配置，不發佈 |
| `npm run deploy` | 建置並發佈 Worker |

## 驗證與部署

`.github/workflows/verify.yml` 會在針對 `main` 的 Pull Request 與手動觸發時執行 `npm ci`、套件漏洞檢查、`npm run verify` 與兩種 runtime 的 Playwright 測試；它不含部署權限，也不會發佈 Worker。

首次執行瀏覽器測試前，先安裝 Chromium；Worker 測試需要先建置：

```powershell
npx playwright install chromium --only-shell
npm run test:e2e
npm run build:worker
npm run test:e2e:worker
```

測試會在 `127.0.0.1:3100` 啟動獨立服務，使用測試密碼與本機合成媒體。清單、容量與所有 R2 寫入請求都由測試攔截；管理密碼驗證與上傳限制查詢會走本機服務。R2 操作另有模擬 S3 的回歸測試，不會改動正式相簿。

若要額外檢查 Wrangler 對已建置 Worker 的打包與部署配置，可執行：

```powershell
npm run deploy:dry-run
npx wrangler deploy --config dist/server/wrangler.json --dry-run
```

`deploy:dry-run` 中的 Vinext 檢查只確認部署配置；第二個指令才會執行 Wrangler 的打包檢查。兩者都不發佈 Worker，也不能代替部署後的正式環境驗證。

正式環境採 Cloudflare Workers Builds，預期設定如下。這些設定由 Dashboard 管理，儲存庫本身無法保證目前已啟用；啟用 `main` 的自動部署後，推送會透過 `npm run deploy` 發佈 `family-album` Worker。若要確保部署前一定先通過 Verify，請在 GitHub 對 `main` 設定 branch protection，將 Verify 工作流程的 `verify` job 設為 required status check，並禁止直接推送。

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

專案尚未遷移到 `cloudflare.config.ts`，目前沿用 Vinext／Wrangler 的開發與部署流程。Cloudflare 帳號及資源管理優先使用官方 `cf` CLI；若要統一遷移，先執行 `cf migrate --dry-run`，另行完成配置、npm scripts 與 CI 調整及部署驗證。

## 依賴安全修補

直接依賴分為框架與 Workers 整合、R2 的請求簽署與 XML 解析，以及樣式、型別、建置和測試工具。`@vitejs/plugin-react`、`@vitejs/plugin-rsc`、`react-server-dom-webpack` 支援 Vinext／App Router；`@testing-library/dom` 是測試工具的 peer dependency。本機 `fast-glob` 相容層與直接宣告的 `postcss` 同時作為安全覆寫的來源。

`overrides` 將間接 `postcss` 統一到直接宣告的版本，並將 Next.js 的 `sharp` 固定為 `0.35.5`。

`package.json` 保留兩個針對 Vinext 間接依賴的覆寫：

- `satori` 的 `fflate` 使用 0.7.5，修復 ZIP64 解析漏洞並保留 0.7 系列的解壓縮 API。0.8 系列改動了同步解壓縮的第二個參數，不能直接替換。
- `vite-plugin-dynamic-import` 的 `fast-glob` 使用 `vendor/dynamic-import-glob`，只提供該套件實際使用的同步搜尋介面，底層採 `tinyglobby`，避開含有漏洞的 `braces` 依賴。相容性測試涵蓋副檔名選項、資料夾 index，以及動態 `require()` 的建置與執行。

後續升級 Vinext 時，若上游已修補這些依賴，可移除對應覆寫並重新執行漏洞檢查及完整驗證。參考：[braces 漏洞公告](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)、[tinyglobby 遷移指引](https://superchupu.dev/tinyglobby/migration)、[fflate 版本變更](https://github.com/101arrowz/fflate/blob/master/CHANGELOG.md)。

## API

| 方法 | 路徑 | 用途 | 驗證 |
| --- | --- | --- | --- |
| GET | `/api/media?prefix=&limit=&cursor=` | 取得相簿媒體清單；`limit` 可選 1 至 200，回傳 `nextCursor` 供續頁使用 | 公開 |
| POST | `/api/media` | 建立資料夾或驗證管理員 token | `x-admin-token` |
| PATCH | `/api/media` | 重新命名、移動或批次移動 | `x-admin-token` |
| DELETE | `/api/media` | 刪除媒體；刪除資料夾時會將內容上移一層、移除資料夾標記（支援批次） | `x-admin-token` |
| GET | `/api/media/usage` | 取得 bucket 使用量 | `x-admin-token` |
| GET | `/api/upload` | 取得伺服器實際套用的上傳限制 | `x-admin-token` |
| POST | `/api/upload` | 上傳圖片或影片；完整成功為 `201`、部分成功為 `207`、全數寫入失敗為 `502` | `x-admin-token` |
