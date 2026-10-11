import { useEffect, useState } from "react";
import { api, type Node } from "../data/api";
import { normalizeHistory, type History } from "../data/history";
import { historyWindows, type ChartPoint } from "../domain/model";
import { bytes, withGaps } from "../domain/format";
import { Paper, Icon, Flag, Button, Scribble } from "./Sketch";
import { Status } from "./NodeCard";
import { Chart, type Series } from "./Chart";
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
  const [hours, setHours] = useState(1),
    [kind, setKind] = useState<"metrics" | "ping">("metrics"),
    [history, setHistory] = useState<History | null>(null),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setHistory(null);
    setError("");
    api<unknown>(
      `/nodes/${node.id}/metrics?hours=${hours}&points=${Math.max(60, Math.min(720, Math.round(innerWidth)))}&series=${kind}`,
    )
      .then((d) => {
        const safe = normalizeHistory(d, kind);
        if (active) setHistory(safe);
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [node.id, hours, kind, revision]);
  const metricPoints = (key: string, scale = 1): ChartPoint[] =>
    withGaps(history?.metrics || [], history?.step).map((row) => {
      const value = (row as Record<string, number | null>)[key];
      return {
        ts: row.ts,
        value: typeof value === "number" ? value / scale : null,
      };
    });
  const ids = [...new Set((history?.ping || []).map((p) => p.task_id))];
  const ping: Series[] = ids.map((id, i) => ({
    name: history?.probes[id] || `探测 ${id}`,
    color: palette[i % 4],
    points: withGaps(
      (history?.ping || [])
        .filter((p) => p.task_id === id)
        .sort((a, b) => a.ts - b.ts),
      history?.step,
    ).map((p) => ({ ts: p.ts, value: "latency" in p ? p.latency : null })),
  }));
  return (
    <>
      <div className="detail-back">
        <Button onClick={onBack}>
          <Icon name="back" />
          返回记录簿
        </Button>
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
        <Button label="刷新历史记录" onClick={() => setRevision((r) => r + 1)}>
          <Icon name="pen" size={19} /> 再记一页
        </Button>
        <div>
          {(["metrics", "ping"] as const).map((k) => (
            <Button key={k} pressed={kind === k} onClick={() => setKind(k)}>
              {k === "metrics" ? "资源手记" : "延迟探测"}
            </Button>
          ))}
        </div>
        <div>
          {historyWindows(days).map((h) => (
            <Button key={h} pressed={hours === h} onClick={() => setHours(h)}>
              {h < 24 ? `${h} 小时` : `${h / 24} 天`}
            </Button>
          ))}
        </div>
      </div>
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
            series={[
              { name: "CPU", color: palette[0], points: metricPoints("cpu") },
            ]}
            max={100}
            step={history.step}
          />
          <Chart
            title="内存与磁盘"
            series={[
              {
                name: "内存",
                color: palette[1],
                points: metricPoints("mem_used", 1024 ** 3),
              },
              {
                name: "磁盘",
                color: palette[2],
                points: metricPoints("disk_used", 1024 ** 3),
              },
            ]}
            unit=" GB"
            step={history.step}
          />
          <Chart
            title="来来往往的流量"
            series={[
              {
                name: "下载",
                color: palette[0],
                points: metricPoints("net_rx", 1024 ** 2),
              },
              {
                name: "上传",
                color: palette[1],
                points: metricPoints("net_tx", 1024 ** 2),
              },
            ]}
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
                      : `${history.loss[id]}%`}
                  </span>
                ))
              : "暂无探测记录"}
          </Paper>
        </>
      )}
    </>
  );
}
