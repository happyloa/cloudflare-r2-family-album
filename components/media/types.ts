// MediaFile / FolderItem / MediaResponse 與 server 端（lib/r2/core.ts）共用同一份定義，
// 避免前後端各自維護一份相同形狀的型別、悄悄跑掉不一致。
export type { MediaFile, FolderItem, MediaListing as MediaResponse } from '@/lib/r2/core';

export type MessageTone = 'info' | 'success' | 'error';
