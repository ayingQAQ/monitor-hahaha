import { useEffect, useState } from "react";
import { api, groupsOf, useNodes } from "./data/api";
import { loadConfig } from "./data/config";
import { bytes, rate } from "./domain/format";
import { usage, stateOf } from "./domain/model";
import {
  Paper,
  Icon,
  Button,
  Search,
  Scribble,
  Stroke,
} from "./components/Sketch";
import { NodeCard } from "./components/NodeCard";
import { Globe, GlobeRegions } from "./components/Globe";
import { Detail } from "./components/Detail";
import "./styles/app.css";
type Me = {
  site_name: string;
  public_page: boolean;
  authed: boolean;
  history_days?: number;
  demo?: boolean;
};
const readRoute = () => {
  const m = location.pathname.match(/^\/node\/(\d+)\/?$/);
  return m ? Number(m[1]) : null;
};
export default function App() {
  const { nodes, error, closed, reconnect } = useNodes();
  const [me, setMe] = useState<Me | null>(null);
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [meError, setMeError] = useState("");
  const [id, setId] = useState(readRoute);
  const [globeCountry, setGlobeCountry] = useState("");
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string | null>(null);
  const loadMe = () =>
    api<Me>("/me")
      .then((d) => {
        setMe(d);
        setMeError("");
      })
      .catch((e: Error) => setMeError(e.message));
  useEffect(() => {
    void loadMe();
    void loadConfig().then(setConfig);
    const sync = () => setId(readRoute());
    addEventListener("popstate", sync);
    return () => removeEventListener("popstate", sync);
  }, []);
  useEffect(() => {
    if (closed) void loadMe();
  }, [closed]);
  useEffect(() => {
    if (me) {
      document.title = me.site_name || "手绘探针";
      if (!me.public_page && !me.authed) location.href = "/admin/";
    }
  }, [me]);
  const go = (next: number | null) => {
    history.pushState({}, "", next == null ? "/" : `/node/${next}`);
    setId(next);
    scrollTo(0, 0);
  };
  const groups = groupsOf(nodes || []);
  useEffect(() => {
    if (group !== null && group !== "" && !groups.includes(group))
      setGroup(null);
  }, [groups.join("\0"), group]);
  const visible = (nodes || []).filter(
    (n) =>
      (group === null || (n.group || "") === group) &&
      `${n.name} ${n.public_remark || ""} ${n.country}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const online = visible.filter((n) => n.online);
  const valid = visible.filter((n) => stateOf(n) === "online");
  const rx = valid.reduce((sum, n) => sum + (n.metrics?.net_rx || 0), 0),
    tx = valid.reduce((sum, n) => sum + (n.metrics?.net_tx || 0), 0);
  const traffic = visible.reduce((sum, n) => sum + usage(n), 0);
  const selected = nodes?.find((n) => n.id === id);
  const actualInk = String(config.accent || "blue");
  return (
    <div className="desk" data-ink={actualInk}>
      <main className="workbook">
        <header className="masthead">
          <a
            className="site-brand"
            href="/"
            onClick={(e) => {
              e.preventDefault();
              go(null);
            }}
          >
            <svg
              className="brand-doodle"
              viewBox="0 0 58 64"
              aria-hidden="true"
            >
              <Stroke
                d="M8 6 L44 4 L49 56 L5 58 Z"
                roughness={2}
                fill="#eacb7290"
              />
              <Stroke
                d="M13 15 L38 14 L39 27 L12 28 Z M13 34 L39 32 L40 47 L11 48 Z M16 20 L19 20 M28 20 L33 20 M16 40 L18 40 M27 40 L34 40"
                color="var(--blue)"
                roughness={0.8}
              />
            </svg>
            <span>
              {me?.site_name || "手绘探针"}
              <small>a little server scrapbook</small>
            </span>
          </a>
          <nav>
            {id === null ? <div className="search-note"><Icon name="search" /><Search value={query} onChange={setQuery} /></div> : <span className="margin-note">今天也在好好运行 ↙</span>}
            <Button
              label="管理入口"
              className="admin-button"
              onClick={() => location.assign("/admin/")}
            >
              <span className="admin-label">管理入口</span>{" "}
              <Icon name="arrow" size={19} />
            </Button>
          </nav>
        </header>
        {me?.demo && (
          <div className="demo-note">* 开发演示 · 这些是虚构节点 *</div>
        )}
        {Boolean(config.notice) && (
          <Paper color="yellow" className="announcement" tape seed={8}>
            <Icon name="pen" />
            {String(config.notice)}
          </Paper>
        )}
        {(error || meError) && (
          <Paper color="pink" className="message" seed={4}>
            <h3>这次连接没成功</h3>
            <p>{error || meError}</p>
            {nodes != null && (
              <p className="stale-note">当前保留的是上一次读到的记录。</p>
            )}
            <Button
              onClick={() => {
                reconnect();
                void loadMe();
              }}
            >
              再试一次
            </Button>
          </Paper>
        )}
        {id != null ? (
          selected ? (
            <Detail
              key={selected.id}
              node={selected}
              days={me?.history_days ?? 7}
              onBack={() => go(null)}
            />
          ) : (
            <Paper className="message" tape>
              <p>{nodes ? "这张记录不在这里" : "正在找到这张记录…"}</p>
              <Button onClick={() => go(null)}>返回手册</Button>
            </Paper>
          )
        ) : (
          <>
            <section className="opening">
              <Globe nodes={visible} onOpen={go} focus={globeCountry} onFocus={setGlobeCountry} />
              <div className="loose-notes">
                <Paper color="yellow" className="now-note" tape seed={3}>
                  <span className="note-label">此刻，在线的朋友</span>
                  <div className="live-number">
                    <strong>{nodes ? online.length : "—"}</strong>
                    <span>/ {nodes ? visible.length : "—"} 台</span>
                    <Icon name="sun" size={48} />
                  </div>
                  <Scribble color="var(--green)" />
                  <span className="note-caption">
                    {nodes
                      ? `${visible.length - online.length} 台离线 · 正在等它们回来`
                      : "正在读取最新快照"}
                  </span>
                </Paper>
                <Paper color="blue" className="flow-note" seed={37}>
                  <span className="note-label">这个月，走过的流量</span>
                  <strong>{nodes ? bytes(traffic) : "—"}</strong>
                  <div>
                    <Icon name="down" size={20} />
                    {nodes ? rate(rx) : "—"} <Icon name="up" size={20} />
                    {nodes ? rate(tx) : "—"}
                  </div>
                  <span className="note-caption">数字来自 Monitor Hub</span>
                </Paper>
                <div className="tiny-doodle" aria-hidden="true">
                  <svg viewBox="0 0 120 58">
                    <Stroke
                      d="M5 30 L29 30 L35 12 L42 46 L51 22 L60 30 L112 30 M88 14 L101 5 M105 16 L116 13"
                      color="var(--green)"
                      roughness={1.8}
                    />
                  </svg>
                  <span>still alive :)</span>
                </div>
              </div>
            </section>
            <section className="node-section" aria-label="节点列表">
              <GlobeRegions nodes={visible} focus={globeCountry} onFocus={setGlobeCountry} />
              {groups.length > 0 && (
                <div className="group-tabs">
                  <Button
                    pressed={group === null}
                    onClick={() => setGroup(null)}
                  >
                    全部记录
                  </Button>
                  {groups.map((g) => (
                    <Button
                      key={g}
                      pressed={group === g}
                      onClick={() => setGroup(g)}
                    >
                      {g}
                    </Button>
                  ))}
                  {nodes?.some((n) => !n.group) && (
                    <Button pressed={group === ""} onClick={() => setGroup("")}>
                      未分组
                    </Button>
                  )}
                </div>
              )}
              {nodes == null ? (
                <Paper className="message" tape>
                  <Icon name="pen" size={42} />
                  <p>正在摊开这本记录簿…</p>
                </Paper>
              ) : !visible.length ? (
                <Paper className="message" tape color="yellow">
                  <h3>
                    {nodes.length ? "这页暂时是空的" : "第一张记录，还没到来"}
                  </h3>
                  <p>
                    {nodes.length
                      ? "换个分组，或者换个关键词看看。"
                      : "节点接入之后，我们就在这里开始记录。"}
                  </p>
                </Paper>
              ) : (
                <div className="node-grid">
                  {visible.map((n, i) => (
                    <NodeCard
                      key={n.id}
                      node={n}
                      index={i}
                      onOpen={() => go(n.id)}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
        <footer>
          <svg viewBox="0 0 480 25" aria-hidden="true">
            <Stroke d="M4 12 Q165 4 472 13" color="#857a6555" roughness={3} />
          </svg>
          <span>
            <Icon name="pen" size={19} />
            手绘探针 · Powered by Monitor
          </span>
          <span>写下数字，也留下温度。</span>
        </footer>
      </main>

    </div>
  );
}
