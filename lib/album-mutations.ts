import { DurableObject } from 'cloudflare:workers';
import handler from 'vinext/server/fetch-handler';
import { purgeExpiredTrash } from './r2/trash';

/** One object per album coordinates writes across Worker isolates. */
export class AlbumMutations extends DurableObject<CloudflareEnv> {
  private pending: Promise<unknown> = Promise.resolve();

  private run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(operation);
    // A failed operation must release the next request as well.
    this.pending = result.catch(() => {});
    return result;
  }

  fetch(request: Request): Promise<Response> {
    const execute = () => handler.fetch(request, this.env, this.ctx);
    return isWriteRequest(request) ? this.run(execute) : execute();
  }

  cleanup(): Promise<number> {
    return this.run(() => purgeExpiredTrash());
  }
}

export function isWriteRequest(request: Request): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
}

export function needsMutationCoordinator(request: Request): boolean {
  // Include authenticated reads so auth state and the usage cache stay with writes.
  return isWriteRequest(request) || /^\/api\/(?:upload|trash|media\/usage)\/?$/.test(new URL(request.url).pathname);
}
