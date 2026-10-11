const UNITS = ["B", "KB", "MB", "GB", "TB", "PB"];

const unitOf = (n: number) =>
  Math.min(Math.floor(Math.log(n) / Math.log(1024)), UNITS.length - 1);

/**
 * 1024-based, as VPS dashboards and `df` report bytes, but labelled MB/GB the way
 * `df -h` and hosting plans write them: no plan is sold as "1000 GiB", and the two
 * extra letters push the memory and traffic lines past their column.
 *
 * Three significant digits by default. Two decimals throughout would end the
 * card's lines in an ellipsis on a four-column grid; a pair sharing a unit
 * recovers them through pair() below.
 */
export function bytes(n: number, digits?: number): string {
  // `< 1` rather than `< 0`: a fraction of a byte puts `unitOf` at -1 and prints
  // "512 undefined".
  if (!n || n < 1) return "0 B";
  const i = unitOf(n);
  const v = n / 1024 ** i;
  return `${v.toFixed(i === 0 ? 0 : (digits ?? (v >= 100 ? 0 : v >= 10 ? 1 : 2)))} ${UNITS[i]}`;
}

/**
 * A "used / total" pair. Sharing a unit means writing it once, and those four
 * characters are what allow the two decimals: 111px against the 122px a card in
 * the four-column grid provides, where separate units require 132px. A pair
 * spanning two units has nothing to save and falls back to bytes().
 */
export function pair(used: number, total: number): string {
  if (used > 0 && total > 0 && unitOf(used) === unitOf(total)) {
    const i = unitOf(total);
    const f = (n: number) => (n / 1024 ** i).toFixed(i === 0 ? 0 : 2);
    return `${f(used)} / ${f(total)} ${UNITS[i]}`;
  }
  return `${bytes(used)} / ${bytes(total)}`;
}

/**
 * Axis ticks. Whole units are too coarse for a narrow band -- a disk at 3.2 GB
 * would draw 3 GB, 2 GB, 2 GB, 811 MB, 0 B, repeating a label -- so ticks under
 * three digits keep one decimal. Above that the next tick is a whole unit away
 * and the label must stay within the axis.
 */
export function axisBytes(v: number): string {
  if (!v || v < 0) return "0 B";
  return bytes(v, v / 1024 ** unitOf(v) >= 100 ? 0 : 1).replace(".0 ", " ");
}

export function rate(n: number): string {
  return `${bytes(n, 1)}/s`;
}

/** Not capped: a plan used past its quota reads as 209%, not 100%. */
export function percent(used: number, total: number): number {
  return total > 0 ? (used / total) * 100 : 0;
}

export function uptime(seconds: number): string {
  if (!seconds) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d > 0 ? `${d} 天 ${h} 小时` : h > 0 ? `${h} 小时 ${m} 分` : `${m} 分`;
}

/** Whole days until a date, negative once it has passed. */
export function daysUntil(date?: string | null): number | null {
  if (!date) return null;
  const target = new Date(`${date}T00:00:00`).getTime();
  if (Number.isNaN(target)) return null;
  return Math.ceil((target - Date.now()) / 86400000);
}

/**
 * No expiry and no traffic cap are both rendered as the absence of a ceiling.
 * U+221E rather than the emoji, which arrives as a coloured tile from whatever
 * font the visitor has; this inherits the text colour and size.
 */
export const FOREVER = "∞";

const MONEY = new Map<string, Intl.NumberFormat>();

/**
 * A price as zh-CN writes it: ¥12.00, US$12.00, HK$12.00, JP¥1,200, and the code
 * ahead of the amount where the locale has no symbol, as in SGD 12.00. The
 * locale is fixed so the figure does not vary with the browser's language, and
 * so JPY reads JP¥, apart from CNY. Fractions stop at two places, the precision
 * the price is entered in, not at the currency's minor unit: rounding to whole
 * yen would show a price of 0.4 as JP¥0. A formatter costs about 100 µs to
 * build, hence one per currency.
 */
export function money(amount: number, currency: string): string {
  try {
    let format = MONEY.get(currency);
    if (!format) {
      format = new Intl.NumberFormat("zh-CN", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
        // Keep the full Canadian dollar code instead of the locale's CA$ abbreviation.
        currencyDisplay: currency === "CAD" ? "code" : "symbol",
      });
      MONEY.set(currency, format);
    }
    return format.format(amount);
  } catch {
    // Intl throws on anything but three letters, which hubs before 1.3.1 stored
    // unchecked when written through the API.
    return `${currency} ${amount.toFixed(2)}`.trim();
  }
}

