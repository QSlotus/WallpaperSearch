// 进程内 TTL 缓存：Serverless 实例之间不共享，但对同一热实例的重复请求有效，
// 能明显减少打向 Steam 的上游请求。用 Map 的插入顺序实现近似 LRU。
class MemoryCache {
  constructor({ ttlMs, maxEntries = 200 } = {}) {
    this.ttlMs = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : 60_000;
    this.maxEntries = maxEntries;
    this.store = new Map();
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.storedAt >= this.ttlMs) {
      this.store.delete(key);
      return undefined;
    }
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key, value) {
    this.store.delete(key);
    this.store.set(key, { value, storedAt: Date.now() });
    while (this.store.size > this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      this.store.delete(oldestKey);
    }
    return value;
  }

  delete(key) {
    return this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }

  get size() {
    return this.store.size;
  }
}

module.exports = { MemoryCache };
