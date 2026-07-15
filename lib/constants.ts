// 前後端共用的資料夾規則常數（server 端 lib/r2、API route 與前端元件都會用到）

export const MAX_FOLDER_DEPTH = 2;
export const MAX_FOLDER_NAME_LENGTH = 30;

// 貯體容量上限（純前端顯示用：上傳前的超額提示、容量條）。這是單一事實來源，
// UsageBar 與 useDropUpload 都從這裡引用，避免兩處各自寫死同一個數字。
export const BUCKET_LIMIT_BYTES = 10 * 1024 * 1024 * 1024; // 10GB
