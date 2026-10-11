import { startTransition, useEffect, useState } from "react";

export type Metrics = {
  uptime: number;
  cpu: number;
  load: [number, number, number];
  mem_total: number;
  mem_used: number;
  swap_total: number;
  swap_used: number;
  disk_total: number;
  disk_used: number;
  net_rx: number;
  net_tx: number;
  total_rx: number;
  total_tx: number;
  month_rx: number;
  month_tx: number;
  tcp: number;
  udp: number;
  procs: number;
};

export type Node = {
  id: number;
  name: string;
  sort: number;
  public: boolean;
  online: boolean;
  /** ISO 3166-1 alpha-2, or empty when the hub could not locate the address. */
  country: string;
  /** Set by the operator; empty is ungrouped. Absent from a hub predating groups. */
  group?: string;
  public_remark?: string;
  last_seen: number;
  /** Seconds since `last_seen` on the hub's clock, null for a node never seen. Absent on older hubs. */
  last_seen_ago?: number | null;
  metrics: Metrics | null;
  metrics_invalid?: boolean;
  os: string;
  kernel: string;
  arch: string;
  virt: string;
  cpu_name: string;
  cpu_cores: number;
  mem_total: number;
  swap_total: number;
  disk_total: number;
  agent_version: string;
  price: number;
  currency: string;
  billing_cycle: string;
  expires_at: string | null;
  /**
   * Days until `expires_at` on the hub's calendar, negative once past, null
   * without a date. Absent on older hubs.
   */
  expires_in?: number | null;
  traffic_limit: number;
  traffic_mode: string;
  traffic_reset_day: number;
  total_rx: number;
  total_tx: number;
  month_rx: number;
  month_tx: number;
  /** This period's usage as the plan meters it (`traffic_mode`). Absent on older hubs. */
  month_used?: number;
  month_start: string;
  day_rx: number;
  day_tx: number;
  /** Panel only. */
  hostname?: string;
  ip?: string;
  remark?: string;
};

/** Every group in use, in the order of the first node carrying it: the operator's node order decides the tab order. */
export function groupsOf(nodes: Pick<Node, "group">[]): string[] {
  return [...new Set(nodes.map((n) => n.group ?? "").filter(Boolean))];
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Every error the hub answers is one line of plain text written for the reader.
 * Anything else came from something in front of it -- a proxy's error page, a
 * CDN's challenge, an empty 502 -- and is described by its status instead.
 */
async function failure(res: Response): Promise<ApiError> {
  const text = res.headers.get("content-type")?.startsWith("text/plain")
    ? (await res.text()).trim()
    : "";
  return new ApiError(
    res.status,
    text ||
      (res.status >= 500
        ? `服务暂时无法访问（HTTP ${res.status}），稍后再试`
        : `请求被拦截（HTTP ${res.status}），稍后再试`),
  );
}

/**
 * How long one attempt may go unanswered. A connection that died without
 * closing, as when a NAT on a phone's path forgets it, holds a request sent over
 * it until TCP gives up: still pending after 300 s in Chrome over HTTP/1.1,
 * which nginx serves unless configured for HTTP/2. Over HTTP/2 Chrome replaces
 * the dead connection after 10 s itself, but only for a request sent once the
 * connection has been idle 10 s; one sent sooner hangs as over HTTP/1.1.
 * Healthy, the slowest request here, a node's history, answers within 3 s on 4G.
 */
const TIMEOUT = 20_000;

/**
 * Further attempts after a timeout. The aborted connection is closed, but the
 * next attempt takes the next idle one, which may be dead as well: Chrome keeps
 * up to six per host, and with four dead the fifth attempt was the first to
 * succeed. Every request here is a GET, so repeating one is safe.
 */
const RETRIES = 6;

export async function api<T>(path: string, signal?: AbortSignal): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(`/api${path}`, {
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT)]) : AbortSignal.timeout(TIMEOUT),
      });
      if (!res.ok) throw await failure(res);
      if (res.status === 204) return undefined as T;
      // A 200 carrying HTML is a proxy's page, not the hub's JSON.
      return (await res.json().catch((e) => {
        throw e instanceof SyntaxError
          ? new ApiError(res.status, "收到的不是状态数据，稍后再试")
          : e;
      })) as T;
    } catch (e) {
      if (signal?.aborted) throw e;
      if (e instanceof ApiError) throw e;
      // Anything else failed on the network, the body's read included, where
      // the timeout also applies. Chrome names a timeout before the response
      // TimeoutError and one during the body's read AbortError; nothing else
      // here aborts a request unless the caller supplied a cancellation signal.
      const timedOut =
        e instanceof Error &&
        (e.name === "TimeoutError" || e.name === "AbortError");
      if (!timedOut || attempt === RETRIES) {
        throw new ApiError(0, "网络连接失败，稍后再试");
      }
    }
  }
}

