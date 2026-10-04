/** 顯示原始檔名，隱藏上傳時用於避免同名覆蓋的識別碼。 */
export function getMediaName(key: string) {
  const name = key.split('/').pop() ?? key;
  return name.replace(/^\d{13}-(?:[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}-)?/i, '');
}
