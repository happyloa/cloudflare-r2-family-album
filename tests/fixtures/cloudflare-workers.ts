// Node unit tests use the same constructor shape; integration tests use workerd.
// Unit tests assign a fake ALBUM_BUCKET here; integration tests use Miniflare's simulated R2.
export const env: Record<string, unknown> = {};

export class DurableObject<Env> {
  constructor(protected ctx: DurableObjectState, protected env: Env) {}
}