/**
 * Throughput, one sample per push, as a series for every node (null) and one per
 * group ("" for the ungrouped), so the summary above a group tab draws that
 * group's line rather than the fleet's. Held beside the stream that feeds it
 * rather than in the tile that draws it: the summary unmounts while a node page
 * is open, so a buffer held there would restart empty on every return. Two
 * minutes at the hub's push interval; a group no node carries any more is
 * dropped. Keyed null rather than by any string, since a group may be named
 * anything, "*" included.
 */
const KEEP = 60;
export const speedHistory = new Map<
  string | null,
  { rx: number; tx: number }[]
>();

export function sample(nodes: Node[]) {
  const totals = new Map<string | null, { rx: number; tx: number }>();
  for (const n of nodes) {
    for (const key of [null, n.group ?? ""]) {
      const total = totals.get(key) ?? { rx: 0, tx: 0 };
      if (n.online && n.metrics) {
        total.rx += n.metrics.net_rx;
        total.tx += n.metrics.net_tx;
      }
      totals.set(key, total);
    }
  }
  for (const key of speedHistory.keys())
    if (!totals.has(key)) speedHistory.delete(key);
  for (const [key, total] of totals) {
    const series = speedHistory.get(key) ?? [];
    series.push(total);
    if (series.length > KEEP) series.shift();
    speedHistory.set(key, series);
  }
}

/** A malformed report must not remove every other node from the page. */
export function safeNodes(nodes: Node[]): Node[] {
  if (!Array.isArray(nodes))
    throw new ApiError(200, "收到的不是状态数据，稍后再试");
  const number = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0;
  const fields = [
    "uptime",
    "cpu",
    "mem_total",
    "mem_used",
    "swap_total",
    "swap_used",
    "disk_total",
    "disk_used",
    "net_rx",
    "net_tx",
    "total_rx",
    "total_tx",
    "month_rx",
    "month_tx",
    "tcp",
    "udp",
    "procs",
  ] as const;
  return nodes.map((node) => {
    const m = node.metrics;
    return !m ||
      (fields.every((key) => number(m[key])) &&
        Array.isArray(m.load) &&
        m.load.length === 3 &&
        m.load.every(number))
      ? node
      : { ...node, metrics: null, metrics_invalid: true };
  });
}

/**
 * Asks the hub to gzip each pushed frame, sent then as a binary message: a
 * hundred reporting nodes are about 110 KB of JSON every two seconds, 15 KB
 * compressed. Only where the browser can decompress it; a hub that predates the
 * parameter ignores it and sends text, which [frameText] passes through.
 */
const GZIP = typeof DecompressionStream === "function" ? "?gzip" : "";

/** A pushed frame as text: a gzipped one arrives as binary. */
const frameText = (data: string | Blob) =>
  typeof data === "string"
    ? data
    : new Response(
        data.stream().pipeThrough(new DecompressionStream("gzip")),
      ).text();

/**
 * Live node list. Uses the WebSocket the hub pushes every two seconds, falling
 * back to polling if it cannot be established.
 */
