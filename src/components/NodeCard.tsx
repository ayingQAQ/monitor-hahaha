import type { Node } from "../data/api";
import { bytes, rate, money, cycle, uptime } from "../domain/format";
import { stateOf, usage } from "../domain/model";
import { Paper, Icon, Flag, Meter, Scribble, Stroke } from "./Sketch";
const stateLabels = {
  online: "在线",
  offline: "暂时离线",
  waiting: "等第一次上报",
  invalid: "这次读数异常",
};
export function Status({ node }: { node: Node }) {
  const state = stateOf(node);
  return (
    <span className={`status-stamp ${state}`}>
      <svg viewBox="0 0 130 32" aria-hidden="true">
        <Stroke
          d="M7 6 Q60 2 124 5 L122 26 Q69 29 7 26 Z"
          color="currentColor"
          roughness={1.7}
          weight={1.1}
        />
      </svg>
      {stateLabels[state]}
    </span>
  );
}
export function NodeCard({
  node,
  index,
  onOpen,
}: {
  node: Node;
  index: number;
  onOpen: () => void;
}) {
  const state = stateOf(node),
    m = state === "online" ? node.metrics : null;
  const percent = (used: number, total: number) =>
    total > 0 ? (used / total) * 100 : null;
  const metrics: [string, number | null, string, string][] = [
    ["CPU", m?.cpu ?? null, m ? `${m.cpu.toFixed(1)} %` : "—", "var(--blue)"],
    [
      "内存",
      m ? percent(m.mem_used, m.mem_total) : null,
      m ? `${bytes(m.mem_used)} / ${bytes(m.mem_total)}` : "—",
      "var(--green)",
    ],
    [
      "磁盘",
      m ? percent(m.disk_used, m.disk_total) : null,
      m ? `${bytes(m.disk_used)} / ${bytes(m.disk_total)}` : "—",
      "var(--ochre)",
    ],
  ];
  const days = node.expires_in;
  return (
    <Paper
      className={`node-card card-${index % 4} ${state}`}
      color={
        state === "offline"
          ? "grey"
          : ["cream", "pink", "cream", "mint"][index % 4]
      }
      seed={node.id * 11 + 3}
      tape={index % 3 !== 1}
    >
      <div className="card-top">
        <span className="folio">NO. {String(index + 1).padStart(2, "0")}</span>
        <Flag code={node.country} />
        <Status node={node} />
      </div>
      <button className="node-title" onClick={onOpen}>
        {node.name}
        <Icon name="arrow" size={23} />
      </button>
      <Scribble
        color={
          ["var(--blue)", "var(--red)", "var(--ochre)", "var(--green)"][
            index % 4
          ]
        }
      />
      <div className="node-subtitle">
        {node.group || "未分组"} / {node.os || "系统未知"}
      </div>
      {node.public_remark && (
        <p className="node-remark">{node.public_remark}</p>
      )}
      <div className="card-metrics">
        {metrics.map(([name, value, text, color]) => (
          <div className="metric" key={name}>
            <div>
              <span>{name}</span>
              <strong style={{ color }}>{text}</strong>
            </div>
            <Meter value={value} color={color} />
          </div>
        ))}
      </div>
      <div className="speed-note">
        <span>
          <Icon name="down" size={19} />
          {m ? rate(m.net_rx) : "—"}
        </span>
        <span>
          <Icon name="up" size={19} />
          {m ? rate(m.net_tx) : "—"}
        </span>
      </div>
      <div className="traffic-note">
        <span>本月已用</span>
        <strong>
          {bytes(usage(node))}
          {node.traffic_limit > 0
            ? ` / ${bytes(node.traffic_limit)}`
            : " / 不限量"}
        </strong>
      </div>
      <Meter
        value={
          node.traffic_limit > 0
            ? (usage(node) / node.traffic_limit) * 100
            : null
        }
        color="var(--red)"
      />
      <div className="billing-note">
        <span>
          {node.price === 0
            ? "免费的小伙伴"
            : `${money(node.price, node.currency)} / ${cycle(node.billing_cycle)}`}
        </span>
        <span className={days != null && days < 0 ? "expired" : ""}>
          {days == null
            ? "未设到期"
            : days < 0
              ? `已过期 ${-days} 天`
              : days === 0
                ? "今天到期"
                : `还有 ${days} 天`}
        </span>
      </div>
      <div className="card-tail">
        <span>
          {m
            ? `连续运行 ${uptime(m.uptime)}`
            : node.online
              ? "等它写下第一笔…"
              : node.last_seen_ago == null
                ? "从未上报"
                : `离线 ${uptime(node.last_seen_ago)}`}
        </span>
        <span className="turn-page" aria-hidden="true">
          翻页 ↗
        </span>
      </div>
    </Paper>
  );
}
