// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { createLimitedRequest } from '@/lib/upload/body-limit';

describe('createLimitedRequest', () => {
  it('preserves a body that is within the configured byte limit', async () => {
    const original = new Request('https://example.test/upload', {
      method: 'POST',
      body: new Uint8Array([1, 2, 3, 4]),
    });
    const limited = createLimitedRequest(original, 4);

    expect(new Uint8Array(await limited.request.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3, 4]),
    );
    expect(limited.didExceedLimit()).toBe(false);
  });

  it('cancels a body that exceeds the configured byte limit', async () => {
    const original = new Request('https://example.test/upload', {
      method: 'POST',
      body: new Uint8Array([1, 2, 3, 4, 5]),
    });
    const limited = createLimitedRequest(original, 4);

    await expect(limited.request.arrayBuffer()).rejects.toThrow(
      'Request body exceeded upload limit',
    );
    expect(limited.didExceedLimit()).toBe(true);
  });
});
