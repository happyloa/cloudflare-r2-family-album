// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { getTrashRetentionDays, parseTrashKey } from '@/lib/trash-policy';

describe('trash retention policy', () => {
  it('defaults to fifteen days and rejects invalid values instead of shortening retention', () => {
    expect(getTrashRetentionDays('')).toBe(15);
    expect(getTrashRetentionDays('30')).toBe(30);
    for (const value of ['0', '-1', '1.5', '15days', '366']) expect(() => getTrashRetentionDays(value)).toThrow();
  });
  it('only accepts valid internal entries with safe original paths and consistent times', () => {
    const key = '.family-album-trash/1793181600000/1791885600000-01234567-1234-4234-8234-012345678901/trip/photo.jpg';
    expect(parseTrashKey(key)?.originalKey).toBe('trip/photo.jpg');
    for (const invalid of ['photo.jpg', key.replace('1793181600000', '1791885600000'), key.replace('trip/photo.jpg', '../photo.jpg'), key.replace('trip/photo.jpg', '.family-album-trash/file.jpg')]) expect(parseTrashKey(invalid)).toBeNull();
  });
});
