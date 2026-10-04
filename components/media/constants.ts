// A token must fit safely in an HTTP request header. This avoids rejecting
// normal generated secrets (which are commonly 32–256 characters long).
export const MAX_ADMIN_TOKEN_LENGTH = 4096;
export const ADMIN_TOKEN_STORAGE_KEY = 'adminToken';
export const ADMIN_SESSION_DURATION_MS = 15 * 60 * 1000; // 15 分鐘，避免管理模式一直保持開啟
