import handler from 'vinext/server/fetch-handler';
import { AlbumMutations, needsMutationCoordinator } from './lib/album-mutations';
export * from 'vinext/server/fetch-handler';
export { AlbumMutations };

type WorkerEnv = Omit<CloudflareEnv, 'ALBUM_MUTATIONS'> & {
  ALBUM_MUTATIONS: DurableObjectNamespace<AlbumMutations>;
};

export default {
  fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext) {
    if (needsMutationCoordinator(request)) {
      return env.ALBUM_MUTATIONS.getByName('album').fetch(request);
    }
    return handler.fetch(request, env, ctx);
  },
  async scheduled(_controller: ScheduledController, env: WorkerEnv) {
    const deleted = await env.ALBUM_MUTATIONS.getByName('album').cleanup();
    console.log(JSON.stringify({ event: 'trash_cleanup', deleted }));
  },
};
