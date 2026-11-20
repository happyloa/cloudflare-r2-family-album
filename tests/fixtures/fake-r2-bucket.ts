// 單元測試用的記憶體 R2 bucket，只實作相簿用到的 binding 方法。物件內容以數字代表大小。
export type FakeR2Call = {
  op: 'list' | 'head' | 'get' | 'put' | 'delete';
  key: string;
  delimiter?: string;
  limit?: number;
  ifNoneMatch?: string | null;
};

type FakeBody = { fakeSource: string };

export class FakeR2Bucket {
  storage = new Map<string, number>();
  contentTypes = new Map<string, string>();
  calls: FakeR2Call[] = [];
  /** 來源在這裡時，get 回報的大小與寫入的不同，模擬複製結果無法確認。 */
  copyFailures = new Set<string>();
  /** 目的地在這裡時，有條件的寫入一律回 null，模擬寫入當下目的地已被占用。 */
  copyConflicts = new Set<string>();
  /** 有條件的寫入前一刻，其他操作先寫入這個目的地。 */
  copyArrivals = new Map<string, number>();
  /** 依序取代下一次 list 的結果，可回傳延遲的 Promise 或丟出錯誤。 */
  listResponses: Array<() => R2Objects | Promise<R2Objects>> = [];

  reset() {
    this.storage.clear(); this.contentTypes.clear(); this.calls.length = 0;
    this.copyFailures.clear(); this.copyConflicts.clear(); this.copyArrivals.clear(); this.listResponses.length = 0;
  }

  async list(options: R2ListOptions = {}): Promise<R2Objects> {
    const prefix = options.prefix ?? '';
    this.calls.push({ op: 'list', key: prefix, delimiter: options.delimiter, limit: options.limit });
    if (this.listResponses.length) return this.listResponses.shift()!();
    const entries: { key: string; size?: number }[] = [];
    const folders = new Set<string>();
    for (const [key, size] of this.storage) {
      if (!key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length);
      if (options.delimiter && rest.includes(options.delimiter)) folders.add(prefix + rest.split(options.delimiter)[0] + options.delimiter);
      else entries.push({ key, size });
    }
    const cursor = options.cursor ?? '';
    const all: { key: string; size?: number }[] = [...entries, ...[...folders].map(key => ({ key }))]
      .sort((a, b) => (a.key < b.key ? -1 : 1))
      .filter(entry => entry.key > cursor);
    const page = all.slice(0, options.limit ?? 1000);
    const truncated = all.length > page.length;
    return {
      objects: page.filter(entry => entry.size !== undefined).map(entry => fakeObject(entry.key, entry.size!)),
      delimitedPrefixes: page.filter(entry => entry.size === undefined).map(entry => entry.key),
      truncated,
      ...(truncated ? { cursor: page.at(-1)!.key } : {}),
    } as R2Objects;
  }

  async head(key: string) {
    this.calls.push({ op: 'head', key });
    return this.storage.has(key) ? fakeObject(key, this.storage.get(key)!) : null;
  }

  async get(key: string) {
    this.calls.push({ op: 'get', key });
    if (!this.storage.has(key)) return null;
    const size = this.storage.get(key)! + (this.copyFailures.has(key) ? 1 : 0);
    return { ...fakeObject(key, size), httpMetadata: { contentType: this.contentTypes.get(key) }, customMetadata: {}, body: { fakeSource: key } };
  }

  async put(key: string, body: unknown, options: R2PutOptions = {}) {
    const ifNoneMatch = options.onlyIf instanceof Headers ? options.onlyIf.get('If-None-Match') : null;
    this.calls.push({ op: 'put', key, ifNoneMatch });
    if (this.copyArrivals.has(key)) { this.storage.set(key, this.copyArrivals.get(key)!); this.copyArrivals.delete(key); }
    if (ifNoneMatch === '*' && (this.copyConflicts.has(key) || this.storage.has(key))) return null;
    const source = (body as FakeBody | null)?.fakeSource;
    const size = source !== undefined ? this.storage.get(source)!
      : body instanceof Blob ? body.size
      : body instanceof Uint8Array ? body.byteLength : 0;
    this.storage.set(key, size);
    const contentType = (options.httpMetadata as R2HTTPMetadata | undefined)?.contentType;
    if (contentType) this.contentTypes.set(key, contentType);
    return fakeObject(key, size);
  }

  async delete(keys: string | string[]) {
    for (const key of [keys].flat()) { this.calls.push({ op: 'delete', key }); this.storage.delete(key); }
  }
}

function fakeObject(key: string, size: number) {
  return { key, size, uploaded: new Date('2026-10-01T00:00:00Z') } as R2Object;
}
