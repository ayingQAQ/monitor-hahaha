import type { History } from './history';

// Session-only LRU. Bounds estimate retained objects and expire quickly.
export class HistoryCache {
  private entries = new Map<string, {data: History; expires: number; bytes: number}>();
  private ttl: number;
  private limit: number;
  private budget: number;
  constructor(ttl = 30_000, limit = 4, budget = 1024 * 1024) {this.ttl=ttl;this.limit=limit;this.budget=budget;}
  clear() {this.entries.clear();}
  get(key: string, now = Date.now()): History | null {
    for (const [id, entry] of this.entries) if (entry.expires <= now) this.entries.delete(id);
    const entry = this.entries.get(key);
    if (!entry) return null;
    this.entries.delete(key); this.entries.set(key, entry);
    return entry.data;
  }
  set(key: string, data: History, now = Date.now()) {
    this.entries.delete(key);
    // Conservative object estimate without allocating a serialized copy.
    const bytes = data.metrics.reduce((sum,row) => sum + 64 + Object.keys(row).length * 24, 0)
      + data.ping.length * 136
      + Object.entries(data.probes).reduce((sum,[id,name]) => sum + 64 + (id.length + name.length) * 2, 0)
      + Object.keys(data.loss).length * 48 + 128;
    if (bytes > this.budget || data.metrics.length + data.ping.length > 6000) return;
    this.entries.set(key, {data, expires: now + this.ttl, bytes});
    let total = [...this.entries.values()].reduce((sum,e) => sum + e.bytes, 0);
    while (this.entries.size > this.limit || total > this.budget) {
      const oldest = this.entries.keys().next().value!;
      total -= this.entries.get(oldest)!.bytes; this.entries.delete(oldest);
    }
  }
}
export const historyCache = new HistoryCache();
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) historyCache.clear();
  });
}
