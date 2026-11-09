/** The few chart helpers the Bill Delay Tracker needs, so its SVG charts draw without a charting library. */

export const formatInt = new Intl.NumberFormat('en-US');
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumSignificantDigits: 3 });
const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 0 });
const percent1 = new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Whole number with thousands separators; an en dash for a missing value. */
export const fmt = (v: number | null | undefined): string => (v == null ? '–' : formatInt.format(Math.round(v)));
/** Short form for large numbers: 164.7M, 1.46B. */
export const fmtShort = (v: number): string => compact.format(v);
/** A card value that fits the card: up to 9,999,999 in full, above that the short form. */
export const cardNumber = (v: number): string => (Math.abs(v) < 1e7 ? formatInt.format(v) : fmtShort(v));
export const fmtPercent = (v: number): string => percent.format(v);
export const fmtPercent1 = (v: number): string => percent1.format(v);

/** A step of 1, 2 or 5 times a power of ten that splits [0, max] into about count intervals. */
export function tickStep(max: number, count: number): number {
  if (!(max > 0)) return 1;
  const raw = max / Math.max(1, count);
  const power = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / power;
  const mult = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10;
  return Math.max(mult * power, Number.EPSILON);
}

/** A linear scale from [0, max] onto [r0, r1], with max rounded up to a whole tick and the ticks it implies. */
export function linearScale(max: number, [r0, r1]: [number, number], count = 5, nice = true) {
  const step = tickStep(max, count);
  const top = nice ? Math.max(step, Math.ceil(max / step - 1e-9) * step) : Math.max(max, Number.EPSILON);
  const scale = (v: number) => r0 + (v / top) * (r1 - r0);
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Number(v.toFixed(10)));
  return Object.assign(scale, { top, ticks: nice ? ticks : ticks.filter((t) => t <= top) });
}

/** Equal bands for keys across [r0, r1], padding as a share of each step (as a band scale does). */
export function bandScale<K>(keys: K[], [r0, r1]: [number, number], padding = 0.12) {
  const n = Math.max(1, keys.length);
  const step = (r1 - r0) / (n + padding);
  const bandwidth = step * (1 - padding);
  const index = new Map(keys.map((k, i) => [k, i]));
  const at = (k: K) => r0 + step * padding + (index.get(k) ?? 0) * step;
  return Object.assign(at, { step, bandwidth, padding });
}

/** Days since the epoch for an ISO date (YYYY-MM-DD), in UTC. */
export const isoDay = (iso: string): number => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthName = (month: string): string => MONTHS[Number(month.slice(5, 7)) - 1];
export const dayName = (iso: string): string => `${Number(iso.slice(8, 10))} ${monthName(iso)} ${iso.slice(0, 4)}`;

/** Ticks for a date axis from first to last (ISO dates): every second month across about one Congress,
 *  whole years at a spacing that keeps about ten labels over a longer span. */
export function dateTicks(first: string, last: string): { iso: string; label: string }[] {
  const y0 = Number(first.slice(0, 4)), y1 = Number(last.slice(0, 4));
  const years = (isoDay(last) - isoDay(first)) / 365.25;
  const out: { iso: string; label: string }[] = [];
  if (years <= 3) {
    for (let y = y0; y <= y1; y += 1) {
      for (let m = 1; m <= 12; m += 2) {
        const iso = `${y}-${String(m).padStart(2, '0')}-01`;
        if (iso >= first && iso <= last) out.push({ iso, label: `${MONTHS[m - 1]} ${y}` });
      }
    }
  } else {
    const every = Math.max(1, Math.ceil(years / 10));
    for (let y = Math.ceil(y0 / every) * every; y <= y1; y += every) {
      const iso = `${y}-01-01`;
      if (iso >= first && iso <= last) out.push({ iso, label: String(y) });
    }
  }
  return out;
}

/** SVG path of a step-after line through the points: flat until the next point, then up. */
export function stepPath(points: [number, number][]): string {
  if (points.length === 0) return '';
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 1; i < points.length; i += 1) d += `H${points[i][0]}V${points[i][1]}`;
  return d;
}

/** SVG path of the area between two step-after lines that share their x values (upper, then lower reversed). */
export function stepArea(xs: number[], upper: number[], lower: number[]): string {
  if (xs.length === 0) return '';
  const top = stepPath(xs.map((x, i) => [x, upper[i]]));
  let back = `V${lower[lower.length - 1]}`;
  for (let i = xs.length - 1; i > 0; i -= 1) back += `H${xs[i]}V${lower[i - 1]}`;
  return `${top}${back}H${xs[0]}Z`;
}
