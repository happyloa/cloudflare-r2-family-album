/** 上傳時加在檔名前、用於避免同名覆蓋的識別碼（13 位上傳時間，加上可選的 UUID）。 */
export const UPLOAD_ID_PREFIX = /^\d{13}-(?:[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}-)?/i;

/** 顯示原始檔名，隱藏上傳時用於避免同名覆蓋的識別碼。 */
export function getMediaName(key: string) {
  const name = key.split('/').pop() ?? key;
  return name.replace(UPLOAD_ID_PREFIX, '');
}
