# Family Album

家庭相簿：資料夾、媒體預覽、上傳、重新命名、移動與垃圾桶。瀏覽公開，管理需要密碼。

使用 React、Vinext、Vite、Cloudflare Workers 與 R2 binding（`ALBUM_BUCKET`）。

## 開發

使用 `.nvmrc` 的 Node 24.21.0：

```powershell
npm ci
Copy-Item .dev.vars.example .dev.vars
npm run dev
```

網址為 `http://localhost:3000`。本機使用模擬 bucket（`.wrangler/state`），不會讀寫正式相簿。

## 設定

`wrangler.jsonc` 將 `ALBUM_BUCKET` 綁定到 `family-album` bucket。其餘設定本機放 `.dev.vars`，正式環境放 Workers Dashboard 的 Variables and Secrets，`ADMIN_ACCESS_TOKEN` 設為 Secret。

| 變數 | 用途／預設值 |
| --- | --- |
| `R2_PUBLIC_BASE` | 必填，R2 公開網域或自訂媒體網域 |
| `ADMIN_ACCESS_TOKEN` | 必填，管理密碼 |
| `ADMIN_RATE_LIMIT_MAX_FAILURES` | 單一 IP 在 5 分鐘內的驗證失敗上限，預設 5 次 |
| `MAX_IMAGE_SIZE_MB` | 圖片單檔上限，預設 10、最高 32 |
| `MAX_VIDEO_SIZE_MB` | 影片單檔上限，預設與最高皆為 32 |
| `TRASH_RETENTION_DAYS` | 垃圾桶保留天數，預設 15，可設 1–365，只套用到之後移入的媒體。設定無效時，刪除媒體與垃圾桶會失敗 |

## 指令

| 指令 | 用途 |
| --- | --- |
| `npm run dev` | 開發服務 |
| `npm run build` | 建置 Worker |
| `npm run start` | 讀取 `.dev.vars`，本機預覽已建置 Worker |
| `npm run typecheck` | Worker 型別、Vinext 路由型別與 TypeScript 檢查 |
| `npm run verify` | 相容性、型別、單元測試、建置與 Worker 整合測試 |
| `npm run test:e2e` | 開發模式桌面／手機 E2E |
| `npm run test:e2e:worker` | 已建置 Worker 的桌面／手機 E2E |
| `npm run deploy:dry-run` | 建置並檢查部署配置，不發佈 |
| `npm run deploy` | 建置並發佈 Worker |

## 驗證與部署

```powershell
npx playwright install chromium --only-shell
npm audit
npm run verify
npm run test:e2e
npm run test:e2e:worker
```

測試只用模擬 R2 與假密碼。E2E 結果在 `.cache/playwright-results/`，CI 失敗時上傳為 `playwright-traces-*` artifact，保留 5 天。

GitHub Verify 只做驗證。推送 `main` 後由 Cloudflare Workers Builds 部署，Dashboard 設定：

- Production branch：`main`
- Root directory、Build command：留空
- Deploy command：`npm run deploy`
- Node：24.21.0

npm 阻擋安裝腳本時，用 `npm install-scripts ls` 檢查再核准；`allowScripts` 只核准 `esbuild` 與 `workerd`。

## 垃圾桶

從管理模式右下角開啟，可預覽、還原或永久刪除媒體。原位置已有同名項目時無法還原。到期項目由每小時排程刪除。

垃圾桶路徑為 `.family-album-trash/`，一般相簿 API 無法存取。保留中的媒體仍計入容量與 R2 用量。

## 使用限制

- 每批最多 20 個檔案、共 32 MiB（以壓縮後大小計）。支援 JPEG、PNG、WebP、GIF、AVIF、HEIC／HEIF、MP4、WebM、QuickTime。
- JPEG 會縮到長邊 1920px 並轉成 WebP，不保留 EXIF。其他格式保留原檔，拍攝位置等中繼資料會一起公開。
- 資料夾最多兩層。每次請求最多移動或刪除 10 項，介面會自動分批。
- 改名或移動超過約 490 個檔案的資料夾可能失敗。
- 刪除資料夾會把內容上移一層，資料夾本身無法還原。
- 10 GB 容量條只是前端提醒，不是伺服器配額或零費用保證。批次操作不是交易，失敗時可能已完成一部分。
- 密碼限速的計數在重新啟動或部署後歸零。
- Workers Free 每日 10 萬次請求，用完後整站要到台灣時間 08:00 才恢復。

## 依賴維護

`package.json` 覆寫 `postcss` 版本，並把 `satori` 的 `fflate` 固定在 0.7.5（升到 0.8 會壞）。移除覆寫前需通過 `npm audit` 與完整驗證。
