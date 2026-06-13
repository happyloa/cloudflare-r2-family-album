// 路徑處理函式統一由 lib/path 提供（client 與 server 共用），此處重新匯出維持既有引用路徑
export { sanitizeName, sanitizePath, getDepth } from '@/lib/path';
