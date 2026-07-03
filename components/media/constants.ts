// 資料夾規則常數的來源已移至 lib/constants（server 端邏輯也會用到），這裡轉發維持既有引用路徑。
export { MAX_FOLDER_DEPTH, MAX_FOLDER_NAME_LENGTH } from '@/lib/constants';

export const MAX_ADMIN_TOKEN_LENGTH = 15;
export const ADMIN_TOKEN_STORAGE_KEY = 'adminToken';
export const ADMIN_SESSION_DURATION_MS = 15 * 60 * 1000; // 15 分鐘，避免管理模式一直保持開啟