// Hub 1.3.0 and earlier store only these names; later hubs store any other
// length as `<n>m`.
const NAMED_CYCLES: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  yearly: 12,
  biennial: 24,
  triennial: 36,
};
const CYCLE_WORDS: Record<number, string> = {
  1: "月付",
  3: "季付",
  6: "半年付",
  12: "年付",
};

/** How a billing cycle reads: 月付, 5 年付, 18 个月付, 一次性. */
export function cycle(billing: string): string {
  if (billing === "once") return "一次性";
  const months = NAMED_CYCLES[billing] ?? Number(/^(\d+)m$/.exec(billing)?.[1]);
  if (!months) return billing;
  return (
    CYCLE_WORDS[months] ??
    (months % 12 ? `${months} 个月付` : `${months / 12} 年付`)
  );
}

// Built once: recharts calls a tickFormatter for every sample when laying out an
// axis rather than once per tick drawn, and an Intl formatter constructed per call
// would be the largest single cost on the detail page -- 348 ms of a 1531 ms
// click-to-chart. The zone resolves once, which only an OS timezone change under
// an open tab would notice.
//
// They take epoch milliseconds, as Date does. The hub answers in seconds, which
// the charts convert as the rows arrive.
const HHMM = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
});

const MDHHMM = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const MMDD = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
});

/**
 * Axis ticks for a window `hours` wide. Beyond a day a bare "14:00" recurs each
 * midnight and the axis no longer indicates which day it refers to.
 */
export function clockFor(hours: number): (ms: number) => string {
  return hours <= 24 ? HHMM.format : MDHHMM.format;
}

/**
 * The label format for an axis carrying `ticks` over a window `hours` wide: the
 * date alone once every tick is a local midnight, where "00:00" beside each
 * would say nothing, and `clockFor` otherwise. Decided by the ticks rather than
 * the window, so a month dragged down to one day by the brush gets its times
 * back.
 */
export function tickClock(
  ticks: number[],
  hours: number,
): (ms: number) => string {
  const midnight = (t: number) =>
    new Date(t).getHours() === 0 && new Date(t).getMinutes() === 0;
  return ticks.length > 0 && ticks.every(midnight)
    ? MMDD.format
    : clockFor(hours);
}

// Round chart windows, in hours: up to a week they are drawn from minute rows,
// past it from the hub's hourly tier.
const WINDOWS = [1, 6, 24, 168, 720, 2160];

/**
 * The chart windows offered for a hub keeping `days` of history, which `/api/me`
 * reports as `history_days`: the round windows shorter than it, then the whole
 * of it. A window past it would be narrowed by the hub without saying so, and
 * drawn under a label claiming more than it holds. A round window the whole
 * exceeds by less than a quarter is left out, as it would sit beside a tab of
 * nearly the same width: 30 and 31 days, 90 and 92.
 */
export function windows(days: number): { hours: number; label: string }[] {
  const whole = Math.max(1, Math.floor(days)) * 24;
  return [...WINDOWS.filter((h) => h * 1.25 <= whole), whole].map((hours) => ({
    hours,
    label:
      hours < 24
        ? `${hours} 小时`
        : hours === 8760
          ? "1 年"
          : `${hours / 24} 天`,
  }));
}

/**
 * Distro and CPU names as vendors write them carry mostly redundant text: a
 * codename in brackets, "GNU/Linux", "(R)", a core count already printed
 * separately. Stripping it is what makes the line fit.
 */
export function osName(name: string): string {
  return name.replace("GNU/Linux ", "").replace(/\s*\([^)]*\)\s*$/, "");
}

