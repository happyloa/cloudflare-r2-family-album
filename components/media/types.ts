// MediaFile / FolderItem / MediaResponse 與 server 端（lib/r2/core.ts）共用同一份定義，
// 避免前後端各自維護一份相同形狀的型別、悄悄跑掉不一致。走 lib/r2 這個公開入口，
// 而不是直接打進內部模組 lib/r2/core，維持 index.ts 是唯一對外邊界。
export type { MediaFile, FolderItem, MediaListing as MediaResponse } from '@/lib/r2';

export type MessageTone = 'info' | 'success' | 'error';
