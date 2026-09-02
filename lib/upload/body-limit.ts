export type LimitedRequest = {
  request: Request;
  didExceedLimit: () => boolean;
};

/**
 * 將 request body 包成有位元組上限的 stream。即使呼叫端沒有送 Content-Length，
 * FormData parser 也不會讀取超過指定大小的資料。
 */
export function createLimitedRequest(
  request: Request,
  maxBytes: number,
): LimitedRequest {
  if (!request.body) {
    return { request, didExceedLimit: () => false };
  }

  const reader = request.body.getReader();
  let receivedBytes = 0;
  let didExceedLimit = false;

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }

        receivedBytes += value.byteLength;
        if (receivedBytes > maxBytes) {
          didExceedLimit = true;
          await reader.cancel('Request body exceeded upload limit');
          controller.error(new Error('Request body exceeded upload limit'));
          return;
        }

        controller.enqueue(value);
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel(reason) {
      await reader.cancel(reason);
    },
  });

  const headers = new Headers(request.headers);
  headers.delete('content-length');
  const init = {
    method: request.method,
    headers,
    body,
    signal: request.signal,
    // Node 的 Fetch 實作要求串流 request body 明示 duplex；Workers 會忽略此 Web 相容擴充欄位。
    duplex: 'half',
  } as RequestInit;

  return {
    request: new Request(request.url, init),
    didExceedLimit: () => didExceedLimit,
  };
}
