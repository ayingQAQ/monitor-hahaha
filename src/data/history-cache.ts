import type { History } from './history';

// Session-only LRU. Bounds account for the serialized data and expire quickly.
export class HistoryCache {
  private entries = new Map<string, {data: History; expires: number; bytes: number}>();
  private ttl: number;
  private limit: number;
  private budget: number;
  constructor(ttl = 30_000, limit = 8, budget = 2 * 1024 * 1024) {this.ttl=ttl;this.limit=limit;this.budget=budget;}
  get(key: string, now = Date.now()): History | null {
    for (const [id, entry] of this.entries) if (entry.expires <= now) this.entries.delete(id);
    const entry = this.entries.get(key);
    if (!entry) return null;
    this.entries.delete(key); this.entries.set(key, entry);
    return entry.data;
  }
  set(key: string, data: History, now = Date.now()) {
    this.entries.delete(key);
    const bytes = JSON.stringify(data).length * 2;
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
