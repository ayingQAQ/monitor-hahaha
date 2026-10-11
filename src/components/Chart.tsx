import { memo, useEffect, useRef, useState } from "react";
import { Paper, Stroke } from "./Sketch";
import { recordedAt, segments, type ChartPoint } from "../domain/model";
export type Series = { name: string; color: string; points: ChartPoint[] };
export const Chart = memo(function Chart({
  title,
  series,
  unit = "%",
  max: fixedMax,
  step = 60,
}: {
  title: string;
  series: Series[];
  unit?: string;
  max?: number;
  step?: number;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) =>
      setWidth(Math.max(260, entry.contentRect.width)),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, [series.length, series.some((s) => s.points.length > 0)]);
  const all = series.flatMap((s) => s.points),
    values = all.filter((p) => p.value != null).map((p) => p.value as number);
  const start = Math.min(...all.map((p) => p.ts)),
    end = Math.max(...all.map((p) => p.ts));
  const max = fixedMax || Math.max(1, ...values) * 1.12;
  const left = 62,
    right = width - 17,
    span = right - left;
  const x = (ts: number) =>
      left + ((ts - start) / Math.max(1, end - start)) * span,
    y = (v: number) => 185 - Math.min(1, v / max) * 154;
  const format = (v: number) =>
    `${v >= 1000 ? (v / 1000).toFixed(1) + "k" : v.toFixed(v < 10 ? 1 : 0)}${unit}`;
  const clock = (ts: number) =>
    new Date(ts * 1000).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  return (
    <Paper className="chart-sheet" color="cream" seed={23} tape>
      <div className="chart-heading">
        <h3>{title}</h3>
        <span>手写记录 / HISTORY</span>
      </div>
      {!all.length ? (
        <div className="empty-history">这段时间，没有留下记录。</div>
      ) : (
        <>
          <svg
            ref={ref}
            className="hand-chart"
            viewBox={`0 0 ${width} 230`}
            role="img"
            aria-label={`${title}历史曲线`}
            onPointerMove={(e) => {
              const box = e.currentTarget.getBoundingClientRect();
              setHover(
                Math.max(
                  0,
                  Math.min(
                    1,
                    (((e.clientX - box.left) / box.width) * width - left) /
                      span,
                  ),
                ),
              );
            }}
            onPointerLeave={() => setHover(null)}
          >
            {[0, 0.25, 0.5, 0.75, 1].map((t) => (
              <g key={t}>
                <Stroke
                  d={`M${left} ${y(max * t)} Q${width / 2} ${y(max * t) + 0.7} ${right} ${y(max * t)}`}
                  color="#ada58d50"
                  weight={0.65}
                  roughness={1.1}
                />
                <text x={left - 9} y={y(max * t) + 5} textAnchor="end">
                  {format(max * t)}
                </text>
              </g>
            ))}
            <Stroke
              d={`M${left} 25 L${left} 185 L${right} 185`}
              roughness={1}
              weight={1.1}
            />
            {series.map((s, i) => (
              <g key={s.name}>
                {segments(s.points).map((chunk, k) => (
                  <Stroke
                    key={k}
                    d={
                      chunk.length === 1
                        ? `M${x(chunk[0].ts) - 1} ${y(chunk[0].value)} h2`
                        : chunk
                            .map(
                              (p, j) =>
                                `${j ? "L" : "M"}${x(p.ts)} ${y(p.value)}`,
                            )
                            .join(" ")
                    }
                    color={s.color}
                    seed={42 + i}
                    roughness={0.8}
                    weight={1.4}
                  />
                ))}
              </g>
            ))}
            {(width < 420 ? [0, 1] : [0, 0.5, 1]).map((t) => (
              <text
                key={t}
                x={left + span * t}
                y={214}
                textAnchor={t === 0 ? "start" : t === 1 ? "end" : "middle"}
              >
                {clock(start + (end - start) * t)}
              </text>
            ))}
            {hover != null && (
              <Stroke
                d={`M${left + hover * span} 25 V185`}
                color="#82786080"
                roughness={1}
              />
            )}
          </svg>
          <div className="chart-legend">
            {series.map((s) => (
              <span key={s.name} style={{ color: s.color }}>
                <svg width="27" height="15">
                  <Stroke d="M2 9 Q14 5 25 8" color={s.color} />
                </svg>
                {s.name}
              </span>
            ))}
          </div>
          {hover != null && (
            <div className="chart-tooltip" role="status">
              {clock(start + (end - start) * hover)}
              {series.map((s) => {
                const p = recordedAt(
                  s.points,
                  start + (end - start) * hover,
                  step,
                );
                return (
                  <span key={s.name}>
                    {s.name}：
                    {p?.value == null
                      ? "暂无记录"
                      : `${format(p.value)} (${clock(p.ts)})`}
                  </span>
                );
              })}
            </div>
          )}
        </>
      )}
    </Paper>
  );
});
