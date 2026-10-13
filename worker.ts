import handler from 'vinext/server/fetch-handler';
import { purgeExpiredTrash } from './lib/r2/trash';
export * from 'vinext/server/fetch-handler';

export default {
  fetch: handler.fetch,
  async scheduled() {
    const deleted = await purgeExpiredTrash();
    console.log(JSON.stringify({ event: 'trash_cleanup', deleted }));
  },
};
