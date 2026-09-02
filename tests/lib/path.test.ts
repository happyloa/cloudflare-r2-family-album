import { describe, expect, it } from 'vitest';

import {
  getDepth,
  hasPeriodOnlyPathSegment,
  isPeriodOnlyPathSegment,
  sanitizeName,
  sanitizePath,
} from '@/lib/path';

describe('path helpers', () => {
  it('removes characters that cannot be used in a single name', () => {
    expect(sanitizeName('  夏日:旅行/照片?  ')).toBe('夏日旅行照片');
  });

  it('sanitizes every path segment without keeping empty segments', () => {
    expect(sanitizePath('  2026 / 夏日:旅行 / / 海邊?.jpg ')).toBe(
      '2026/夏日旅行/海邊.jpg',
    );
  });

  it('recognizes period-only segments without rejecting ordinary dots', () => {
    expect(isPeriodOnlyPathSegment('.')).toBe(true);
    expect(isPeriodOnlyPathSegment(' .. ')).toBe(true);
    expect(isPeriodOnlyPathSegment('photo.jpg')).toBe(false);
  });

  it('detects unsafe segments anywhere in a stored key', () => {
    expect(hasPeriodOnlyPathSegment('album/../photo.jpg')).toBe(true);
    expect(hasPeriodOnlyPathSegment('album/2026/photo.jpg')).toBe(false);
  });

  it('counts only non-empty path segments', () => {
    expect(getDepth('/2026//summer/')).toBe(2);
    expect(getDepth('')).toBe(0);
  });
});
