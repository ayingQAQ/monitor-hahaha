import {
  createElement,
  memo,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import rough from "roughjs";
import manifest from "../../theme.json";
import "wired-elements/lib/wired-button.js";
import "wired-elements/lib/wired-input.js";
const generator = rough.generator();
export const Stroke = memo(function Stroke({
  d,
  color = "currentColor",
  fill,
  seed = 29,
  weight = 1.5,
  roughness = 1.4,
}: {
  d: string;
  color?: string;
  fill?: string;
  seed?: number;
  weight?: number;
  roughness?: number;
}) {
  const drawing = useMemo(() => {
    const gen = generator;
    const drawable = gen.path(d, {
        seed,
        roughness,
        bowing: 1,
        stroke: color,
        strokeWidth: weight,
        fill,
        fillStyle: "hachure",
        hachureGap: 3.8,
        fillWeight: 1.3,
      });
    for (const set of drawable.sets) for (const op of set.ops) {
      for (let i=0;i<op.data.length;i++) op.data[i]=Math.round(op.data[i]*100)/100;
    }
    return gen.toPaths(drawable);
  }, [d, color, fill, seed, roughness, weight]);
  return (
    <>
      {drawing.map((p, i) => (
        <path
          key={i}
          d={p.d}
          fill={p.fill}
          stroke={p.stroke}
          strokeWidth={p.strokeWidth}
        />
      ))}
    </>
  );
});
function tornContour(w: number, h: number, seed: number) {
  const jiggle = (i: number) =>
    Math.sin(i * 7.93 + seed) * 1.4 + Math.cos(i * 3.73 + seed) * 1.2;
  const edge = 6;
  const points: number[][] = [[edge, edge + 3]];
  let i = 0;
  for (let x = edge + 10; x < w - 26; x += 14)
    points.push([x, edge + jiggle(i++)]);
  points.push([w - 26, edge], [w - edge, 24]);
  for (let y = 31; y < h - edge; y += 13)
    points.push([w - edge + jiggle(i++), y]);
  points.push([w - edge, h - edge - 1]);
  for (let x = w - edge - 13; x > edge; x -= 12)
    points.push([x, h - edge + jiggle(i++)]);
  points.push([edge, h - edge]);
  for (let y = h - edge - 13; y > edge + 6; y -= 17)
    points.push([edge + jiggle(i++), y]);
  return (
    points
      .map(([x, y], k) => `${k ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`)
      .join(" ") + " Z"
  );
}
export function Paper({
  children,
  className = "",
  color = "cream",
  seed = 13,
  tape = false,
}: {
  children: ReactNode;
  className?: string;
  color?: string;
  seed?: number;
  tape?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState([0, 0]);
  const id = useId().replace(/:/g, "");
  useEffect(() => {
    const el = ref.current!;
    const measure = () => {
      const width=el.clientWidth, height=el.clientHeight;
      setSize(previous => previous[0]===width && previous[1]===height ? previous : [width,height]);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const d = useMemo(() => tornContour(size[0], size[1], seed), [size, seed]);
  return (
    <div className={`paper-sheet sheet-${color} ${className}`} ref={ref}>
      <svg
        className="paper-surface"
        width="100%"
        height="100%"
        viewBox={`0 0 ${size[0] || 1} ${size[1] || 1}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <pattern id={`grain-${id}`} width="128" height="128" patternUnits="userSpaceOnUse">
            <image href="/paper-grain.svg" width="128" height="128" />
          </pattern>
          <clipPath id={`cut-${id}`}>
            <path d={d} />
          </clipPath>
        </defs>
        {size[0] > 0 && (
          <>
            <path
              className="torn-edge"
              d={d}
              fill="var(--sheet)"
              stroke="#9b8e7238"
              strokeWidth=".7"
            />
            <path d={d} fill={`url(#grain-${id})`} style={{mixBlendMode:"multiply"}} />
            <g clipPath={`url(#cut-${id})`} opacity=".32">
              <path
                d={`M${size[0] - 24} 5 L${size[0] - 24} 24 L${size[0] - 5} 24 Z`}
                fill="#b9a57e"
              />
              <path
                d={`M10 ${size[1] * 0.64} Q${size[0] * 0.4} ${size[1] * 0.68} ${size[0] - 9} ${size[1] * 0.59}`}
                fill="none"
                stroke="#baae9238"
                strokeWidth="2"
              />
            </g>
          </>
        )}
      </svg>
      {tape && <span className="paper-tape" aria-hidden="true" />}
      <div className="paper-content">{children}</div>
    </div>
  );
}
export function Button({
  children,
  onClick,
  className = "",
  label,
  pressed,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  label?: string;
  pressed?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current as HTMLElement & {
      updateComplete?: Promise<unknown>;
    };
    void el?.updateComplete?.then(() => {
      const button = el.shadowRoot?.querySelector("button");
      if (button && label) button.setAttribute("aria-label", label);
      if (button && pressed !== undefined)
        button.setAttribute("aria-pressed", String(pressed));
    });
  }, [label, pressed]);
  return createElement(
    "wired-button",
    {
      ref,
      class: `ink-button ${className}`,
      "data-selected": pressed ? "true" : "false",
      elevation: "2",
      onClick,
    },
    children,
  );
}
export function Search({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current as HTMLElement & {
      updateComplete?: Promise<unknown>;
      value: string;
    };
    void el?.updateComplete?.then(() => {
      el.value = value;
      const input = el.shadowRoot?.querySelector("input");
      input?.setAttribute("aria-label", "搜索节点");
      if (input) input.style.background = "transparent";
    });
  }, [value]);
  return createElement("wired-input", {
    ref,
    class: "ink-search",
    placeholder: "找找哪一台…",
    onInput: (e: Event) =>
      onChange((e.target as HTMLElement & { value: string }).value),
  });
}
const icons: Record<string, string> = {
  server:
    "M3 3 Q12 1 21 4 L20 10 L3 11 Z M4 15 L21 14 L21 22 L3 21 Z M6 6 L7 6 M15 6 L18 6 M6 18 L7 18 M15 18 L18 18",
  arrow: "M3 13 Q11 10 21 12 M14 5 L21 12 L14 19",
  back: "M21 12 Q12 14 3 12 M10 5 L3 12 L10 19",
  search: "M16 16 L22 22 M17 9 A8 8 0 1 1 1 9 A8 8 0 1 1 17 9",
  down: "M12 2 Q10 10 12 21 M5 14 L12 21 L20 14",
  up: "M12 22 Q14 12 12 3 M4 10 L12 3 L19 10",
  pen: "M2 22 L5 14 L18 2 L23 7 L11 19 Z M5 14 L11 19",
  close: "M4 3 L21 21 M20 3 L3 21",
  sun: "M12 6 A6 6 0 1 1 12 18 A6 6 0 1 1 12 6 M12 1 V3 M12 21 V23 M1 12 H3 M21 12 H23 M4 4 L6 6 M18 18 L20 20 M4 20 L6 18 M18 6 L20 4",
  globe:
    "M12 2 A10 10 0 1 1 12 22 A10 10 0 1 1 12 2 M2 12 H22 M12 2 C4 8 4 16 12 22 M12 2 C20 8 20 16 12 22",
  settings: "M3 6 H21 M3 12 H21 M3 18 H21 M7 3 V9 M17 9 V15 M10 15 V21",
};
export function Icon({ name, size = 24 }: { name: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className="ink-icon"
      aria-hidden="true"
    >
      <Stroke d={icons[name] || icons.server} roughness={0.9} />
    </svg>
  );
}
export function Scribble({
  className = "",
  color = "var(--blue)",
}: {
  className?: string;
  color?: string;
}) {
  return (
    <svg
      className={`scribble ${className}`}
      viewBox="0 0 260 18"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <Stroke
        d="M3 8 Q82 15 251 6 M14 13 Q149 6 255 12"
        color={color}
        roughness={1.9}
        weight={1.4}
      />
    </svg>
  );
}
export function Meter({
  value,
  color = "var(--blue)",
}: {
  value: number | null;
  color?: string;
}) {
  const valid = value != null && Number.isFinite(value);
  const amount = valid ? Math.max(0, Math.min(100, value)) : 0;
  return (
    <svg
      className="pencil-meter"
      viewBox="0 0 280 22"
      preserveAspectRatio="none"
      role="img"
      aria-label={valid ? `${value.toFixed(1)}%` : "指标不可用"}
    >
      <Stroke
        d="M4 5 Q140 3 275 6 L276 17 Q150 16 4 19 Z"
        color="#948c7666"
        roughness={1}
      />
      {amount > 0 && (
        <Stroke
          d={`M5 6 L${5 + amount * 2.68} 5 L${5 + amount * 2.68} 17 L5 18 Z`}
          fill={color}
          color={color}
          roughness={1.25}
        />
      )}
    </svg>
  );
}
export function Flag({ code }: { code: string }) {
  const normalized = code.trim().toUpperCase();
  const flagCode = normalized === "UK" ? "GB" : normalized;
  const [missing, setMissing] = useState(false);
  useEffect(() => setMissing(false), [code]);
  const valid = /^[A-Z]{2}(?:-(?:ENG|SCT|WLS|NIR))?$/.test(flagCode);
  return (
    <span className="country-note" title={code || "地区未知"}>
      {valid && !missing ? (
        <img
          src={`/flags/${flagCode}.svg?v=${manifest.version}`}
          alt={`${code} 手绘国旗`}
          onError={() => setMissing(true)}
        />
      ) : (
        <>
          <Icon name="globe" size={24} />
          <span>{code || "—"}</span>
        </>
      )}
    </span>
  );
}
