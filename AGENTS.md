<!-- BEGIN:nextjs-agent-rules -->

本專案使用 Vinext 的 Next.js 相容 API，未安裝 `next`。修改框架相關程式前，查閱 `node_modules/vinext/README.md`、已安裝的 shims／types 與官方文件。

<!-- END:nextjs-agent-rules -->

## 開發

- 公開瀏覽、密碼管理；管理 API 必須由 `lib/ensure-admin.ts` 驗證 `x-admin-token`。
- React／App Router 由 Vinext、Vite 與 Cloudflare Vite plugin 執行。開發及建置均使用 Workers runtime，不要重新加入 `next`；型別由 `vinext typegen` 與 `vinext/types` 提供。
- Node 版本依 `.nvmrc`，指令依 `package.json`，環境設定依 `.dev.vars.example`，操作說明見 `README.md`。
- 沿用 `app/api/`、`lib/r2/`、`lib/upload/`、`components/media/` 的共用流程；限制以 `lib/constants.ts`、`lib/upload/constants.ts` 為準。
- 保留思源黑體（Noto Sans TC）與既有元件，依賴保持精簡。

## R2 與驗證

- 未經明確授權，不得新增、移動、覆寫或刪除正式 R2 物件。本機服務使用真實憑證時也會連到正式 bucket。
- 測試使用模擬 S3、固定假憑證與隔離資料，不得拿正式相簿測試寫入。
- R2 使用 `aws4fetch` 簽署 S3 請求，沒有原生 binding；保留複製結果驗證、衝突處理與確認複製後才刪除來源的順序。批次操作不是交易。
- 不得提交憑證、管理密碼、`.env.local` 或 `.dev.vars`。10 GB 容量條只是前端提醒，不能宣稱為伺服器配額或零費用保證。
- 功能／依賴異動執行 `npm run verify`；框架或互動異動另跑 `npm run test:e2e` 與 `npm run test:e2e:worker`。文件核對指令、路徑、連結與實作。
- 保留 `vendor/dynamic-import-glob` 與安全覆寫，移除前確認上游修補並通過相容性測試、`npm audit` 與建置。

## Cloudflare 與文件

- 資源管理優先使用官方 `cf`（Windows 用 `cf.cmd`）；先 `cf cli search`，再用 `cf schema` 或 `--help` 確認參數。
- 專案仍使用 `wrangler.jsonc`，開發／建置／部署維持 Vinext／Wrangler。遷移 `cf` 需先 `cf migrate --dry-run`，取得遷移授權後才更新配置、依賴、scripts 與 CI，並驗證 bindings、資源 ID、routes、triggers 與部署流程。
- GitHub Verify 不部署；Workers Builds 由 Dashboard 管理。本機測試或 dry-run 不能視為正式環境驗證。
- README、文件與提交訊息使用 `humanizer`；首次使用 skill 前確認來源、版本及上游更新。保留事實與限制，提交訊息使用中文。
- `CLAUDE.md` 引用本檔，共用規則集中於此。
