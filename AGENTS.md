<!-- BEGIN:nextjs-agent-rules -->

本專案使用 Vinext 的 Next.js 相容 API，未安裝 `next`。修改框架相關程式前，查閱 `node_modules/vinext/README.md`、已安裝的 shims／types 與官方文件。

<!-- END:nextjs-agent-rules -->

## 開發

- 管理 API 必須由 `lib/ensure-admin.ts` 驗證 `x-admin-token`。
- 開發與建置都在 Workers runtime（Vinext、Vite、Cloudflare Vite plugin）。不要加入 `next`；型別由 `vinext typegen` 與 `vinext/types` 提供。
- Node 版本依 `.nvmrc`，指令依 `package.json`，環境設定依 `.dev.vars.example`。
- 沿用 `app/api/`、`lib/r2/`、`lib/upload/`、`components/media/` 的共用流程；限制以 `lib/constants.ts`、`lib/upload/constants.ts` 為準。
- 介面維持深色、思源黑體（Noto Sans TC）與以照片為主的攝影集版面，工具列保持精簡。

## R2

- 未經明確授權，不得新增、移動、覆寫或刪除正式 R2 物件。本機開發與測試只用模擬 bucket，不得為 `ALBUM_BUCKET` 加上 `remote: true`。
- R2 透過 `ALBUM_BUCKET` binding 存取（`lib/r2/core.ts`）。複製是 `get` 後以 `onlyIf: If-None-Match: *` 的 `put` 寫入；保留大小驗證與衝突處理，確認複製後才刪除來源。批次操作不是交易。
- `.family-album-trash/` 是保留路徑，一般 API 不得操作。到期時間在移入時決定，改保留天數不追溯；`worker.ts` 每小時只清理有效且到期的項目。
- 不得提交管理密碼、`.env.local` 或 `.dev.vars`。10 GB 容量條不能宣稱為伺服器配額或零費用保證。

## 驗證

- 功能或依賴異動跑 `npm run verify`；框架或互動異動另跑 `npm run test:e2e` 與 `npm run test:e2e:worker`。
- 文件要核對指令、路徑、連結與實作。
- 保留 `postcss`、`satori/fflate` 與 `undici` 覆寫，移除前確認上游修補並通過 `npm audit` 與建置。

## Cloudflare 與文件

- 資源管理優先用 `cf`（Windows 用 `cf.cmd`）：先 `cf cli search`，再以 `cf schema` 或 `--help` 確認參數。
- 開發、建置與部署維持 `wrangler.jsonc` 與 Vinext／Wrangler。遷移到 `cf` 要先跑 `cf migrate --dry-run` 並取得授權，再更新配置、依賴、scripts 與 CI，並驗證 bindings、資源 ID、routes、triggers 與部署。
- GitHub Verify 不部署，Workers Builds 由 Dashboard 管理。本機測試或 dry-run 不算正式環境驗證。
- README、文件與提交訊息使用 `humanizer`（使用前確認版本與上游更新），保留事實與限制；提交訊息用中文。
- `CLAUDE.md` 只引用本檔。