export function cpuName(name: string): string {
  return name
    .replace(/\((R|TM|r|tm)\)/g, "")
    .replace(/\s+(CPU|Processor)\b/g, "")
    .replace(/\s+\d+-Core\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Ticks on round clock values across `[from, to]`, in epoch milliseconds.
//
// recharts selects ticks by "nice number" on the raw value, which on a timestamp
// yields 05:14 and 10:22 where a chart requires 06:00 and 12:00; it never uses a
// time scale's own ticks, whatever `scale` specifies. The axis is therefore given
// the list explicitly: the smallest step from the ladder keeping the count under
// `count`, phased on local midnight so a daily tick lands on the day even in a
// zone offset by 30 or 45 minutes. Past what two weeks can cover, on the first of
// a month: months differ in length, so no fixed step lands on one.
const TICK_STEPS = [
  1, 2, 5, 10, 15, 30, 60, 120, 180, 360, 720, 1440, 2880, 10080, 20160,
].map((m) => m * 60_000);
const TICK_MONTHS = [1, 2, 3, 6, 12];

export function timeTicks(from: number, to: number, count = 8): number[] {
  const step = TICK_STEPS.find((s) => (to - from) / s <= count);
  if (step === undefined) return monthTicks(from, to, count);
  const zone = new Date(from).getTimezoneOffset() * 60_000;
  const ticks: number[] = [];
  for (
    let t = Math.ceil((from - zone) / step) * step + zone;
    t <= to;
    t += step
  ) {
    // Past a daylight-saving change a step of days lands an hour off midnight,
    // so each such tick is set back on the nearest one.
    const tick =
      step < 86_400_000 ? t : new Date(t + 43_200_000).setHours(0, 0, 0, 0);
    if (tick <= to) ticks.push(tick);
  }
  return ticks;
}

// The first of every `every`th month within `[from, to]`, on months divisible
// by `every` so a quarterly axis reads January, April, July.
function monthTicks(from: number, to: number, count: number): number[] {
  const start = new Date(from);
  const every =
    TICK_MONTHS.find((k) => (to - from) / (k * 30 * 86_400_000) <= count) ?? 12;
  let month = start.getFullYear() * 12 + start.getMonth();
  if (new Date(start.getFullYear(), start.getMonth(), 1).getTime() < from)
    month++;
  const ticks: number[] = [];
  for (month = Math.ceil(month / every) * every; ; month += every) {
    const t = new Date(Math.floor(month / 12), month % 12, 1).getTime();
    if (t > to) return ticks;
    ticks.push(t);
  }
}

/**
 * A zero-anchored axis top for a utilisation percentage, which has no capacity
 * to measure against.
 *
 * Derived from the gridline rather than the reverse -- the smallest round step
 * whose fourth multiple clears the data. Chosen the other way, the top is round
 * while the four gridlines beneath it are not: a ceiling of 75% draws lines at
 * 18.75 and 56.25.
 *
 * `floor` keeps an idle machine looking idle: tracked exactly, a host that never
 * exceeds 0.4% CPU would get an axis of 0-0.4 and render every scheduler blip as
 * a peak.
 */
export function axisTop(max: number, floor: number, cap: number): number {
  const target = Math.min(cap, Math.max(max, floor)) / 4;
  const scale = 10 ** Math.floor(Math.log10(target));
  return Math.min(cap, LADDER.find((m) => m * scale >= target)! * scale * 4);
}

/** Round multipliers spanning a decade, so `axisTop` always finds one. */
const LADDER = [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10];

/**
 * The gridlines for a zero-anchored axis: the top and the three quarters beneath
 * it.
 *
 * Specified explicitly rather than left to recharts, which selects "nice" decimal
 * values whatever domain it is given -- a top of 30 MiB returns 7.6, 15.3, 22.9,
 * 30, neither quarters nor round in the unit they are printed in.
 */
export function quarters(top: number): number[] {
  return [0, 0.25, 0.5, 0.75, 1].map((f) => top * f);
}

/**
 * `rows` with an empty row in each gap over twice their usual spacing, where a
 * chart breaks its line rather than drawing a straight one across a stretch with
 * no samples -- a day offline would read as a day of steady load. The usual
 * spacing is the median gap rather than the hub's bucket: an agent reporting
 * every few minutes leaves a row only every few buckets.
 */
export function withGaps<T extends { ts: number }>(
  rows: T[],
  step?: number,
): (T | { ts: number })[] {
  const gaps = rows
    .slice(1)
    .map((r, i) => r.ts - rows[i].ts)
    .sort((a, b) => a - b);
  // The lower median: of two gaps, the shorter is the spacing and the longer
  // the one in question.
  const usual =
    step !== undefined && Number.isFinite(step) && step > 0
      ? step
      : gaps[(gaps.length - 1) >> 1];
  return rows.flatMap((r, i) =>
    i > 0 && r.ts - rows[i - 1].ts > 2 * usual
      ? [{ ts: (r.ts + rows[i - 1].ts) / 2 }, r]
      : [r],
  );
}

/**
 * The rungs of a logarithmic byte axis: 1, 10 and 100 of each binary unit, so
 * every gridline prints as a round label -- 100 B, 1 KB, 10 KB, 100 KB, 1 MB.
 * Adjacent rungs are 10 apart, or 10.24 across a unit, which draws as even.
 */
const rung = (i: number) => 1024 ** Math.floor(i / 3) * 10 ** (i % 3);

/** The rung of `RATE_FLOOR`. */
const FLOOR = 3;

/**
 * The lowest rate drawn, 1 KB/s, since a log axis has no zero. An agent's own
 * reports run below it, 0.2 to 0.7 KB/s each way across nine nodes over a week,
 * so a node doing nothing else lies along the floor rather than drawing that
 * traffic, magnified, as activity.
 */
export const RATE_FLOOR = rung(FLOOR);

/**
 * A logarithmic axis for transfer rates, from the rung at or below `low` to the
 * rung at or above `high`, and no lower than `RATE_FLOOR`.
 *
 * At most six labels, counted down from the top, which is the one that says how
 * far the axis reaches. Six label every rung from the floor to 100 MB/s, the
 * bursts of a gigabit port, so an idle line lies on a labelled gridline; on a
 * panel 120 px tall they sit 24 px apart. Wider spans take every other rung:
 * 1 KB/s to 1 GB/s is seven, and a label on each would sit 20 px from the next.
 */
export function rateAxis(
  low: number,
  high: number,
): { domain: [number, number]; ticks: number[] } {
  let bottom = FLOOR;
  while (rung(bottom + 1) <= Math.min(low, high)) bottom++;
  let top = bottom + 1;
  while (rung(top) < high) top++;
  const step = Math.ceil((top - bottom) / 5);
  const ticks: number[] = [];
  for (let i = top; i >= bottom; i -= step) ticks.unshift(rung(i));
  return { domain: [rung(bottom), rung(top)], ticks };
}

/**
 * Hampel filter (Hampel 1974; MATLAB ships it as `hampel`). A sample more than
 * `sigmas` robust deviations from the median of its window is replaced by that
 * median, while everything else passes through unchanged, which is what
 * separates it from a rolling median or a moving average: a period that is
 * genuinely slow keeps its height, since its own neighbours are slow too.
 *
 * 1.4826 rescales the median absolute deviation to a standard deviation for
 * normally distributed data; 3 sigma is the conventional cut.
 *
 * The deviation is floored at one millisecond, the resolution round trips are
 * stored in. Unfloored, a window whose samples mostly repeat one value -- which
 * is what a steady route looks like at that resolution -- has a deviation of
 * exactly 0, and the test then either rejects nothing or rejects every sample
 * that is not the median, depending on which way the comparison is written. Both
 * fail on the very chart this exists for: a flat line with one 2 s bucket in it.
 * The floor puts the cut at 4.5 ms for a line that does not move.
 *
 * A null is a timeout rather than a high reading, so it is neither replaced nor
 * counted towards what its neighbours are compared against.
 */
export function despike(
  values: (number | null)[],
  window = 7,
  sigmas = 3,
): (number | null)[] {
  const half = window >> 1;
  // ponytail: the window is re-collected per sample. A day of one probe is 1,438
  // of them; a rolling structure would only pay off on a far longer window.
  return values.map((v, i) => {
    if (v === null) return v;
    const near = values
      .slice(Math.max(0, i - half), i + half + 1)
      .filter((n) => n !== null);
    const mid = median(near);
    const mad = Math.max(median(near.map((n) => Math.abs(n - mid))), 1);
    return Math.abs(v - mid) > sigmas * 1.4826 * mad ? mid : v;
  });
}

/** The middle of a sorted copy, the mean of the middle pair for an even count. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const half = sorted.length >> 1;
  return sorted.length % 2
    ? sorted[half]
    : (sorted[half - 1] + sorted[half]) / 2;
}

/**
 * Seconds since the node last reported, as the hub counts them: subtracted on
 * the visitor's clock, a browser eight hours fast would show a node that
 * dropped a minute ago as offline for eight hours. The browser's clock serves
 * only a hub from before `last_seen_ago`.
 */
export function sinceSeen(node: {
  last_seen: number;
  last_seen_ago?: number | null;
}): number {
  if (node.last_seen_ago !== undefined) return node.last_seen_ago ?? 0;
  return node.last_seen ? Date.now() / 1000 - node.last_seen : 0;
}
