<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 專案與開發

- 這是公開瀏覽、密碼管理的家庭相簿。維持此存取方式；管理 API 由 `lib/ensure-admin.ts` 驗證 `x-admin-token`。
- 原始碼使用 Next.js App Router 與 React；正式 Worker 透過 Vinext、Vite 和 `@cloudflare/vite-plugin` 建置。Next.js 與 Workers 兩種流程都需保持可用。
- Node 版本依 `.nvmrc`，套件與指令依 `package.json`，環境變數依 `.env.example`、`.dev.vars.example`；操作說明見 `README.md`。
- `app/api/` 處理 API，`lib/r2/` 封裝 S3 操作，`lib/upload/` 共用上傳規則，`components/media/` 與其 hooks 處理相簿互動。限制常數以 `lib/constants.ts`、`lib/upload/constants.ts` 為準。
- 介面使用 Tailwind 與思源黑體（Noto Sans TC），由 `@fontsource/noto-sans-tc` 隨靜態資產部署。保留使用者指定的字型，優先沿用現有元件及共用流程，保持依賴精簡。

## R2 與資料保護

- 未經使用者明確授權，不得新增、移動、覆寫或刪除正式 R2 bucket 內的物件。開發服務使用真實憑證時也會連到正式 R2；本機啟動不代表資料已隔離。
- 驗證使用模擬 S3 或既有 Playwright 隔離資料。不得用正式相簿測試上傳、重新命名、移動或刪除。
- R2 目前透過 `aws4fetch` 簽署 S3 API 請求，沒有原生 R2 binding。保留複製結果驗證、衝突處理與來源刪除順序；批次操作並非交易。
- 不得提交憑證、管理密碼、`.env.local` 或 `.dev.vars`。10 GB 容量條是前端提醒，不能宣稱為伺服器配額或零費用保證。

## Cloudflare 指令

- 帳號與資源管理優先使用官方 `cf` CLI：先 `cf cli search` 查找，再以 `cf schema` 或 `--help` 確認參數。Windows 可使用 `cf.cmd`。
- 專案仍使用 `wrangler.jsonc`。遷移完成前，開發、建置與部署維持現有 Vinext／Wrangler 流程，不可只替換為 `cf dev`、`cf build` 或 `cf deploy`。
- 後續可另行遷移至 `cf`；先執行 `cf migrate --dry-run`，取得遷移授權後才修改配置、依賴、scripts 與 CI，並驗證 bindings、資源 ID、routes、triggers 及建置部署。

## 驗證與文件

- 功能或依賴異動執行 `npm run verify`；介面互動異動另執行 `npm run test:e2e` 與已建置 Worker 的 `npm run test:e2e:worker`。文件異動核對指令、路徑、連結與原始碼即可。
- 保留 `vendor/dynamic-import-glob` 及 `package.json` 的安全覆寫；移除前先確認上游修補並通過相容性測試、`npm audit` 與建置。
- `CLAUDE.md` 引用本檔，共用規則集中於此。保留上方 Next.js 自動維護區塊，避免下次啟動重新產生差異。
- 撰寫或修改 README、文件、PR 描述與提交訊息時使用 `humanizer`；首次使用 skill 前確認來源、版本及上游更新。保留事實與限制，提交訊息使用中文。
- GitHub Verify 只驗證，不部署。Cloudflare Workers Builds 的分支與發佈指令由 Dashboard 管理；本機測試或 dry-run 通過不能視為正式部署已驗證。
