# Family Album

一個以 Next.js App Router 打造的家庭相簿，專注於直接管理 Cloudflare R2 的媒體。介面採 Google Drive 風的操作體驗：路徑導覽、多選與批次操作、右鍵選單、拖曳上傳與移動、圖片與影片預覽，並以管理密碼保護寫入操作。

## 特色

- **雙層目錄與年份分組**：資料夾深度上限 2 層、名稱最長 30 字；根目錄依名稱開頭年份自動分組成可收合的手風琴（收合狀態會記住）。
- **管理密碼與節流**：寫入 API 需帶入 `ADMIN_ACCESS_TOKEN`，密碼錯誤會依 IP 進行速率限制（預設 5 次 / 5 分鐘）；密碼輸入採 App 內對話框，錯誤可原地重試。
- **Google Drive 風操作**：多選（hover 核取方塊、Ctrl/Cmd 點選、Shift 範圍選取、手機長按）、右鍵 / ⋮ 溢位選單、批次移動與批次刪除、刪除可在數秒內復原（Undo）。
- **媒體瀏覽體驗**：麵包屑導覽、無限捲動、依名稱 / 日期 / 大小排序、快速搜尋與圖片 / 影片篩選、燈箱預覽含鍵盤左右切換。
- **上傳體驗**：透過「＋ 新增」選單，或把檔案直接拖到頁面任意處即上傳到目前資料夾；前端自動將圖片壓縮為 WebP 並套用時間戳記檔名；工具列即時顯示貯體用量。
- **移動方式**：拖曳到資料夾或「上一層」，或用資料夾選擇器（瀏覽式）挑選目的地。
- **樂觀更新**：移動 / 刪除 / 重新命名會即時反映於畫面，再於背景與 R2 對帳，避免等待感。
- **Session 安全性**：管理模式僅存於 sessionStorage，15 分鐘未操作會自動失效。
- **Cloudflare Pages 友善**：所有 API 以 Edge Runtime 實作，可直接部署到 Pages。

## 專案結構

```
app/                   # Next.js App Router 頁面與 API Routes（Edge Runtime）
  api/media/           # 列表 / 建立 / 重新命名 / 移動 / 刪除（含批次）
  api/media/usage/     # 貯體已使用容量
  api/upload/          # 圖片 / 影片上傳
components/
  MediaGrid.tsx        # 整合各功能的核心元件
  media/               # 媒體 UI：FolderGrid、MediaSection、Toolbar、各 Modal、ContextMenu…
    hooks/             # useMediaData / useAdminAuth / useMediaActions / useMediaDragDrop /
                       # useSelection / useContextMenu / useDialogs / useDropUpload /
                       # useUndoableDelete / useBucketUsage / useLongPress / useMessage
lib/
  r2/                  # Cloudflare R2 操作（core / queries / mutations，使用 aws4fetch）
  constants.ts         # 跨前後端共用的資料夾規則常數（深度 / 名稱長度上限）
  path.ts              # 共用路徑處理（client 與 server 共用）
  ensure-admin.ts      # 管理員身分驗證與 IP 速率限制
  upload/              # 上傳常數與前端壓縮 / 上傳邏輯
```

## 需求與相依

- Node.js 20+ 與 npm
- Next.js 16、React 19、TypeScript、Tailwind CSS 4
- Cloudflare R2（含 Access Key / Secret Key）

## 開發環境設定

1. 安裝套件：
   ```bash
   npm install
   ```
2. 複製並填寫環境變數：
   ```bash
   cp .env.example .env.local
   ```
3. 本機啟動：
   ```bash
   npm run dev
   ```
4. 其他腳本：
   - `npm run build`：產生生產環境建置成果

## 環境變數

| 變數                                                  | 必填 | 說明                                   |
| ----------------------------------------------------- | ---- | -------------------------------------- |
| `R2_ACCOUNT_ID`                                       | ✅   | Cloudflare 帳戶 ID                     |
| `R2_ACCESS_KEY_ID`                                    | ✅   | R2 Access Key                          |
| `R2_SECRET_ACCESS_KEY`                                | ✅   | R2 Secret Key                          |
| `R2_BUCKET_NAME`                                      | ✅   | 儲存媒體的 bucket 名稱                 |
| `R2_PUBLIC_BASE`                                      | ✅   | 公開讀取的基底 URL                     |
| `ADMIN_ACCESS_TOKEN`                                  | ✅   | 管理密碼（最長 15 字）                 |
| `ADMIN_RATE_LIMIT_MAX_FAILURES`                       | ⬜️   | 密碼錯誤嘗試次數（預設 5 次 / 5 分鐘） |
| `MAX_IMAGE_SIZE_MB` / `NEXT_PUBLIC_MAX_IMAGE_SIZE_MB` | ⬜️   | 圖片單檔上限（預設 10MB）              |
| `MAX_VIDEO_SIZE_MB` / `NEXT_PUBLIC_MAX_VIDEO_SIZE_MB` | ⬜️   | 影片單檔上限（預設 150MB）             |

## API 速查

| 方法   | 路徑                 | 用途                                       | 認證            |
| ------ | -------------------- | ------------------------------------------ | --------------- |
| GET    | `/api/media?prefix=` | 取得指定 prefix 的資料夾與媒體清單         | 不需            |
| POST   | `/api/media`         | 建立資料夾 / 驗證管理密碼                   | `x-admin-token` |
| PATCH  | `/api/media`         | 重新命名 / 移動 / 批次移動                 | `x-admin-token` |
| DELETE | `/api/media`         | 刪除 / 批次刪除（檔案或資料夾）            | `x-admin-token` |
| GET    | `/api/media/usage`   | 取得儲存貯體 (Bucket) 已使用容量           | 不需            |
| POST   | `/api/upload`        | 上傳圖片 / 影片                            | `x-admin-token` |

## 部署建議（Cloudflare Pages）

1. 在 Pages 專案設定中新增上述環境變數
2. `next.config.mjs` 已配置 Edge Runtime，無需額外調整
3. 若使用自訂網域，確認 `R2_PUBLIC_BASE` 與實際公開位址一致
