export type History = {
  metrics: ({ ts: number } & Record<string, number | null>)[];
  ping: { ts: number; task_id: number; latency: number | null }[];
  probes: Record<string, string>;
  loss: Record<string, number>;
  step?: number;
};
const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const numeric = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
export function normalizeHistory(
  input: unknown,
  kind: "metrics" | "ping",
): History {
  if (!object(input) || !Array.isArray(input[kind]))
    throw new Error("历史数据格式异常");
  const metrics: History["metrics"] = [];
  for (const row of Array.isArray(input.metrics) ? input.metrics : []) {
    if (!object(row) || !numeric(row.ts)) continue;
    const safe = Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        numeric(value) ? value : null,
      ]),
    ) as Record<string, number | null>;
    metrics.push({ ...safe, ts: row.ts });
  }
  const ping: History["ping"] = [];
  for (const row of Array.isArray(input.ping) ? input.ping : []) {
    if (!object(row) || !numeric(row.ts) || !numeric(row.task_id)) continue;
    ping.push({
      ts: row.ts,
      task_id: row.task_id,
      latency: numeric(row.latency) && row.latency >= 0 ? row.latency : null,
    });
  }
  const rawLoss = object(input.loss) ? input.loss : null;
  const loss: History["loss"] = Object.fromEntries(
    Object.entries(rawLoss ?? {}).filter(
      (pair): pair is [string, number] =>
        numeric(pair[1]) && pair[1] >= 0 && pair[1] <= 100,
    ),
  );
  // Hub only includes positive loss. A valid answered sample with an omitted
  // entry is zero loss; an absent map or an invalid explicit value is unknown.
  if (rawLoss) {
    for (const row of ping) {
      if (row.latency !== null && !Object.hasOwn(rawLoss, row.task_id)) {
        loss[row.task_id] = 0;
      }
    }
  }
  return {
    metrics: metrics.sort((a, b) => a.ts - b.ts),
    ping,
    probes: Object.fromEntries(
      Object.entries(object(input.probes) ? input.probes : {}).filter(
        (pair): pair is [string, string] => typeof pair[1] === "string",
      ),
    ),
    loss,
    step: numeric(input.step) && input.step > 0 ? input.step : undefined,
  };
}
