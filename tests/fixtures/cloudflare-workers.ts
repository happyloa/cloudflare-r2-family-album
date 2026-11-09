// Node unit tests use the same constructor shape; integration tests use workerd.
export class DurableObject<Env> {
  constructor(protected ctx: DurableObjectState, protected env: Env) {}
}
