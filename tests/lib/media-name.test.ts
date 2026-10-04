import { expect, it } from 'vitest';
import { getMediaName } from '@/lib/media-name';

it('displays original names for both legacy and new uploads while preserving ordinary filenames', () => {
  expect(getMediaName('trip/1791115824360-photo.jpg')).toBe('photo.jpg');
  expect(getMediaName('trip/1791115824360-12345678-abcd-4abc-9abc-123456789abc-photo.jpg')).toBe('photo.jpg');
  expect(getMediaName('trip/20261004-photo.jpg')).toBe('20261004-photo.jpg');
});
