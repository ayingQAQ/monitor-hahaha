export function stateOf(n: {
  online: boolean;
  metrics: unknown;
  metrics_invalid?: boolean;
}) {
  if (!n.online) return "offline";
  if (n.metrics_invalid) return "invalid";
  if (n.metrics == null) return "waiting";
  const m = n.metrics as Record<string, unknown>;
  return [
    "cpu",
    "mem_used",
    "mem_total",
    "disk_used",
    "disk_total",
    "net_rx",
    "net_tx",
  ].every((k) => typeof m[k] === "number" && Number.isFinite(m[k]))
    ? "online"
    : "invalid";
}
export function usage(n: {
  month_used?: number;
  month_rx: number;
  month_tx: number;
  traffic_mode: string;
}) {
  if (typeof n.month_used === "number" && Number.isFinite(n.month_used))
    return n.month_used;
  return n.traffic_mode === "up"
    ? n.month_tx
    : n.traffic_mode === "down"
      ? n.month_rx
      : n.traffic_mode === "max"
        ? Math.max(n.month_rx, n.month_tx)
        : n.month_rx + n.month_tx;
}
export function historyWindows(days: number) {
  const max = Math.max(1, Math.min(365, days || 7)) * 24;
  return [...[1, 6, 24, 168, 720, 2160].filter((h) => h * 1.25 <= max), max];
}
export type ChartPoint = { ts: number; value: number | null };
export function segments(points: ChartPoint[]) {
  const result: { ts: number; value: number }[][] = [];
  let segment: { ts: number; value: number }[] = [];
  for (const p of points) {
    if (p.value == null || !Number.isFinite(p.value)) {
      if (segment.length) result.push(segment);
      segment = [];
    } else segment.push({ ts: p.ts, value: p.value });
  }
  if (segment.length) result.push(segment);
  return result;
}
export function recordedAt(points: ChartPoint[], target: number, step = 60) {
  let closest: ChartPoint | null = null;
  for (const p of points)
    if (!closest || Math.abs(p.ts - target) < Math.abs(closest.ts - target))
      closest = p;
  return closest &&
    closest.value != null &&
    Math.abs(closest.ts - target) <= step
    ? closest
    : null;
}
