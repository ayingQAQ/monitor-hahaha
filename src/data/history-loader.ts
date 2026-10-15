import { api } from "./api";
import { historyCache } from "./history-cache";
import { normalizeHistory, type History } from "./history";

type Kind = "metrics" | "ping";
type Lease = { promise: Promise<History>; release: () => void };
type Request = { controller: AbortController; refs: number; settled: boolean; promise: Promise<History> };
const pending = new Map<string, Request>();
let warmed: { path: string; lease: Lease } | null = null;

export function historyPath(id: number, hours: number, kind: Kind) {
  const width = typeof innerWidth === "number" ? innerWidth : 720;
  return `/nodes/${id}/metrics?hours=${hours}&points=${Math.max(60, Math.min(720, Math.round(width)))}&series=${kind}`;
}

// A preload and an open page share one request. Release only cancels a request
// when nobody needs it; a microtask also allows React StrictMode to reacquire it.
export function acquireHistory(path: string, kind: Kind): Lease {
  const cached = historyCache.get(path);
  if (cached) return { promise: Promise.resolve(cached), release() {} };
  let entry = pending.get(path);
  if (!entry) {
    const current: Request = { controller: new AbortController(), refs: 0, settled: false, promise: null! };
    entry = current;
    pending.set(path, current);
    current.promise = api<unknown>(path, current.controller.signal)
      .then(data => {
        if (current.controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
        const safe = normalizeHistory(data, kind);
        const hours = Number(new URLSearchParams(path.split("?")[1]).get("hours"));
        historyCache.set(path, safe, Date.now(), hours >= 168 ? 120_000 : 30_000);
        return safe;
      })
      .finally(() => {
        current.settled = true;
        if (pending.get(path) === current) pending.delete(path);
      });
  }
  const current = entry;
  current.refs++;
  let released = false;
  return {
    promise: current.promise,
    release() {
      if (released) return;
      released = true;
      current.refs--;
      queueMicrotask(() => {
        if (!current.refs && !current.settled) {
          current.controller.abort();
          if (pending.get(path) === current) pending.delete(path);
        }
      });
    },
  };
}

// Speculate only for the entry the visitor is interacting with, never the list.
export function warmHistory(id: number, kind: Kind = "metrics", hours = 1) {
  if (typeof document !== "undefined" && document.hidden) return;
  const path = historyPath(id, hours, kind);
  if (warmed?.path === path) return;
  warmed?.lease.release();
  warmed = null;
  if (historyCache.get(path)) return;
  const lease = acquireHistory(path, kind);
  warmed = { path, lease };
  void lease.promise.catch(() => {}).finally(() => {
    lease.release();
    if (warmed?.lease === lease) warmed = null;
  });
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { warmed?.lease.release(); warmed = null; }
  });
}