export function useNodes() {
  const [nodes, setNodes] = useState<Node[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Set when the hub answers 401: the status page has been closed to anonymous
  // callers since this tab loaded. The hub also ends the stream, so this surfaces
  // on the fallback fetch the reconnect starts; a close allows a client to
  // re-query its state but cannot compel it.
  const [closed, setClosed] = useState(false);
  const [connectionRevision, setConnectionRevision] = useState(0);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let silent: ReturnType<typeof setTimeout> | null = null;

    // Set by `resume`. The throughput line is drawn by position, one point per
    // push, so the samples from before the page was hidden, or the stream went
    // silent, would join the new ones as if no time had passed in between. They
    // are dropped on the first arrival rather than at once, which would read as
    // 0 B/s beside figures that are merely stale.
    let gap = false;
    // A slow REST response must not replace a snapshot received since it began.
    let revision = 0;
    const receive = (list: Node[]) => {
      const safe = safeNodes(list);
      revision++;
      if (gap) speedHistory.clear();
      gap = false;
      sample(safe);
      // Live snapshots must yield to taps and navigation on slower devices.
      startTransition(() => setNodes(safe));
      setError(null);
      setClosed(false);
    };

    // Bumped by `pause`: a request started before the page was hidden may fail
    // or land after a fresh one, and neither result describes the page now.
    let epoch = 0;
    const fetchOnce = () => {
      const started = epoch;
      const startedRevision = revision;
      return api<{ nodes: Node[] }>("/nodes")
        .then((d) => {
          if (started === epoch && startedRevision === revision)
            receive(d.nodes);
        })
        .catch((e: Error) => {
          if (started !== epoch) return;
          // A request lost on a dead pooled connection says nothing of an open
          // stream, whose own watchdog reports it going quiet.
          if (
            e instanceof ApiError &&
            e.status === 0 &&
            socket?.readyState === WebSocket.OPEN
          )
            return;
          setError(e.message);
          if (e instanceof ApiError && e.status === 401) setClosed(true);
        });
    };

    const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws${GZIP}`;
    // A hub restart closes every stream. Without reconnecting, a page that
    // outlives a deploy would remain on the fallback poll for the rest of its
    // life, refreshing every 5 seconds rather than 2 with no indication.
    const connect = () => {
      let opened: WebSocket;
      try {
        opened = new WebSocket(url);
      } catch {
        poll ??= setInterval(fetchOnce, 5000);
        return;
      }
      socket = opened;
      // Re-armed by every frame read. Five of the hub's two-second pushes without one
      // mean the connection died without closing, as when a NAT on the path
      // forgets it or the hub's machine drops off the network; the browser sends
      // nothing on it and would notice only when TCP keepalive gives up, 450 s
      // later in Chrome. The stream is replaced rather
      // than closed and awaited: on a dead connection the close event arrives
      // only after the 60 s closing handshake times out. The notice stays until
      // data arrives, since with no network the fetch started alongside may hang
      // rather than fail.
      const watch = () => {
        if (silent) clearTimeout(silent);
        silent = setTimeout(() => {
          setError("实时数据中断，正在重新连接");
          resume();
        }, 10_000);
      };
      watch();
      // In arrival order: a gzipped frame decodes asynchronously, and one that
      // finishes after this stream closed or was replaced describes nothing
      // current. Only a frame that reads re-arms the watchdog, so a stream whose
      // frames cannot be read counts as silent and is replaced.
      let decoded = Promise.resolve();
      opened.onmessage = (event) => {
        decoded = decoded
          .then(async () => {
            const nodes = JSON.parse(await frameText(event.data)).nodes;
            if (opened.readyState !== WebSocket.OPEN) return;
            receive(nodes);
            watch();
            // The stream has returned; the poll was only covering for it.
            if (poll) {
              clearInterval(poll);
              poll = null;
            }
          })
          .catch((e) => console.warn("live frame dropped:", e));
      };
      opened.onerror = () => opened.close();
      opened.onclose = () => {
        if (silent) clearTimeout(silent);
        poll ??= setInterval(fetchOnce, 5000);
        retry = setTimeout(connect, 5000);
      };
    };

    // A phone suspends a page it sends to the background and drops its
    // connections without telling it. Back in front, the socket may still read
    // as open while nothing arrives, or close and wait out the retry, either
    // way leaving the figures from before; a request caught in flight fails.
    // So a hidden page lets go of the stream and starts nothing, and a visible
    // one fetches at once and opens a fresh stream.
    const pause = () => {
      epoch++;
      if (socket) {
        socket.onclose = null;
        socket.close();
        socket = null;
      }
      if (poll) clearInterval(poll);
      if (retry) clearTimeout(retry);
      if (silent) clearTimeout(silent);
      poll = retry = silent = null;
    };
    const resume = () => {
      pause();
      gap = true;
      fetchOnce();
      connect();
    };
    const visibility = () => (document.hidden ? pause() : resume());
    document.addEventListener("visibilitychange", visibility);
    resume();

    return () => {
      document.removeEventListener("visibilitychange", visibility);
      pause();
    };
  }, [connectionRevision]);

  return {
    nodes,
    error,
    closed,
    reconnect: () => setConnectionRevision((v) => v + 1),
  };
}
