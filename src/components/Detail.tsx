import { useEffect, useMemo, useState } from "react";
import { type Node } from "../data/api";
import { historyCache } from "../data/history-cache";
import { type History } from "../data/history";
import { acquireHistory, historyPath, warmHistory } from "../data/history-loader";
import { historyWindows, type ChartPoint } from "../domain/model";
import { bytes, withGaps } from "../domain/format";
import { Paper, Icon, Flag, Button, Scribble } from "./Sketch";
import { Status } from "./NodeCard";
import { Chart, type Series } from "./Chart";
const readView = (): "metrics" | "ping" => new URLSearchParams(location.search).get("view") === "ping" ? "ping" : "metrics";
const palette = ["var(--blue)", "var(--green)", "var(--ochre)", "var(--red)"];
export function Detail({
  node,
  days,
  onBack,
}: {
  node: Node;
  days: number;
  onBack: () => void;
}) {
  const [requestedHours, setHours] = useState(1),
    [kind, setKind] = useState<"metrics" | "ping">(readView);
  const windows = historyWindows(days);
  const hours = windows.includes(requestedHours)
    ? requestedHours
    : windows.filter((h) => h <= requestedHours).at(-1) ?? windows[0];
  useEffect(() => {
    if (requestedHours !== hours) setHours(hours);
  }, [requestedHours, hours]);
  const requestPath = historyPath(node.id, hours, kind);
  const [loaded, setLoaded] = useState<{key:string;data:History} | null>(() => {const cached=historyCache.get(requestPath);return cached?{key:requestPath,data:cached}:null;}),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  const cachedHistory = loaded?.key === requestPath ? null : historyCache.get(requestPath);
  const history = cachedHistory ?? (loaded && loaded.key.endsWith(`&series=${kind}`) ? loaded.data : null);
  const updating = !!history && !cachedHistory && loaded?.key !== requestPath;
  useEffect(() => {
    let active = true;
    const cached = historyCache.get(requestPath);
    if (cached) {setLoaded({key:requestPath,data:cached});setError("");return;}
    setError("");
    const lease = acquireHistory(requestPath, kind);
    lease.promise
      .then((safe) => {
        if (active) setLoaded({key:requestPath,data:safe});
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;lease.release();
    };
  }, [requestPath, kind, revision]);
  useEffect(() => {
    const sync = () => setKind(readView());
    addEventListener("popstate", sync);
    return () => removeEventListener("popstate", sync);
  }, []);
  const selectView = (next: "metrics" | "ping") => {
    if (next === kind) return;
    const url = new URL(location.href);
    if (next === "ping") url.searchParams.set("view", "ping");
    else url.searchParams.delete("view");
    window.history.pushState({}, "", url.pathname + url.search);
    setKind(next);
  };
  const resourceSeries = useMemo(() => {
    const rows = withGaps(history?.metrics || [], history?.step);
    const metricPoints = (key: string, scale = 1): ChartPoint[] =>
    rows.map((row) => {
      const value = (row as Record<string, number | null>)[key];
      return {
        ts: row.ts,
        value: typeof value === "number" ? value / scale : null,
      };
    });
    return {
      cpu: [{name:"CPU",color:palette[0],points:metricPoints("cpu")}],
      memory: [{name:"内存",color:palette[1],points:metricPoints("mem_used",1024**3)},{name:"磁盘",color:palette[2],points:metricPoints("disk_used",1024**3)}],
      traffic: [{name:"下载",color:palette[0],points:metricPoints("net_rx",1024**2)},{name:"上传",color:palette[1],points:metricPoints("net_tx",1024**2)}],
    };
  }, [history]);
  const ids = useMemo(() => [...new Set((history?.ping || []).map((p) => p.task_id))], [history]);
  const ping: Series[] = useMemo(() => ids.map((id, i) => ({
    name: history?.probes[id] || `探测 ${id}`,
    color: palette[i % 4],
    points: withGaps(
      (history?.ping || [])
        .filter((p) => p.task_id === id)
        .sort((a, b) => a.ts - b.ts),
      history?.step,
    ).map((p) => ({ ts: p.ts, value: "latency" in p ? p.latency : null })),
  })), [history, ids]);
  return (
    <>
      <div className="detail-navigation">
        <Button onClick={onBack}>
          <Icon name="back" />
          返回记录簿
        </Button>
        <nav className="detail-tabs" aria-label="节点页面">
          {(["metrics", "ping"] as const).map((k) => (
            <Button key={k} pressed={kind === k} onIntent={() => warmHistory(node.id,k,hours)} onClick={() => selectView(k)}>
              {k === "metrics" ? "资源手记" : "延迟探测"}
            </Button>
          ))}
        </nav>
      </div>
      <Paper className="detail-intro" color="yellow" seed={node.id} tape>
        <div>
          <Flag code={node.country} />
          <h2>{node.name}</h2>
          <Status node={node} />
        </div>
        <Scribble color="var(--ochre)" />
        <p>{node.public_remark || "这一页，记下它的运行故事。"}</p>
        <div className="detail-facts">
          <span>{node.os || "系统未知"}</span>
          <span>
            {node.cpu_cores} 核 / {node.cpu_name || "处理器未知"}
          </span>
          <span>
            内存 {bytes(node.mem_total)} · 磁盘 {bytes(node.disk_total)}
          </span>
        </div>
      </Paper>
      <div className="detail-controls">
        <div role="group" aria-label="历史时间范围">
          {windows.map((h) => (
            <Button key={h} pressed={hours === h} onIntent={() => warmHistory(node.id,kind,h)} onClick={() => setHours(h)}>
              {h < 24 ? `${h} 小时` : `${h / 24} 天`}
            </Button>
          ))}
        </div>
      </div>
      {updating && !error && <p className="history-loading" role="status">正在加载 {hours < 24 ? `${hours} 小时` : `${hours / 24} 天`}记录，暂时显示上次记录…</p>}
      {error ? (
        <Paper className="message" color="pink" tape>
          <h3>这页没能读出来</h3>
          <p>{error}</p>
          <Button onClick={() => setRevision((r) => r + 1)}>再翻一次</Button>
        </Paper>
      ) : !history ? (
        <Paper className="message" tape>
          <p>正在翻阅过去的记录…</p>
        </Paper>
      ) : kind === "metrics" ? (
        <div className="chart-grid">
          <Chart
            title="CPU 的忙碌程度"
            series={resourceSeries.cpu}
            max={100}
            step={history.step}
          />
          <Chart
            title="内存与磁盘"
            series={resourceSeries.memory}
            unit=" GB"
            step={history.step}
          />
          <Chart
            title="来来往往的流量"
            series={resourceSeries.traffic}
            unit=" MB/s"
            step={history.step}
          />
        </div>
      ) : (
        <>
          <Chart
            title="走到远方，要多久？"
            series={ping}
            unit=" ms"
            step={history.step}
          />
          <Paper className="loss-note" color="blue" tape>
            <h3>这段时间的丢包率</h3>
            {ids.length
              ? ids.map((id) => (
                  <span key={id}>
                    {history.probes[id] || `探测 ${id}`}：
                    {history.loss[id] == null
                      ? "暂无统计"
                      : history.loss[id] === 0
                        ? "0%"
                        : `${history.loss[id].toFixed(3)}%`}
                  </span>
                ))
              : "暂无探测记录"}
          </Paper>
        </>
      )}
    </>
  );
}
